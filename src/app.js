'use strict';

const fastify = require('fastify');
const cors = require('@fastify/cors');

const db = require('./db/pool');
const env = require('./config/env');
const errorHandler = require('./core/middlewares/errorHandler');
const sendWhatsAppMessage = require('./channels/whatsapp/sendWhatsAppMessage');
const createRecoveryComposition = require('./modules/revenue/recovery/createRecoveryComposition');
const ConversationRepository = require('./repositories/ConversationRepository');
const MessageRepository = require('./repositories/MessageRepository');
const createShadenEngine = require(
  './services/shaden/createShadenEngine'
);
const createRepositories = require('./repositories');
const MasterDataService = require('./modules/master-data/MasterDataService');
const MasterDataRepository = require('./modules/master-data/MasterDataRepository');
const WhatsAppController = require('./channels/whatsapp/WhatsAppController');
const BookingEngine = require('./modules/bookings/BookingEngine');
const BookingService = require('./services/BookingService');
const AvailabilityService = require('./services/availability/AvailabilityService');
const ClinicService = require('./services/ClinicService');
const ConversationService = require('./services/ConversationService');
const PatientService = require('./modules/patients/PatientService');
const WhatsAppMessageDebouncer = require('./channels/whatsapp/WhatsAppMessageDebouncer');
const PriceService = require('./services/PriceService');
const KnowledgeService = require('./services/KnowledgeService');
const CommunicationService = require(
  './communication/services/CommunicationService'
);
const CommunicationJob = require(
  './communication/jobs/CommunicationJob'
);
const ProductionWhatsAppTransport = require(
  './channels/whatsapp/ProductionWhatsAppTransport'
);
const AppointmentRepository = require(
  './modules/appointments/AppointmentRepository'
);
const AppointmentService = require(
  './modules/appointments/AppointmentService'
);
const NotificationService = require('./services/NotificationService');
const NotificationScheduler = require('./services/NotificationScheduler');
const LocalEventBus = require('./core/events/LocalEventBus');
const OutboxRepository = require('./core/events/OutboxRepository');
const OutboxPublisher = require('./core/events/OutboxPublisher');
const OutboxScheduler = require('./core/events/OutboxScheduler');
const AppointmentEvents = require('./modules/appointments/AppointmentEvents');
const AppointmentChangeDeliveryRepository = require('./repositories/AppointmentChangeDeliveryRepository');
const AppointmentChangeNotificationProcessor = require('./services/AppointmentChangeNotificationProcessor');
const WhatsAppStatusRouter = require('./channels/whatsapp/WhatsAppStatusRouter');

