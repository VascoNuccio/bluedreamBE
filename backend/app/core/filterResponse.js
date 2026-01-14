const { Role } = require('@prisma/client');

const filterResponse = () => {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (data) => {
      if (req.user.role === Role.SUPERADMIN) {
        return originalJson(data);
      }

      const filterUser = (user) =>
        user?.role === Role.SUPERADMIN ? null : user;

      // Array utenti
      if (Array.isArray(data)) {
        return originalJson(
          data
            .map(filterUser)
            .filter(Boolean)
        );
      }

      // Oggetto singolo
      if (data?.role === Role.SUPERADMIN) {
        return originalJson({ message: 'Risorsa non disponibile' });
      }

      // Oggetti annidati
      if (data?.users) {
        data.users = data.users
          .map(filterUser)
          .filter(Boolean);
      }

      return originalJson(data);
    };

    next();
  };
};

module.exports = { filterResponse };
