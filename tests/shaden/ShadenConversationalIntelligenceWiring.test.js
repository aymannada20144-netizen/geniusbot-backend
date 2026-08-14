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
  botox: '22222222-2222-4222-8222-222222222222',
  filler: '33333333-3333-4333-8333-333333333333',
};

const KNOWLEDGE_SERVICES = Object.freeze([
  { id: IDS.botox, name: 'بوتوكس', is_active: true, is_booking_enabled: true },
  { id: IDS.filler, name: 'فيلر', is_active: true, is_booking_enabled: true },
  {
    id: '44444444-4444-4444-8444-444444444444',
    name: 'إزالة الشعر بالليزر',
    aliases: ['ليزر'],
    is_active: true,
    is_booking_enabled: true,
  },
]);

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

describe('Shaden authoritative medical knowledge wiring', () => {
  test('uses an exact explicit service and preserves the stored fact verbatim', async () => {
    const calls = [];
    const fact = 'النص الطبي المعتمد كما هو. 🌸';
    const harness = createHarness({
      services: KNOWLEDGE_SERVICES,
      knowledgeService: knowledgeFound(fact, calls),
      conversationalIntelligenceOrchestrator: medicalKnowledgeCI(),
    });

    const result = await harness.send('ما تعليمات البوتوكس؟');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].clinicId, IDS.clinic);
    assert.equal(calls[0].serviceId, IDS.botox);
    assert.equal(calls[0].type, 'medical_faq');
    assert.equal(calls[0].source, 'knowledge_base');
    assert.equal(calls[0].query, 'ما تعليمات البوتوكس؟');
    assert.deepEqual(calls[0].keywords, []);
    assert.equal(calls[0].required, true);
    assert.equal(calls[0].allowGeneralModelKnowledge, false);
    assert.equal(result.replyText, fact);
  });

  test('uses the existing clinic service alias for explicit context', async () => {
    const calls = [];
    const harness = medicalHarness({
      knowledgeService: knowledgeFound('معتمد', calls),
    });

    await harness.send('تحضير الليزر');
    assert.equal(calls[0].serviceId, '44444444-4444-4444-8444-444444444444');
  });

  test('explicit current-message service overrides different persisted service', async () => {
    const calls = [];
    const harness = medicalHarness({
      state: stateWithBooking(IDS.filler),
      services: KNOWLEDGE_SERVICES,
      knowledgeService: knowledgeFound('معتمد', calls),
    });

    await harness.send('ما تعليمات البوتوكس؟');
    assert.equal(calls[0].serviceId, IDS.botox);
  });

  test('unresolved explicit service wording never falls back to persisted service', async () => {
    const calls = [];
    const harness = medicalHarness({
      state: stateWithBooking(IDS.filler),
      services: KNOWLEDGE_SERVICES,
      knowledgeService: knowledgeFound('معتمد', calls),
    });

    await harness.send('هل علاج المورفيوس مناسب؟');
    assert.equal(calls[0].serviceId, null);
  });

  test('multiple explicit service mentions never fall back to persisted service', async () => {
    const calls = [];
    const harness = medicalHarness({
      state: stateWithBooking(IDS.filler),
      services: KNOWLEDGE_SERVICES,
      knowledgeService: knowledgeFound('معتمد', calls),
    });

    await harness.send('ايش الفرق بين البوتوكس والفيلر؟');
    assert.equal(calls[0].serviceId, null);
  });

  test('uses one exact persisted service only when the current message has none', async () => {
    const calls = [];
    const harness = medicalHarness({
      state: stateWithBooking(IDS.filler),
      services: KNOWLEDGE_SERVICES,
      knowledgeService: knowledgeFound('معتمد', calls),
    });

    await harness.send('ما تعليمات التحضير؟');
    assert.equal(calls[0].serviceId, IDS.filler);
  });

  test('ambiguous persisted services and absent context use clinic-wide scope', async () => {
    for (const state of [stateWithAmbiguousServices(), null]) {
      const calls = [];
      const harness = medicalHarness({
        state,
        services: KNOWLEDGE_SERVICES,
        knowledgeService: knowledgeFound('معتمد', calls),
      });

      await harness.send('ايهم انسب؟');
      assert.equal(calls[0].serviceId, null);
    }
  });

  test('active flow composes once and preserves engine state and interaction', async () => {
    const initialState = stateAtServiceSelection();
    const baseline = createHarness({
      initialState,
      services: KNOWLEDGE_SERVICES,
      conversationalIntelligenceOrchestrator: continueCI(),
    });
    const influenced = createHarness({
      initialState,
      services: KNOWLEDGE_SERVICES,
      knowledgeService: knowledgeFound('FACT-VERBATIM'),
      conversationalIntelligenceOrchestrator: medicalKnowledgeCI(),
    });

    const baselineResult = await baseline.send('ما تعليمات التحضير؟');
    const result = await influenced.send('ما تعليمات التحضير؟');

    assert.equal(
      result.replyText,
      `FACT-VERBATIM\n\n${baselineResult.replyText}`
    );
    assert.equal(result.replyText.split('FACT-VERBATIM').length - 1, 1);
    assert.deepEqual(result.state, baselineResult.state);
    assert.deepEqual(
      influenced.lastDelivery().interaction,
      baseline.lastDelivery().interaction
    );
  });

  test('not_found and unavailable use distinct fixed policy responses', async () => {
    const policy = new ShadenPolicy();
    const notFound = medicalHarness({
      knowledgeService: knowledgeReturning('not_found'),
    });
    const unavailable = medicalHarness({
      knowledgeService: knowledgeReturning('unavailable'),
    });
    const invalidFound = medicalHarness({
      knowledgeService: knowledgeReturning('found', []),
    });

    assert.equal((await notFound.send('سؤال طبي')).replyText,
      policy.medicalKnowledgeNotFound());
    assert.equal((await unavailable.send('سؤال طبي')).replyText,
      policy.medicalKnowledgeUnavailable());
    assert.equal((await invalidFound.send('سؤال طبي')).replyText,
      policy.medicalKnowledgeUnavailable());
  });

  test('knowledge exceptions fail closed without crashing Shaden', async () => {
    const policy = new ShadenPolicy();
    const harness = medicalHarness({
      knowledgeService: {
        async retrieve() { throw new Error('database secret'); },
      },
    });

    const result = await harness.send('سؤال طبي');
    assert.equal(result.replyText, policy.medicalKnowledgeUnavailable());
  });

  test('not_found during an active flow preserves the engine prompt', async () => {
    const baseline = createHarness({
      initialState: stateAtServiceSelection(),
      services: KNOWLEDGE_SERVICES,
      conversationalIntelligenceOrchestrator: continueCI(),
    });
    const influenced = medicalHarness({
      state: stateAtServiceSelection(),
      services: KNOWLEDGE_SERVICES,
      knowledgeService: knowledgeReturning('not_found'),
    });
    const baselineResult = await baseline.send('ما تعليمات التحضير؟');
    const result = await influenced.send('ما تعليمات التحضير؟');

    assert.equal(result.replyText,
      `${new ShadenPolicy().medicalKnowledgeNotFound()}\n\n${baselineResult.replyText}`);
    assert.deepEqual(result.state, baselineResult.state);
  });

  test('all action, signal, knowledge and higher-risk guards fail closed', async () => {
    const cases = [
      { signals: { medicalQuestion: false } },
      { action: 'CONTINUE' },
      { requiredKnowledge: [] },
      { flags: { requiresKnowledge: false } },
      { signals: { medicalQuestion: true, medicalRisk: true } },
      { signals: { medicalQuestion: true, complaint: true } },
      { signals: { medicalQuestion: true, legalEscalation: true } },
      { signals: { medicalQuestion: true, abuseOrThreat: true } },
      { signals: { medicalQuestion: true, humanHandover: true } },
      { action: 'REQUEST_CANCELLATION' },
    ];

    for (const overrides of cases) {
      let retrievals = 0;
      const harness = createHarness({
        services: KNOWLEDGE_SERVICES,
        knowledgeService: {
          async retrieve() { retrievals += 1; return knowledgeResult('found'); },
        },
        conversationalIntelligenceOrchestrator: medicalKnowledgeCI(overrides),
      });
      await harness.send('سؤال طبي');
      assert.equal(retrievals, 0);
    }
  });

  test('medical knowledge wiring cannot invoke appointment mutations', async () => {
    let mutations = 0;
    const harness = medicalHarness({
      knowledgeService: knowledgeFound('معتمد'),
      appointmentService: {
        async cancelAppointment() { mutations += 1; },
        async rescheduleAppointment() { mutations += 1; },
        async changeAppointmentService() { mutations += 1; },
        async changeAppointmentBranch() { mutations += 1; },
      },
    });

    await harness.send('سؤال طبي');
    assert.equal(mutations, 0);
  });
});
  test('guarded objection overlay prepends exactly once and preserves runtime output', async () => {
    let mutationCalls = 0;
    const baselineHarness = createHarness();
    const harness = createHarness({
      appointmentService: {
        async cancelAppointment() { mutationCalls += 1; },
        async rescheduleAppointment() { mutationCalls += 1; },
        async changeAppointmentService() { mutationCalls += 1; },
        async changeAppointmentBranch() { mutationCalls += 1; },
      },
      conversationalIntelligenceOrchestrator: {
        async analyze() {
          return {
            understanding: { signals: { objection: true } },
            decision: { action: 'HANDLE_OBJECTION' },
            executable: true,
          };
        },
      },
    });

    const baseline = await baselineHarness.send('مرحبا');
    const result = await harness.send('مرحبا');
    const overlay = new ShadenPolicy().objectionResponse();

    assert.equal(result.replyText, `${overlay}\n\n${baseline.replyText}`);
    assert.equal(result.replyText.split(overlay).length - 1, 1);
    assert.deepEqual(result.state, baseline.state);
    assert.deepEqual(
      harness.lastDelivery()?.interaction,
      baselineHarness.lastDelivery()?.interaction
    );
    assert.equal(mutationCalls, 0);
  });

  test('objection overlay requires matching action and signal', async () => {
    const baselineHarness = createHarness();
    const baseline = await baselineHarness.send('مرحبا');
    const cases = [
      { action: 'HANDLE_OBJECTION', signals: { objection: false } },
      { action: 'ANSWER', signals: { objection: true } },
    ];

    for (const value of cases) {
      const harness = createHarness({
        conversationalIntelligenceOrchestrator: {
          async analyze() {
            return { understanding: { signals: value.signals }, decision: { action: value.action } };
          },
        },
      });
      assert.equal((await harness.send('مرحبا')).replyText, baseline.replyText);
    }
  });

  test('higher-risk signals prevent objection overlay', async () => {
    const baselineHarness = createHarness();
    const baseline = await baselineHarness.send('مرحبا');
    const cases = [
      { signal: 'complaint', action: 'HANDLE_OBJECTION' },
      { signal: 'medicalRisk', action: 'HANDLE_OBJECTION' },
      { signal: 'legalEscalation', action: 'HANDLE_OBJECTION' },
      { signal: null, action: 'ESCALATE' },
      { signal: 'abuseOrThreat', action: 'HANDLE_OBJECTION' },
      { signal: 'humanHandover', action: 'HANDLE_OBJECTION' },
    ];

    for (const { signal, action } of cases) {
      const harness = createHarness({
        conversationalIntelligenceOrchestrator: {
          async analyze() {
            return {
              understanding: {
                signals: {
                  objection: true,
                  ...(signal ? { [signal]: true } : {}),
                },
              },
              decision: { action },
            };
          },
        },
      });
      assert.equal((await harness.send('مرحبا')).replyText, baseline.replyText);
    }
  });

  test('objection overlay cannot synthesize an empty engine reply', async () => {
    const originalHandle = ShadenEngine.prototype.handle;
    ShadenEngine.prototype.handle = async function handleEmptyReply() {
      return { reply: '', nextState: { safe: true }, interaction: { unchanged: true } };
    };
    try {
      const harness = createHarness({
        conversationalIntelligenceOrchestrator: {
          async analyze() {
            return {
              understanding: { signals: { objection: true } },
              decision: { action: 'HANDLE_OBJECTION' },
            };
          },
        },
      });
      const result = await harness.send('مرحبا');
      assert.equal(result.replyText, null);
      assert.equal(result.skipped, true);
      assert.equal(harness.lastDelivery(), null);
      assert.deepEqual(result.state.data.shaden, { safe: true });
    } finally {
      ShadenEngine.prototype.handle = originalHandle;
    }
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
  knowledgeService = null,
  initialState = null,
  services = [],
} = {}) {
  let state = structuredClone(initialState);
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
      async list(resource) {
        return resource === 'services' ? structuredClone(services) : [];
      },
    },

    clinicConfigurationSource: {
      async get() {
        return {};
      },
    },

    appointmentService,
    knowledgeService,

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

