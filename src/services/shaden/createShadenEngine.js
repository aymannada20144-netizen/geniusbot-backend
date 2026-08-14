'use strict';
const DeterministicUnderstandingProvider = require(
  './DeterministicUnderstandingProvider'
);
const DeterministicDialogueDecisionProvider = require(
  './DeterministicDialogueDecisionProvider'
);
const ShadenDataProvider = require('./ShadenDataProvider');
const ShadenPolicy = require('./ShadenPolicy');
const ShadenEngine = require('./ShadenEngine');
const ShadenConversationContextProvider = require(
  './ShadenConversationContextProvider'
);
const ClinicService = require('../ClinicService');
const ConversationService = require('../ConversationService');
const PatientService = require('../../modules/patients/PatientService');
const {
  normalizeSaudiMobile,
} = require('../../core/validators/saudiMobile');
const ShadenConversationalIntelligenceOrchestrator = require(
  './ShadenConversationalIntelligenceOrchestrator'
);
const {
  createKnowledgeRequest,
} = require('../../contracts/shaden/KnowledgeRequest');
function createShadenEngine({
  clinicRepository,
  conversationRepository,
  patientRepository,
  clinicService = null,
  conversationService = null,
  patientService = null,
  messageRepository,
  catalogService,
  clinicConfigurationSource,
  bookingEngine,
  appointmentService = null,
  priceService = null,
  knowledgeService = null,
  conversationalIntelligenceOrchestrator = null,
  sendMessage,
} = {}) {
  if (
    knowledgeService !== null &&
    typeof knowledgeService?.retrieve !== 'function'
  ) {
    throw new TypeError('createShadenEngine knowledgeService must provide retrieve().');
  }
  const clinics = clinicService || new ClinicService(clinicRepository);
  const conversations = conversationService ||
    new ConversationService(conversationRepository);
  const patients = patientService || new PatientService(patientRepository);
  const policy = new ShadenPolicy();
  const dataProvider = new ShadenDataProvider({
    catalogService,
    clinicConfigurationSource,
  });
  const engine = new ShadenEngine({
    policy,
    bookingEngine,
    appointmentService,
    priceService,
  });
  const contextProvider = new ShadenConversationContextProvider({
    patientService: patients,
  });
  const ciOrchestrator =
  conversationalIntelligenceOrchestrator ||
  new ShadenConversationalIntelligenceOrchestrator({
    understandingProvider:
      new DeterministicUnderstandingProvider({
        policy,
      }),

    decisionProvider:
      new DeterministicDialogueDecisionProvider(),
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
        clinicId: clinic.id,
        channel: message.channel,
        channelIdentity: message.senderId,
      });
      const identityContext = await contextProvider.load({
        clinicId: clinic.id,
        channelIdentity: message.senderId,
        conversation,
      });
      if (conversation.botEnabled === false) return { suppressed: true };
      if (await messageRepository.findByExternalId(
        conversation.id,
        message.externalMessageId
      )) {
        return { duplicate: true };
      }

      await messageRepository.saveIncomingMessage({
        conversationId: conversation.id,
        waMessageId: message.externalMessageId,
        messageText: message.text,
        rawPayload: message.rawPayload,
      });

      const persistedState = await conversations.loadState(
        conversation.id
      );
      const preservedData = stateData(persistedState?.data);
      const identityTrace = buildIdentityTrace({
        clinicId: clinic.id,
        senderId: message.senderId,
        conversation,
        identityContext,
        preservedData,
      });
      console.info('Shaden patient identity trace.', identityTrace);
      const clinicData = await dataProvider.load(clinic);
      let ciResult = null;
      try {
  ciResult = await ciOrchestrator.analyze({
    message,
    currentState: preservedData.shaden,
    clinicContext: {
      clinicId: clinic.id,
      clinicName: clinic.display_name_ar || clinic.name || null,
    },
    patientContext: {
      patientId: conversation.patientId || null,
      knownPatient: identityContext?.patient ? true : false,
    },
  });
} catch (error) {
  console.warn('Shaden CI shadow analysis failed safely.', {
    message: error?.message || 'unknown error',
  });
}
      let {
        reply,
        nextState,
        interaction,
        notificationAttempted,
      } = await engine.handle({
        message,
        currentState: preservedData.shaden,
        clinicData,
        patientIdentity: identityContext,
        bookingContext: {
          clinicId: clinic.id,
          conversationId: conversation.id,
          channel: message.channel,
          channelIdentity: message.senderId,
          patientId: conversation.patientId || null,
        },
      });

      const hasActiveBooking =
        preservedData.shaden?.booking &&
        typeof preservedData.shaden.booking === 'object';
      const isBookingIntent =
        ciResult?.understanding?.primaryIntent === 'booking';

      if (
        ciResult?.decision?.action === 'REASSURE' &&
        (hasActiveBooking || isBookingIntent) &&
        typeof reply === 'string' &&
        reply.trim() !== ''
      ) {
        reply = `${policy.hesitation()}\n\n${reply}`;
      }
      if (
        ciResult?.decision?.action === 'APOLOGIZE' &&
        ciResult?.understanding?.signals?.complaint === true &&
        typeof reply === 'string' &&
        reply.trim() !== ''
    ) {
  reply = `${policy.complaintApology()}\n\n${reply}`;
}
      const objectionSignals = ciResult?.understanding?.signals;
      if (
        ciResult?.decision?.action === 'HANDLE_OBJECTION' &&
        objectionSignals?.objection === true &&
        objectionSignals?.complaint !== true &&
        objectionSignals?.medicalRisk !== true &&
        objectionSignals?.legalEscalation !== true &&
        objectionSignals?.abuseOrThreat !== true &&
        objectionSignals?.humanHandover !== true &&
        typeof reply === 'string' &&
        reply.trim() !== ''
      ) {
        reply = `${policy.objectionResponse()}\n\n${reply}`;
      }

      if (shouldRetrieveMedicalKnowledge(ciResult) && knowledgeService) {
        const serviceId = resolveMedicalKnowledgeServiceId({
          text: message.text,
          state: preservedData.shaden,
          services: clinicData.services,
          policy,
        });
        let knowledgeResult;
        try {
          knowledgeResult = await knowledgeService.retrieve(
            createKnowledgeRequest({
              clinicId: clinic.id,
              serviceId,
              type: 'medical_faq',
              query: message.text,
              keywords: [],
              required: true,
            })
          );
        } catch (_error) {
          knowledgeResult = null;
        }
        const activeFlow = hasOperationalFlow(nextState, interaction);
        const fact = usableKnowledgeFact(knowledgeResult);
        const knowledgeReply = fact || (
          knowledgeResult?.status === 'not_found'
            ? policy.medicalKnowledgeNotFound()
            : policy.medicalKnowledgeUnavailable()
        );
        reply = composeKnowledgeReply({
          knowledgeReply,
          engineReply: reply,
          activeFlow,
        });
      }

      // 1. شبكة الأمان: التأكد من أن الرد ليس فارغاً
      if (!reply || typeof reply !== 'string' || reply.trim() === '') {
        console.warn('⚠️ Shaden Engine returned an empty reply. Message:', message.text);
        // لا تقم بإرسال رسالة إذا كان الرد فارغاً
        await conversations.updateState(conversation.id, {
          current: 'shaden',
          data: {
            ...preservedData,
            shaden: nextState,
          },
        });
        return { 
          replyText: null, 
          state: { data: { ...preservedData, shaden: nextState } },
          skipped: true,
          notificationAttempted: notificationAttempted === true,
        };
      }

      await conversations.updateState(conversation.id, {
        current: 'shaden',
        data: {
          ...preservedData,
          shaden: nextState,
        },
      });

      // 2. طباعة الرد للتأكد من محتواه قبل الإرسال
      console.log(`📤 Sending reply to ${maskPhone(message.senderId)}: ${reply.substring(0, 50)}...`);
            // 3. تعديل طريقة الإرسال (جرب تغيير 'body' إلى 'text' إذا استمر الخطأ)
      const delivery = await sendMessage({
        to: message.senderId,
        body: reply,
        ...(interaction ? { interaction } : {}),
      });
      await messageRepository.saveOutgoingMessage({
        conversationId: conversation.id,
        messageText: reply,
        waMessageId: delivery?.messageId || null,
        rawPayload: {
          delivery: delivery || null,
          interaction: interaction ? {
            version: interaction.version,
            mode: interaction.mode,
            purpose: interaction.purpose,
            optionIds: interaction.options.map((option) => option.id),
          } : null,
        },
      });
      return {
        replyText: reply,
        state: { data: { ...preservedData, shaden: nextState } },
      };
    },
  };
}

