'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createActionRequest,
} = require('../../src/contracts/shaden/ActionRequest');

test('ActionRequest', async (t) => {
  await t.test('creates a safe default request', () => {
    const result = createActionRequest();

    assert.equal(result.version, 1);
    assert.equal(result.type, 'none');
    assert.equal(result.authorized, false);

    assert.deepEqual(result.flags, {
      mutating: false,
      identityVerified: false,
      confirmationVerified: false,
      domainValidationRequired: false,
    });

    assert.deepEqual(result.payload, {});
  });

  await t.test('represents a cancellation request without authorizing execution', () => {
    const result = createActionRequest({
      type: 'cancel_appointment',
      clinicId: 'clinic-1',
      conversationId: 'conversation-1',
      patientId: 'patient-1',
      appointmentId: 'appointment-1',
      flags: {
        identityVerified: true,
        confirmationVerified: true,
      },
    });

    assert.equal(result.type, 'cancel_appointment');
    assert.equal(result.flags.mutating, true);
    assert.equal(result.flags.identityVerified, true);
    assert.equal(result.flags.confirmationVerified, true);
    assert.equal(result.flags.domainValidationRequired, true);
    assert.equal(result.authorized, false);
  });

  await t.test('keeps availability checks non-mutating', () => {
    const result = createActionRequest({
      type: 'check_availability',
      clinicId: 'clinic-1',
      payload: {
        serviceId: 'service-1',
        date: '2026-08-20',
      },
    });

    assert.equal(result.flags.mutating, false);
    assert.equal(result.authorized, false);

    assert.deepEqual(result.payload, {
      serviceId: 'service-1',
      date: '2026-08-20',
    });
  });

  await t.test('rejects unsupported action types safely', () => {
    const result = createActionRequest({
      type: 'delete_everything',
      flags: {
        identityVerified: true,
        confirmationVerified: true,
      },
    });

    assert.equal(result.type, 'none');
    assert.equal(result.flags.mutating, false);
    assert.equal(result.authorized, false);
  });

  await t.test('does not accept nested or array payload values', () => {
    const result = createActionRequest({
      type: 'reschedule_appointment',
      payload: {
        date: '2026-08-21',
        nested: { unsafe: true },
        items: ['x'],
      },
    });

    assert.deepEqual(result.payload, {
      date: '2026-08-21',
    });
  });

  await t.test('never trusts caller-provided authorization', () => {
    const result = createActionRequest({
      type: 'change_branch',
      authorized: true,
    });

    assert.equal(result.authorized, false);
  });

  await t.test('returns immutable structures', () => {
    const result = createActionRequest({
      type: 'lookup_appointment',
    });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.flags), true);
    assert.equal(Object.isFrozen(result.payload), true);
  });
});