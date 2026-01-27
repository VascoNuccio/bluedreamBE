const express = require('express');
const { PrismaClient, SubscriptionStatus, UserStatus, EventStatus, Role, GroupLevel } = require('@prisma/client');
const prisma = new PrismaClient();
const { canBookEvent, getEventMinLevel } = require('../utils/subscription');
const { canBookEventByEventId, canCancelEventByEventId } = require('../utils/dateRules');

const router = express.Router();

/* ================================
   GET MONTH EVENTS (USER)
================================ */
/**
 * @swagger
 * /user/events/month:
 *   get:
 *     summary: Recupera gli eventi del mese
 *     description: Restituisce tutti gli eventi schedulati del mese indicato
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Lista eventi del mese
 *       401:
 *         description: Non autenticato
 */
router.get('/events/month', async (req, res) => {
  const { year, month, userEmail } = req.query;

  const events = await prisma.event.findMany({
    where: {
      status: EventStatus.SCHEDULED,
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      }
    },
    include: {
      signups: {
        select: {
          user: { select: { email: true } }
        }
      }
    }
  });

  // Trasforma per il FE
  const formattedEvents = events.map(ev => ({
    ...ev,
    partecipanti: ev.signups.map(s => s.user.email)
  }));

  res.json({ events: formattedEvents });
});

/* ================================
   GET DAY EVENTS (USER)
================================ */
/**
 * @swagger
 * /user/events/day:
 *   get:
 *     summary: Recupera gli eventi di un giorno specifico
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: query
 *         name: month
 *         required: true
 *         schema:
 *           type: integer
 *           example: 5
 *       - in: query
 *         name: day
 *         required: true
 *         schema:
 *           type: integer
 *           example: 12
 *     responses:
 *       200:
 *         description: Lista eventi del giorno
 *       401:
 *         description: Non autenticato
 */
router.get('/events/day', async (req, res) => {
  try {
    const { year, month, day } = req.query;

    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({ message: "ID utente non valido" });
    }

    const events = await prisma.event.findMany({
      where: {
        status: EventStatus.SCHEDULED,
        date: {
          gte: new Date(year, month - 1, day),
          lt: new Date(year, month - 1, Number(day) + 1)
        }
      },
      include: {
        signups: {
          select: {
            user: { select: { email: true } }
          }
        },
        category: true
      }
    });

    // Trasforma eventi per FE
    const formattedEvents = await Promise.all(
      events.map(async (ev) => {
        const { canBook } = await canBookEvent(userId, ev.id); // se può prenotare
        const minLevel = ev.category ? getEventMinLevel(ev.category.code) : 'ALL'; // livello minimo richiesto

        return {
          ...ev,
          id: ev.id,
          title: ev.title,
          description: ev.description,
          location: ev.location,
          date: ev.date,
          startTime: ev.startTime,
          endTime: ev.endTime,
          maxSlots: ev.maxSlots,
          signedUpCount: ev.signups.length,
          partecipanti: ev.signups.map(s => s.user.email),
          canBook,
          minLevel
        };
      })
    );

    res.json({ events: formattedEvents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server' });
  }
});

/* ================================
   BOOK EVENT
   - controllo subscription valida tramite utils
   - controllo slot disponibili
================================ */
/**
 * @swagger
 * /user/events/book:
 *   post:
 *     summary: Prenota un evento
 *     description: >
 *       Prenota un evento se l'utente ha una subscription valida
 *       e se ci sono slot disponibili.
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventId
 *             properties:
 *               eventId:
 *                 type: number
 *                 example: 10
 *     responses:
 *       201:
 *         description: Prenotazione creata
 *       403:
 *         description: Subscription non valida o evento pieno/non disponibile
 */
router.post('/events/book', async (req, res) => {
  const { eventId } = req.body;
  const userId = req.user.userId;

  try {
    // Controllo temporale (fuori transazione)
    const timeCheck = await canBookEventByEventId(eventId);
    if (!timeCheck.canBook) {
      return res.status(403).json({ message: timeCheck.message });
    }

    // Controllo read-only business per frontend (facoltativo)
    const businessCheck = await canBookEvent(userId, eventId);
    if (!businessCheck.canBook) {
      return res.status(403).json({ message: businessCheck.message });
    }

    // Prenotazione atomica dentro transazione
    await prisma.$transaction(async (tx) => {

      // Lock evento: prendi signups correnti
      const event = await tx.event.findUnique({
        where: { id: eventId },
        include: { signups: true }
      });

      if (!event || event.status !== 'SCHEDULED') {
        throw new Error('Evento non disponibile');
      }

      if (event.signups.length >= event.maxSlots) {
        throw new Error('Evento pieno');
      }

      // Lock subscription attiva dell’utente
      const subscription = await tx.subscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE',
          startDate: { lte: new Date() },
          endDate: { gte: new Date() }
        }
      });

      if (!subscription || subscription.ingressi <= 0) {
        throw new Error('Ingressi insufficienti');
      }

      // Inserisci prenotazione
      await tx.eventSignup.create({
        data: { userId, eventId }
      });

      // Decrementa ingressi atomico
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { ingressi: { decrement: 1 } }
      });
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Errore prenotazione:', err);
    if (err.message.includes('Unique constraint')) {
      return res.status(409).json({ message: 'Sei già prenotato' });
    }
    res.status(403).json({ message: err.message });
  }
});


/* ================================
   CANCEL EVENT BOOKING
================================ */
/**
 * @swagger
 * /user/events/cancel:
 *   post:
 *     summary: Cancella la prenotazione di un evento
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventId
 *             properties:
 *               eventId:
 *                 type: number
 *                 example: 10
 *     responses:
 *       200:
 *         description: Prenotazione cancellata
 *       404:
 *         description: Prenotazione non trovata
 */
router.post('/events/cancel', async (req, res) => {
  const { eventId } = req.body;
  const userId = req.user.userId;

  try {
    // Controllo temporale per cancel
    const cancelCheck = await canCancelEventByEventId(eventId);
    if (!cancelCheck.canCancel) {
      return res.status(403).json({ message: cancelCheck.message });
    }

    // Transazione atomica per delete + increment ingressi
    await prisma.$transaction(async (tx) => {

      // Cancella prenotazione
      const deleted = await tx.eventSignup.delete({
        where: { userId_eventId: { userId, eventId } }
      });

      if (!deleted) {
        throw new Error('Prenotazione non trovata');
      }

      // Trova subscription attiva
      const subscription = await tx.subscription.findFirst({
        where: {
          userId,
          status: 'ACTIVE'
        }
      });

      if (!subscription) {
        throw new Error('Subscription attiva non trovata');
      }

      // Incrementa ingressi atomico
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { ingressi: { increment: 1 } }
      });
    });

    res.json({ message: 'Prenotazione cancellata' });
  } catch (err) {
    console.error('Errore cancellazione:', err);
    res.status(500).json({ message: err.message });
  }
});


/* ================================
   GET USER LEVELS
================================ */
/**
 * @swagger
 * /user/levels:
 *   get:
 *     summary: Restituisce tutti i livelli utente disponibili
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista dei livelli utente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *                 enum: [ALL, OPEN, ADVANCED, DEEP]
 *                 example: ADVANCED
 */
router.get('/levels', async (req, res) => {
  try {
    res.json(Object.values(GroupLevel));
  } catch (err) {
    console.error('Errore recupero livelli utente:', err);
    res.status(500).json({ message: 'Errore server' });
  }
});

module.exports = router;
