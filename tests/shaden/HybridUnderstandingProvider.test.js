'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const HybridUnderstandingProvider = require('../../src/services/shaden/HybridUnderstandingProvider');
const {
  SEMANTIC_CONFIDENCE_THRESHOLD,
} = require('../../src/services/shaden/HybridUnderstandingProvider');

const SIGNAL_KEYS = [
  'confirmation', 'rejection', 'correction', 'interruption', 'conditional',
  'hesitation', 'objection', 'complaint', 'medicalQuestion', 'medicalRisk',
  'humanHandover', 'legalEscalation', 'botFrustration', 'abuseOrThreat',
];

function signals(overrides = {}) {
  return Object.fromEntries(
    SIGNAL_KEYS.map((key) => [key, overrides[key] === true])
  );
}

function deterministic(overrides = {}) {
  return {
    version: 1, primaryIntent: 'unknown', knowledgeTopic: null,
    secondaryIntents: [], entities: {},
    conversationAct: 'statement', sentiment: 'neutral', signals: signals(),
    confidence: 0, ...overrides,
  };
}

function semantic(overrides = {}) {
  return {
    version: 1, conversationAct: 'request', primaryIntent: 'unknown',
    knowledgeTopic: null,
    secondaryIntents: [],
    entities: {
      serviceMentions: [], branchMentions: [], providerMentions: [],
      dateTimeMentions: [], bookingReference: null,
      appointmentManagementTarget: 'unspecified', corrections: [],
    },
    signals: signals(), sentiment: 'neutral', confidence: 0.95,
    ambiguity: {
      requiresClarification: false, reason: 'none', candidateIntents: [],
      ambiguousEntityTypes: [],
    },
    ...overrides,
  };
}

function provider({ deterministicResult = deterministic(), semanticResult, semanticError, absent = false } = {}) {
  return new HybridUnderstandingProvider({
    deterministicProvider: { understand: async () => deterministicResult },
    semanticProvider: absent ? null : {
      async understand() {
        if (semanticError) throw semanticError;
        return semanticResult;
      },
    },
  });
}

test('hybrid fills deterministic unknown for supported semantic intent families', async (t) => {
  const families = [
    ['كيف أتحضر لجلسة الليزر', 'medical_question', { medicalQuestion: true }],
    ['وش أسوي قبل الليزر', 'medical_question', { medicalQuestion: true }],
    ['ايش المطلوب قبل جلسة إزالة الشعر', 'medical_question', { medicalQuestion: true }],
    ['في شي أسويه قبل موعد الليزر؟', 'medical_question', { medicalQuestion: true }],
    ['اسمك جميل يا شادن', 'courtesy', {}],
    ['عجبني اسمك', 'courtesy', {}],
    ['اسم شادن حلو', 'courtesy', {}],
    ['وش هالاسم الحلو', 'courtesy', {}],
    ['الغي موعدي', 'appointment_cancellation', {}],
    ['ما عاد أبي الموعد', 'appointment_cancellation', {}],
    ['ممكن تشيلون حجزي؟', 'appointment_cancellation', {}],
    ['أبغى أكنسل', 'appointment_cancellation', {}],
    ['غيّر الموعد', 'appointment_reschedule', {}],
    ['غيّر الخدمة', 'appointment_change_service', {}],
    ['غيّر الفرع', 'appointment_change_branch', {}],
    ['غيّر الطبيبة', 'appointment_change_provider', {}],
    ['الخدمة سيئة', 'complaint', { complaint: true }],
    ['السعر غالي', 'objection', { objection: true }],
    ['خليني أفكر', 'hesitation', { hesitation: true }],
    ['أبغى موظفة', 'human_handover_request', { humanHandover: true }],
  ];
  for (const [text, intent, semanticSignals] of families) {
    await t.test(text, async () => {
      const result = await provider({
        semanticResult: semantic({
          primaryIntent: intent,
          conversationAct: intent === 'medical_question' ? 'question' : 'request',
          signals: signals(semanticSignals),
        }),
      }).understand({ text });
      assert.equal(result.primaryIntent, intent);
    });
  }
});

test('hybrid trusts a bounded medical topic only through an eligible semantic result', async () => {
  const result = await provider({ semanticResult: semantic({
    primaryIntent: 'medical_question',
    knowledgeTopic: 'preparation',
    signals: signals({ medicalQuestion: true }),
  }) }).understand({ text: 'natural language' });
  assert.equal(result.knowledgeTopic, 'preparation');

  const lowConfidence = await provider({ semanticResult: semantic({
    primaryIntent: 'medical_question',
    knowledgeTopic: 'preparation',
    confidence: SEMANTIC_CONFIDENCE_THRESHOLD - 0.01,
  }) }).understand({ text: 'natural language' });
  assert.equal(lowConfidence.knowledgeTopic, null);
});

