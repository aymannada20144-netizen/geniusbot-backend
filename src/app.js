'use strict';

const fastify = require('fastify');
const cors = require('@fastify/cors');

const db = require('./db/pool');
const env = require('./config/env');
const errorHandler = require('./core/middlewares/errorHandler');
const sendWhatsAppMessage = require('./channels/whatsapp/sendWhatsAppMessage');
const createRecoveryComposition = require('./modules/revenue/recovery/createRecoveryComposition');
const ClinicRepository = require('./repositories/ClinicRepository');
const PatientRepository = require('./modules/patients/PatientRepository');
const ConversationRepository = require('./repositories/ConversationRepository');
const MessageRepository = require('./repositories/MessageRepository');
const AiClient = require('./intelligence/AiClient');
const ShadenService = require('./services/ShadenService');
const WhatsAppController = require('./channels/whatsapp/WhatsAppController');

const appointmentsModule = require('./modules/appointments');
const dashboardModule = require('./modules/dashboard');
const patientsModule = require('./modules/patients');
const bookingsModule = require('./modules/bookings');
const staffModule = require('./modules/staff');
const masterDataModule = require('./modules/master-data');

const ALLOWED_FRONTEND_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

async function buildApp() {
  const app = fastify({
    logger: true,
  });

  await app.register(cors, {
    origin(origin, callback) {
      callback(
        null,
        !origin || ALLOWED_FRONTEND_ORIGINS.has(origin)
      );
    },
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
  masterDataModule.register({ app, db });

  const shadenService = new ShadenService({
    clinicRepository: new ClinicRepository(db),
    patientRepository: new PatientRepository(db),
    conversationRepository: new ConversationRepository(db),
    messageRepository: new MessageRepository(db),
    aiClient: new AiClient(),
    sendMessage: sendWhatsAppMessage,
  });
  const whatsappController = new WhatsAppController(shadenService);
  app.get('/api/whatsapp/webhook', whatsappController.verifyWebhook.bind(whatsappController));
  app.post('/api/whatsapp/webhook', whatsappController.receiveWebhook.bind(whatsappController));

  const { recoveryWorkerService } = createRecoveryComposition({
    db: db.pool,
    clock: {
      now: () => new Date(),
    },
    sendMessage: sendWhatsAppMessage,
    whatsappTemplateName: env.whatsapp.recoveryTemplateName,
  });

  await recoveryWorkerService.runNext();

  return app;
}

module.exports = buildApp;
