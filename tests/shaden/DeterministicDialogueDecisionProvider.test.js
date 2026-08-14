'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const DeterministicDialogueDecisionProvider =
  require('../../src/services/shaden/DeterministicDialogueDecisionProvider');

test('DeterministicDialogueDecisionProvider', async (t) => {
  await t.test('escalates medical risk above all other intents', async () => {
    const provider = new DeterministicDialogueDecisionProvider();

    const result = await provider.decide({
      understanding: {
        primaryIntent: 'booking',
        secondaryIntents: [],
        signals: {
          medicalRisk: true,
          legalEscalation: false,
          humanHandover: false,
          abuseOrThreat: false,
        },
      },
    });

    assert.equal(result.action, 'ESCALATE');
    assert.equal(result.goal, 'handover_to_human');
    assert.equal(result.flags.requiresHuman, true);
    assert.equal(result.executable, false);
  });

  await t.test('escalates explicit human handover request', async () => {
    const provider = new DeterministicDialogueDecisionProvider();

    const result = await provider.decide({
      understanding: {
        primaryIntent: 'unknown',
        secondaryIntents: [],
        signals: {
          medicalRisk: false,
          legalEscalation: false,
          humanHandover: true,
          abuseOrThreat: false,
        },
      },
    });

    assert.equal(result.action, 'ESCALATE');
    assert.equal(result.goal, 'handover_to_human');
    assert.equal(result.flags.requiresHuman, true);
    assert.equal(result.executable, false);
  });

  await t.test('escalates legal escalation signals', async () => {
    const provider = new DeterministicDialogueDecisionProvider();

    const result = await provider.decide({
      understanding: {
        primaryIntent: 'complaint',
        secondaryIntents: [],
        signals: {
          medicalRisk: false,
          legalEscalation: true,
          humanHandover: false,
          abuseOrThreat: false,
        },
      },
    });

    assert.equal(result.action, 'ESCALATE');
    assert.equal(result.goal, 'handover_to_human');
    assert.equal(result.flags.requiresHuman, true);
    assert.equal(result.executable, false);
  });

  await t.test('escalates abuse or threat signals', async () => {
    const provider = new DeterministicDialogueDecisionProvider();

    const result = await provider.decide({
      understanding: {
        primaryIntent: 'unknown',
        secondaryIntents: [],
        signals: {
          medicalRisk: false,
          legalEscalation: false,
          humanHandover: false,
          abuseOrThreat: true,
        },
      },
    });

    assert.equal(result.action, 'ESCALATE');
    assert.equal(result.goal, 'handover_to_human');
    assert.equal(result.flags.requiresHuman, true);
    assert.equal(result.executable, false);
  });

  await t.test('medical risk wins over booking', async () => {
    const provider = new DeterministicDialogueDecisionProvider();

    const result = await provider.decide({
      understanding: {
        primaryIntent: 'booking',
        secondaryIntents: [],
        signals: {
          medicalRisk: true,
          legalEscalation: false,
          humanHandover: false,
          abuseOrThreat: false,
        },
      },
    });

    assert.notEqual(result.action, 'START_BOOKING');
    assert.equal(result.action, 'ESCALATE');
  });
  await t.test('apologizes for complaints without escalating ordinary dissatisfaction', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'appointment_query',
      signals: {
        complaint: true,
      },
    },
  });

  assert.equal(result.action, 'APOLOGIZE');
  assert.equal(result.goal, 'resolve_complaint');
  assert.equal(result.flags.requiresHuman, false);
  assert.equal(result.flags.preserveCurrentFlow, true);
});

await t.test('handles objections before operational intent', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'booking',
      signals: {
        objection: true,
      },
    },
  });

  assert.equal(result.action, 'HANDLE_OBJECTION');
  assert.equal(result.goal, 'resolve_concern');
  assert.equal(result.targetIntent, 'booking');
  assert.equal(result.executable, false);
});

await t.test('reassures hesitant customers while preserving the current goal', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'booking',
      signals: {
        hesitation: true,
      },
    },
  });

  assert.equal(result.action, 'REASSURE');
  assert.equal(result.goal, 'resolve_concern');
  assert.equal(result.flags.preserveCurrentFlow, true);
});

await t.test('routes medical questions to approved knowledge retrieval', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'medical_question',
      signals: {
        medicalQuestion: true,
      },
    },
  });

  assert.equal(result.action, 'RETRIEVE_KNOWLEDGE');
  assert.equal(result.goal, 'answer_question');
  assert.equal(result.flags.requiresKnowledge, true);
  assert.deepEqual(
    result.requiredKnowledge,
    ['medical_question']
  );
});

await t.test('complaint wins over booking when no higher safety signal exists', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'booking',
      signals: {
        complaint: true,
      },
    },
  });

  assert.notEqual(result.action, 'START_BOOKING');
  assert.equal(result.action, 'APOLOGIZE');
});
await t.test('maps sensitive appointment management intents safely', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const cases = [
    ['appointment_cancellation', 'REQUEST_CANCELLATION'],
    ['appointment_reschedule', 'REQUEST_RESCHEDULE'],
    ['appointment_change_service', 'REQUEST_CHANGE_SERVICE'],
    ['appointment_change_branch', 'REQUEST_CHANGE_BRANCH'],
    ['appointment_change_provider', 'REQUEST_CHANGE_PROVIDER'],
  ];

  for (const [primaryIntent, expectedAction] of cases) {
    const result = await provider.decide({
      understanding: {
        primaryIntent,
        signals: {},
      },
    });

    assert.equal(result.action, expectedAction);
    assert.equal(result.goal, 'manage_appointment');
    assert.equal(result.flags.sensitive, true);
    assert.equal(result.flags.requiresConfirmation, true);
    assert.equal(result.executable, false);
  }
});

