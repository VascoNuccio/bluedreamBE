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
const { validateUserExcelBody, validateUpsertUserExcelBody } = require('../utils/zodValidate');

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
      });

      /* ================= SUBSCRIPTIONS ================= */
      const subsSheet = workbook.getWorksheet('SUBSCRIPTIONS');
      const SUBSCRIPTION_COLUMNS = [
        'id',
        'userId',
        'startDate',
        'endDate',
        'amount',
        'ingressi',
        'currency',
        'status'
      ]
      
      /* ================= GROUPS ================= */
      const groupsSheet = workbook.getWorksheet('GROUPS');

      /* ================= USER_GROUPS ================= */
      const ugSheet = workbook.getWorksheet('USER_GROUPS');

      res.json({ message: 'Import completato', report });

    } catch (err) {
      console.error('Template upload error:', err);
      res.status(500).json({ message: 'Errore lettura Excel' });
    }
  }
);

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
        if (usersSheet) {
          const rows = [];
          usersSheet.eachRow((row, i) => i > 1 && rows.push(row));

          for (let i = 0; i < rows.length; i++) {
            const [
              userIdCell,
              emailCell,
              passwordCell,
              firstNameCell,
              lastNameCell,
              roleCell,
              statusCell
            ] = rows[i].values.slice(1);

            const email = cellValueToString(emailCell);
            const password = cellValueToString(passwordCell);
            const firstName = cellValueToString(firstNameCell);
            const lastName = cellValueToString(lastNameCell);
            const role = cellValueToString(roleCell);
            const status = cellValueToString(statusCell);

            if (!email) continue;

            try {
              await tx.user.upsert({
                where: { email }, // email unica
                update: {
                  firstName,
                  lastName,
                  role: role || Role.USER,
                  status: status || UserStatus.SUBSCRIBED,
                  ...(password ? { password: await hashPassword(password) } : {})
                },
                create: {
                  email,
                  password: password ? await hashPassword(password) : undefined,
                  firstName,
                  lastName,
                  role: role || Role.USER,
                  status: status || UserStatus.SUBSCRIBED
                }
              });
              report.users.created++; // contiamo tutti come creati/aggiornati
            } catch (e) {
              report.users.errors.push({ row: i + 2, email, error: e.message });
            }
          }
        }

        /* ================= SUBSCRIPTIONS ================= */
        const subsSheet = workbook.getWorksheet('SUBSCRIPTIONS');
        if (subsSheet) {
          const rows = [];
          subsSheet.eachRow((row, i) => i > 1 && rows.push(row));

          for (let i = 0; i < rows.length; i++) {
            const [
              subscriptionIdCell,
              userIdCell,
              startDateCell,
              endDateCell,
              amountCell,
              ingressiCell,
              currencyCell,
              statusCell
            ] = rows[i].values.slice(1);

            const startDate = startDateCell;
            const endDate = endDateCell;
            const amount = amountCell;
            const ingressi = ingressiCell;
            const currency = cellValueToString(currencyCell) || 'EUR';
            const status = cellValueToString(statusCell) || SubscriptionStatus.PENDING;

            if (!userIdCell || !startDate || !endDate) continue;

            try {
              if (subscriptionIdCell) {
                await tx.subscription.update({
                  where: { id: subscriptionIdCell },
                  data: { startDate, endDate, amount, ingressi, currency, status }
                });
              } else {
                // Non avendo ID, usiamo upsert per userId+startDate+endDate come chiave virtuale
                await tx.subscription.upsert({
                  where: { id: subscriptionIdCell || 0 }, // dummy per upsert
                  update: { startDate, endDate, amount, ingressi, currency, status },
                  create: { userId: userIdCell, startDate, endDate, amount, ingressi, currency, status }
                });
              }
              report.subscriptions.created++;
            } catch (e) {
              report.subscriptions.errors.push({ row: i + 2, userId: userIdCell, error: e.message });
            }
          }
        }

        /* ================= GROUPS ================= */
        const groupsSheet = workbook.getWorksheet('GROUPS');
        if (groupsSheet) {
          const rows = [];
          groupsSheet.eachRow((row, i) => i > 1 && rows.push(row));

          for (let i = 0; i < rows.length; i++) {
            const [groupIdCell, nameCell, descriptionCell] = rows[i].values.slice(1);

            const name = cellValueToString(nameCell);
            const description = cellValueToString(descriptionCell);

            if (!name) continue;

            try {
              await tx.group.upsert({
                where: { name }, // name è UNIQUE
                update: { description },
                create: { name, description }
              });
              report.groups.created++;
            } catch (e) {
              report.groups.errors.push({ row: i + 2, name, error: e.message });
            }
          }
        }

        /* ================= USER_GROUPS ================= */
        const ugSheet = workbook.getWorksheet('USER_GROUPS');
        if (ugSheet) {
          const rows = [];
          ugSheet.eachRow((row, i) => i > 1 && rows.push(row));

          for (let i = 0; i < rows.length; i++) {
            const [
              userIdCell,
              groupIdCell,
              subscriptionIdCell,
              validFromCell,
              validToCell,
              isActiveCell
            ] = rows[i].values.slice(1);

            const validFrom = validFromCell;
            const validTo = validToCell;
            const isActive = isActiveCell ?? true;

            if (!userIdCell || !groupIdCell || !subscriptionIdCell) continue;

            try {
              await tx.userGroup.upsert({
                where: {
                  userId_groupId_subscriptionId: {
                    userId: userIdCell,
                    groupId: groupIdCell,
                    subscriptionId: subscriptionIdCell
                  }
                },
                update: { validFrom, validTo, isActive },
                create: { userId: userIdCell, groupId: groupIdCell, subscriptionId: subscriptionIdCell, validFrom, validTo, isActive }
              });
              report.userGroups.created++;
            } catch (e) {
              report.userGroups.errors.push({
                row: i + 2,
                userId: userIdCell,
                groupId: groupIdCell,
                error: e.message
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

module.exports = router;