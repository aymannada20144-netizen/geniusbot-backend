'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSemanticContext,
} = require('../../src/services/shaden/SemanticContextBuilder');

test('SemanticContextBuilder maps confident booking phases', async (t) => {
  const cases = [
    ['service', 'collecting_information', 'selection', 'service'],
    ['branch', 'collecting_information', 'selection', 'branch'],
    ['doctor', 'collecting_information', 'selection', 'provider'],
    ['date', 'collecting_information', 'selection', 'date'],
    ['time', 'collecting_information', 'selection', 'time'],
    ['availability', 'awaiting_selection', 'selection', 'time'],
    ['confirmation', 'awaiting_confirmation', 'confirmation', 'appointment'],
  ];
  for (const [legacyStep, step, kind, targetType] of cases) {
    await t.test(legacyStep, () => {
      const result = buildSemanticContext({
        version: 1,
        booking: { step: legacyStep, serviceId: null },
      });
      assert.deepEqual(result.active, { goal: 'booking', step });
      assert.deepEqual(result.pending, { kind, targetType });
    });
  }
});

test('SemanticContextBuilder maps bounded appointment-management phases', async (t) => {
  const cases = [
    ['cancellation', 'appointment_cancellation', 'appointment_cancel', 'awaiting_confirmation', 'confirmation', 'appointment'],
    ['reschedule', 'appointment_reschedule', 'appointment_reschedule', 'awaiting_date', 'selection', 'date'],
    ['changeService', 'appointment_change_service', 'appointment_change', 'awaiting_service', 'selection', 'service'],
    ['changeBranch', 'appointment_change_branch', 'appointment_change', 'awaiting_branch', 'selection', 'branch'],
    ['reschedule', 'appointment_reschedule', 'appointment_reschedule', 'awaiting_reference', 'free_text', 'appointment'],
  ];
  for (const [key, intent, goal, legacyStep, kind, targetType] of cases) {
    await t.test(`${key}:${legacyStep}`, () => {
      const state = { version: 1, [key]: { intent, step: legacyStep } };
      const result = buildSemanticContext(state);
      assert.equal(result.active.goal, goal);
      assert.deepEqual(result.pending, { kind, targetType });
    });
  }
});

test('SemanticContextBuilder degrades unknown and ambiguous state safely', () => {
  const empty = { contextVersion: 1, active: null, pending: null };
  assert.deepEqual(buildSemanticContext(null), empty);
  assert.deepEqual(buildSemanticContext({ version: 2 }), empty);
  assert.deepEqual(buildSemanticContext({
    version: 1, priceInquiry: { step: 'service' },
  }), empty);
  assert.deepEqual(buildSemanticContext({
    version: 1, booking: { step: 'ready' },
  }), empty);
  assert.deepEqual(buildSemanticContext({
    version: 1, booking: { step: 'specialty' },
  }), empty);
  assert.deepEqual(buildSemanticContext({
    version: 1, booking: { step: 'city' },
  }), empty);
  assert.deepEqual(buildSemanticContext({
    version: 1,
    booking: { step: 'service' },
    cancellation: {
      intent: 'appointment_cancellation', step: 'awaiting_confirmation',
    },
  }), empty);
});

test('SemanticContextBuilder does not mutate source state or expose values', () => {
  const state = {
    version: 1,
    reschedule: {
      intent: 'appointment_reschedule',
      step: 'awaiting_time',
      selectedAppointmentId: 'private-id',
      availableTimes: ['10:00'],
    },
  };
  const before = structuredClone(state);
  const result = buildSemanticContext(state);
  assert.deepEqual(state, before);
  assert.equal(JSON.stringify(result).includes('private-id'), false);
  assert.equal(JSON.stringify(result).includes('10:00'), false);
  assert.equal(Object.isFrozen(result), true);
});
