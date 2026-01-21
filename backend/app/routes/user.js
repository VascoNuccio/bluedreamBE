const express = require('express');
const { PrismaClient, SubscriptionStatus, UserStatus, EventStatus, Role, GroupLevel } = require('@prisma/client');
const prisma = new PrismaClient();
const { canBookEvent } = require('../utils/subscription');

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
            user: {
              select: {
                email: true
              }
            }
          }
        }
      }
    });

    // Trasforma eventi per FE
    const formattedEvents = await Promise.all(
      events.map(async (ev) => {
        const { canBook } = await canBookEvent(userId, ev.id); // se può prenotare
        const minLevel = getEventMinLevel(ev.category.code);    // livello minimo richiesto

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

  // Uso dell'utility per controllare subscription e prenotazione
  const { canBook, message } = await canBookEvent(userId, eventId);
  if (!canBook) return res.status(403).json({ message });

  // Creazione prenotazione
  const signup = await prisma.eventSignup.create({
    data: { userId, eventId }
  });

  res.status(201).json(signup);
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

  await prisma.eventSignup.delete({
    where: {
      userId_eventId: { userId, eventId }
    }
  });

  res.json({ message: 'Prenotazione cancellata' });
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
 *                 enum: [ALL, OPEN, ADVANCED, DEPTH]
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
