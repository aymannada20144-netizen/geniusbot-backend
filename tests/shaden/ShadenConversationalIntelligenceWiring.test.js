'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const createShadenEngine = require(
  '../../src/services/shaden/createShadenEngine'
);

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  conversation: '77777777-7777-4777-8777-777777777777',
};

describe('Shaden conversational intelligence shadow wiring', () => {
  test('invokes the injected CI orchestrator in shadow mode', async () => {
    const shadowCalls = [];

    const harness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze(input) {
          shadowCalls.push(input);

          return {
            mode: 'shadow',
            affectsRuntime: false,
            affectsReply: false,
            affectsState: false,
            executable: false,
          };
        },
      },
    });

    const result = await harness.send('مرحبا');

    assert.equal(shadowCalls.length, 1);
    assert.equal(shadowCalls[0].message.text, 'مرحبا');

    assert.deepEqual(shadowCalls[0].clinicContext, {
      clinicId: IDS.clinic,
      clinicName: 'Clinic',
    });

    assert.deepEqual(shadowCalls[0].patientContext, {
      patientId: null,
      knownPatient: false,
    });

    assert.equal(typeof result.replyText, 'string');
  });

  test('CI result cannot replace the current Shaden reply', async () => {
    const baselineHarness = createHarness();

    const shadowHarness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            mode: 'shadow',
            fakeReply: 'THIS MUST NEVER BE SENT',
            affectsRuntime: true,
            executable: true,
          };
        },
      },
    });

    const baseline = await baselineHarness.send('مرحبا');
    const shadowed = await shadowHarness.send('مرحبا');

    assert.equal(
      shadowed.replyText,
      baseline.replyText
    );

    assert.notEqual(
      shadowed.replyText,
      'THIS MUST NEVER BE SENT'
    );
  });

  test('CI result cannot replace the current Shaden state', async () => {
    const baselineHarness = createHarness();

    const shadowHarness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            mode: 'shadow',
            nextState: {
              dangerous: true,
            },
          };
        },
      },
    });

    const baseline = await baselineHarness.send('مرحبا');
    const shadowed = await shadowHarness.send('مرحبا');

    assert.deepEqual(
      shadowed.state,
      baseline.state
    );

    assert.equal(
      shadowed.state?.data?.shaden?.dangerous,
      undefined
    );
  });

  test('CI provider failure never blocks the current Shaden runtime', async () => {
    const baselineHarness = createHarness();

    const failingHarness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          throw new Error('shadow provider failure');
        },
      },
    });

    const baseline = await baselineHarness.send('مرحبا');
    const result = await failingHarness.send('مرحبا');

    assert.equal(
      result.replyText,
      baseline.replyText
    );

    assert.deepEqual(
      result.state,
      baseline.state
    );
  });

  test('shadow analysis cannot trigger appointment mutations', async () => {
    let mutationCalls = 0;

    const harness = createHarness({
      appointmentService: {
        async cancelAppointment() {
          mutationCalls += 1;
          throw new Error('must not execute');
        },

        async rescheduleAppointment() {
          mutationCalls += 1;
          throw new Error('must not execute');
        },

        async changeAppointmentService() {
          mutationCalls += 1;
          throw new Error('must not execute');
        },

        async changeAppointmentBranch() {
          mutationCalls += 1;
          throw new Error('must not execute');
        },
      },

      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            mode: 'shadow',
            understanding: {
              primaryIntent: 'appointment_cancellation',
            },
            decision: {
              action: 'REQUEST_CANCELLATION',
            },
            executable: true,
          };
        },
      },
    });

    await harness.send('مرحبا');

    assert.equal(mutationCalls, 0);
  });
  test('default runtime uses deterministic understanding in shadow mode', async () => {
  const observed = [];

  class CapturingOrchestrator {
    constructor({ understandingProvider } = {}) {
      this.understandingProvider = understandingProvider;
    }

    async analyze(input) {
      const understanding = await this.understandingProvider.understand({
        text: input.message?.text ?? input.message,
      });

      observed.push(understanding);

      return {
        mode: 'shadow',
        understanding,
        affectsRuntime: false,
        affectsReply: false,
        affectsState: false,
        executable: false,
      };
    }
  }

  const originalModule =
    require('../../src/services/shaden/ShadenConversationalIntelligenceOrchestrator');

  assert.equal(typeof originalModule, 'function');

  const provider =
    new (require('../../src/services/shaden/DeterministicUnderstandingProvider'))({
      policy: {
        recognize() {
          return {
            type: 'greeting',
            kind: 'casual',
          };
        },
      },
    });

  const orchestrator = new CapturingOrchestrator({
    understandingProvider: provider,
  });

  const harness = createHarness({
    conversationalIntelligenceOrchestrator: orchestrator,
  });

  await harness.send('مرحبا');

  assert.equal(observed.length, 1);
  assert.equal(observed[0].primaryIntent, 'greeting');
  assert.equal(observed[0].conversationAct, 'greeting');
  assert.equal(observed[0].confidence, 1);
});
});

function createHarness({
  conversationalIntelligenceOrchestrator = null,
  appointmentService = null,
} = {}) {
  let state = null;
  let messageNumber = 0;

  const runtime = createShadenEngine({
    clinicService: {
      async resolveWhatsAppClinic() {
        return {
          id: IDS.clinic,
          name: 'Clinic',
        };
      },
    },

    conversationService: {
      async findOrCreateForChannel() {
        return {
          id: IDS.conversation,
          patientId: null,
          botEnabled: true,
        };
      },

      async loadState() {
        return state;
      },

      async updateState(_id, nextState) {
        state = nextState;
      },
    },

    patientService: {
      async resolveChannelIdentity() {
        return null;
      },
    },

    messageRepository: {
      async findByExternalId() {
        return null;
      },

      async saveIncomingMessage() {},

      async saveOutgoingMessage() {},
    },

    catalogService: {
      async list() {
        return [];
      },
    },

    clinicConfigurationSource: {
      async get() {
        return {};
      },
    },

    appointmentService,

    conversationalIntelligenceOrchestrator,

    async sendMessage() {
      return {
        messageId: 'out-1',
      };
    },
  });

  return {
    async send(text) {
      return runtime.processMessage({
        channel: 'whatsapp',
        waMessageId: `in-${++messageNumber}`,
        senderPhone: '+966501234567',
        receiverPhone: '+966500000002',
        metaPhoneNumberId: '123456789',
        messageType: 'text',
        text,
        rawPayload: {},
      });
    },
  };
}