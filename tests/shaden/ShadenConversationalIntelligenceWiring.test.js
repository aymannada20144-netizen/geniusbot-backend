'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const createShadenEngine = require(
  '../../src/services/shaden/createShadenEngine'
);
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');
const KnowledgeService = require('../../src/services/KnowledgeService');

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
    aliases: ['خدمات الليزر الطبية والتجميلية'],
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
  test('routes the exact live preparation question through deterministic retrieval', async () => {
    const fact = 'احلقي قبل 24 ساعة، تجنبي النتف والشمع والشمس أسبوعين 🌸';
    const knowledgeService = new KnowledgeService({
      async findEligibleCandidates() {
        return [{
          id: '00000000-0000-0000-0000-000000003011',
          service_id: '44444444-4444-4444-8444-444444444444',
          title: 'تحضير الليزر',
          content: fact,
          category: 'medical_faq',
          keywords: ['تحضير', 'حلاقة', 'شمع', 'نتف'],
          priority: 6,
        }];
      },
    });
    const harness = createHarness({
      services: KNOWLEDGE_SERVICES,
      knowledgeService,
      semanticUnderstandingProvider: semanticProvider({
        primaryIntent: 'medical_question',
        conversationAct: 'question',
        knowledgeTopic: 'preparation',
        signals: { medicalQuestion: true },
        serviceMentions: [{
          text: 'الليزر',
          concept: KNOWLEDGE_SERVICES[2].name,
          role: 'requested',
          confidence: 0.99,
        }],
      }),
    });

    const result = await harness.send('كيف أتحضر لجلسة الليزر');
    assert.equal(result.replyText, fact);
  });

  test('one unrelated character cannot enter medical retrieval even with stale CI output', async () => {
    let retrievals = 0;
    const harness = createHarness({
      initialState: stateWithBooking(IDS.filler),
      services: KNOWLEDGE_SERVICES,
      knowledgeService: {
        async retrieve() { retrievals += 1; return knowledgeResult('found'); },
      },
      conversationalIntelligenceOrchestrator: medicalKnowledgeCI(),
    });

    const result = await harness.send('ر');
    assert.equal(retrievals, 0);
    assert.doesNotMatch(result.replyText, /معلومة معتمدة/u);
  });

  test('routes the exact live compliment through courtesy without side effects', async () => {
    let retrievals = 0;
    let mutations = 0;
    const harness = createHarness({
      services: KNOWLEDGE_SERVICES,
      knowledgeService: {
        async retrieve() { retrievals += 1; return knowledgeResult('found'); },
      },
      appointmentService: {
        async cancelAppointment() { mutations += 1; },
        async rescheduleAppointment() { mutations += 1; },
        async changeAppointmentService() { mutations += 1; },
        async changeAppointmentBranch() { mutations += 1; },
      },
    });

    const result = await harness.send('اسمك جميل يا شادن');
    assert.equal(result.replyText, new ShadenPolicy().courtesy('praise', null));
    assert.equal(retrievals, 0);
    assert.equal(mutations, 0);
  });

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

    await harness.send('خدمات الليزر الطبية والتجميلية');
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

