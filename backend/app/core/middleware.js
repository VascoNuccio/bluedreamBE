const jwt = require('jsonwebtoken');

// JWT Secret (in production, use a strong secret from environment)
const JWT_SECRET = process.env.JWT_SECRET || '';

/* ================================
   VERIFY JWT TOKEN
================================ */
const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token mancante' });
  }

  try {
    const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Token non valido' });
  }
};

/* ================================
   ADMIN CHECK
================================ */
const isAdmin = (req, res, next) => {
  if (req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN') {
    return next();
  }
  return res.status(403).json({ message: 'Accesso admin richiesto' });
};

/* ================================
   SUPERADMIN CHECK
================================ */
const isSuperAdmin = (req, res, next) => {
  if (req.user.role === 'SUPERADMIN') {
    return next();
  }
  return res.status(403).json({ message: 'Accesso super admin richiesto' });
};

module.exports = { verifyToken, isAdmin, isSuperAdmin };