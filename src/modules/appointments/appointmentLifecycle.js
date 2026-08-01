'use strict';

const { ValidationError } = require('../../core/errors');

const STATUSES = Object.freeze([
  'pending',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled',
]);

const TRANSITIONS = Object.freeze({
  pending: Object.freeze(['confirmed', 'cancelled', 'rescheduled']),
  confirmed: Object.freeze(['checked_in', 'cancelled', 'no_show', 'rescheduled']),
  checked_in: Object.freeze(['completed', 'cancelled']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
  no_show: Object.freeze([]),
  rescheduled: Object.freeze([]),
});

function validateAppointmentTransition(currentStatus, nextStatus) {
  if (!STATUSES.includes(nextStatus)) {
    throw new ValidationError('Invalid appointment status.');
  }

  if (!STATUSES.includes(currentStatus) ||
      !TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new ValidationError(
      'Appointment status transition is not allowed.'
    );
  }
}

module.exports = Object.freeze({
  STATUSES,
  TRANSITIONS,
  validateAppointmentTransition,
});
