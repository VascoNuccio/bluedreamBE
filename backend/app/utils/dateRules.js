// utils/dateRules.js
const { prisma } = require("../prisma"); // ← adattalo al tuo path

const TIMEZONE = "Europe/Rome";

/* =====================
   DATE HELPERS
===================== */
function getNowItaly() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: TIMEZONE })
  );
}

function stripTime(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* =====================
   BOOK EVENT RULE
===================== */
async function canBookEventByEventId(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { startDate: true }
  });

  if (!event) {
    return {
      canBook: false,
      message: "Evento non trovato"
    };
  }

  const now = getNowItaly();
  const today = stripTime(now);
  const eventDay = stripTime(event.startDate);

  // NO evento passato
  if (eventDay < today) {
    return {
      canCancel: false,
      message: "Non puoi prenotare eventi passati"
    };
  }

  // NO oggi dopo le 18
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
async function canCancelEventByEventId(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { startDate: true }
  });

  if (!event) {
    return {
      canCancel: false,
      message: "Evento non trovato"
    };
  }

  const now = getNowItaly();
  const today = stripTime(now);
  const eventDay = stripTime(event.startDate);

  // NO evento passato
  if (eventDay < today) {
    return {
      canCancel: false,
      message: "Non puoi disdire eventi passati"
    };
  }

  // NO oggi dopo le 18
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
