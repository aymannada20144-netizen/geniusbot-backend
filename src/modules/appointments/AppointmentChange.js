'use strict';

const { ValidationError } = require('../../core/errors');
const {
  validatePlainObject,
  validateUuid,
} = require('../../core/validators/commonValidators');

const OPERATIONS = Object.freeze([
  'cancel', 'reschedule', 'modify', 'change_service', 'change_branch',
]);
const SOURCES = Object.freeze(['dashboard', 'shaden', 'api', 'system']);
const CHANGE_FIELDS = Object.freeze({
  status: 'status',
  appointment_start: 'time',
  appointment_end: 'time',
  service_id: 'service',
  branch_id: 'branch',
  doctor_id: 'provider',
  room_id: 'room',
  quoted_price: 'price',
  currency: 'price',
});
const PATCH_FIELDS = Object.freeze([
  ...Object.keys(CHANGE_FIELDS),
  'cancellation_reason',
]);
const SNAPSHOT_FIELDS = Object.freeze(Object.keys(CHANGE_FIELDS));

function optionalUuid(value, fieldName) {
  if (value == null) return null;
  validateUuid(value, fieldName);
  return value;
}

function optionalString(value, fieldName) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalTimestamp(value, fieldName) {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid timestamp.`);
  }
  return date.toISOString();
}

function rejectUnknownKeys(value, allowed, fieldName) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new ValidationError(`${fieldName}.${unknown[0]} is not supported.`);
  }
}

function normalizeAppointmentChangeCommand(command) {
  validatePlainObject(command, 'command');
  rejectUnknownKeys(command, [
    'clinicId', 'appointmentId', 'expected', 'operation', 'changes',
    'actor', 'metadata',
  ], 'command');
  validateUuid(command.clinicId, 'command.clinicId');
  validateUuid(command.appointmentId, 'command.appointmentId');

  if (!OPERATIONS.includes(command.operation)) {
    throw new ValidationError('command.operation is not supported.');
  }

  const expected = command.expected == null ? {} :
    validatePlainObject(command.expected, 'command.expected');
  rejectUnknownKeys(expected, ['status', 'updatedAt'], 'command.expected');
  const changes = command.changes == null ? {} :
    validatePlainObject(command.changes, 'command.changes');
  rejectUnknownKeys(changes, [
    'appointmentStart', 'serviceId', 'branchId', 'providerId', 'reason',
  ], 'command.changes');
  const actor = command.actor == null ? {} :
    validatePlainObject(command.actor, 'command.actor');
  rejectUnknownKeys(actor, ['staffId', 'patientId', 'source'], 'command.actor');
  if (!SOURCES.includes(actor.source)) {
    throw new ValidationError('command.actor.source is not supported.');
  }
  if (actor.staffId && actor.patientId) {
    throw new ValidationError('command.actor cannot identify both staff and patient.');
  }
  const metadata = command.metadata == null ? {} :
    validatePlainObject(command.metadata, 'command.metadata');
  rejectUnknownKeys(metadata, ['requestId', 'conversationId'], 'command.metadata');

  return Object.freeze({
    clinicId: command.clinicId,
    appointmentId: command.appointmentId,
    expected: Object.freeze({
      status: optionalString(expected.status, 'command.expected.status'),
      updatedAt: optionalTimestamp(expected.updatedAt, 'command.expected.updatedAt'),
    }),
    operation: command.operation,
    changes: Object.freeze({
      appointmentStart: optionalTimestamp(
        changes.appointmentStart,
        'command.changes.appointmentStart'
      ),
      serviceId: optionalUuid(changes.serviceId, 'command.changes.serviceId'),
      branchId: optionalUuid(changes.branchId, 'command.changes.branchId'),
      providerId: optionalUuid(changes.providerId, 'command.changes.providerId'),
      reason: optionalString(changes.reason, 'command.changes.reason'),
    }),
    actor: Object.freeze({
      staffId: optionalUuid(actor.staffId, 'command.actor.staffId'),
      patientId: optionalUuid(actor.patientId, 'command.actor.patientId'),
      source: actor.source,
    }),
    metadata: Object.freeze({
      requestId: optionalString(metadata.requestId, 'command.metadata.requestId'),
      conversationId: optionalUuid(
        metadata.conversationId,
        'command.metadata.conversationId'
      ),
    }),
  });
}

function validateResolvedPatch(patch) {
  validatePlainObject(patch, 'resolvedPatch');
  rejectUnknownKeys(patch, PATCH_FIELDS, 'resolvedPatch');
  if (Object.keys(patch).length === 0) {
    throw new ValidationError('resolvedPatch must contain at least one change.');
  }
  return { ...patch };
}

function semanticSnapshot(appointment) {
  return Object.fromEntries(
    SNAPSHOT_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(appointment, field))
      .map((field) => {
        const value = appointment[field];
        return [field, value instanceof Date ? value.toISOString() : value];
      })
  );
}

function deriveChangeTypes(before, after) {
  return [...new Set(SNAPSHOT_FIELDS
    .filter((field) => before[field] !== after[field])
    .map((field) => CHANGE_FIELDS[field]))];
}

module.exports = Object.freeze({
  OPERATIONS,
  SOURCES,
  PATCH_FIELDS,
  normalizeAppointmentChangeCommand,
  validateResolvedPatch,
  semanticSnapshot,
  deriveChangeTypes,
});