describe('Shaden live hybrid understanding composition', () => {
  test('semantic-equivalent medical questions retrieve exact approved rows', async (t) => {
    const rows = [
      { id: '00000000-0000-0000-0000-000000003011', service_id: KNOWLEDGE_SERVICES[2].id, title: 'تحضير الليزر', content: 'laser preparation', category: 'medical_faq', keywords: [], priority: 6 },
      { id: '00000000-0000-0000-0000-000000003012', service_id: IDS.filler, title: 'تحضير الفيلر', content: 'filler preparation', category: 'medical_faq', keywords: [], priority: 5 },
      { id: '00000000-0000-0000-0000-000000003015', service_id: IDS.botox, title: 'عناية ما بعد البوتوكس', content: 'botox aftercare', category: 'medical_faq', keywords: [], priority: 6 },
      { id: '00000000-0000-0000-0000-000000003016', service_id: null, title: 'الفرق بوتكس/فيلر', content: 'comparison', category: 'medical_faq', keywords: [], priority: 5 },
    ];
    const cases = [
      ['كيف أتحضر للفيلر', 'preparation', [{ text: 'الفيلر', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 }], null, rows[1].id],
      ['وش أسوي قبل الفيلر', 'preparation', [{ text: 'الفيلر', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 }], null, rows[1].id],
      ['في تجهيزات قبل جلسة الفيلر؟', 'preparation', [{ text: 'الفيلر', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 }], null, rows[1].id],
      ['تحضير الفيلر', 'preparation', [{ text: 'الفيلر', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 }], null, rows[1].id],
      ['كيف أتحضر لليزر', 'preparation', [{ text: 'لليزر', concept: KNOWLEDGE_SERVICES[2].name, role: 'requested', confidence: 0.99 }], null, rows[0].id],
      ['وش المطلوب قبل جلسة إزالة الشعر بالليزر؟', 'preparation', [{ text: 'إزالة الشعر بالليزر', concept: KNOWLEDGE_SERVICES[2].name, role: 'requested', confidence: 0.99 }], null, rows[0].id],
      ['وش أسوي بعد البوتوكس؟', 'aftercare', [{ text: 'البوتوكس', concept: KNOWLEDGE_SERVICES[0].name, role: 'requested', confidence: 0.99 }], null, rows[2].id],
      ['ايش التعليمات بعد الجلسة؟', 'aftercare', [], stateWithBooking(IDS.botox), rows[2].id],
      ['ايش الفرق بين البوتوكس والفيلر؟', 'comparison', [
        { text: 'البوتوكس', concept: KNOWLEDGE_SERVICES[0].name, role: 'requested', confidence: 0.99 },
        { text: 'الفيلر', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 },
      ], null, rows[3].id],
      ['وش الأنسب بوتوكس ولا فيلر؟', 'comparison', [
        { text: 'بوتوكس', concept: KNOWLEDGE_SERVICES[0].name, role: 'requested', confidence: 0.99 },
        { text: 'فيلر', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 },
      ], null, rows[3].id],
    ];

    for (const [text, knowledgeTopic, serviceMentions, initialState, expectedId] of cases) {
      await t.test(text, async () => {
        const retrieved = [];
        const authoritativeKnowledgeService = new KnowledgeService({
          async findEligibleCandidates({ serviceId, category }) {
            return rows.filter((row) =>
              row.category === category &&
              (serviceId === null
                ? row.service_id === null
                : row.service_id === null || row.service_id === serviceId)
            );
          },
        });
        const knowledgeService = {
          async retrieve(request) {
            const result = await authoritativeKnowledgeService.retrieve(request);
            retrieved.push(result);
            return result;
          },
        };
        const result = await createHarness({
          initialState,
          services: KNOWLEDGE_SERVICES,
          semanticUnderstandingProvider: semanticProvider({
            primaryIntent: 'medical_question',
            conversationAct: 'question',
            knowledgeTopic,
            signals: { medicalQuestion: true },
            serviceMentions,
          }),
          knowledgeService,
        }).send(text);
        assert.equal(retrieved[0].references[0].id, expectedId);
        assert.match(
          result.replyText,
          new RegExp(rows.find(({ id }) => id === expectedId).content, 'u')
        );
      });
    }
  });

  test('semantic medical understanding reaches deterministic knowledge decision', async () => {
    const semanticCalls = [];
    const knowledgeCalls = [];
    const harness = createHarness({
      services: KNOWLEDGE_SERVICES,
      semanticUnderstandingProvider: semanticProvider({
        primaryIntent: 'medical_question',
        knowledgeTopic: 'preparation',
        conversationAct: 'question',
        signals: { medicalQuestion: true },
      }, semanticCalls),
      knowledgeService: knowledgeFound('تعليمات التحضير المعتمدة', knowledgeCalls),
    });

    const result = await harness.send('كيف أتحضر لجلسة الليزر');

    assert.equal(semanticCalls.length, 1);
    assert.equal(semanticCalls[0].text, 'كيف أتحضر لجلسة الليزر');
    assert.equal(knowledgeCalls.length, 1);
    assert.equal(knowledgeCalls[0].type, 'medical_faq');
    assert.match(result.replyText, /تعليمات التحضير المعتمدة/u);
  });

  test('semantic courtesy reaches the existing deterministic social reply', async () => {
    const semanticCalls = [];
    const harness = createHarness({
      semanticUnderstandingProvider: semanticProvider({
        primaryIntent: 'courtesy',
        conversationAct: 'statement',
        sentiment: 'positive',
      }, semanticCalls),
    });

    const result = await harness.send('عجبني اسمك');

    assert.equal(semanticCalls.length, 1);
    assert.match(result.replyText, /تسلمي|نورتينا/u);
    assert.doesNotMatch(result.replyText, /لم أفهم/u);
  });

  test('semantic cancellation enters existing management flow without mutation', async () => {
    let mutations = 0;
    const semanticCalls = [];
    const harness = createHarness({
      semanticUnderstandingProvider: semanticProvider({
        primaryIntent: 'appointment_cancellation',
        conversationAct: 'request',
      }, semanticCalls),
      appointmentService: {
        async cancelAppointment() { mutations += 1; },
        async applyValidatedChange() { mutations += 1; },
      },
    });

    const result = await harness.send('ما عاد أبي الموعد');

    assert.equal(semanticCalls.length, 1);
    assert.equal(mutations, 0);
    assert.match(result.replyText, /رقم الحجز/u);
  });

  test('semantic failure preserves the old deterministic path', async () => {
    const harness = createHarness({
      semanticUnderstandingProvider: {
        async understand() { throw new Error('semantic timeout'); },
      },
    });

    const result = await harness.send('مرحبا');
    assert.match(result.replyText, /أهل|مرحب/u);
  });

  test('deterministic medical risk survives semantic interpretation', async () => {
    let retrievals = 0;
    let mutations = 0;
    const harness = createHarness({
      services: KNOWLEDGE_SERVICES,
      semanticUnderstandingProvider: semanticProvider({
        primaryIntent: 'courtesy',
        conversationAct: 'statement',
        sentiment: 'positive',
      }),
      knowledgeService: {
        async retrieve() { retrievals += 1; return knowledgeResult('found'); },
      },
      appointmentService: {
        async cancelAppointment() { mutations += 1; },
        async applyValidatedChange() { mutations += 1; },
      },
    });

    await harness.send('حرق شديد بعد الليزر');

    assert.equal(retrievals, 0);
    assert.equal(mutations, 0);
  });

  test('semantic service concepts are grounded deterministically through the wired path', async (t) => {
    const cases = [
      { name: 'laser preparation', text: '\u0643\u064a\u0641 \u0623\u062a\u062d\u0636\u0631 \u0644\u062c\u0644\u0633\u0629 \u0627\u0644\u0644\u064a\u0632\u0631', mention: '\u0627\u0644\u0644\u064a\u0632\u0631', concept: KNOWLEDGE_SERVICES[2].name, expectedId: KNOWLEDGE_SERVICES[2].id },
      { name: 'natural laser paraphrase', text: '\u0648\u0634 \u0623\u0633\u0648\u064a \u0642\u0628\u0644 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0634\u0639\u0631 \u0628\u0627\u0644\u0644\u064a\u0632\u0631', mention: KNOWLEDGE_SERVICES[2].name, concept: KNOWLEDGE_SERVICES[2].name, expectedId: KNOWLEDGE_SERVICES[2].id },
      { name: 'filler question', text: '\u0639\u0646\u062f\u064a \u0633\u0624\u0627\u0644 \u0639\u0646 \u0627\u0644\u0641\u064a\u0644\u0631', mention: '\u0627\u0644\u0641\u064a\u0644\u0631', concept: KNOWLEDGE_SERVICES[1].name, expectedId: IDS.filler },
      { name: 'Botox aftercare', text: '\u0628\u0639\u062f \u0627\u0644\u0628\u0648\u062a\u0643\u0633 \u0648\u0634 \u0627\u0644\u0645\u0645\u0646\u0648\u0639', mention: '\u0627\u0644\u0628\u0648\u062a\u0643\u0633', concept: KNOWLEDGE_SERVICES[0].name, expectedId: IDS.botox },
    ];

    for (const item of cases) {
      await t.test(item.name, async () => {
        const calls = [];
        await createHarness({
          services: KNOWLEDGE_SERVICES,
          semanticUnderstandingProvider: semanticProvider({
            primaryIntent: 'medical_question',
            conversationAct: 'question',
            signals: { medicalQuestion: true },
            serviceMentions: [{ text: item.mention, concept: item.concept, role: 'requested', confidence: 0.99 }],
          }),
          knowledgeService: knowledgeFound('authoritative fact', calls),
        }).send(item.text);
        assert.equal(calls[0].serviceId, item.expectedId);
      });
    }
  });

  test('explicit semantic filler evidence overrides persisted laser context', async () => {
    const calls = [];
    await createHarness({
      initialState: stateWithBooking(KNOWLEDGE_SERVICES[2].id),
      services: KNOWLEDGE_SERVICES,
      semanticUnderstandingProvider: semanticProvider({
        primaryIntent: 'medical_question', conversationAct: 'question',
        signals: { medicalQuestion: true },
        serviceMentions: [{ text: '\u0627\u0644\u0641\u064a\u0644\u0631', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 }],
      }),
      knowledgeService: knowledgeFound('filler fact', calls),
    }).send('\u0639\u0646\u062f\u064a \u0633\u0624\u0627\u0644 \u0639\u0646 \u0627\u0644\u0641\u064a\u0644\u0631');
    assert.equal(calls[0].serviceId, IDS.filler);
  });

  test('unknown, multiple, and ambiguous semantic evidence never guesses a service', async (t) => {
    const cases = [
      { name: 'unknown service', serviceMentions: [{ text: 'unknown treatment', concept: 'unknown treatment', role: 'requested', confidence: 0.99 }], services: KNOWLEDGE_SERVICES, text: 'unknown treatment' },
      { name: 'service comparison', serviceMentions: [
        { text: '\u0627\u0644\u0628\u0648\u062a\u0643\u0633', concept: KNOWLEDGE_SERVICES[0].name, role: 'requested', confidence: 0.99 },
        { text: '\u0627\u0644\u0641\u064a\u0644\u0631', concept: KNOWLEDGE_SERVICES[1].name, role: 'requested', confidence: 0.99 },
      ], services: KNOWLEDGE_SERVICES, text: '\u0627\u064a\u0634 \u0627\u0644\u0641\u0631\u0642 \u0628\u064a\u0646 \u0627\u0644\u0628\u0648\u062a\u0643\u0633 \u0648\u0627\u0644\u0641\u064a\u0644\u0631' },
      { name: 'ambiguous generic laser', serviceMentions: [{ text: '\u0627\u0644\u0644\u064a\u0632\u0631', concept: '\u0644\u064a\u0632\u0631', role: 'requested', confidence: 0.99 }], services: [
        ...KNOWLEDGE_SERVICES,
        { id: '55555555-5555-4555-8555-555555555555', name: '\u0644\u064a\u0632\u0631 \u0627\u0644\u062a\u0635\u0628\u063a\u0627\u062a', aliases: [], is_active: true },
      ], text: '\u0627\u0644\u0644\u064a\u0632\u0631' },
    ];

    for (const item of cases) {
      await t.test(item.name, async () => {
        const calls = [];
        await createHarness({
          services: item.services,
          semanticUnderstandingProvider: semanticProvider({
            primaryIntent: 'medical_question', conversationAct: 'question',
            signals: { medicalQuestion: true },
            serviceMentions: item.serviceMentions,
          }),
          knowledgeService: knowledgeFound('general fact', calls),
        }).send(item.text);
        assert.equal(calls[0].serviceId, null);
      });
    }
  });

  test('semantic failure retains deterministic service grounding', async () => {
    const calls = [];
    await createHarness({
      services: KNOWLEDGE_SERVICES,
      semanticUnderstandingProvider: { async understand() { throw new Error('model unavailable'); } },
      knowledgeService: knowledgeFound('laser fact', calls),
    }).send('\u0643\u064a\u0641 \u0623\u062a\u062d\u0636\u0631 \u0644\u062c\u0644\u0633\u0629 \u0627\u0644\u0644\u064a\u0632\u0631');
    assert.equal(calls[0].serviceId, KNOWLEDGE_SERVICES[2].id);
  });
});

