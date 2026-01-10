const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Event & Subscription API',
      version: '1.0.0',
      description: 'API per gestione utenti, eventi e subscription'
    },
    servers: [
      {
        url: 'http://localhost:5000/api',
        description: 'Local server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },

  // percorso routes dove leggere i commenti per popolare lo swagger
  apis: [
    './app/routes/*.js',   // ← percorso REALE
    './app/routes/**/*.js'
  ]
};

module.exports = swaggerJsdoc(options);
