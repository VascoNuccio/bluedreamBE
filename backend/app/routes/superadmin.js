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
const { cellValueToString } = require('../utils/excel');

const prisma = new PrismaClient();
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

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
  usersSheet.columns = [
    { header: 'userId', key: 'id', width: 38 },
    { header: 'email', key: 'email', width: 30 },
    { header: 'password', key: 'password', width: 20 },
    { header: 'firstName', key: 'firstName', width: 20 },
    { header: 'lastName', key: 'lastName', width: 20 },
    { header: 'role', key: 'role', width: 15 },
    { header: 'status', key: 'status', width: 20 }
  ];

  /* ========== SUBSCRIPTIONS ========== */
  const subsSheet = wb.addWorksheet('SUBSCRIPTIONS');
  subsSheet.columns = [
    { header: 'subscriptionId', key: 'id', width: 15 },
    { header: 'userId', key: 'userId', width: 38 },
    { header: 'startDate', key: 'startDate', width: 15 },
    { header: 'endDate', key: 'endDate', width: 15 },
    { header: 'amount', key: 'amount', width: 12 },
    { header: 'currency', key: 'currency', width: 10 },
    { header: 'status', key: 'status', width: 20 }
  ];

  /* ========== USER_GROUPS ========== */
  const ugSheet = wb.addWorksheet('USER_GROUPS');
  ugSheet.columns = [
    { header: 'userId', key: 'userId', width: 38 },
    { header: 'groupId', key: 'groupId', width: 10 },
    { header: 'subscriptionId', key: 'subscriptionId', width: 15 },
    { header: 'validFrom', key: 'validFrom', width: 15 },
    { header: 'validTo', key: 'validTo', width: 15 },
    { header: 'isActive', key: 'isActive', width: 10 }
  ];

  /* ========== GROUPS ========== */
  const groupsSheet = wb.addWorksheet('GROUPS');
  groupsSheet.columns = [
    { header: 'groupId', key: 'id', width: 10 },
    { header: 'name', key: 'name', width: 25 },
    { header: 'description', key: 'description', width: 40 }
  ];

  /* ========== ENUMS ========== */
  const enumSheet = wb.addWorksheet('ENUMS');
  enumSheet.addRow(['Role', ...Object.values(Role)]);
  enumSheet.addRow(['UserStatus', ...Object.values(UserStatus)]);
  enumSheet.addRow(['SubscriptionStatus', ...Object.values(SubscriptionStatus)]);
  enumSheet.addRow(['EventStatus', ...Object.values(EventStatus)]);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    'attachment; filename=admin_bulk_template.xlsx'
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
              currencyCell,
              statusCell
            ] = rows[i].values.slice(1);

            const startDate = startDateCell;
            const endDate = endDateCell;
            const amount = amountCell;
            const currency = cellValueToString(currencyCell) || 'EUR';
            const status = cellValueToString(statusCell) || SubscriptionStatus.PENDING;

            if (!userIdCell || !startDate || !endDate) continue;

            try {
              if (subscriptionIdCell) {
                await tx.subscription.update({
                  where: { id: subscriptionIdCell },
                  data: { startDate, endDate, amount, currency, status }
                });
              } else {
                // Non avendo ID, usiamo upsert per userId+startDate+endDate come chiave virtuale
                await tx.subscription.upsert({
                  where: { id: subscriptionIdCell || 0 }, // dummy per upsert
                  update: { startDate, endDate, amount, currency, status },
                  create: { userId: userIdCell, startDate, endDate, amount, currency, status }
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