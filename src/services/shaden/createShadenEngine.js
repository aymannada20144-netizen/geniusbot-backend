'use strict';
const ShadenDataProvider = require('./ShadenDataProvider');
const ShadenPolicy = require('./ShadenPolicy');
const ShadenEngine = require('./ShadenEngine');
const { lifecycleMetadataFrom, userFacingHandlerResult } =
  require('../../contracts/shaden/InternalHandlerResult');
const { validateLifecycleTransition, validatePersistedFlowState } =
  require('./FlowLifecycle');
const ShadenConversationContextProvider = require('./ShadenConversationContextProvider');
const ClinicService = require('../ClinicService');
const ConversationService = require('../ConversationService');
const PatientService = require('../../modules/patients/PatientService');
const { normalizeSaudiMobile } = require('../../core/validators/saudiMobile');

function createShadenEngine({
  clinicRepository, conversationRepository, patientRepository,
  clinicService = null, conversationService = null, patientService = null,
  messageRepository, catalogService, serviceAssignmentRepository = null,
  clinicConfigurationSource, bookingEngine, appointmentService = null,
  priceService = null, logger = console, shadenEngine = null, sendMessage,
} = {}) {
  const clinics = clinicService || new ClinicService(clinicRepository);
  const conversations = conversationService ||
    new ConversationService(conversationRepository);
  const patients = patientService || new PatientService(patientRepository);
  const policy = new ShadenPolicy();
  const dataProvider = new ShadenDataProvider({
    catalogService, clinicConfigurationSource, serviceAssignmentRepository,
  });
  const engine = shadenEngine || new ShadenEngine({
    policy, bookingEngine, appointmentService, priceService,
  });
  const contextProvider = new ShadenConversationContextProvider({
    patientService: patients,
  });

  return {
    async processMessage(rawMessage) {
      if (!rawMessage?.text) return null;
      const message = normalizeMessage(rawMessage);
      const clinic = await clinics.resolveWhatsAppClinic({
        phoneNumberId: message.receiverPhoneNumberId,
        displayPhoneNumber: message.receiverId,
      });
      if (!clinic) {
        console.error('WhatsApp clinic resolution failed.', {
          phoneNumberId: safePhoneNumberId(message.receiverPhoneNumberId),
          displayNumberLast4: lastFourDigits(message.receiverId),
        });
        throw new Error('WhatsApp clinic could not be resolved.');
      }
      const conversation = await conversations.findOrCreateForChannel({
        clinicId: clinic.id, channel: message.channel,
        channelIdentity: message.senderId,
      });
      logger.info({
        event: 'SHADEN_RUNTIME_ENTRY', conversationId: conversation.id,
        messageId: message.externalMessageId,
      });
      const identityContext = await contextProvider.load({
        clinicId: clinic.id, channelIdentity: message.senderId, conversation,
      });
      if (conversation.botEnabled === false) return { suppressed: true };
      if (await messageRepository.findByExternalId(
        conversation.id, message.externalMessageId
      )) return { duplicate: true };

      await messageRepository.saveIncomingMessage({
        conversationId: conversation.id,
        waMessageId: message.externalMessageId,
        messageText: message.text,
        rawPayload: message.rawPayload,
      });
      const persistedState = await conversations.loadState(conversation.id);
      const preservedData = stateData(persistedState?.data);
      console.info('Shaden patient identity trace.', buildIdentityTrace({
        clinicId: clinic.id, senderId: message.senderId, conversation,
        identityContext, preservedData,
      }));
      const clinicData = await dataProvider.load(clinic);
      logger.info({
        event: 'SHADEN_RUNTIME_ROUTE', conversationId: conversation.id,
        messageId: message.externalMessageId,
        route: message.inputProvenance?.trusted === true
          ? 'MACHINE_DETERMINISTIC' : 'DETERMINISTIC',
      });
      logger.info({
        event: 'SHADEN_DETERMINISTIC_ENTER', conversationId: conversation.id,
        messageId: message.externalMessageId,
      });
      const internalResult = await engine.handle({
        message, currentState: preservedData.shaden, clinicData,
        patientIdentity: identityContext,
        bookingContext: {
          clinicId: clinic.id, conversationId: conversation.id,
          channel: message.channel, channelIdentity: message.senderId,
          patientId: conversation.patientId || null,
        },
      });
      validateInternalLifecycleResult(internalResult);
      const { reply, nextState, interaction, notificationAttempted } =
        userFacingHandlerResult(internalResult);
      if (!reply || typeof reply !== 'string' || reply.trim() === '') {
        console.warn('⚠️ Shaden Engine returned an empty reply. Message:', message.text);
        await conversations.updateState(conversation.id, {
          current: 'shaden', data: { ...preservedData, shaden: nextState },
        });
        return {
          replyText: null,
          state: { data: { ...preservedData, shaden: nextState } },
          skipped: true,
          notificationAttempted: notificationAttempted === true,
        };
      }
      await conversations.updateState(conversation.id, {
        current: 'shaden', data: { ...preservedData, shaden: nextState },
      });
      console.log(
        `📤 Sending reply to ${maskPhone(message.senderId)}: ${reply.substring(0, 50)}...`
      );
      const delivery = await sendMessage({
        to: message.senderId, body: reply,
        ...(interaction ? { interaction } : {}),
      });
      await messageRepository.saveOutgoingMessage({
        conversationId: conversation.id, messageText: reply,
        waMessageId: delivery?.messageId || null,
        rawPayload: {
          delivery: delivery || null,
          interaction: interaction ? {
            version: interaction.version, mode: interaction.mode,
            purpose: interaction.purpose,
            optionIds: interaction.options.map((option) => option.id),
          } : null,
        },
      });
      return {
        replyText: reply,
        state: { data: { ...preservedData, shaden: nextState } },
        notificationAttempted: notificationAttempted === true,
      };
    },
  };
}

