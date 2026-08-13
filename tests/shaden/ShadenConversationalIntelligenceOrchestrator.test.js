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
});