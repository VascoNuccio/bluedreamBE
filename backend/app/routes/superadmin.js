const express = require('express');
const {
  PrismaClient,
  SubscriptionStatus,
  UserStatus,
  EventStatus,
  Role
} = require('@prisma/client');

const ExcelJS = require('exceljs');
const multer = require('multer');
const { hashPassword } = require('../utils/password');
const { writeObjRow, fileNameWithDate, rowToObject } = require('../utils/excel');
const { validateUserExcelBody, validateUpsertUserExcelBody, validateUpsertSubscriptionExcelBody, validateSubscriptionExcelBody, GroupExcelSchema, UserGroupExcelSchema, EventExcelSchema } = require('../utils/zodValidate');

const prisma = new PrismaClient();
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

const USER_COLUMNS = [
  'id',
  'email',
  'firstName',
  'lastName',
  'role',
  'status',
  'createdAt',
  'updatedAt'
];

const SUBSCRIPTION_COLUMNS = [
  'id',
  'userId',
  'startDate',
  'endDate',
  'amount',
  'ingressi',
  'currency',
  'status'
];

const USER_GROUPS_COLUMNS = [
  'userId',
  'groupId',
  'subscriptionId',
  'validFrom',
  'validTo',
  'isActive'
];

const GROUPS_COLUMNS = [
  'groupId',
  'name',
  'description'
];

const EVENT_COLUMNS = [
  'title',
  'description',
  'equipment',
  'note',
  'location',
  'startTime',
  'endTime',
  'maxSlots',
  'status',
  'categoryCode',  // EventCategory code (unique) TRAINING_ALL
  'creatorEmail',  // per collegamento con User
  'monthCount',    // numero di mesi da generare
  'dayOfWeek',     // 0 = Domenica, 1 = Lunedì, ..., 6 = Sabato
];

/* ================================
   DOWNLOAD ADMIN EXCEL TEMPLATE
================================ */
/**
 * @swagger
 * /superadmin/template/download:
 *   get:
 *     summary: Scarica template Excel amministrativo
 *     description: >
 *       Scarica un file Excel multi-sheet per la gestione massiva
 *       di utenti, subscription, gruppi e assegnazioni.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: File Excel scaricato
 *       403:
 *         description: Accesso negato
 */
