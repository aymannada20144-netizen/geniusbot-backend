'use strict';

const {
  createSemanticContext,
} = require('../../contracts/shaden/SemanticContext');

const EMPTY_CONTEXT = Object.freeze({
  contextVersion: 1,
  active: null,
  pending: null,
});

const BOOKING_STEPS = Object.freeze({
  service: ['collecting_information', 'selection', 'service'],
  branch: ['collecting_information', 'selection', 'branch'],
  doctor: ['collecting_information', 'selection', 'provider'],
  date_period: ['collecting_information', 'information', 'date'],
  date: ['collecting_information', 'selection', 'date'],
  time_period: ['collecting_information', 'information', 'time'],
  time: ['collecting_information', 'selection', 'time'],
  availability: ['awaiting_selection', 'selection', 'time'],
  confirmation: ['awaiting_confirmation', 'confirmation', 'appointment'],
});

const APPOINTMENT_FLOW_STEPS = Object.freeze({
  awaiting_reference: ['verification', 'free_text', 'appointment'],
  awaiting_verification: ['verification', 'free_text', 'appointment'],
  awaiting_appointment: ['awaiting_selection', 'selection', 'appointment'],
  awaiting_selection: ['awaiting_selection', 'selection', 'appointment'],
  awaiting_date: ['awaiting_selection', 'selection', 'date'],
  awaiting_time: ['awaiting_selection', 'selection', 'time'],
  awaiting_confirmation: ['awaiting_confirmation', 'confirmation', 'appointment'],
});

const FLOW_DEFINITIONS = Object.freeze([
  ['cancellation', 'appointment_cancellation', 'appointment_cancel', null],
  ['reschedule', 'appointment_reschedule', 'appointment_reschedule', null],
  ['changeService', 'appointment_change_service', 'appointment_change', 'service'],
  ['changeBranch', 'appointment_change_branch', 'appointment_change', 'branch'],
]);

function buildSemanticContext(state) {
  if (!isPlainObject(state) || state.version !== 1) return emptyContext();

  const mappings = [];
  const booking = mapBooking(state.booking);
  if (booking) mappings.push(booking);

  for (const definition of FLOW_DEFINITIONS) {
    const mapped = mapAppointmentFlow(state, definition);
    if (mapped) mappings.push(mapped);
  }

  return mappings.length === 1
    ? createSemanticContext(mappings[0])
    : emptyContext();
}

function mapBooking(value) {
  if (!isPlainObject(value)) return null;
  const mapping = BOOKING_STEPS[value.step];
  return mapping ? contextFor('booking', mapping) : null;
}

function mapAppointmentFlow(state, [key, intent, goal, specializedTarget]) {
  const value = state[key];
  if (!isPlainObject(value) || value.intent !== intent) return null;
  let mapping = APPOINTMENT_FLOW_STEPS[value.step];
  if (!mapping) {
    if (value.step === 'awaiting_service' && specializedTarget === 'service') {
      mapping = ['awaiting_selection', 'selection', 'service'];
    } else if (value.step === 'awaiting_branch' && specializedTarget === 'branch') {
      mapping = ['awaiting_selection', 'selection', 'branch'];
    } else {
      return null;
    }
  }
  return contextFor(goal, mapping);
}

function contextFor(goal, [step, kind, targetType]) {
  return {
    contextVersion: 1,
    active: { goal, step },
    pending: { kind, targetType },
  };
}

function emptyContext() {
  return createSemanticContext(EMPTY_CONTEXT);
}

function isPlainObject(value) {
  return Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

module.exports = Object.freeze({ buildSemanticContext });
