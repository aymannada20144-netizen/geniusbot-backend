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
const GroqConversationProvider = require('./conversation/GroqConversationProvider');
const ShadenConversationLayer = require('./conversation/ShadenConversationLayer');

function createShadenEngine({
  clinicRepository, conversationRepository, patientRepository,
  clinicService = null, conversationService = null, patientService = null,
  messageRepository, catalogService, serviceAssignmentRepository = null,
  clinicConfigurationSource, bookingEngine, appointmentService = null,
  priceService = null, knowledgeService = null,
  logger = console, shadenEngine = null, sendMessage,
  conversationEnabled = false, conversationApiKey = null,
  conversationProvider = null,
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
  const conversationLayer = conversationEnabled
    ? new ShadenConversationLayer({
      provider: conversationProvider ||
        new GroqConversationProvider({ apiKey: conversationApiKey }),
      logger,
    })
    : null;

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

      const persistedIncomingMessage = await messageRepository.saveIncomingMessage({
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
      const deterministicInquiry = policy.recognize(message.text);
      const operationalOwner = shouldUseOperationalCore(
        message, preservedData.shaden, deterministicInquiry
      );
      let conversationalResult = null;
      if (conversationLayer && !operationalOwner) {
        const context = buildConversationContext(
          await messageRepository.getRecentMessages({
            conversationId: conversation.id,
            limit: CONTEXT_RETRIEVAL_LIMIT,
          }),
          persistedIncomingMessage.id
        );
        conversationalResult = await conversationLayer.respond({
          currentMessage: message.text,
          contextTurns: context.turns,
          clinicData,
        });
      }
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
      const conversationalOwned = Boolean(conversationalResult?.reply);
      const internalResult = conversationalOwned
        ? {
          reply: conversationalResult.reply,
          nextState: idleState(preservedData.shaden, policy),
          undeclaredLifecycleReason: 'legacy_undeclared',
        }
        : await engine.handle({
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
      logger.info({
        event: 'SHADEN_CONVERSATION_ROUTE',
        conversationId: conversation.id,
        messageId: message.externalMessageId,
        owner: conversationalOwned ? 'LLM_CONVERSATION' : 'OPERATIONAL_CORE',
        ownershipReason: operationalOwner ||
          (conversationLayer ? 'FREE_FORM_CONVERSATION' : 'CONVERSATION_LAYER_DISABLED'),
        deterministicRecognizedType: deterministicInquiry?.type || 'unknown',
        toolCallCount: conversationalResult?.toolCallCount || 0,
        conversationStatus: conversationalResult?.status || null,
      });
      const nextData = plainObject(preservedData);
      if (!reply || typeof reply !== 'string' || reply.trim() === '') {
        console.warn('⚠️ Shaden Engine returned an empty reply. Message:', message.text);
        await conversations.updateState(conversation.id, {
          current: 'shaden', data: { ...nextData, shaden: nextState },
        });
        return {
          replyText: null,
          state: { data: { ...nextData, shaden: nextState } },
          skipped: true,
          notificationAttempted: notificationAttempted === true,
        };
      }
      await conversations.updateState(conversation.id, {
        current: 'shaden', data: { ...nextData, shaden: nextState },
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
        state: { data: { ...nextData, shaden: nextState } },
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
function idleState(value, policy) {
  if (value && typeof value === 'object' && value.version === 1) return structuredClone(value);
  return policy.initialState();
}
function shouldUseOperationalCore(message, state, inquiry) {
  if (message?.inputProvenance?.trusted === true) return 'TRUSTED_MACHINE_INPUT';
  if (activeOperationalOwner(state)) return 'ACTIVE_OPERATIONAL_STATE';
  return OPERATIONAL_INQUIRY_TYPES.has(inquiry?.type)
    ? 'EXPLICIT_OPERATIONAL_REQUEST' : null;
}
function activeOperationalOwner(value) {
  if (!value || typeof value !== 'object') return null;
  return ['booking', 'cancellation', 'reschedule', 'changeService',
    'changeBranch', 'priceInquiry'].find((key) => Boolean(value[key])) || null;
}
const OPERATIONAL_INQUIRY_TYPES = new Set([
  'booking', 'availability_request', 'appointment_management_clarification',
  'booking_cancellation_request', 'booking_modification_request',
  'change_service_request', 'change_branch_request', 'change_provider_request',
  'booking_reference_request', 'booking_status_request',
  'appointment_query_request', 'booking_rejection', 'bulk_cancel_request',
  'compound_appointment_request', 'cancellation_information_request',
]);

const MAX_CONTEXT_TURNS = 4;
const MAX_CONTEXT_MESSAGE_CHARS = 800;
const MAX_CONTEXT_TOTAL_CHARS = 2400;
const CONTEXT_RETRIEVAL_LIMIT = MAX_CONTEXT_TURNS + 1;

function buildConversationContext(messages, currentMessageId) {
  const eligible = (Array.isArray(messages) ? messages : [])
    .filter((item) =>
      item?.id !== currentMessageId &&
      ['patient', 'bot'].includes(item?.senderType) &&
      typeof item?.messageText === 'string' &&
      item.messageText.trim()
    );
  let truncated = eligible.length > MAX_CONTEXT_TURNS;
  const bounded = eligible.slice(-MAX_CONTEXT_TURNS).map((item) => {
    const text = item.messageText.trim();
    if (text.length > MAX_CONTEXT_MESSAGE_CHARS) truncated = true;
    return {
      role: item.senderType === 'patient' ? 'user' : 'assistant',
      content: text.slice(0, MAX_CONTEXT_MESSAGE_CHARS),
    };
  });
  let remaining = MAX_CONTEXT_TOTAL_CHARS;
  const turns = [];
  for (let index = bounded.length - 1; index >= 0; index -= 1) {
    if (remaining === 0) { truncated = true; break; }
    const turn = bounded[index];
    const content = turn.content.slice(0, remaining);
    if (content.length < turn.content.length) truncated = true;
    turns.unshift(Object.freeze({ role: turn.role, content }));
    remaining -= content.length;
  }
  return Object.freeze({
    turns: Object.freeze(turns),
    truncated,
  });
}
module.exports = createShadenEngine;
module.exports.validateInternalLifecycleResult = validateInternalLifecycleResult;
module.exports.buildConversationContext = buildConversationContext;
module.exports.MAX_CONTEXT_TURNS = MAX_CONTEXT_TURNS;
module.exports.shouldUseOperationalCore = shouldUseOperationalCore;
