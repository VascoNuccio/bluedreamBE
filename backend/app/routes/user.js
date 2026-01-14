const express = require('express');
const prisma = require('../prisma');
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
  const { year, month } = req.query;

  const events = await prisma.event.findMany({
    where: {
      status: 'SCHEDULED',
      date: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1)
      }
    }
  });

  res.json({ events });
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
  const { year, month, day } = req.query;

  const events = await prisma.event.findMany({
    where: {
      status: 'SCHEDULED',
      date: new Date(year, month - 1, day)
    }
  });

  res.json({ events });
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

module.exports = router;
