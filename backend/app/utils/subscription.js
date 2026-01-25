const { PrismaClient, SubscriptionStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const z = require('zod');
const { eventRules, DEFAULT_RULE, LEVEL_HIERARCHY } = require('../config/eventRules');

const ISO_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF'];

const createSubscriptionSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  amount: z.coerce.number().positive(),
  currency: z.string().refine(
    val => ISO_CURRENCIES.includes(val),
    { message: 'Currency not valid (ISO 4217)' }
  ).optional().default('EUR'),
  status: z.string().refine(
    val => SubscriptionStatus.includes(val),
    { message: 'Status not valid' }
  ).optional().default(SubscriptionStatus.ACTIVE),
  groups: z.array(z.coerce.number()).optional()
}).refine(
  (data) => data.endDate > data.startDate,
  { message: "endDate must be after startDate" }
);


/**
 * Crea una subscription per un utente e assegna i gruppi
 * @param {Object} params
 * @param {string} params.userId - ID utente
 * @param {string|Date} params.startDate - Data inizio subscription
 * @param {string|Date} params.endDate - Data fine subscription
 * @param {number} params.amount - Importo subscription
 * @param {number[]} params.groups - Array di ID gruppi da assegnare
 * @returns {Promise<Object>} subscription
 */
async function createSubscriptionWithGroups({userId, startDate, endDate, amount, ingressi, currency, status, groups}) {
  
  // VALIDAZIONE INPUT
  const validSubscription = createSubscriptionSchema.parse({startDate, endDate, amount, ingressi, currency, status, groups});

  // TRANSAZIONE TUTTO INSIEME
  const subscription = await prisma.$transaction(async (tx) => {

    // Disattivo eventuali subscription attive
    await tx.subscription.updateMany({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE
      },
      data: {
        status: SubscriptionStatus.CANCELLED,
        endDate: new Date()
      }
    });

    // Creo nuova subscription
    const newSubscription = await tx.subscription.create({
      data: {
        userId,
        startDate: validSubscription.startDate,
        endDate: validSubscription.endDate,
        amount: validSubscription.amount,
        ingressi: validSubscription.ingressi,
        currency: validSubscription.currency,
        status: validSubscription.status
      }
    });

    // Assegno i gruppi (se presenti)
    if (validSubscription.groups?.length) {
      const userGroupsData = validSubscription.groups.map(groupId => ({
        userId,
        groupId,
        validFrom: validSubscription.startDate,
        validTo: validSubscription.endDate,
        isActive: true,
        subscriptionId: newSubscription.id
      }));

      await tx.userGroup.createMany({ data: userGroupsData });
    }

    return newSubscription;
  });

  return subscription;
}

/**
 * Controlla se un utente ha una subscription valida per prenotare un evento
 * @param {string} userId - ID utente
 * @returns {Promise<boolean>} true se valido, false altrimenti
 */
async function hasValidSubscription(userId) {
  const now = new Date();

  const validGroup = await prisma.userGroup.findFirst({
    where: {
      userId,
      validFrom: { lte: now },
      validTo: { gte: now },
      isActive: true
    }
  });

  return !!validGroup;
}

/**
 * Controlla se un utente può prenotare un evento
 * - Subscription valida
 * - Evento schedulato
 * - Posti disponibili
 * - Requisiti subscription
 * - Requisiti gruppi
 * @param {string} userId - ID utente
 * @param {number} eventId - ID evento
 * @returns {Promise<{canBook: boolean, message?: string}>}
 */
async function canBookEvent(userId, eventId) {
  // Prendo l'evento con la categoria
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { category: true, signups: true }
  });

  if (!event) return { canBook: false, message: 'Evento non trovato' };
  if (event.status !== 'SCHEDULED') return { canBook: false, message: 'Evento non disponibile' };
  if (event.signups.length >= event.maxSlots) return { canBook: false, message: 'Evento pieno' };

  const now = new Date();
  
  // controllo che l'utente abbia ancora ingressi disponibili
  const activeIngressi = await prisma.subscription.findFirst({
    where: {
      userId: userId,
      status: 'ACTIVE',          // solo subscription attiva
      startDate: { lte: now },
      endDate: { gte: now }
    },
    select: {
      ingressi: true             // prendi solo il campo ingressi
    }
  });
  
  const availableIngressi = activeIngressi?.ingressi ?? 0;
  if (availableIngressi <= 0) return { canUse: false, message: "Non hai più ingressi disponibili" };

  // Prendo le regole della categoria o default
  const rule = eventRules[event.category.code] || DEFAULT_RULE;

  // Recupero la subscription attive dell'utente
  const activeUserGroups = await prisma.userGroup.findMany({
    where: {
      userId,
      isActive: true,
      validFrom: { lte: now },
      validTo: { gte: now }
    },
    include: { group: true }
  });

  // livelli dell’utente
  const userLevels = activeUserGroups
    .map(ug => ug.group.level)       // estrai l’enum level dal gruppo
    .flatMap(level => LEVEL_HIERARCHY[level]); // espandi i livelli inferiori

  // rimuovi duplicati
  const uniqueUserLevels = [...new Set(userLevels)];

  // Subscription
  if (rule.requiresSubscription) {
    const hasSubscription = await hasValidSubscription(userId);
    if (!hasSubscription) return { canBook: false, message: 'Subscription non valida' };
  }

  // Gruppi (opzionale, futuro)
  if (rule.requiredGroups?.length) {
    const userGroups = await prisma.userGroup.findMany({
      where: { userId, isActive: true },
      include: { group: true }
    });
    const groupNames = userGroups.map(g => g.group.name);
    const hasGroup = rule.requiredGroups.some(rg => groupNames.includes(rg));
    if (!hasGroup) return { canBook: false, message: 'Livello utente non autorizzato per questo evento' };
  }

  // Livello utente
  if (!rule.allowedLevels.some(level => uniqueUserLevels.includes(level))) {
    return { canBook: false, message: 'Livello utente non autorizzato per questo evento' };
  }

  return { canBook: true };
}

/**
 * Restituisce il livello minimo richiesto per partecipare a un evento
 * @param {string} categoryCode - codice categoria evento
 * @returns {string} livello minimo
 */
function getEventMinLevel(categoryCode) {
  const rule = eventRules[categoryCode] || DEFAULT_RULE;

  // Ordina allowedLevels in base alla priorità (ALL=1, OPEN=2, ADVANCED=3, DEPTH=4)
  const levelPriority = { ALL: 1, OPEN: 2, ADVANCED: 3, DEPTH: 4 };

  // Trova il livello più “basso” che consente partecipazione
  const minLevel = rule.allowedLevels.reduce((min, level) => {
    return levelPriority[level] < levelPriority[min] ? level : min;
  }, rule.allowedLevels[0]);

  return minLevel;
}


module.exports = {
  createSubscriptionWithGroups,
  hasValidSubscription,
  canBookEvent,
  getEventMinLevel
};
