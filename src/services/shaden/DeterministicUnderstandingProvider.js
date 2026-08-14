'use strict';

const ShadenPolicy = require('./ShadenPolicy');
const ShadenConversationalSignalDetector = require(
  './ShadenConversationalSignalDetector'
);

class DeterministicUnderstandingProvider {
  constructor({
    policy = new ShadenPolicy(),
    signalDetector = new ShadenConversationalSignalDetector(),
  } = {}) {
    this.policy = policy;
    this.signalDetector = signalDetector;
  }

  async understand(input = {}) {
    const text = typeof input?.text === 'string'
      ? input.text
      : '';

    if (!text.trim()) {
      return safeUnknown();
    }

    let inquiry;
let detectedSignals;

try {
  inquiry = this.policy.recognize(text);
  detectedSignals = this.signalDetector.detect({
    text,
  });
} catch {
  return safeUnknown();
}

return mergeDetectedSignals(
  mapInquiryToUnderstanding(inquiry),
  detectedSignals
);

    return mapInquiryToUnderstanding(inquiry);
  }
}
function mergeDetectedSignals(understanding, detected = {}) {
  const legacySignals = understanding?.signals || {};

  const mergedSignals = {
    confirmation:
      legacySignals.confirmation === true,

    rejection:
      legacySignals.rejection === true,

    correction:
      legacySignals.correction === true ||
      detected.correction === true,

    interruption:
      legacySignals.interruption === true ||
      detected.interruption === true,

    conditional:
      legacySignals.conditional === true,

    hesitation:
      legacySignals.hesitation === true ||
      detected.hesitation === true,

    objection:
      legacySignals.objection === true ||
      detected.objection === true,

    complaint:
      legacySignals.complaint === true ||
      detected.complaint === true,

    medicalQuestion:
      legacySignals.medicalQuestion === true ||
      detected.medicalQuestion === true,

    medicalRisk:
      legacySignals.medicalRisk === true ||
      detected.medicalRisk === true,

    humanHandover:
      legacySignals.humanHandover === true ||
      detected.humanHandover === true,
      legalEscalation:
  legacySignals.legalEscalation === true ||
  detected.legalEscalation === true,

botFrustration:
  legacySignals.botFrustration === true ||
  detected.botFrustration === true,

abuseOrThreat:
  legacySignals.abuseOrThreat === true ||
  detected.abuseOrThreat === true,
  };

  return {
    ...understanding,
    sentiment: chooseSentiment(
      understanding.sentiment,
      detected.sentiment
    ),
    signals: mergedSignals,
  
  };
}
function chooseSentiment(legacySentiment, detectedSentiment) {
  const priority = {
    angry: 6,
    frustrated: 5,
    worried: 4,
    negative: 3,
    positive: 2,
    neutral: 1,
  };

  const legacy = priority[legacySentiment]
    ? legacySentiment
    : 'neutral';

  const detected = priority[detectedSentiment]
    ? detectedSentiment
    : 'neutral';

  return priority[detected] > priority[legacy]
    ? detected
    : legacy;
}
function mapInquiryToUnderstanding(inquiry) {
  if (!inquiry || typeof inquiry !== 'object') {
    return safeUnknown();
  }

  const legacyType = normalizeLegacyType(inquiry.type);
  const compoundIntents = legacyType === 'compound_appointment_request'
    ? mappedCompoundIntents(inquiry.intents)
    : [];
  const primaryIntent = compoundIntents[0] || primaryIntentFor(legacyType);

  return {
    primaryIntent,

    secondaryIntents: compoundIntents.length
      ? compoundIntents.slice(1)
      : secondaryIntentsFor(inquiry),

    entities: extractEntities(inquiry),

    conversationAct: legacyType === 'compound_appointment_request'
      ? 'request'
      : conversationActFor(legacyType),

    sentiment: sentimentFor(legacyType),

    signals: signalsFor(inquiry),

    confidence: confidenceFor(legacyType),
  };
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

    // Appointment information
    case 'appointment_query':
    case 'existing_appointment_query':
    case 'appointment_status_query':
    case 'appointment_query_request':
    case 'booking_status_request':
    case 'booking_reference_request':
    case 'cancellation_information_request':
      return 'appointment_query';

    // Appointment management
    case 'booking_cancellation_request':
    case 'appointment_cancellation':
    case 'cancellation_request':
    case 'bulk_cancel_request':
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

    // Conversational state / clarification, not standalone semantic intents
    case 'conditional_confirmation':
    case 'booking_rejection':
    case 'appointment_management_clarification':
    case 'compound_appointment_request':
      return 'unknown';

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

function mappedCompoundIntents(value) {
  if (!Array.isArray(value)) return [];

  const mapped = [];

  for (const item of value) {
    const type = typeof item === 'string'
      ? item
      : item?.type;

    const intent = primaryIntentFor(
      normalizeLegacyType(type)
    );

    if (intent !== 'unknown') {
      mapped.push(intent);
    }
  }

  return [...new Set(mapped)];
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
    case 'conditional_confirmation':
      return 'confirmation';

    case 'booking_rejection':
      return 'rejection';

    case 'booking':
    case 'booking_request':
    case 'availability_request':
    case 'booking_cancellation_request':
    case 'appointment_cancellation':
    case 'cancellation_request':
    case 'bulk_cancel_request':
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
    case 'appointment_query_request':
    case 'booking_status_request':
    case 'booking_reference_request':
    case 'cancellation_information_request':
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
      legalEscalation:
  inquiry.legalEscalation === true,

botFrustration:
  inquiry.botFrustration === true,

abuseOrThreat:
  inquiry.abuseOrThreat === true,
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
