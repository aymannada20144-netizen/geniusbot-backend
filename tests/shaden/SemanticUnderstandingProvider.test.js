'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SemanticUnderstandingProvider = require('../../src/services/shaden/SemanticUnderstandingProvider');

function output({ intent, act, text, service = null, branch = null, date = null, signals = {}, secondary = [], correction = null, knowledgeTopic = null }) {
  return {
    version: 1,
    conversationAct: act,
    primaryIntent: intent,
    knowledgeTopic,
    secondaryIntents: secondary,
    entities: {
      serviceMentions: service ? [{ text: service, concept: service, role: correction ? 'requested' : 'requested', confidence: 0.95 }] : [],
      branchMentions: branch ? [{ text: branch, concept: null, role: 'requested', confidence: 0.95 }] : [],
      providerMentions: [],
      dateTimeMentions: date ? [{ text: date, kind: 'date', role: 'requested', confidence: 0.95 }] : [],
      bookingReference: null,
      appointmentManagementTarget: intent === 'appointment_cancellation' ? 'entire_booking' : correction?.entityType || 'unspecified',
      corrections: correction ? [{ ...correction, confidence: 0.98 }] : [],
    },
    signals: {
      confirmation: false, rejection: false, correction: Boolean(correction),
      interruption: false, conditional: signals.conditional === true,
      hesitation: false, objection: false, complaint: false,
      medicalQuestion: signals.medicalQuestion === true, medicalRisk: false,
      humanHandover: false, legalEscalation: false, botFrustration: false,
      abuseOrThreat: false,
    },
    sentiment: intent === 'courtesy' ? 'positive' : 'neutral',
    confidence: 0.94,
    ambiguity: { requiresClarification: false, reason: 'none', candidateIntents: [], ambiguousEntityTypes: [] },
  };
}

async function understand(text, result) {
  const calls = [];
  const provider = new SemanticUnderstandingProvider({
    modelClient: {
      async inferUnderstanding(input) {
        calls.push(input);
        return JSON.stringify(result);
      },
    },
  });
  const understood = await provider.understand({ text, state: { secret: true }, clinic: { facts: 'hidden' } });
  assert.deepEqual(calls, [{ text }]);
  return understood;
}

test('SemanticUnderstandingProvider supports semantic language families through model output', async (t) => {
  const preparation = [
    ['كيف أتحضر للفيلر', 'فيلر'],
    ['وش أسوي قبل الفيلر', 'الفيلر'],
    ['في تجهيزات قبل جلسة الفيلر؟', 'الفيلر'],
    ['تحضير الفيلر', 'الفيلر'],
    ['كيف أتحضر لليزر', 'لليزر'],
    ['وش المطلوب قبل جلسة إزالة الشعر بالليزر؟', 'إزالة الشعر بالليزر'],
  ];
  for (const [text, service] of preparation) {
    await t.test(`preparation: ${text}`, async () => {
      const result = await understand(text, output({ intent: 'medical_question', act: 'question', text, service, knowledgeTopic: 'preparation', signals: { medicalQuestion: true } }));
      assert.equal(result.primaryIntent, 'medical_question');
      assert.equal(result.knowledgeTopic, 'preparation');
      assert.equal(result.signals.medicalQuestion, true);
    });
  }

  for (const text of ['اسمك جميل يا شادن', 'عجبني اسمك', 'اسم شادن حلو', 'وش هالاسم الحلو']) {
    await t.test(`compliment: ${text}`, async () => {
      const result = await understand(text, output({ intent: 'courtesy', act: 'statement', text }));
      assert.equal(result.primaryIntent, 'courtesy');
      assert.equal(result.sentiment, 'positive');
    });
  }

  for (const text of ['الغي موعدي', 'ما عاد أبي الموعد', 'ممكن تشيلون حجزي؟', 'أبغى أكنسل']) {
    await t.test(`cancellation: ${text}`, async () => {
      const result = await understand(text, output({ intent: 'appointment_cancellation', act: 'request', text }));
      assert.equal(result.primaryIntent, 'appointment_cancellation');
    });
  }
});

