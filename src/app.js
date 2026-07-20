'use strict';

const fastify = require('fastify');
const cors = require('@fastify/cors');

const db = require('./db/pool');
const errorHandler = require('./core/middlewares/errorHandler');

const appointmentsModule = require('./modules/appointments');
const dashboardModule = require('./modules/dashboard');
const patientsModule = require('./modules/patients');
const bookingsModule = require('./modules/bookings');
const staffModule = require('./modules/staff');

async function buildApp() {
  const app = fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: 'http://localhost:5173',
    credentials: false,
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],
  });

  app.setErrorHandler(errorHandler);

  app.get('/health', async () => {
    try {
      await db.query('SELECT 1');

      return {
        success: true,
        database: 'connected',
      };
    } catch (error) {
      return {
        success: false,
        database: 'disconnected',
        error: error.message,
      };
    }
  });

  appointmentsModule.register({ app, db });
  dashboardModule.register({ app, db });
  patientsModule.register({ app, db });
  bookingsModule.register({ app, db });
  staffModule.register({ app, db });

  return app;
}

module.exports = buildApp;