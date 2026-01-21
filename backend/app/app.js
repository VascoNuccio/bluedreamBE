require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Import core middleware and utilities check roles and filtering
const { Role } = require('@prisma/client');
const { verifyToken } = require('./core/middleware');
const { requireRole } = require('./core/roleCheck');
const { guardRequest } = require('./core/guardRequest');
const { filterResponse } = require('./core/filterResponse');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const superadminRoutes = require('./routes/superadmin');

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

// app.use('/api/auth', authRoutes);
// app.use('/api/user', userRoutes);
// app.use('/api/admin', adminRoutes);
// app.use('/api/superadmin', superadminRoutes);

/* ================================
   ROUTES
================================ */

// AUTH → nessun middleware
app.use('/api/auth', authRoutes);

// USER → autenticato
app.use(
  '/api/user',
  verifyToken,
  requireRole([Role.USER, Role.ADMIN, Role.SUPERADMIN]),
  guardRequest(),
  filterResponse(),
  userRoutes
);

// ADMIN → admin + superadmin
app.use(
  '/api/admin',
  verifyToken,
  requireRole([Role.ADMIN, Role.SUPERADMIN]),
  guardRequest(),
  filterResponse(),
  adminRoutes
);

// SUPERADMIN → solo superadmin
app.use(
  '/api/superadmin',
  verifyToken,
  requireRole([Role.SUPERADMIN]),
  guardRequest(),
  filterResponse(),
  superadminRoutes
);

app.get('/health', (_, res) => {
  res.json({ status: 'ok' });
});

const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

// Swagger JSON
//download file swagger.json
//curl http://localhost:5000/api/swagger.json -o swagger.json
//http://localhost:5000/api/swagger.json
app.get('/api/swagger.json', (req, res) => {
  res.json(swaggerSpec);
});

// Swagger UI
// Documentazione Swagger
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      url: '/api/swagger.json',
    },
  })
);



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


