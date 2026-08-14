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
  conversationalIntelligenceOrchestrator = null,
  sendMessage,
} = {}) {
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
