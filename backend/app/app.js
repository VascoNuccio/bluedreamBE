require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const templateRoutes = require('./routes/template');

const app = express();

// Configurazione CORS sicura
// const allowedOrigins = [
//   process.env.CLIENT_URL,  // FE web
//   'capacitor://localhost',                            // web mobile app create with capacitor
//   'http://localhost',                                  // localhost in dev 
//   'my-mobile-app://*'                                     // App mobile in prod (esempio schema URL)
// ];

// app.use(cors({
//   origin: function (origin, callback) {
//     // allow requests with no origin (mobile apps, curl, postman)
//     if (!origin) return callback(null, true);
//     if (allowedOrigins.indexOf(origin) === -1) {
//       const msg = `CORS policy: Origin ${origin} not allowed`;
//       return callback(new Error(msg), false);
//     }
//     return callback(null, true);
//   },
//   credentials: true
// }));

// Configurazione CORS permissiva (da rivedere in produzione) valida per testing con app mobile
app.use(cors({
  origin: true,        // accetta tutte le origini, incluso mobile
  credentials: true
}));

app.use(express.json());
app.use(cookieParser()); // Per leggere i cookie

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/template', templateRoutes);

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


