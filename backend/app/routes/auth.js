require('dotenv').config();
const express = require('express');
const prisma = require('../prisma');
const jwt = require('jsonwebtoken');
const { comparePassword } = require('../utils/password');
const { generateAccessToken, generateRefreshToken } = require('../utils/token');
const { createPayment, confirmPayment } = require('../utils/payment');

const router = express.Router();

// JWT REFRESH Secret (in production, use a very strong secret from environment)
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
 *                 description: Indirizzo email dell'utente
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
 *         description: Errore durante il login
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
 *     description: Registrazione con subscription in stato PENDING
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
 *               password:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       201:
 *         description: Utente registrato
 *       400:
 *         description: Dati non validi
 *       500:
 *         description: Errore server
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email e password sono obbligatori' });

    // Controllo utente già esistente
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ message: 'Utente già registrato' });

    // Hash della password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Creazione utente
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        role: 'USER',
        status: 'SUBSCRIBED' // lo status dell'utente in sé rimane SUBSCRIBED
      }
    });

    // Creazione subscription PENDING
    const subscription = await prisma.subscription.create({
      data: {
        userId: user.id,
        startDate: new Date(),          // inizio subscription
        endDate: new Date(Date.now() + 30*24*60*60*1000), // 30 giorni di esempio
        amount: 0,                      // sarà aggiornato dopo pagamento
        ingressi: 32,                   // da controllare e aggiornare dopo il pagamento
        currency: 'EUR',
        status: 'PENDING'               // <-- PENDING finché il pagamento non è confermato
      }
    });

    // Genera pagamento tramite provider selezionato
    const payment = await createPayment({ provider: paymentProvider, subscription });

    // Generazione token
    const token = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Salvataggio refresh token sul DB
    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    // Imposta cookie HTTPOnly
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
 *     summary: Refresh access token
 *     description: >
 *       Genera un nuovo access token utilizzando il refresh token
 *       salvato come cookie HTTPOnly.
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Token rinnovato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: Nuovo access token JWT
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     role:
 *                       type: string
 *       401:
 *         description: Refresh token mancante o scaduto
 *       403:
 *         description: Refresh token non valido
 */
router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token mancante" });
    }

    const user = await prisma.user.findFirst({ where: { refreshToken } });
    if (!user) {
      return res.status(403).json({ message: "Refresh token non valido" });
    }

    jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken }
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      token: newAccessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
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
 *     summary: Conferma pagamento di una subscription
 *     description: >
 *       Aggiorna lo stato della subscription da `PENDING` a `ACTIVE` 
 *       una volta che il pagamento è stato confermato.
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
 *                 description: Nome del provider di pagamento (paypal, stripe, postepay, ecc.)
 *                 example: paypal
 *               paymentId:
 *                 type: string
 *                 description: ID del pagamento generato dal provider
 *                 example: PP123456
 *               subscriptionId:
 *                 type: integer
 *                 description: ID della subscription da aggiornare
 *                 example: 1
 *     responses:
 *       200:
 *         description: Pagamento confermato e subscription aggiornata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Pagamento non confermato
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Pagamento non confermato
 *       500:
 *         description: Errore server durante la conferma del pagamento
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Errore conferma pagamento
 */
router.post('/payment/confirm', async (req, res) => {
  try {
    const { provider, paymentId, subscriptionId } = req.body;

    const success = await confirmPayment({ provider, paymentId });
    if (!success) return res.status(400).json({ message: 'Pagamento non confermato' });

    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: 'ACTIVE' }
    });

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
 *     description: >
 *       Invalida il refresh token dell'utente, rimuovendolo dal database
 *       e cancellando il cookie httpOnly dal browser.
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout completato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Logout completato
 *       401:
 *         description: Utente non autenticato
 *       500:
 *         description: Errore durante il logout
 */
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
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

