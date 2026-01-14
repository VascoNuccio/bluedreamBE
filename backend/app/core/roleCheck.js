const { Role } = require('@prisma/client');

const requireRole = (roles = []) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Accesso negato' });
    }
    next();
  };
};

module.exports = { requireRole };