function buildIdentityTrace({
  clinicId, senderId, conversation, identityContext, preservedData,
}) {
  const shaden = plainObject(preservedData.shaden);
  const booking = plainObject(shaden.booking);
  const stateCustomer = plainObject(shaden.customer);
  return {
    clinicId, inboundSender: maskPhone(senderId),
    resolvedPatientId: identityContext.patient?.id || null,
    resolvedPatientFullName: identityContext.patient?.fullName || null,
    conversationId: conversation.id,
    conversationPatientId: conversation.patientId || null,
    persistedStateNames: { customerName: stateCustomer.name || null },
    bookingDraftPatient: {
      patientId: booking.patientId || booking.patient_id || null,
      name: booking.fullName || booking.full_name || booking.patientName || null,
    },
    contextCustomerName: identityContext.customerName || stateCustomer.name || null,
    shadenEngineCustomerName: identityContext.customerName || stateCustomer.name || null,
    shadenPolicyCustomerName: identityContext.customerName || stateCustomer.name || null,
    sources: {
      resolvedPatient: 'patients matched by clinic_id and current sender whatsapp_id/phone_number',
      persistedStateNames: 'conversations.state_payload.shaden.customer',
      bookingDraftPatient: 'conversations.state_payload.shaden.booking',
      contextCustomerName: identityContext.customerNameSource,
      shadenEngineCustomerName: identityContext.customerNameSource,
      shadenPolicyCustomerName: identityContext.customerNameSource,
    },
  };
}
function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? `${digits.slice(0, 3)}******${digits.slice(-3)}` : null;
}
function normalizeMessage(rawMessage) {
  const inputProvenance = normalizeInputProvenance(rawMessage.inputProvenance);
  return {
    channel: rawMessage.channel || 'whatsapp',
    externalMessageId: rawMessage.waMessageId,
    senderId: normalizeSaudiMobile(rawMessage.senderPhone, 'senderPhone'),
    receiverId: rawMessage.receiverPhone,
    receiverPhoneNumberId: rawMessage.metaPhoneNumberId,
    messageType: ['button', 'interactive'].includes(rawMessage.messageType)
      ? 'text' : rawMessage.messageType,
    text: rawMessage.text, receivedAt: rawMessage.timestamp,
    rawPayload: rawMessage.rawPayload &&
      typeof rawMessage.rawPayload === 'object'
      ? rawMessage.rawPayload : { value: rawMessage.rawPayload ?? null },
    ...(inputProvenance ? { inputProvenance } : {}),
  };
}
function normalizeInputProvenance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.trusted !== true || value.source !== 'meta_whatsapp') return null;
  if (!['meta_legacy_button', 'meta_interactive_button',
    'meta_interactive_list', 'structured_machine_event'].includes(value.kind)) {
    return null;
  }
  return Object.freeze({ trusted: true, source: 'meta_whatsapp', kind: value.kind });
}
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value) : {};
}
function stateData(value) {
  if (typeof value !== 'string') return plainObject(value);
  try { return plainObject(JSON.parse(value)); } catch { return {}; }
}
function safePhoneNumberId(value) {
  return typeof value === 'string' && /^\d{6,32}$/.test(value) ? value : null;
}
function validateInternalLifecycleResult(result) {
  try {
    const metadata = lifecycleMetadataFrom(result);
    if (metadata.lifecycleOutcome) {
      validateLifecycleTransition({
        outcome: metadata.lifecycleOutcome, resultingState: result.nextState,
      });
    } else if (metadata.undeclaredLifecycleReason) {
      validatePersistedFlowState(result.nextState);
      console.warn('Shaden handler lifecycle remains temporarily undeclared.', {
        reason: metadata.undeclaredLifecycleReason,
      });
    } else {
      throw new TypeError('Handler result must declare lifecycle metadata.');
    }
  } catch (error) {
    const invariantError = new Error(error?.message || 'Invalid lifecycle result.');
    invariantError.name = 'LifecycleInvariantError';
    invariantError.code = 'SHADEN_LIFECYCLE_INVARIANT';
    invariantError.cause = error;
    throw invariantError;
  }
}
function lastFourDigits(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
}
module.exports = createShadenEngine;
module.exports.validateInternalLifecycleResult = validateInternalLifecycleResult;
