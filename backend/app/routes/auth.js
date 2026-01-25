require('dotenv').config();
const express = require('express');
const prisma = require('../prisma');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { comparePassword } = require('../utils/password');
const { generateAccessToken, generateRefreshToken } = require('../utils/token');
const { createPayment, confirmPayment } = require('../utils/payment');

const router = express.Router();
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "";

/* ================================
   AUTH: Login
================================ */
/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login utente
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 description: Email dell'utente
 *                 example: user@test.com
 *               password:
 *                 type: string
 *                 description: Password dell'utente
 *                 example: test123
 *     responses:
 *       200:
 *         description: Login riuscito
 *       401:
 *         description: Credenziali errate
 *       403:
 *         description: Utente cancellato
 *       500:
 *         description: Errore server
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status === 'CANCELLED') {
      return res.status(403).json({ message: 'Utente cancellato' });
    }
    const valid = await comparePassword(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Credenziali errate' });

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ token, user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Errore durante il login' });
  }
});

/* ================================
   AUTH: Register
================================ */
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registrazione utente
 *     description: Registra un nuovo utente e crea una subscription PENDING
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@test.com
 *               password:
 *                 type: string
 *                 example: test123
 *               firstName:
 *                 type: string
 *                 example: Mario
 *               lastName:
 *                 type: string
 *                 example: Rossi
 *               paymentProvider:
 *                 type: string
 *                 description: Provider pagamento (es. paypal, stripe)
 *                 example: paypal
 *     responses:
 *       201:
 *         description: Utente registrato con subscription PENDING
 *       400:
 *         description: Dati non validi
 *       409:
 *         description: Utente già registrato
 *       500:
 *         description: Errore server
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, paymentProvider } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email e password sono obbligatori' });

    const hashedPassword = await bcrypt.hash(password, 10);
    let user;
    try {
      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName: firstName || null,
          lastName: lastName || null,
          role: 'USER',
          status: 'SUBSCRIBED'
        }
      });
    } catch (err) {
      if (err.code === 'P2002') return res.status(409).json({ message: 'Utente già registrato' });
      throw err;
    }

    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30*24*60*60*1000),
        amount: 0,
        ingressi: 32,
        currency: 'EUR',
        status: 'PENDING'
      }
    });

    await createPayment({ provider: paymentProvider, subscription });

    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role },
      subscription: { id: subscription.id, status: subscription.status }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Errore nella registrazione' });
  }
});

/* ================================
   AUTH: Refresh token
================================ */
/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rinnova access token
 *     description: Genera un nuovo access token usando il refresh token salvato come cookie
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Token rinnovato
 *       401:
 *         description: Refresh token mancante
 *       403:
 *         description: Refresh token non valido o scaduto
 */
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: "Refresh token mancante" });

    const user = await prisma.user.findFirst({ where: { refreshToken } });
    if (!user) return res.status(403).json({ message: "Refresh token non valido" });

    try { jwt.verify(refreshToken, JWT_REFRESH_SECRET); }
    catch { return res.status(403).json({ message: "Refresh token non valido o scaduto" }); }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken: newRefreshToken } });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      token: newAccessToken,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
    });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(401).json({ message: "Refresh token non valido o scaduto" });
  }
});

/* ================================
   AUTH: Confirm Payment
================================ */
/**
 * @swagger
 * /auth/payment/confirm:
 *   post:
 *     summary: Conferma pagamento
 *     description: Aggiorna lo stato della subscription da PENDING a ACTIVE
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - paymentId
 *               - subscriptionId
 *             properties:
 *               provider:
 *                 type: string
 *                 example: paypal
 *               paymentId:
 *                 type: string
 *                 example: PP123456
 *               subscriptionId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Pagamento confermato
 *       400:
 *         description: Subscription già attiva o pagamento non confermato
 *       500:
 *         description: Errore server
 */
router.post('/payment/confirm', async (req, res) => {
  try {
    const { provider, paymentId, subscriptionId } = req.body;
    const success = await confirmPayment({ provider, paymentId });
    if (!success) return res.status(400).json({ message: 'Pagamento non confermato' });

    const updated = await prisma.subscription.updateMany({
      where: { id: subscriptionId, status: 'PENDING' },
      data: { status: 'ACTIVE' }
    });

    if (updated.count === 0) {
      return res.status(400).json({ message: 'Subscription già attiva o non trovata' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Payment confirmation error:', err);
    res.status(500).json({ message: 'Errore conferma pagamento' });
  }
});

/* ================================
   AUTH: Logout
================================ */
/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout utente
 *     description: Invalida il refresh token e cancella il cookie
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Logout completato
 *       500:
 *         description: Errore server
 */
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await prisma.user.updateMany({
        where: { refreshToken },
        data: { refreshToken: null },
      });
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/',
    });

    res.json({ message: "Logout completato" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Errore durante il logout" });
  }
});

module.exports = router;