const appointmentsModule = require('./modules/appointments');
const dashboardModule = require('./modules/dashboard');
const patientsModule = require('./modules/patients');
const bookingsModule = require('./modules/bookings');
const staffModule = require('./modules/staff');
const masterDataModule = require('./modules/master-data');
const reportsModule = require('./modules/reports');
const assistantIdentityModule = require('./modules/assistant-identity');
const pricesModule = require('./modules/prices');
const campaignsModule = require('./modules/campaigns');

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

  const communicationService = new CommunicationService({
    job: new CommunicationJob({
      transport: new ProductionWhatsAppTransport(),
    }),
  });
  const bookingRepositories = createRepositories(db);
  const notificationService = new NotificationService(
    bookingRepositories.notifications,
    communicationService,
    {
      googleReviewDelayMinutes:
        env.notifications.googleReviewDelayMinutes,
    }
  );
  const notificationScheduler = new NotificationScheduler(
    notificationService,
    {
      intervalMs: env.notifications.intervalMs,
      logger: app.log,
    }
  );
  const eventBus = new LocalEventBus({ logger: app.log });
  const changeNotificationProcessor = new AppointmentChangeNotificationProcessor({
    deliveryRepository: new AppointmentChangeDeliveryRepository(db),
    notificationService: new NotificationService(bookingRepositories.notifications,
      new CommunicationService({ job: new CommunicationJob({
        transport: new ProductionWhatsAppTransport(), maxAttempts: 1,
      }) })),
    logger: app.log,
  });
  eventBus.subscribe(AppointmentEvents.CHANGED,
    (payload, metadata) => changeNotificationProcessor.process(payload, metadata));
  const outboxScheduler = new OutboxScheduler(
    new OutboxPublisher(new OutboxRepository(db), eventBus),
    { logger: app.log }
  );
  const availabilityService = new AvailabilityService(bookingRepositories);
  const bookingService = new BookingService(
    bookingRepositories,
    availabilityService,
    communicationService,
    notificationService
  );
  const appointmentService = new AppointmentService(
    new AppointmentRepository(db),
    communicationService,
    notificationService,
    {
      googleReviewDelayMinutes:
        env.notifications.googleReviewDelayMinutes,
      availabilityService,
      bookingService,
      priceService: bookingService.priceService,
    }
  );

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

  appointmentsModule.register({ app, db, appointmentService });
  dashboardModule.register({ app, db, appointmentService });
  patientsModule.register({ app, db });
  bookingsModule.register({ app, db });
  staffModule.register({ app, db });
  masterDataModule.register({ app, db });
  reportsModule.register({ app, db });
  const assistantIdentity = assistantIdentityModule.register({ app, db });
  pricesModule.register({ app, db });
  const campaigns = campaignsModule.register({ app, db, communicationService });

  const bookingEngine = new BookingEngine({ bookingService });
  const clinicRepository = bookingRepositories.clinics;
  const conversationRepository = new ConversationRepository(db);
  const messageRepository = new MessageRepository(db);
  const clinicService = new ClinicService(
    clinicRepository,
    bookingRepositories.branches
  );
  const conversationService = new ConversationService(
    conversationRepository
  );
  const patientService = new PatientService(bookingRepositories.patients);
  const priceService = new PriceService(bookingRepositories.prices);
  const knowledgeService = new KnowledgeService(
    bookingRepositories.knowledgeBase
  );
  const catalogService = new MasterDataService(
    new MasterDataRepository(db)
  );
  const conversationEngine = createShadenEngine({
    clinicRepository,
    conversationRepository,
    patientRepository: bookingRepositories.patients,
    clinicService,
    conversationService,
    patientService,
    messageRepository,
    catalogService,
    serviceRepository: bookingRepositories.services,
    branchRepository: bookingRepositories.branches,
    serviceAssignmentRepository: bookingRepositories.serviceAssignments,
    clinicConfigurationSource: assistantIdentity.service,
    bookingEngine,
    appointmentService,
    priceService,
    knowledgeService,
    knowledgeBaseRepository: bookingRepositories.knowledgeBase,
    conversationEnabled: env.conversation.enabled,
    conversationApiKey: env.conversation.openRouterApiKey,
    conversationBaseUrl: env.conversation.openRouterBaseUrl,
    conversationModel: env.conversation.model,
    logger: app.log,
    sendMessage: sendWhatsAppMessage,
  });
  const inboundConversationService = new WhatsAppMessageDebouncer({
    target: conversationEngine,
    windowMs: env.whatsappMessageDebounceMs,
    logger: app.log,
  });
  app.log.info({
    event: 'SHADEN_WHATSAPP_COMPOSITION',
    route: env.conversation.enabled
      ? 'LLM_CONVERSATION_WITH_OPERATIONAL_CORE'
      : 'DETERMINISTIC',
    conversationLayerEnabled: env.conversation.enabled,
    debouncerConstructed: true,
    debounceMs: env.whatsappMessageDebounceMs,
  });
  const whatsappStatusRouter = new WhatsAppStatusRouter({
    campaignService: campaigns.service,
    appointmentChangeDeliveries: new AppointmentChangeDeliveryRepository(db),
    logger: app.log,
  });
  const whatsappController = new WhatsAppController(inboundConversationService, {
    verifyToken: env.whatsapp.verifyToken,
    statusHandler: whatsappStatusRouter.handle.bind(whatsappStatusRouter),
    logger: app.log,
  });
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

  notificationScheduler.start();
  outboxScheduler.start();
  campaigns.scheduler.start();
  app.addHook('onClose', async () => {
    notificationScheduler.stop();
    outboxScheduler.stop();
    campaigns.scheduler.stop();
  });

  return app;
}

module.exports = buildApp;
