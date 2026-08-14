'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const createShadenEngine = require(
  '../../src/services/shaden/createShadenEngine'
);
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');

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

  test('REASSURE prepends hesitation only for a booking intent', async () => {
    let mutationCalls = 0;
    const baselineHarness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return { decision: { action: 'CONTINUE' } };
        },
      },
    });
    const influencedHarness = createHarness({
      appointmentService: {
        async cancelAppointment() { mutationCalls += 1; },
        async rescheduleAppointment() { mutationCalls += 1; },
      },
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            understanding: { primaryIntent: 'booking' },
            decision: { action: 'REASSURE' },
          };
        },
      },
    });

    const baseline = await baselineHarness.send('ابغى حجز بس مترددة شوي');
    const influenced = await influencedHarness.send('ابغى حجز بس مترددة شوي');
    const reassurance = new ShadenPolicy().hesitation();

    assert.equal(influenced.replyText, `${reassurance}\n\n${baseline.replyText}`);
    assert.deepEqual(influenced.state, baseline.state);
    assert.equal(mutationCalls, 0);
    assert.deepEqual(
      influencedHarness.lastDelivery()?.interaction,
      baselineHarness.lastDelivery()?.interaction
    );
  });

  test('actions other than REASSURE cannot affect the reply', async () => {
    const baseline = await createHarness().send('مرحبا');
    for (const action of ['APOLOGIZE', 'ESCALATE', 'HANDLE_OBJECTION', 'START_BOOKING']) {
      const harness = createHarness({
        conversationalIntelligenceOrchestrator: {
          async analyze() {
            return {
              understanding: { primaryIntent: 'booking' },
              decision: { action },
            };
          },
        },
      });
      assert.equal((await harness.send('مرحبا')).replyText, baseline.replyText);
    }
  });

  test('REASSURE without booking context cannot affect the reply', async () => {
    const baseline = await createHarness().send('مرحبا');
    const harness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            understanding: { primaryIntent: 'greeting' },
            decision: { action: 'REASSURE' },
          };
        },
      },
    });
    assert.equal((await harness.send('مرحبا')).replyText, baseline.replyText);
  });

  test('an active preserved booking permits only the reassurance overlay', async () => {
    let call = 0;
    const orchestrator = {
      async analyze() {
        call += 1;
        return call === 1
          ? { understanding: { primaryIntent: 'booking' }, decision: { action: 'START_BOOKING' } }
          : { understanding: { primaryIntent: 'unknown' }, decision: { action: 'REASSURE' } };
      },
    };
    const baselineHarness = createHarness();
    const influencedHarness = createHarness({ conversationalIntelligenceOrchestrator: orchestrator });
    await baselineHarness.send('حجز');
    await influencedHarness.send('حجز');
    const baseline = await baselineHarness.send('نورة');
    const influenced = await influencedHarness.send('نورة');

    assert.equal(
      influenced.replyText,
      `${new ShadenPolicy().hesitation()}\n\n${baseline.replyText}`
    );
    assert.deepEqual(influenced.state, baseline.state);
    assert.deepEqual(
      influencedHarness.lastDelivery()?.interaction,
      baselineHarness.lastDelivery()?.interaction
    );
  });

  test('REASSURE cannot synthesize a reply when the engine reply is empty', async () => {
    const originalHandle = ShadenEngine.prototype.handle;
    ShadenEngine.prototype.handle = async function handleEmptyReply() {
      return { reply: null, nextState: { safe: true }, interaction: { dangerous: true } };
    };
    try {
      const harness = createHarness({
        conversationalIntelligenceOrchestrator: {
          async analyze() {
            return {
              understanding: { primaryIntent: 'booking' },
              decision: { action: 'REASSURE' },
            };
          },
        },
      });
      const result = await harness.send('حجز');
      assert.equal(result.replyText, null);
      assert.equal(result.skipped, true);
      assert.equal(harness.lastDelivery(), null);
      assert.deepEqual(result.state.data.shaden, { safe: true });
    } finally {
      ShadenEngine.prototype.handle = originalHandle;
    }
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
  test('complaint APOLOGIZE prepends apology without replacing the engine reply', async () => {
    const baselineHarness = createHarness();
    await baselineHarness.send('مرحبا');

    const baselineReply = baselineHarness.lastDelivery()?.body;
    assert.equal(typeof baselineReply, 'string');

    const harness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            mode: 'shadow',
            understanding: {
              primaryIntent: 'greeting',
              signals: {
                complaint: true,
              },
            },
            decision: {
              action: 'APOLOGIZE',
            },
            executable: false,
          };
        },
      },
    });

    await harness.send('مرحبا');

    const finalReply = harness.lastDelivery()?.body;

    assert.equal(
      finalReply,
      `أعتذر لك عن التجربة 🌸 خليني أساعدك وأكمل معك من نفس النقطة.\n\n${baselineReply}`
    );
  });

  test('ESCALATE never activates complaint apology overlay', async () => {
    const baselineHarness = createHarness();
    await baselineHarness.send('مرحبا');

    const baselineReply = baselineHarness.lastDelivery()?.body;

    const harness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            mode: 'shadow',
            understanding: {
              primaryIntent: 'complaint',
              signals: {
                complaint: true,
                legalEscalation: true,
              },
            },
            decision: {
              action: 'ESCALATE',
            },
            executable: false,
          };
        },
      },
    });

    await harness.send('مرحبا');

    assert.equal(
      harness.lastDelivery()?.body,
      baselineReply
    );
  });

  test('APOLOGIZE without complaint signal cannot affect the reply', async () => {
    const baselineHarness = createHarness();
    await baselineHarness.send('مرحبا');

    const baselineReply = baselineHarness.lastDelivery()?.body;

    const harness = createHarness({
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            mode: 'shadow',
            understanding: {
              primaryIntent: 'greeting',
              signals: {
                complaint: false,
              },
            },
            decision: {
              action: 'APOLOGIZE',
            },
            executable: false,
          };
        },
      },
    });

    await harness.send('مرحبا');

    assert.equal(
      harness.lastDelivery()?.body,
      baselineReply
    );
  });

  test('complaint overlay cannot trigger appointment mutations', async () => {
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
              primaryIntent: 'greeting',
              signals: {
                complaint: true,
              },
            },
            decision: {
              action: 'APOLOGIZE',
            },
            executable: true,
          };
        },
      },
    });

    await harness.send('مرحبا');

    assert.equal(mutationCalls, 0);
  });
});

function createHarness({
  conversationalIntelligenceOrchestrator = null,
  appointmentService = null,
} = {}) {
  let state = null;
  let messageNumber = 0;
  const deliveries = [];

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

    async sendMessage(payload) {
      deliveries.push(payload);
      return {
        messageId: 'out-1',
      };
    },
  });

  return {
    lastDelivery() {
      return deliveries.at(-1) || null;
    },
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
