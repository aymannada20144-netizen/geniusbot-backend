'use strict';

const ALLOWED_ACTION_TYPES = new Set([
  'none',

  // Booking
  'start_booking',

  // Appointment management
  'cancel_appointment',
  'reschedule_appointment',
  'change_service',
  'change_branch',
  'change_provider',

  // Non-mutating operational actions
  'check_availability',
  'lookup_appointment',

  // Human escalation
  'handover_to_human',
]);

const MUTATING_ACTIONS = new Set([
  'start_booking',
  'cancel_appointment',
  'reschedule_appointment',
  'change_service',
  'change_branch',
  'change_provider',
]);

function createActionRequest(input = {}) {
  const type = normalizeActionType(input.type);

  const result = {
    version: 1,

    type,

    clinicId: normalizeNullableString(input.clinicId),
    conversationId: normalizeNullableString(input.conversationId),
    patientId: normalizeNullableString(input.patientId),
    appointmentId: normalizeNullableString(input.appointmentId),

    payload: normalizePayload(input.payload),

    flags: {
      mutating: MUTATING_ACTIONS.has(type),
      identityVerified: input.flags?.identityVerified === true,
      confirmationVerified: input.flags?.confirmationVerified === true,
      domainValidationRequired: true,
    },

    authorized: false,
  };

  enforceActionSafety(result);

  return Object.freeze({
    ...result,
    payload: Object.freeze({ ...result.payload }),
    flags: Object.freeze({ ...result.flags }),
  });
}

function enforceActionSafety(result) {
  // The request itself never authorizes execution.
  // Authorization belongs to the deterministic Action Gate.
  result.authorized = false;

  if (result.type === 'none') {
    result.flags.domainValidationRequired = false;
  }
}

function normalizeActionType(value) {
  if (typeof value !== 'string') return 'none';
  return ALLOWED_ACTION_TYPES.has(value) ? value : 'none';
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized || null;
}

function normalizePayload(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const payload = {};

  for (const [key, item] of Object.entries(value)) {
    if (!key.trim()) continue;

    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {
      payload[key] = item;
    }
  }

  return payload;
}

module.exports = Object.freeze({
  createActionRequest,
  ALLOWED_ACTION_TYPES,
  MUTATING_ACTIONS,
});