test('hybrid preserves correction and compound understanding without promoting entities', async (t) => {
  for (const [text, intent] of [
    ['لا مو الليزر، أقصد الفيلر', 'appointment_change_service'],
    ['قصدي فرع جدة مو الرياض', 'appointment_change_branch'],
  ]) {
    await t.test(text, async () => {
      const result = await provider({ semanticResult: semantic({
        primaryIntent: intent, conversationAct: 'correction',
        signals: signals({ correction: true }),
      }) }).understand({ text });
      assert.equal(result.primaryIntent, intent);
      assert.equal(result.signals.correction, true);
      assert.deepEqual(result.entities, {});
    });
  }

  await t.test('compound intent is preserved but not executed', async () => {
    const result = await provider({ semanticResult: semantic({
      primaryIntent: 'medical_question', secondaryIntents: ['booking'],
      signals: signals({ medicalQuestion: true, conditional: true }),
    }) }).understand({ text: 'أبغى أعرف عن الفيلر وإذا مناسب أحجز الخميس' });
    assert.equal(result.primaryIntent, 'medical_question');
    assert.deepEqual(result.secondaryIntents, ['booking']);
    assert.equal(result.signals.conditional, false);
    assert.equal('action' in result, false);
  });

  await t.test('validated service evidence is preserved without an identifier', async () => {
    const entities = semantic().entities;
    const result = await provider({ semanticResult: semantic({
      primaryIntent: 'medical_question',
      signals: signals({ medicalQuestion: true }),
      entities: {
        ...entities,
        serviceMentions: [{
          text: 'Ø§Ù„Ù„ÙŠØ²Ø±', concept: 'Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø´Ø¹Ø± Ø¨Ø§Ù„Ù„ÙŠØ²Ø±',
          role: 'requested', confidence: 0.99,
        }],
      },
    }) }).understand({ text: 'Ø³Ø¤Ø§Ù„ Ø¹Ù† Ø§Ù„Ù„ÙŠØ²Ø±' });
    assert.equal(result.entities.serviceMentions[0].concept, 'Ø¥Ø²Ø§Ù„Ø© Ø§Ù„Ø´Ø¹Ø± Ø¨Ø§Ù„Ù„ÙŠØ²Ø±');
    assert.equal('serviceId' in result.entities, false);
  });
});

test('deterministic evidence remains authoritative', async (t) => {
  const monotonic = [
    'medicalRisk', 'legalEscalation', 'abuseOrThreat', 'humanHandover',
    'complaint', 'objection', 'hesitation',
  ];
  for (const signal of monotonic) {
    await t.test(`${signal} cannot be cleared`, async () => {
      const result = await provider({
        deterministicResult: deterministic({ signals: signals({ [signal]: true }) }),
        semanticResult: semantic({ primaryIntent: 'courtesy' }),
      }).understand({ text: 'text' });
      assert.equal(result.signals[signal], true);
    });
  }

  await t.test('semantic safety may add conservative evidence', async () => {
    const result = await provider({ semanticResult: semantic({
      primaryIntent: 'medical_question',
      signals: signals({ medicalQuestion: true, medicalRisk: true }),
    }) }).understand({ text: 'text' });
    assert.equal(result.signals.medicalRisk, true);
  });

  await t.test('high-confidence explicit intent rejects conflicting semantic operation', async () => {
    const baseline = deterministic({
      primaryIntent: 'booking', confidence: 1, conversationAct: 'request',
    });
    const result = await provider({
      deterministicResult: baseline,
      semanticResult: semantic({ primaryIntent: 'appointment_cancellation' }),
    }).understand({ text: 'text' });
    assert.equal(result.primaryIntent, 'booking');
    assert.equal(result.confidence, 1);
  });

  await t.test('validated medical meaning refines generic deterministic services', async () => {
    const result = await provider({
      deterministicResult: deterministic({
        primaryIntent: 'services', confidence: 1, conversationAct: 'question',
      }),
      semanticResult: semantic({
        primaryIntent: 'medical_question',
        knowledgeTopic: 'aftercare',
        signals: signals({ medicalQuestion: true }),
      }),
    }).understand({ text: 'natural medical question' });
    assert.equal(result.primaryIntent, 'medical_question');
    assert.equal(result.knowledgeTopic, 'aftercare');
  });

  await t.test('eligible semantic meaning supersedes low-confidence deterministic conflict', async () => {
    const result = await provider({
      deterministicResult: deterministic({ primaryIntent: 'booking', confidence: 0.5 }),
      semanticResult: semantic({ primaryIntent: 'appointment_cancellation' }),
    }).understand({ text: 'text' });
    assert.equal(result.primaryIntent, 'appointment_cancellation');
    assert.equal(result.conversationAct, 'request');
  });

  await t.test('state-dependent semantic signals do not override deterministic state', async () => {
    const result = await provider({ semanticResult: semantic({
      primaryIntent: 'courtesy',
      signals: signals({ confirmation: true, rejection: true, conditional: true, interruption: true }),
    }) }).understand({ text: 'text' });
    assert.equal(result.signals.confirmation, false);
    assert.equal(result.signals.rejection, false);
    assert.equal(result.signals.conditional, false);
    assert.equal(result.signals.interruption, false);
  });
});

test('semantic failures and gates preserve deterministic behavior unchanged', async (t) => {
  const baseline = deterministic({
    primaryIntent: 'booking', confidence: 1, conversationAct: 'request',
    signals: signals({ hesitation: true }),
  });
  const cases = [
    ['absent provider', { absent: true }],
    ['provider error', { semanticError: new Error('timeout') }],
    ['invalid result', { semanticResult: { version: 1, action: 'START_BOOKING' } }],
    ['low confidence', { semanticResult: semantic({ primaryIntent: 'courtesy', confidence: SEMANTIC_CONFIDENCE_THRESHOLD - 0.01 }) }],
    ['ambiguous result', { semanticResult: semantic({
      primaryIntent: 'courtesy',
      ambiguity: { requiresClarification: true, reason: 'intent_unclear', candidateIntents: ['courtesy'], ambiguousEntityTypes: [] },
    }) }],
  ];
  for (const [name, options] of cases) {
    await t.test(name, async () => {
      const result = await provider({ deterministicResult: baseline, ...options }).understand({ text: 'text' });
      assert.deepEqual(result, baseline);
    });
  }
});

test('semantic confidence threshold is conservatively fixed at 0.85', () => {
  assert.equal(SEMANTIC_CONFIDENCE_THRESHOLD, 0.85);
});