describe('Shaden Semantic Core processMessage behavioral gate', () => {
  test('deterministic authority ignores conflicting Core interpretation', async () => {
    const calls = [];
    const initialState = stateAtServiceSelection();
    const baseline = await createHarness({ initialState }).send('مرحبا');
    const integrated = await createHarness({
      initialState,
      semanticCoreProvider: coreProvider({
        primaryGoal: 'appointment_cancel',
        conversationAct: 'request',
      }, calls),
    }).send('مرحبا');

    assert.equal(calls.length, 0);
    assert.equal(integrated.replyText, baseline.replyText);
    assert.deepEqual(integrated.state, baseline.state);
  });

  test('valid Core evidence assists an unresolved active-flow turn', async () => {
    const calls = [];
    const initialState = stateAtServiceSelection();
    const baseline = await createHarness({ initialState })
      .send('contextual utterance');
    const integrated = await createHarness({
      initialState,
      semanticCoreProvider: coreProvider({
        primaryGoal: 'booking',
        conversationAct: 'inform',
      }, calls),
    }).send('contextual utterance');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].context.active.goal, 'booking');
    assert.equal(typeof integrated.replyText, 'string');
    assert.deepEqual(integrated.state, baseline.state);
  });

  test('Core error, invalid output, and timeout fail open to R1 behavior', async (t) => {
    const initialState = stateAtServiceSelection();
    const text = 'contextual utterance';
    const baseline = await createHarness({ initialState }).send(text);
    const cases = [
      ['error', { async understand() { throw new Error('core unavailable'); } }],
      ['invalid', { async understand() { return { action: 'EXECUTE' }; } }],
      ['timeout', { async understand() { return new Promise(() => {}); } }],
    ];
    for (const [name, semanticCoreProvider] of cases) {
      await t.test(name, async () => {
        const integrated = await createHarness({
          initialState,
          semanticCoreProvider,
          semanticCoreTimeoutMs: 5,
        }).send(text);
        assert.equal(integrated.replyText, baseline.replyText);
        assert.deepEqual(integrated.state, baseline.state);
      });
    }
  });

  test('courtesy remains conversational and cannot enter an operational flow', async () => {
    const calls = [];
    const baseline = await createHarness().send('اسمك جميل يا شادن');
    const integrated = await createHarness({
      semanticCoreProvider: coreProvider({
        primaryGoal: 'booking',
        conversationAct: 'request',
      }, calls),
    }).send('اسمك جميل يا شادن');

    assert.equal(calls.length, 0);
    assert.equal(integrated.replyText, baseline.replyText);
    assert.deepEqual(integrated.state, baseline.state);
    assert.equal(integrated.state.data.shaden.booking, undefined);
  });

  test('R1 medical knowledge routing remains authoritative with Core configured', async () => {
    const coreCalls = [];
    const knowledgeCalls = [];
    const semantic = semanticProvider({
      primaryIntent: 'medical_question',
      knowledgeTopic: 'preparation',
      conversationAct: 'question',
      signals: { medicalQuestion: true },
    });
    const options = {
      services: KNOWLEDGE_SERVICES,
      semanticUnderstandingProvider: semantic,
      knowledgeService: knowledgeFound('تعليمات التحضير المعتمدة', knowledgeCalls),
    };
    const integrated = await createHarness({
      ...options,
      semanticCoreProvider: coreProvider({
        primaryGoal: 'appointment_cancel',
        conversationAct: 'request',
      }, coreCalls),
    }).send('كيف أتحضر لجلسة الليزر');

    assert.equal(coreCalls.length, 0);
    assert.equal(knowledgeCalls.length, 1);
    assert.match(integrated.replyText, /تعليمات التحضير المعتمدة/u);
  });

  test('Core appointment-management intent cannot authorize execution', async () => {
    let mutations = 0;
    const calls = [];
    const initialState = persistedState(rootShadenState({
      cancellation: {
        intent: 'appointment_cancellation',
        step: 'awaiting_reference',
      },
    }));
    const integrated = await createHarness({
      initialState,
      semanticCoreProvider: coreProvider({
        primaryGoal: 'appointment_cancel',
        conversationAct: 'request',
      }, calls),
      appointmentService: {
        async cancelAppointment() { mutations += 1; },
        async applyValidatedChange() { mutations += 1; },
      },
    }).send('contextual utterance');

    assert.equal(calls.length, 1);
    assert.equal(mutations, 0);
    assert.equal(typeof integrated.replyText, 'string');
  });

  test('interactive reply authority prevents Core invocation', async () => {
    const calls = [];
    const initialState = stateAtServiceSelection();
    const baseline = await createHarness({ initialState })
      .send('اختيار', { value: 'service:authoritative-option' });
    const integrated = await createHarness({
      initialState,
      semanticCoreProvider: coreProvider({
        primaryGoal: 'booking',
        conversationAct: 'inform',
      }, calls),
    }).send('اختيار', { value: 'service:authoritative-option' });

    assert.equal(calls.length, 0);
    assert.equal(integrated.replyText, baseline.replyText);
    assert.deepEqual(integrated.state, baseline.state);
  });

  test('Core-only interpretation does not create hidden state mutation', async () => {
    const calls = [];
    const initialState = stateAtServiceSelection();
    const before = structuredClone(initialState);
    const baseline = await createHarness({ initialState })
      .send('contextual utterance');
    const integrated = await createHarness({
      initialState,
      semanticCoreProvider: coreProvider({
        primaryGoal: 'booking',
        conversationAct: 'inform',
      }, calls),
    }).send('contextual utterance');

    assert.equal(calls.length, 1);
    assert.deepEqual(initialState, before);
    assert.deepEqual(integrated.state, baseline.state);
  });
});