function medicalHarness({ state = null, ...options } = {}) {
  return createHarness({
    initialState: state,
    services: KNOWLEDGE_SERVICES,
    conversationalIntelligenceOrchestrator: medicalKnowledgeCI(),
    ...options,
  });
}

function medicalKnowledgeCI(overrides = {}) {
  return {
    async analyze() {
      return {
        understanding: {
          signals: {
            medicalQuestion: true,
            ...(overrides.signals || {}),
          },
        },
        decision: {
          action: overrides.action || 'RETRIEVE_KNOWLEDGE',
          requiredKnowledge: overrides.requiredKnowledge || ['medical_question'],
          flags: {
            requiresKnowledge: true,
            ...(overrides.flags || {}),
          },
        },
      };
    },
  };
}

function continueCI() {
  return { async analyze() { return { decision: { action: 'CONTINUE' } }; } };
}

function knowledgeFound(fact, calls = []) {
  return {
    async retrieve(request) {
      calls.push(request);
      return knowledgeResult('found', [fact]);
    },
  };
}

function knowledgeResult(status, facts = status === 'found' ? ['معتمد'] : []) {
  return {
    status,
    facts,
    options: [],
    references: [],
    warnings: [],
  };
}

function knowledgeReturning(status, facts) {
  return {
    async retrieve() { return knowledgeResult(status, facts); },
  };
}

