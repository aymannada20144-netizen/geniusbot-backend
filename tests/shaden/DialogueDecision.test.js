'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createDialogueDecision,
} = require('../../src/contracts/shaden/DialogueDecision');

test('DialogueDecision', async (t) => {
  await t.test('creates a safe default decision', () => {
    const result = createDialogueDecision();

    assert.equal(result.version, 1);
    assert.equal(result.action, 'NOOP');
    assert.equal(result.goal, 'none');
    assert.equal(result.reason, null);
    assert.equal(result.targetIntent, null);
    assert.deepEqual(result.requiredKnowledge, []);
    assert.equal(result.resumeGoal, null);

    assert.deepEqual(result.flags, {
      sensitive: false,
      requiresKnowledge: false,
      requiresVerification: false,
      requiresConfirmation: false,
      requiresHuman: false,
      preserveCurrentFlow: false,
    });

    assert.equal(result.executable, false);
  });

  await t.test('represents a natural booking opportunity without execution', () => {
    const result = createDialogueDecision({
      action: 'OFFER_BOOKING',
      goal: 'book_appointment',
      reason: 'customer interest detected after concern resolution',
      targetIntent: 'booking',
      flags: {
        preserveCurrentFlow: true,
      },
    });

    assert.equal(result.action, 'OFFER_BOOKING');
    assert.equal(result.goal, 'book_appointment');
    assert.equal(result.flags.sensitive, false);
    assert.equal(result.flags.preserveCurrentFlow, true);
    assert.equal(result.executable, false);
  });

  await t.test('marks sensitive appointment-management decisions safely', () => {
    const result = createDialogueDecision({
      action: 'REQUEST_CANCELLATION',
      goal: 'manage_appointment',
      targetIntent: 'appointment_cancellation',
    });

    assert.equal(result.action, 'REQUEST_CANCELLATION');
    assert.equal(result.flags.sensitive, true);
    assert.equal(result.flags.requiresConfirmation, true);
    assert.equal(result.executable, false);
  });

  await t.test('allows knowledge routing without granting execution', () => {
    const result = createDialogueDecision({
      action: 'RETRIEVE_KNOWLEDGE',
      goal: 'answer_question',
      requiredKnowledge: [
        'service_medical_faq',
        'service_medical_faq',
        'clinic_policy',
      ],
      flags: {
        requiresKnowledge: true,
      },
    });

    assert.deepEqual(result.requiredKnowledge, [
      'service_medical_faq',
      'clinic_policy',
    ]);

    assert.equal(result.flags.requiresKnowledge, true);
    assert.equal(result.executable, false);
  });

  await t.test('forces escalation flag for human handover', () => {
    const result = createDialogueDecision({
      action: 'ESCALATE',
      goal: 'handover_to_human',
    });

    assert.equal(result.flags.requiresHuman, true);
    assert.equal(result.executable, false);
  });

  await t.test('rejects unsupported actions and goals safely', () => {
    const result = createDialogueDecision({
      action: 'DELETE_APPOINTMENT_NOW',
      goal: 'do_anything',
    });

    assert.equal(result.action, 'NOOP');
    assert.equal(result.goal, 'none');
    assert.equal(result.executable, false);
  });

  await t.test('returns immutable structures', () => {
    const result = createDialogueDecision({
      action: 'CLARIFY',
    });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.flags), true);
    assert.equal(Object.isFrozen(result.requiredKnowledge), true);
  });
});