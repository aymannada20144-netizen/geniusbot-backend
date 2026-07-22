'use strict';

const ClinicRepository = require('../../../repositories/ClinicRepository');
const PatientRepository = require('../../../repositories/PatientRepository');
const ConversationRepository = require('../../../repositories/ConversationRepository');
const StaffRepository = require('../../staff/StaffRepository');
const BaseRepository = require('../../../core/BaseRepository');
const RecoveryAttemptRepository = require('./RecoveryAttemptRepository');
const RecoveryPolicy = require('./RecoveryPolicy');
const RecoveryMessageBuilder = require('./RecoveryMessageBuilder');
const RecoveryChannelRouter = require('./RecoveryChannelRouter');
const RecoveryExecutionService = require('./RecoveryExecutionService');
const RecoveryExecutionContextProvider = require('./RecoveryExecutionContextProvider');
const RecoveryWorkerService = require('./RecoveryWorkerService');
const RecoveryRetryPolicy = require('./RecoveryRetryPolicy');
const WhatsAppRecoverySender = require('../../../channels/whatsapp/WhatsAppRecoverySender');
const createRecoveryExecutionLoader = require('./createRecoveryExecutionLoader');

const {
  RECOVERY_CHANNEL,
} = require('../../../constants/recoveryChannel');

function createRecoveryComposition({
  db,
  clock,
  sendMessage,
  whatsappTemplateName,
} = {}) {
  assertObjectOrFunction(db, 'db');
  assertCallableMethod(db, 'query', 'db');
  assertCallableMethod(db, 'connect', 'db');
  assertObjectOrFunction(clock, 'clock');
  assertCallableMethod(clock, 'now', 'clock');

  if (typeof sendMessage !== 'function') {
    throw new TypeError(
      'createRecoveryComposition: sendMessage must be callable.'
    );
  }

  if (
    typeof whatsappTemplateName !== 'string' ||
    whatsappTemplateName.trim().length === 0
  ) {
    throw new TypeError(
      'createRecoveryComposition: whatsappTemplateName must be a non-empty string.'
    );
  }

  const clinicRepository = new ClinicRepository(db);
  const opportunityRepository = new BaseRepository(
    db,
    'revenue_opportunities'
  );
  const patientRepository = new PatientRepository(db);
  const conversationRepository = new ConversationRepository(db);
  const staffRepository = new StaffRepository(db);
  const recoveryAttemptRepository =
    new RecoveryAttemptRepository(db);

  const whatsappSender =
    new WhatsAppRecoverySender({ sendMessage });
  const providers = Object.freeze({
    [RECOVERY_CHANNEL.WHATSAPP]: whatsappSender,
  });

  const load = createRecoveryExecutionLoader({
    clinicRepository,
    opportunityRepository,
    patientRepository,
    conversationRepository,
    staffRepository,
    providers,
    whatsappTemplateName,
  });

  const recoveryExecutionContextProvider =
    new RecoveryExecutionContextProvider({ load });

  const recoveryExecutionService =
    new RecoveryExecutionService({
      policy: new RecoveryPolicy(),
      messageBuilder: new RecoveryMessageBuilder(),
      channelRouter: new RecoveryChannelRouter(),
    });

  const retryPolicy = new RecoveryRetryPolicy();

  const recoveryWorkerService =
    new RecoveryWorkerService({
      recoveryAttemptRepository,
      recoveryExecutionContextProvider,
      recoveryExecutionService,
      retryPolicy,
      clock,
    });

  return Object.freeze({
    recoveryWorkerService,
  });
}

function assertObjectOrFunction(value, fieldName) {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    throw new TypeError(
      `createRecoveryComposition: ${fieldName} must be an object or function.`
    );
  }
}

function assertCallableMethod(value, methodName, fieldName) {
  let current = value;

  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(
      current,
      methodName
    );

    if (descriptor) {
      if (
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        typeof descriptor.value !== 'function'
      ) {
        throw new TypeError(
          `createRecoveryComposition: ${fieldName}.${methodName} must be callable.`
        );
      }

      return;
    }

    current = Object.getPrototypeOf(current);
  }

  throw new TypeError(
    `createRecoveryComposition: ${fieldName}.${methodName} must be callable.`
  );
}

module.exports = createRecoveryComposition;