router.get('/template/download', async (req, res) => {
  const wb = new ExcelJS.Workbook();

  /* ========== USERS ========== */
  const usersSheet = wb.addWorksheet('USERS');

  const users = await prisma.user.findMany({
    include: {
      subscriptions: {
        orderBy: { startDate: 'desc' }
      },
      groups: {
        include: {
          group: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  const safeUser = Array.isArray(users) ? users : [users];
  writeObjRow(USER_COLUMNS, usersSheet, safeUser);

  /* ========== SUBSCRIPTIONS ========== */
  const subsSheet = wb.addWorksheet('SUBSCRIPTIONS');

  safeUser.forEach(user => writeObjRow(SUBSCRIPTION_COLUMNS, subsSheet, user.subscriptions));

  /* ========== USER_GROUPS ========== */
  const ugSheet = wb.addWorksheet('USER_GROUPS');

  safeUser.forEach(user => writeObjRow(USER_GROUPS_COLUMNS, ugSheet, user.groups));

  /* ========== GROUPS ========== */
  const groupsSheet = wb.addWorksheet('GROUPS');

  const groups = await prisma.group.findMany({
    orderBy: {
      name: 'desc'
    }
  });

  writeObjRow(GROUPS_COLUMNS, groupsSheet, groups)

  /* ========== ENUMS ========== */
  const enumSheet = wb.addWorksheet('ENUMS');
  enumSheet.addRow(['Role', ...Object.values(Role)]);
  enumSheet.addRow(['UserStatus', ...Object.values(UserStatus)]);
  enumSheet.addRow(['SubscriptionStatus', ...Object.values(SubscriptionStatus)]);
  enumSheet.addRow(['EventStatus', ...Object.values(EventStatus)]);

  const filename = fileNameWithDate('bluedream_template');
  console.log("create file: ",filename);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename=${filename}.xlsx`
  );

  await wb.xlsx.write(res);
  res.end();
});

/* ================================
   UPLOAD ADMIN EXCEL TEMPLATE
================================ */
/**
 * @swagger
 * /superadmin/template/upload:
 *   post:
 *     summary: Upload template Excel amministrativo
 *     description: >
 *       Carica un file Excel multi-sheet e aggiorna il database
 *       (USERS, SUBSCRIPTIONS, GROUPS, USER_GROUPS) in modo
 *       transazionale e puntuale.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import completato
 *       400:
 *         description: File non valido
 *       500:
 *         description: Errore server
 */
router.post(
  '/template/upload',
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'File mancante' });
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      const report = {
        users: { created: 0, updated: 0, errors: [] },
        subscriptions: { created: 0, updated: 0, errors: [] },
        groups: { created: 0, updated: 0, errors: [] },
        userGroups: { created: 0, updated: 0, errors: [] }
      };

      await prisma.$transaction(async tx => {
        /* ================= USERS ================= */
        const usersSheet = workbook.getWorksheet('USERS');
        if (!usersSheet) {
          console.error('Worksheet "USERS" not found!');
          report.users.errors.push({ error: 'Worksheet "USERS" not found!' });
        }else{
          const users = rowToObject(USER_COLUMNS, usersSheet);

          for (let i = 0; i < users.length; i++) {
            const user = users[i];
            try {
              const existingUser = await tx.user.findUnique({
                where: { email: user.email }
              });
              // salva in DB
              if (existingUser) {
                const validatedUser = validateUpsertUserExcelBody(user);
                const updateData = Object.fromEntries(
                  Object.entries(validatedUser)
                    .filter(([_, v]) => v != null) // filtra null / undefined
                    .filter(([k]) => ['firstName','lastName','role','status'].includes(k)) // solo i campi che vuoi aggiornare
                );
                // Aggiornamento
                await tx.user.update({
                  where: { email: validatedUser.email },
                  data: updateData
                });
                report.users.updated++;
              } else {
                const validatedUser = validateUserExcelBody(user);
                // Creazione
                await tx.user.create({
                  data: {
                    email: validatedUser.email,
                    firstName: validatedUser.firstName,
                    lastName: validatedUser.lastName,
                    role: validatedUser.role,
                    status: validatedUser.status,
                    password: validatedUser.password
                  }
                });
                report.users.created++;
              }
            } catch (e) {
              report.users.errors.push({ row: i + 2, email: user.email, error: e.message });
            }
          }
        }

        /* ================= SUBSCRIPTIONS ================= */
        const subsSheet = workbook.getWorksheet('SUBSCRIPTIONS');
        if (!subsSheet) {
          console.error('Worksheet "SUBSCRIPTIONS" not found!');
          report.users.errors.push({ error: 'Worksheet "SUBSCRIPTIONS" not found!' });
        }else{
          const subscriptions = rowToObject(SUBSCRIPTION_COLUMNS, subsSheet);

          for (let i = 0; i < subscriptions.length; i++) {
            const subscription = subscriptions[i];
          
            try {
              // Controllo se la subscription con ID esiste
              const existingSubscription = subscription.id
                ? await tx.subscription.findUnique({
                    where: { id: subscription.id }
                  })
                : null;
                
              if (existingSubscription) {
                // UPDATE subscription esistente
                const validatedSub = validateUpsertSubscriptionExcelBody(subscription);
              
                const updateData = Object.fromEntries(
                  Object.entries(validatedSub)
                    .filter(([_, v]) => v != null)
                    .filter(([k]) =>
                      ['startDate','endDate','amount','ingressi','currency','status'].includes(k)
                    )
                );
              
                await tx.subscription.update({
                  where: { id: existingSubscription.id },
                  data: updateData
                });
              
                report.subscriptions.updated++;
              
              } else {
                // Creo la nuova subscription ACTIVE
                const validatedSub = validateSubscriptionExcelBody(subscription);

                // Nessuna subscription con questo ID
                // controllo se esiste una ACTIVE per lo user
                const activeSubscription = await tx.subscription.findFirst({
                  where: {
                    userId: validatedSub.userId,
                    status: 'ACTIVE'
                  }
                });
              
                if (activeSubscription) {
                  // disattivo la vecchia
                  await tx.subscription.update({
                    where: { id: activeSubscription.id },
                    data: { status: 'CANCELLED' }
                  });
                }
              
                await tx.subscription.create({
                  data: {
                    userId: validatedSub.userId,
                    startDate: validatedSub.startDate,
                    endDate: validatedSub.endDate,
                    amount: validatedSub.amount,
                    ingressi: validatedSub.ingressi,
                    currency: validatedSub.currency,
                    status: 'ACTIVE'
                  }
                });
              
                report.subscriptions.created++;
              }
            
            } catch (e) {
              report.subscriptions.errors.push({
                row: i + 2,
                userId: subscription.userId,
                error: e.message
              });
            }
          }
        }

        /* ================= GROUPS ================= */
        const groupsSheet = workbook.getWorksheet('GROUPS');

        if (!groupsSheet) {
          console.error('Worksheet "GROUPS" not found!');
          report.groups.errors.push({
            error: 'Worksheet "GROUPS" not found!',
          });
        } else {
          const groups = rowToObject(GROUPS_COLUMNS, groupsSheet);
        
          for (let i = 0; i < groups.length; i++) {
            const group = groups[i];
          
            try {
              const validated = GroupExcelSchema.parse(group);
            
              const existingGroup = await tx.group.findUnique({
                where: { name: validated.name },
              });
            
              if (existingGroup) {
                await tx.group.update({
                  where: { name: validated.name },
                  data: {
                    description: validated.description,
                    level: validated.level,
                  },
                });
                report.groups.updated++;
              } else {
                await tx.group.create({
                  data: {
                    name: validated.name,
                    description: validated.description,
                    level: validated.level,
                  },
                });
                report.groups.created++;
              }
            } catch (e) {
              report.groups.errors.push({
                row: i + 2,
                name: group.name,
                error: e.message,
              });
            }
          }
        }

        /* ================= USER_GROUPS ================= */
        const ugSheet = workbook.getWorksheet('USER_GROUPS');

        if (!ugSheet) {
          console.error('Worksheet "USER_GROUPS" not found!');
          report.userGroups.errors.push({
            error: 'Worksheet "USER_GROUPS" not found!',
          });
        } else {
          const userGroups = rowToObject(USER_GROUPS_COLUMNS, ugSheet);
        
          for (let i = 0; i < userGroups.length; i++) {
            const ug = userGroups[i];
          
            try {
              const validated = UserGroupExcelSchema.parse(ug);
            
              const group = await tx.group.findUnique({
                where: { name: validated.groupName },
              });
            
              if (!group) {
                throw new Error(`Group not found: ${validated.groupName}`);
              }
            
              const existingUG = await tx.userGroup.findUnique({
                where: {
                  userId_groupId_subscriptionId: {
                    userId: validated.userId,
                    groupId: group.id,
                    subscriptionId: validated.subscriptionId,
                  },
                },
              });
            
              if (existingUG) {
                await tx.userGroup.update({
                  where: {
                    userId_groupId_subscriptionId: {
                      userId: validated.userId,
                      groupId: group.id,
                      subscriptionId: validated.subscriptionId,
                    },
                  },
                  data: {
                    validFrom: validated.validFrom,
                    validTo: validated.validTo,
                    isActive: validated.isActive,
                  },
                });
                report.userGroups.updated++;
              } else {
                await tx.userGroup.create({
                  data: {
                    userId: validated.userId,
                    groupId: group.id,
                    subscriptionId: validated.subscriptionId,
                    validFrom: validated.validFrom,
                    validTo: validated.validTo,
                    isActive: validated.isActive,
                  },
                });
                report.userGroups.created++;
              }
            } catch (e) {
              report.userGroups.errors.push({
                row: i + 2,
                userId: ug.userId,
                group: ug.groupName,
                error: e.message,
              });
            }
          }
        }

      });
          
      res.json({ message: 'Import completato', report });

    } catch (err) {
      console.error('Template upload error:', err);
      res.status(500).json({ message: 'Errore lettura Excel' });
    }
  }
);

/*=====================================
  EVENTS TEMPLATE
=======================================*/

/**
 * @swagger
 * /superadmin/template/events/download:
 *   get:
 *     summary: Scarica template Excel per eventi
 *     description: Restituisce un file Excel vuoto con le colonne corrette per import eventi.
 *     tags:
 *       - Events
 *     responses:
 *       200:
 *         description: Template Excel generato
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/template/events/download', async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('EVENTS');
    sheet.addRow(EVENT_COLUMNS); // header
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="event_template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nella generazione del template' });
  }
});

/**
 * @swagger
 * /superadmin/template/events/upload:
 *   post:
 *     summary: Carica file Excel con eventi
 *     description: >
 *       Carica un file Excel con eventi e li inserisce nel database.
 *       Gestisce la generazione di eventi settimanali per il numero di mesi indicati.
 *     tags:
 *       - Events
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Import completato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 report:
 *                   type: object
 *       400:
 *         description: File non valido
 *       500:
 *         description: Errore server
 */
router.post('/superadmin/template/events/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File non fornito' });

  const report = { events: { created: 0, errors: [] } };
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.getWorksheet('EVENTS');
    if (!sheet) return res.status(400).json({ error: 'Worksheet "EVENTS" non trovata' });

    const rows = [];
    sheet.eachRow((row, i) => i > 1 && rows.push(row)); // skip header

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const raw = {};
        EVENT_COLUMNS.forEach((col, idx) => {
          raw[col] = row.getCell(idx + 1).value;
        });
      
        try {
          // ================== VALIDAZIONE ZOD ==================
          const validated = EventExcelSchema.parse(raw);
        
          // Trova category e creator
          const category = await tx.eventCategory.findUnique({ where: { code: validated.categoryCode } });
          if (!category) throw new Error(`Category non trovata: ${validated.categoryCode}`);
        
          const creator = await tx.user.findUnique({ where: { email: validated.creatorEmail } });
          if (!creator) throw new Error(`Creator non trovato: ${validated.creatorEmail}`);
        
          // Genera date eventi
          const dates = generateEventDates(1, validated.monthCount, validated.dayOfWeek);
        
          for (const date of dates) {
            await tx.event.create({
              data: {
                title: validated.title,
                description: validated.description,
                equipment: validated.equipment,
                note: validated.note,
                location: validated.location,
                date,
                startTime: validated.startTime,
                endTime: validated.endTime,
                maxSlots: validated.maxSlots,
                status: validated.status,
                categoryId: category.id,
                creatorId: creator.id,
              },
            });
            report.events.created++;
          }
        } catch (e) {
          report.events.errors.push({
            row: i + 2,
            title: raw.title,
            error: e.errors ? e.errors.map(err => err.message).join(', ') : e.message,
          });
        }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore server', details: err.message });
  }
});


module.exports = router;