function createHarness({
  conversationalIntelligenceOrchestrator = null,
  semanticUnderstandingProvider = null,
  semanticCoreProvider = null,
  semanticCoreTimeoutMs = undefined,
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
    semanticUnderstandingProvider,
    semanticCoreProvider,
    semanticCoreTimeoutMs,

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
    async send(text, rawPayload = {}) {
      return runtime.processMessage({
        channel: 'whatsapp',
        waMessageId: `in-${++messageNumber}`,
        senderPhone: '+966501234567',
        receiverPhone: '+966500000002',
        metaPhoneNumberId: '123456789',
        messageType: 'text',
        text,
        rawPayload,
      });
    },
  };
}

function coreProvider(overrides = {}, calls = []) {
  return {
    async understand(input) {
      calls.push(input);
      return {
        contractVersion: 2,
        primaryGoal: 'booking',
        conversationAct: 'inform',
        confidence: 0.95,
        interpretation: { status: 'clear' },
        mentionedEntities: [],
        additionalGoals: [],
        ...overrides,
      };
    },
  };
}

function semanticProvider(overrides = {}, calls = []) {
  return {
    async understand(input) {
      calls.push(input);
      const signalNames = [
        'confirmation', 'rejection', 'correction', 'interruption',
        'conditional', 'hesitation', 'objection', 'complaint',
        'medicalQuestion', 'medicalRisk', 'humanHandover',
        'legalEscalation', 'botFrustration', 'abuseOrThreat',
      ];
      return {
        version: 1,
        conversationAct: overrides.conversationAct || 'statement',
        primaryIntent: overrides.primaryIntent || 'unknown',
        knowledgeTopic: overrides.knowledgeTopic || null,
        secondaryIntents: [],
        entities: {
          serviceMentions: overrides.serviceMentions || [],
          branchMentions: [], providerMentions: [],
          dateTimeMentions: [], bookingReference: null,
          appointmentManagementTarget: 'unspecified', corrections: [],
        },
        signals: Object.fromEntries(signalNames.map((name) => [
          name,
          overrides.signals?.[name] === true,
        ])),
        sentiment: overrides.sentiment || 'neutral',
        confidence: 0.95,
        ambiguity: {
          requiresClarification: false,
          reason: 'none',
          candidateIntents: [],
          ambiguousEntityTypes: [],
        },
      };
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