await t.test('maps availability requests to availability checking', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'availability_request',
      signals: {},
    },
  });

  assert.equal(result.action, 'CHECK_AVAILABILITY');
  assert.equal(result.goal, 'answer_question');
  assert.equal(result.targetIntent, 'availability_request');
  assert.equal(result.executable, false);
});

await t.test('maps appointment queries to appointment lookup', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'appointment_query',
      signals: {},
    },
  });

  assert.equal(result.action, 'LOOKUP_APPOINTMENT');
  assert.equal(result.goal, 'manage_appointment');
  assert.equal(result.executable, false);
});

await t.test('maps booking intent to start booking without execution authority', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'booking',
      signals: {},
    },
  });

  assert.equal(result.action, 'START_BOOKING');
  assert.equal(result.goal, 'book_appointment');
  assert.equal(result.targetIntent, 'booking');
  assert.equal(result.executable, false);
});

await t.test('medical risk wins over sensitive appointment management', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'appointment_cancellation',
      signals: {
        medicalRisk: true,
      },
    },
  });

  assert.equal(result.action, 'ESCALATE');
  assert.equal(result.goal, 'handover_to_human');
  assert.notEqual(result.action, 'REQUEST_CANCELLATION');
});

await t.test('complaint wins over booking when both are present', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'booking',
      signals: {
        complaint: true,
      },
    },
  });

  assert.equal(result.action, 'APOLOGIZE');
  assert.equal(result.goal, 'resolve_complaint');
  assert.notEqual(result.action, 'START_BOOKING');
});
await t.test('maps clinic information intents to knowledge retrieval', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const cases = [
    'services',
    'specialties',
    'branches',
    'branch_address',
    'working_hours',
    'payment_methods',
    'insurance',
    'price_inquiry',
  ];

  for (const primaryIntent of cases) {
    const result = await provider.decide({
      understanding: {
        primaryIntent,
        signals: {},
      },
    });

    assert.equal(
      result.action,
      'RETRIEVE_KNOWLEDGE',
      primaryIntent
    );

    assert.equal(
      result.goal,
      'answer_question',
      primaryIntent
    );

    assert.equal(
      result.targetIntent,
      primaryIntent,
      primaryIntent
    );

    assert.equal(
      result.flags.requiresKnowledge,
      true,
      primaryIntent
    );

    assert.deepEqual(
      result.requiredKnowledge,
      [primaryIntent],
      primaryIntent
    );

    assert.equal(
      result.executable,
      false,
      primaryIntent
    );
  }
});

await t.test('maps acknowledgement to ACKNOWLEDGE', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'acknowledgement',
      signals: {},
    },
  });

  assert.equal(result.action, 'ACKNOWLEDGE');
  assert.equal(result.goal, 'assist_customer');
  assert.equal(result.executable, false);
});

await t.test('maps social intents to conversational answer', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const cases = [
    'greeting',
    'courtesy',
    'farewell',
    'identity',
    'presence',
    'small_talk',
  ];

  for (const primaryIntent of cases) {
    const result = await provider.decide({
      understanding: {
        primaryIntent,
        signals: {},
      },
    });

    assert.equal(
      result.action,
      'ANSWER',
      primaryIntent
    );

    assert.equal(
      result.goal,
      'assist_customer',
      primaryIntent
    );

    assert.equal(
      result.targetIntent,
      primaryIntent,
      primaryIntent
    );

    assert.equal(
      result.executable,
      false,
      primaryIntent
    );
  }
});

await t.test('maps conversational primary intents even without matching signal flags', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const cases = [
    ['complaint', 'APOLOGIZE', 'resolve_complaint'],
    ['objection', 'HANDLE_OBJECTION', 'resolve_concern'],
    ['hesitation', 'REASSURE', 'resolve_concern'],
    ['medical_question', 'RETRIEVE_KNOWLEDGE', 'answer_question'],
    ['human_handover_request', 'ESCALATE', 'handover_to_human'],
  ];

  for (const [primaryIntent, expectedAction, expectedGoal] of cases) {
    const result = await provider.decide({
      understanding: {
        primaryIntent,
        signals: {},
      },
    });

    assert.equal(
      result.action,
      expectedAction,
      primaryIntent
    );

    assert.equal(
      result.goal,
      expectedGoal,
      primaryIntent
    );

    assert.equal(
      result.executable,
      false,
      primaryIntent
    );
  }
});

await t.test('returns safe NOOP for unknown intent', async () => {
  const provider = new DeterministicDialogueDecisionProvider();

  const result = await provider.decide({
    understanding: {
      primaryIntent: 'unknown',
      signals: {},
    },
  });

  assert.equal(result.action, 'NOOP');
  assert.equal(result.goal, 'none');
  assert.equal(result.executable, false);
});
});