'use strict';

const ShadenPolicy = require('./ShadenPolicy');

class DeterministicUnderstandingProvider {
  constructor({
    policy = new ShadenPolicy(),
  } = {}) {
    this.policy = policy;
  }

  async understand(input = {}) {
    const text = typeof input?.text === 'string'
      ? input.text
      : '';

    if (!text.trim()) {
      return safeUnknown();
    }

    let inquiry;

    try {
      inquiry = this.policy.recognize(text);
    } catch {
      return safeUnknown();
    }

    return mapInquiryToUnderstanding(inquiry);
  }
}

function mapInquiryToUnderstanding(inquiry) {
  if (!inquiry || typeof inquiry !== 'object') {
    return safeUnknown();
  }

  const legacyType = normalizeLegacyType(inquiry.type);

  const base = {
    primaryIntent: primaryIntentFor(legacyType),

    secondaryIntents: secondaryIntentsFor(inquiry),

    entities: extractEntities(inquiry),

    conversationAct: conversationActFor(legacyType),

    sentiment: sentimentFor(legacyType),

    signals: signalsFor(inquiry),

    confidence: confidenceFor(legacyType),
  };

  return base;
}

function primaryIntentFor(type) {
  switch (type) {
    // Social
    case 'greeting':
    case 'combined_greeting':
      return 'greeting';

    case 'courtesy':
    case 'empathy':
      return 'courtesy';

    case 'farewell':
      return 'farewell';

    case 'acknowledgement':
      return 'acknowledgement';

    case 'identity':
      return 'identity';

    case 'presence':
      return 'presence';

    case 'how_are_you':
      return 'small_talk';

    // Clinic information
    case 'services':
    case 'services_under_specialty':
    case 'service_exists':
      return 'services';

    case 'specialties':
      return 'specialties';

    case 'branches':
      return 'branches';

    case 'branch_address':
      return 'branch_address';

    case 'working_hours':
    case 'working_hours_branch':
    case 'working_hours_city':
    case 'working_day':
    case 'holiday_day':
      return 'working_hours';

    case 'payment_methods':
      return 'payment_methods';

    case 'insurance_companies':
    case 'insurance_classes':
    case 'insurance_class_check':
    case 'insurance_company_check':
      return 'insurance';

    case 'price':
    case 'prices':
    case 'price_inquiry':
      return 'price_inquiry';

    // Booking
    case 'booking':
    case 'booking_request':
      return 'booking';

    case 'availability_request':
      return 'availability_request';

    // Appointment lookup
    case 'appointment_query':
    case 'existing_appointment_query':
    case 'appointment_status_query':
      return 'appointment_query';

    // Appointment management
    case 'booking_cancellation_request':
    case 'appointment_cancellation':
    case 'cancellation_request':
      return 'appointment_cancellation';

    case 'booking_modification_request':
    case 'appointment_reschedule':
    case 'reschedule_request':
      return 'appointment_reschedule';

    case 'change_service_request':
    case 'appointment_change_service':
      return 'appointment_change_service';

    case 'change_branch_request':
    case 'appointment_change_branch':
      return 'appointment_change_branch';

    case 'change_provider_request':
    case 'appointment_change_provider':
      return 'appointment_change_provider';

    // Conversational
    case 'complaint':
      return 'complaint';

    case 'objection':
      return 'objection';

    case 'hesitation':
      return 'hesitation';

    case 'medical_question':
      return 'medical_question';

    case 'human_handover_request':
    case 'human_handover':
      return 'human_handover_request';

    default:
      return 'unknown';
  }
}

function secondaryIntentsFor(inquiry) {
  const result = [];

  if (Array.isArray(inquiry.intents)) {
    for (const item of inquiry.intents) {
      const rawType = typeof item === 'string'
        ? item
        : item?.type;

      const mapped = primaryIntentFor(
        normalizeLegacyType(rawType)
      );

      if (
        mapped !== 'unknown' &&
        mapped !== primaryIntentFor(
          normalizeLegacyType(inquiry.type)
        )
      ) {
        result.push(mapped);
      }
    }
  }

  return [...new Set(result)];
}