function shouldRetrieveMedicalKnowledge(ciResult) {
  const signals = ciResult?.understanding?.signals;
  const decision = ciResult?.decision;
  return decision?.action === 'RETRIEVE_KNOWLEDGE' &&
    signals?.medicalQuestion === true &&
    Array.isArray(decision.requiredKnowledge) &&
    decision.requiredKnowledge.includes('medical_question') &&
    decision.flags?.requiresKnowledge === true &&
    signals.medicalRisk !== true &&
    signals.legalEscalation !== true &&
    signals.abuseOrThreat !== true &&
    signals.humanHandover !== true &&
    signals.complaint !== true;
}

function resolveMedicalKnowledgeServiceId({ text, state, services, policy }) {
  const activeServices = Array.isArray(services) ? services : [];
  const explicitMatches = ShadenEngine.matchingServices(
    text,
    activeServices,
    policy
  );
  if (explicitMatches.length === 1) return String(explicitMatches[0].id);
  if (
    explicitMatches.length > 1 ||
    hasUnresolvedExplicitServiceWording(text, policy)
  ) return null;

  const activeIds = new Set(activeServices.map(({ id }) => String(id)));
  const persistedIds = [
    state?.booking?.serviceId,
    state?.priceInquiry?.selected_service_id,
  ].filter((id) => typeof id === 'string' && activeIds.has(id));
  const distinctIds = [...new Set(persistedIds)];
  return distinctIds.length === 1 ? distinctIds[0] : null;
}