function rootShadenState(overrides = {}) {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'نورة' },
    context: null,
    options: [],
    ...overrides,
  };
}

function persistedState(shaden) {
  return { current: 'shaden', data: { shaden } };
}

function stateWithBooking(serviceId) {
  return persistedState(rootShadenState({
    booking: {
      step: 'branch',
      serviceId,
      branchId: null,
      doctorId: null,
      preferredStart: null,
      paymentMethodId: null,
    },
  }));
}

function stateWithAmbiguousServices() {
  const state = stateWithBooking(IDS.filler);
  state.data.shaden.priceInquiry = {
    intent: 'price_inquiry',
    state: 'awaiting_price_payment_method',
    selected_service_id: IDS.botox,
    selected_service_name: 'بوتوكس',
    selected_payment_method: null,
    selected_insurance_company_id: null,
    selected_insurance_company_name: null,
    selected_insurance_class_id: null,
    selected_insurance_class_name: null,
    resolved_cash_price: null,
    resolved_insurance_price: null,
    currency: null,
  };
  return state;
}

function stateAtServiceSelection() {
  return persistedState(rootShadenState({
    booking: {
      step: 'service',
      serviceId: null,
      branchId: null,
      doctorId: null,
      preferredStart: null,
      paymentMethodId: null,
    },
  }));
}