function conversationActFor(type) {
  switch (type) {
    case 'greeting':
    case 'combined_greeting':
      return 'greeting';

    case 'farewell':
      return 'farewell';

    case 'courtesy':
      return 'thanks';

    case 'acknowledgement':
      return 'confirmation';

    case 'booking':
    case 'booking_request':
    case 'availability_request':
    case 'booking_cancellation_request':
    case 'appointment_cancellation':
    case 'cancellation_request':
    case 'booking_modification_request':
    case 'appointment_reschedule':
    case 'reschedule_request':
    case 'change_service_request':
    case 'appointment_change_service':
    case 'change_branch_request':
    case 'appointment_change_branch':
    case 'change_provider_request':
    case 'appointment_change_provider':
    case 'human_handover_request':
    case 'human_handover':
      return 'request';

    case 'services':
    case 'services_under_specialty':
    case 'service_exists':
    case 'specialties':
    case 'branches':
    case 'branch_address':
    case 'working_hours':
    case 'working_hours_branch':
    case 'working_hours_city':
    case 'working_day':
    case 'holiday_day':
    case 'payment_methods':
    case 'insurance_companies':
    case 'insurance_classes':
    case 'insurance_class_check':
    case 'insurance_company_check':
    case 'price':
    case 'prices':
    case 'price_inquiry':
    case 'appointment_query':
    case 'existing_appointment_query':
    case 'appointment_status_query':
    case 'medical_question':
      return 'question';

    case 'complaint':
      return 'complaint';

    case 'appointment_management_clarification':
      return 'clarification';

    default:
      return 'statement';
  }
}

function sentimentFor(type) {
  switch (type) {
    case 'complaint':
      return 'negative';

    case 'hesitation':
      return 'worried';

    case 'empathy':
      return 'negative';

    default:
      return 'neutral';
  }
}

function signalsFor(inquiry) {
  const type = normalizeLegacyType(inquiry.type);

  return {
    confirmation:
      type === 'acknowledgement' ||
      type === 'conditional_confirmation',

    rejection:
      type === 'booking_rejection' ||
      type === 'rejection',

    correction:
      type === 'correction',

    interruption:
      inquiry.interruption === true,

    conditional:
      inquiry.conditional === true ||
      type === 'conditional_confirmation',

    hesitation:
      type === 'hesitation',

    objection:
      type === 'objection',

    complaint:
      type === 'complaint',

    medicalQuestion:
      type === 'medical_question',

    medicalRisk:
      inquiry.medicalRisk === true ||
      inquiry.medical_risk === true,

    humanHandover:
      type === 'human_handover_request' ||
      type === 'human_handover',
  };
}

function extractEntities(inquiry) {
  const entities = {};

  copyEntity(
    entities,
    'legacyIntentType',
    normalizeLegacyType(inquiry.type)
  );

  copyEntity(entities, 'city', inquiry.city);
  copyEntity(entities, 'day', inquiry.day);

  copyEntity(
    entities,
    'branchText',
    inquiry.branchText
  );

  copyEntity(
    entities,
    'serviceText',
    inquiry.serviceText
  );

  copyEntity(
    entities,
    'specialtyText',
    inquiry.specialtyText
  );

  copyEntity(
    entities,
    'value',
    inquiry.value
  );

  copyEntity(
    entities,
    'companyName',
    inquiry.companyName
  );

  copyEntity(
    entities,
    'bookingReference',
    inquiry.bookingReference
  );

  return entities;
}

function copyEntity(target, key, value) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    target[key] = value;
  }
}

function confidenceFor(type) {
  return type === 'unknown'
    ? 0
    : 1;
}

function normalizeLegacyType(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : 'unknown';
}

function safeUnknown() {
  return {
    primaryIntent: 'unknown',
    secondaryIntents: [],
    entities: {},
    conversationAct: 'statement',
    sentiment: 'neutral',

    signals: {
      confirmation: false,
      rejection: false,
      correction: false,
      interruption: false,
      conditional: false,
      hesitation: false,
      objection: false,
      complaint: false,
      medicalQuestion: false,
      medicalRisk: false,
      humanHandover: false,
    },

    confidence: 0,
  };
}

module.exports = DeterministicUnderstandingProvider;