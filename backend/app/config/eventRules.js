// config/eventRules.js
const { GroupLevel } = require('@prisma/client');

// Gerarchia dei livelli
const LEVEL_HIERARCHY = {
  ALL: [GroupLevel.ALL],
  OPEN: [GroupLevel.OPEN, GroupLevel.ALL],
  ADVANCED: [GroupLevel.ADVANCED, GroupLevel.ALL],
  DEEP: [GroupLevel.DEEP, GroupLevel.ALL]
};

// Regola di default
const DEFAULT_RULE = {
  requiresSubscription: true,
  allowedLevels: [GroupLevel.ALL, GroupLevel.OPEN, GroupLevel.ADVANCED, GroupLevel.DEEP],
};

// Mappa delle regole per categoria evento
const eventRules = {
  // Corsi
  TRY_DIVE: { requiresSubscription: false, allowedLevels: [GroupLevel.ALL] },
  COURSE_OPEN: { requiresSubscription: true, allowedLevels: [GroupLevel.OPEN] },
  COURSE_ADVANCED: { requiresSubscription: true, allowedLevels: [GroupLevel.ADVANCED] },
  COURSE_DEEP: { requiresSubscription: true, allowedLevels: [GroupLevel.DEEP] },

  // Allenamenti
  TRAINING_ALL: { requiresSubscription: true, allowedLevels: [GroupLevel.ALL] },
  TRAINING_OPEN: { requiresSubscription: true, allowedLevels: [GroupLevel.OPEN] },
  TRAINING_ADVANCED: { requiresSubscription: true, allowedLevels: [GroupLevel.ADVANCED] },
  TRAINING_DEEP: { requiresSubscription: true, allowedLevels: [GroupLevel.DEEP] },

  // Acque libere
  OPEN_WATER_ALL: { requiresSubscription: true, allowedLevels: [GroupLevel.ALL] },
  OPEN_WATER_OPEN: { requiresSubscription: true, allowedLevels: [GroupLevel.OPEN] },
  OPEN_WATER_ADVANCE: { requiresSubscription: true, allowedLevels: [GroupLevel.ADVANCED] },
  OPEN_WATER_DEEP: { requiresSubscription: true, allowedLevels: [GroupLevel.DEEP] },

  // Y-40
  Y40_ALL: { requiresSubscription: true, allowedLevels: [GroupLevel.ALL] },
  Y40_OPEN: { requiresSubscription: true, allowedLevels: [GroupLevel.OPEN] },
  Y40_ADVANCED: { requiresSubscription: true, allowedLevels: [GroupLevel.ADVANCED] },
  Y40_DEEP: { requiresSubscription: true, allowedLevels: [GroupLevel.DEEP] },

  // Eventi Speciali
  EVENT_SPECIAL_FREE: { requiresSubscription: false, allowedLevels: [GroupLevel.ALL] },
  EVENT_SPECIAL: { requiresSubscription: true, allowedLevels: [GroupLevel.ALL] },
  EVENT_SPECIAL_OPEN: { requiresSubscription: true, allowedLevels: [GroupLevel.OPEN] },
  EVENT_SPECIAL_ADVANCED: { requiresSubscription: true, allowedLevels: [GroupLevel.ADVANCED] },
  EVENT_SPECIAL_DEEP: { requiresSubscription: true, allowedLevels: [GroupLevel.DEEP] },
};

module.exports = { LEVEL_HIERARCHY, DEFAULT_RULE, eventRules };