test('SemanticUnderstandingProvider represents aftercare and comparison paraphrases as bounded topics', async (t) => {
  const cases = [
    ['وش أسوي بعد البوتوكس؟', 'البوتوكس', 'aftercare'],
    ['ايش التعليمات بعد الجلسة؟', null, 'aftercare'],
    ['ايش الفرق بين البوتوكس والفيلر؟', 'البوتوكس', 'comparison'],
    ['وش الأنسب بوتوكس ولا فيلر؟', 'بوتوكس', 'comparison'],
  ];
  for (const [text, service, knowledgeTopic] of cases) {
    await t.test(text, async () => {
      const result = await understand(text, output({
        intent: 'medical_question',
        act: 'question',
        text,
        service,
        knowledgeTopic,
        signals: { medicalQuestion: true },
      }));
      assert.equal(result.knowledgeTopic, knowledgeTopic);
    });
  }
});

test('SemanticUnderstandingProvider preserves structured corrections and compound intents', async (t) => {
  await t.test('service correction', async () => {
    const text = 'لا مو الليزر، أقصد الفيلر';
    const result = await understand(text, output({
      intent: 'appointment_change_service', act: 'correction', text,
      service: 'الفيلر', correction: { entityType: 'service', fromText: 'الليزر', toText: 'الفيلر' },
    }));
    assert.equal(result.signals.correction, true);
    assert.equal(result.entities.corrections[0].toText, 'الفيلر');
  });

  await t.test('branch correction', async () => {
    const text = 'قصدي فرع جدة مو الرياض';
    const result = await understand(text, output({
      intent: 'appointment_change_branch', act: 'correction', text,
      branch: 'جدة', correction: { entityType: 'branch', fromText: 'الرياض', toText: 'جدة' },
    }));
    assert.equal(result.entities.appointmentManagementTarget, 'branch');
  });

  await t.test('compound medical and booking request', async () => {
    const text = 'أبغى أعرف عن الفيلر وإذا مناسب أحجز الخميس';
    const result = await understand(text, output({
      intent: 'medical_question', secondary: ['booking'], act: 'request', text,
      service: 'الفيلر', date: 'الخميس', signals: { medicalQuestion: true, conditional: true },
    }));
    assert.deepEqual(result.secondaryIntents, ['booking']);
    assert.equal(result.signals.conditional, true);
  });
});

test('SemanticUnderstandingProvider rejects invalid JSON and unanchored entities', async (t) => {
  await t.test('invalid JSON', async () => {
    const provider = new SemanticUnderstandingProvider({ modelClient: { inferUnderstanding: async () => '{bad' } });
    await assert.rejects(provider.understand({ text: 'رسالة' }), { code: 'VALIDATION_ERROR' });
  });
  await t.test('unanchored entity', async () => {
    const provider = new SemanticUnderstandingProvider({
      modelClient: { inferUnderstanding: async () => output({ intent: 'medical_question', act: 'question', service: 'البوتكس', signals: { medicalQuestion: true } }) },
    });
    await assert.rejects(provider.understand({ text: 'كيف أتحضر لجلسة الليزر' }), { code: 'VALIDATION_ERROR' });
  });
});

test('SemanticUnderstandingProvider exposes only message text to the model', async () => {
  const calls = [];
  const provider = new SemanticUnderstandingProvider({
    modelClient: {
      async inferUnderstanding(input) {
        calls.push(input);
        return output({ intent: 'unknown', act: 'statement', text: 'hello' });
      },
    },
  });

  await provider.understand({
    text: 'hello',
    clinic: {
      services: [{
        id: 'model-must-not-see-this',
        name: 'Service A',
        aliases: ['Alias A'],
      }],
    },
  });

  assert.deepEqual(calls, [{ text: 'hello' }]);
  assert.equal(JSON.stringify(calls).includes('model-must-not-see-this'), false);
  assert.equal(JSON.stringify(calls).includes('Service A'), false);
});
