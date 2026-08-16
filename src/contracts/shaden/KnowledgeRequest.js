'use strict';

const ALLOWED_KNOWLEDGE_TYPES = new Set([
  'none',

  // Clinic facts
  'clinic_info',
  'branches',
  'working_hours',
  'services',
  'specialties',
  'payment_methods',
  'insurance',
  'prices',

  // Approved knowledge
  'service_faq',
  'medical_faq',
  'clinic_policy',

  // Operational truth
  'availability',
  'appointment_details',
]);

const ALLOWED_SOURCES = new Set([
  'none',
  'clinic_database',
  'knowledge_base',
  'booking_engine',
  'appointment_service',
]);
const ALLOWED_SEMANTIC_TOPICS = new Set([
  'preparation',
  'aftercare',
  'comparison',
]);

const TYPE_SOURCE_POLICY = Object.freeze({
  none: 'none',

  clinic_info: 'clinic_database',
  branches: 'clinic_database',
  working_hours: 'clinic_database',
  services: 'clinic_database',
  specialties: 'clinic_database',
  payment_methods: 'clinic_database',
  insurance: 'clinic_database',
  prices: 'clinic_database',

  service_faq: 'knowledge_base',
  medical_faq: 'knowledge_base',
  clinic_policy: 'knowledge_base',

  availability: 'booking_engine',
  appointment_details: 'appointment_service',
});

function createKnowledgeRequest(input = {}) {
  const type = normalizeKnowledgeType(input.type);
  const requiredSource = TYPE_SOURCE_POLICY[type];

  const result = {
    version: 1,

    type,

    source: requiredSource,

    clinicId: normalizeNullableString(input.clinicId),
    serviceId: normalizeNullableString(input.serviceId),
    appointmentId: normalizeNullableString(input.appointmentId),

    query: normalizeNullableString(input.query),

    semanticTopic: normalizeSemanticTopic(input.semanticTopic),

    keywords: normalizeStringArray(input.keywords),

    allowGeneralModelKnowledge: false,

    required: input.required === true,
  };

  return Object.freeze({
    ...result,
    keywords: Object.freeze([...result.keywords]),
  });
}

function normalizeKnowledgeType(value) {
  if (typeof value !== 'string') return 'none';
  return ALLOWED_KNOWLEDGE_TYPES.has(value) ? value : 'none';
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized || null;
}

function normalizeSemanticTopic(value) {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' && ALLOWED_SEMANTIC_TOPICS.has(value)
    ? value
    : null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

module.exports = Object.freeze({
  createKnowledgeRequest,
  ALLOWED_KNOWLEDGE_TYPES,
  ALLOWED_SOURCES,
  TYPE_SOURCE_POLICY,
  ALLOWED_SEMANTIC_TOPICS,
});
