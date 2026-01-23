// utils/dateRules.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TIMEZONE = "Europe/Rome";

/* =====================
   DATE HELPERS
===================== */

/**
 * Ritorna la data/ora corrente in Italia
 */
function getNowItaly() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: TIMEZONE })
  );
}

/**
 * Rimuove l'orario dalla data
 */
function stripTime(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* =====================
   BOOK EVENT RULE
===================== */

/**
 * Controlla se l'utente può prenotare l'evento
 * @param {number} eventId
 * @returns {Promise<{canBook: boolean, message?: string}>}
 */
async function canBookEventByEventId(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { date: true } // campo corretto dal modello
  });

  if (!event) {
    return { canBook: false, message: "Evento non trovato" };
  }

  const now = getNowItaly();
  const today = stripTime(now);
  const eventDay = stripTime(event.date);

  // evento passato
  if (eventDay < today) {
    return { canBook: false, message: "Non puoi prenotare eventi passati" };
  }

  // evento oggi ma dopo le 18
  if (eventDay.getTime() === today.getTime() && now.getHours() >= 18) {
    return {
      canBook: false,
      message: "Non puoi prenotare eventi del giorno corrente dopo le 18:00"
    };
  }

  return { canBook: true };
}

/* =====================
   CANCEL EVENT RULE
===================== */

/**
 * Controlla se l'utente può disdire l'evento
 * @param {number} eventId
 * @returns {Promise<{canCancel: boolean, message?: string}>}
 */
async function canCancelEventByEventId(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { date: true } // campo corretto dal modello
  });

  if (!event) {
    return { canCancel: false, message: "Evento non trovato" };
  }

  const now = getNowItaly();
  const today = stripTime(now);
  const eventDay = stripTime(event.date);

  // evento passato
  if (eventDay < today) {
    return { canCancel: false, message: "Non puoi disdire eventi passati" };
  }

  // evento oggi ma dopo le 18
  if (eventDay.getTime() === today.getTime() && now.getHours() >= 18) {
    return {
      canCancel: false,
      message: "Non puoi disdire eventi del giorno corrente dopo le 18:00"
    };
  }

  return { canCancel: true };
}

/* =====================
   EXPORTS
===================== */
module.exports = {
  getNowItaly,
  stripTime,
  canBookEventByEventId,
  canCancelEventByEventId
};