function hasUnresolvedExplicitServiceWording(text, policy) {
  const normalized = policy.normalize(text);
  return /(?:^|\s)(?:خدمة|علاج|جلسة)\s+[\p{L}\p{N}]+/u.test(normalized);
}

function hasOperationalFlow(state, interaction) {
  if (interaction && typeof interaction === 'object') return true;
  if (!state || typeof state !== 'object') return false;
  return [
    'booking',
    'priceInquiry',
    'cancellation',
    'reschedule',
    'changeService',
    'changeBranch',
  ].some((key) => state[key] && typeof state[key] === 'object');
}

function usableKnowledgeFact(result) {
  if (result?.status !== 'found' || !Array.isArray(result.facts)) return null;
  const fact = result.facts[0];
  return typeof fact === 'string' && fact.trim() !== '' ? fact : null;
}

function composeKnowledgeReply({ knowledgeReply, engineReply, activeFlow }) {
  if (
    activeFlow &&
    typeof engineReply === 'string' &&
    engineReply.trim() !== ''
  ) {
    return `${knowledgeReply}\n\n${engineReply}`;
  }
  return knowledgeReply;
}

function buildIdentityTrace({
  clinicId,
  senderId,
  conversation,
  identityContext,
  preservedData,
}) {
  const shaden = plainObject(preservedData.shaden);
  const booking = plainObject(shaden.booking);
  const stateCustomer = plainObject(shaden.customer);
  return {
    clinicId,
    inboundSender: maskPhone(senderId),
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
  if (!digits) return null;
  return `${digits.slice(0, 3)}******${digits.slice(-3)}`;
}

function normalizeMessage(rawMessage) {
  return {
    channel: rawMessage.channel || 'whatsapp',
    externalMessageId: rawMessage.waMessageId,
    senderId: normalizeSaudiMobile(rawMessage.senderPhone, 'senderPhone'),
    receiverId: rawMessage.receiverPhone,
    receiverPhoneNumberId: rawMessage.metaPhoneNumberId,
    messageType: ['button', 'interactive'].includes(rawMessage.messageType)
      ? 'text'
      : rawMessage.messageType,
    text: rawMessage.text,
    receivedAt: rawMessage.timestamp,
    rawPayload: rawMessage.rawPayload &&
      typeof rawMessage.rawPayload === 'object'
      ? rawMessage.rawPayload
      : { value: rawMessage.rawPayload ?? null },
  };
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value)
    : {};
}

function stateData(value) {
  if (typeof value !== 'string') return plainObject(value);
  try {
    return plainObject(JSON.parse(value));
  } catch {
    return {};
  }
}

function safePhoneNumberId(value) {
  return typeof value === 'string' && /^\d{6,32}$/.test(value)
    ? value
    : null;
}

function lastFourDigits(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
}

module.exports = createShadenEngine;
