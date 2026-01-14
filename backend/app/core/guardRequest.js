const { Role } = require('@prisma/client');

const guardRequest = (options = {}) => {
  const {
    forbidCreateRoles = [],
    forbidUpdateRoles = [],
    forbidDeleteRoles = []
  } = options;

  return (req, res, next) => {
    const actorRole = req.user.role;
    const targetRole = req.body?.role;

    // BLOCCO CREAZIONE
    if (
      req.method === 'POST' &&
      targetRole &&
      forbidCreateRoles.includes(targetRole) &&
      actorRole !== Role.SUPERADMIN
    ) {
      return res.status(403).json({
        message: `Non puoi creare utenti con ruolo ${targetRole}`
      });
    }

    // BLOCCO UPDATE ROLE
    if (
      req.method === 'PUT' &&
      targetRole &&
      forbidUpdateRoles.includes(targetRole) &&
      actorRole !== Role.SUPERADMIN
    ) {
      return res.status(403).json({
        message: `Non puoi assegnare il ruolo ${targetRole}`
      });
    }

    next();
  };
};

module.exports = { guardRequest };
