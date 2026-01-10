const express = require('express');
const { PrismaClient, SubscriptionStatus, UserStatus, EventStatus, Role } = require('@prisma/client');
const prisma = new PrismaClient();
const { verifyToken, isAdmin } = require('../core/middleware');
const { hashPassword } = require('../utils/password');
const { createSubscriptionWithGroups } = require('../utils/subscription');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

/* ================================
   DOWNLOAD ADMIN EXCEL TEMPLATE
================================ */
/**
 * @swagger
 * /admin/template/download:
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
router.get('/download', verifyToken, isAdmin, async (req, res) => {
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
 * /admin/template/upload:
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
  '/upload',
  verifyToken,
  isAdmin,
  upload.single('file'),
  async (req, res) => {
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

        usersSheet?.eachRow((row, i) => {
          if (i === 1) return;

          const [
            userId,
            email,
            password,
            firstName,
            lastName,
            role,
            status
          ] = row.values.slice(1);

          if (!email) return;

          try {
            if (userId) {
              tx.user.update({
                where: { id: userId },
                data: {
                  firstName,
                  lastName,
                  role,
                  status
                }
              });
              report.users.updated++;
            } else {
              tx.user.create({
                data: {
                  email,
                  password,
                  firstName,
                  lastName,
                  role: role || Role.USER,
                  status: status || UserStatus.SUBSCRIBED
                }
              });
              report.users.created++;
            }
          } catch (e) {
            report.users.errors.push({
              row: i,
              email,
              error: e.message
            });
          }
        });

        /* ================= SUBSCRIPTIONS ================= */
        const subsSheet = workbook.getWorksheet('SUBSCRIPTIONS');

        subsSheet?.eachRow((row, i) => {
          if (i === 1) return;

          const [
            subscriptionId,
            userId,
            startDate,
            endDate,
            amount,
            currency,
            status
          ] = row.values.slice(1);

          if (!userId || !startDate || !endDate) return;

          try {
            if (subscriptionId) {
              tx.subscription.update({
                where: { id: subscriptionId },
                data: {
                  startDate,
                  endDate,
                  amount,
                  currency,
                  status
                }
              });
              report.subscriptions.updated++;
            } else {
              tx.subscription.create({
                data: {
                  userId,
                  startDate,
                  endDate,
                  amount,
                  currency: currency || 'EUR',
                  status: status || SubscriptionStatus.PENDING
                }
              });
              report.subscriptions.created++;
            }
          } catch (e) {
            report.subscriptions.errors.push({
              row: i,
              userId,
              error: e.message
            });
          }
        });

        /* ================= GROUPS ================= */
        const groupsSheet = workbook.getWorksheet('GROUPS');

        groupsSheet?.eachRow((row, i) => {
          if (i === 1) return;

          const [groupId, name, description] = row.values.slice(1);
          if (!name) return;

          try {
            if (groupId) {
              tx.group.update({
                where: { id: groupId },
                data: { name, description }
              });
              report.groups.updated++;
            } else {
              tx.group.create({
                data: { name, description }
              });
              report.groups.created++;
            }
          } catch (e) {
            report.groups.errors.push({
              row: i,
              name,
              error: e.message
            });
          }
        });

        /* ================= USER_GROUPS ================= */
        const ugSheet = workbook.getWorksheet('USER_GROUPS');

        ugSheet?.eachRow((row, i) => {
          if (i === 1) return;

          const [
            userId,
            groupId,
            subscriptionId,
            validFrom,
            validTo,
            isActive
          ] = row.values.slice(1);

          if (!userId || !groupId || !subscriptionId) return;

          try {
            tx.userGroup.upsert({
              where: {
                userId_groupId_subscriptionId: {
                  userId,
                  groupId,
                  subscriptionId
                }
              },
              update: {
                validFrom,
                validTo,
                isActive
              },
              create: {
                userId,
                groupId,
                subscriptionId,
                validFrom,
                validTo,
                isActive: isActive ?? true
              }
            });
            report.userGroups.updated++;
          } catch (e) {
            report.userGroups.errors.push({
              row: i,
              userId,
              groupId,
              error: e.message
            });
          }
        });

      });

      res.status(200).json({
        message: 'Import completato',
        report
      });

    } catch (error) {
      console.error('Admin template upload error:', error);
      res.status(500).json({
        message: 'Errore durante il caricamento del file Excel'
      });
    }
  }
);


module.exports = router;