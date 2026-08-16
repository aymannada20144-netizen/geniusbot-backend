'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ShadenConversationalIntelligenceOrchestrator =
  require('../../src/services/shaden/ShadenConversationalIntelligenceOrchestrator');

test('ShadenConversationalIntelligenceOrchestrator', async (t) => {
  await t.test('returns a safe shadow result by default', async () => {
    const orchestrator =
      new ShadenConversationalIntelligenceOrchestrator();

    const result = await orchestrator.analyze({
      message: { text: 'أبغى أسأل عن الليزر' },
    });

    assert.equal(result.version, 1);
    assert.equal(result.mode, 'shadow');

    assert.equal(result.affectsRuntime, false);
    assert.equal(result.affectsReply, false);
    assert.equal(result.affectsState, false);
    assert.equal(result.executable, false);

    assert.equal(result.understanding.primaryIntent, 'unknown');
    assert.equal(result.decision.action, 'NOOP');
  });

  await t.test('normalizes provider understanding through the contract', async () => {
    const orchestrator =
      new ShadenConversationalIntelligenceOrchestrator({
        understandingProvider: {
          async understand() {
            return {
              primaryIntent: 'medical_question',
              secondaryIntents: ['booking'],
              conversationAct: 'question',
              sentiment: 'worried',
              signals: {
                hesitation: true,
                medicalQuestion: true,
              },
              confidence: 0.92,
            };
          },
        },
      });

    const result = await orchestrator.analyze({
      message: 'هل الليزر يوجع؟',
    });

    assert.equal(
      result.understanding.primaryIntent,
      'medical_question'
    );

    assert.deepEqual(
      result.understanding.secondaryIntents,
      ['booking']
    );

    assert.equal(
      result.understanding.signals.medicalQuestion,
      true
    );

    assert.equal(result.affectsRuntime, false);
  });

  await t.test('normalizes dialogue decisions through the contract', async () => {
    const orchestrator =
      new ShadenConversationalIntelligenceOrchestrator({
        understandingProvider: {
          async understand() {
            return {
              primaryIntent: 'appointment_cancellation',
              confidence: 0.95,
            };
          },
        },

        decisionProvider: {
          async decide({ understanding }) {
            assert.equal(
              understanding.primaryIntent,
              'appointment_cancellation'
            );

            return {
              action: 'REQUEST_CANCELLATION',
              goal: 'manage_appointment',
              targetIntent: 'appointment_cancellation',
            };
          },
        },
      });

    const result = await orchestrator.analyze({
      message: 'خلاص أبغى ألغي موعدي',
    });

    assert.equal(
      result.decision.action,
      'REQUEST_CANCELLATION'
    );

    assert.equal(
      result.decision.flags.sensitive,
      true
    );

    assert.equal(
      result.decision.flags.requiresConfirmation,
      true
    );

    assert.equal(result.decision.executable, false);
    assert.equal(result.executable, false);
  });

  await t.test('falls back safely when providers throw', async () => {
    const orchestrator =
      new ShadenConversationalIntelligenceOrchestrator({
        understandingProvider: {
          async understand() {
            throw new Error('provider failure');
          },
        },

        decisionProvider: {
          async decide() {
            throw new Error('decision failure');
          },
        },
      });

    const result = await orchestrator.analyze({
      message: 'أي رسالة',
    });

    assert.equal(
      result.understanding.primaryIntent,
      'unknown'
    );

    assert.equal(result.decision.action, 'NOOP');
    assert.equal(result.executable, false);
  });

  await t.test('does not expose nested runtime state into shadow input', async () => {
    const orchestrator =
      new ShadenConversationalIntelligenceOrchestrator();

    const result = await orchestrator.analyze({
      message: 'مرحبا',

      currentState: {
        step: 'service',
        customerName: 'نورة',
        booking: {
          appointmentId: 'secret-appointment',
        },
      },

      clinicContext: {
        clinicId: 'clinic-1',
        nested: {
          private: true,
        },
      },

      patientContext: {
        patientId: 'patient-1',
        privateData: {
          mobile: 'secret',
        },
      },
    });

    assert.deepEqual(result.input.state, {
      step: 'service',
      customerName: 'نورة',
    });

    assert.deepEqual(result.input.clinic, {
      clinicId: 'clinic-1',
    });

    assert.deepEqual(result.input.patient, {
      patientId: 'patient-1',
    });
    assert.deepEqual(result.input.context, {
      contextVersion: 1,
      active: null,
      pending: null,
    });
  });

  await t.test('builds bounded context and exposes only interactive presence', async () => {
    const orchestrator = new ShadenConversationalIntelligenceOrchestrator();
    const result = await orchestrator.analyze({
      message: { text: 'نعم', rawPayload: { value: 'private-option-id' } },
      currentState: {
        version: 1,
        booking: { step: 'confirmation', appointmentId: 'private-id' },
      },
    });
    assert.deepEqual(result.input.context, {
      contextVersion: 1,
      active: { goal: 'booking', step: 'awaiting_confirmation' },
      pending: { kind: 'confirmation', targetType: 'appointment' },
    });
    assert.equal(result.input.interactive, true);
    assert.equal(JSON.stringify(result.input).includes('private-option-id'), false);
    assert.equal(JSON.stringify(result.input.context).includes('private-id'), false);
  });

  await t.test('propagates only a validated interaction event as metadata', async () => {
    const event = {
      eventVersion: 1,
      type: 'ACCEPT_PENDING',
      source: 'semantic_core',
      guard: {
        contextVersion: 1,
        goal: 'booking',
        step: 'awaiting_confirmation',
        pendingKind: 'confirmation',
        targetType: 'appointment',
      },
    };
    const orchestrator = new ShadenConversationalIntelligenceOrchestrator({
      understandingProvider: {
        understand: async () => ({}),
        understandWithMetadata: async () => ({
          understanding: { primaryIntent: 'booking', confidence: 1 },
          interactionEvent: event,
        }),
      },
    });
    const result = await orchestrator.analyze({ message: 'response' });
    assert.deepEqual(result.interactionEvent, event);
    assert.equal(Object.isFrozen(result.interactionEvent), true);
    assert.equal(result.decision.action, 'NOOP');
  });

  await t.test('returns immutable shadow structures', async () => {
    const orchestrator =
      new ShadenConversationalIntelligenceOrchestrator();

    const result = await orchestrator.analyze({
      message: 'مرحبا',
    });

    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.input), true);
    assert.equal(Object.isFrozen(result.input.state), true);
    assert.equal(Object.isFrozen(result.understanding), true);
    assert.equal(Object.isFrozen(result.decision), true);
  });
  await t.test('emits complete shadow telemetry without affecting runtime', async () => {
  const logs = [];

  const orchestrator =
    new ShadenConversationalIntelligenceOrchestrator({
      understandingProvider: {
        async understand() {
          return {
            primaryIntent: 'booking',
            confidence: 0.91,
          };
        },
      },

      decisionProvider: {
        async decide() {
          return {
            action: 'START_BOOKING',
            goal: 'book_appointment',
            targetIntent: 'booking',
          };
        },
      },

      logger: {
        debug(event, payload) {
          logs.push({ event, payload });
        },
      },
    });

  const result = await orchestrator.analyze({
    message: 'أبغى أحجز ليزر',
  });

  assert.equal(logs.length, 1);

  assert.equal(
    logs[0].event,
    'Shaden CI shadow result'
  );

  assert.equal(
    logs[0].payload.understanding.primaryIntent,
    'booking'
  );

  assert.equal(
    logs[0].payload.decision.action,
    'START_BOOKING'
  );

  assert.equal(logs[0].payload.mode, 'shadow');
  assert.equal(logs[0].payload.affectsRuntime, false);
  assert.equal(logs[0].payload.affectsReply, false);
  assert.equal(logs[0].payload.affectsState, false);
  assert.equal(logs[0].payload.executable, false);

  assert.equal(result.executable, false);
});

await t.test('logger failure never breaks shadow analysis', async () => {
  const orchestrator =
    new ShadenConversationalIntelligenceOrchestrator({
      logger: {
        debug() {
          throw new Error('telemetry failure');
        },
      },
    });

  const result = await orchestrator.analyze({
    message: 'مرحبا',
  });

  assert.equal(result.mode, 'shadow');
  assert.equal(result.understanding.primaryIntent, 'unknown');
  assert.equal(result.decision.action, 'NOOP');
  assert.equal(result.executable, false);
});
});
