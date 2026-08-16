'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SemanticCoreProvider = require('../../src/services/shaden/SemanticCoreProvider');

function output(overrides = {}) {
  return {
    contractVersion: 2,
    primaryGoal: 'information',
    conversationAct: 'request',
    confidence: 0.95,
    interpretation: { status: 'clear' },
    ...overrides,
  };
}

function providerReturning(value, calls = []) {
  return new SemanticCoreProvider({
    modelClient: {
      async inferSemanticCore(input) {
        calls.push(input);
        if (value instanceof Error) throw value;
        return value;
      },
    },
  });
}

test('SemanticCoreProvider sends only inbound text to the model', async () => {
  const calls = [];
  const provider = providerReturning(output(), calls);
  await provider.understand({
    text: 'أريد معلومات',
    clinic: { id: 'must-not-pass', services: ['secret'] },
    patient: { id: 'must-not-pass' },
    state: { appointmentId: 'must-not-pass' },
  });
  assert.deepEqual(calls, [{ text: 'أريد معلومات' }]);
});

test('SemanticCoreProvider accepts and forwards only validated SemanticContext', async () => {
  const calls = [];
  const provider = providerReturning(output(), calls);
  const context = {
    contextVersion: 1,
    active: { goal: 'booking', step: 'awaiting_confirmation' },
    pending: { kind: 'confirmation', targetType: 'appointment' },
  };
  await provider.understand({ text: 'نعم', context });
  assert.deepEqual(calls, [{ text: 'نعم', context }]);
  assert.equal(Object.isFrozen(calls[0].context), true);
});

test('SemanticCoreProvider rejects invalid SemanticContext before inference', async () => {
  const calls = [];
  await assert.rejects(
    providerReturning(output(), calls).understand({
      text: 'نعم',
      context: {
        contextVersion: 1,
        active: { goal: 'booking', step: 'internal_booking_state' },
        pending: null,
      },
    }),
    { code: 'VALIDATION_ERROR' }
  );
  assert.equal(calls.length, 0);
});

test('SemanticCoreProvider accepts anchored morphological normalization', async () => {
  const result = await providerReturning(output({
    mentionedEntities: [{
      type: 'service', surfaceText: 'للتقشير', conceptText: 'تقشير',
    }],
  })).understand({ text: 'كيف أتحضر للتقشير؟' });
  assert.equal(result.mentionedEntities[0].conceptText, 'تقشير');
});

test('SemanticCoreProvider rejects unanchored and structurally expanded entities', async (t) => {
  const cases = [
    ['unanchored surface', 'أبي الليزر', {
      type: 'service', surfaceText: 'الفيلر', conceptText: 'فيلر',
    }],
    ['generic service specialization', 'هل الليزر مؤلم؟', {
      type: 'service', surfaceText: 'الليزر', conceptText: 'إزالة الشعر بالليزر',
    }],
    ['catalog UUID', 'أبي الفيلر', {
      type: 'service', surfaceText: 'الفيلر',
      conceptText: '2a293364-12a6-4815-9991-94718251e7c9',
    }],
    ['database authority marker', 'أبي الفيلر', {
      type: 'service', surfaceText: 'الفيلر', conceptText: 'service_id',
    }],
  ];
  for (const [name, text, entity] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        providerReturning(output({ mentionedEntities: [entity] }))
          .understand({ text }),
        { code: 'VALIDATION_ERROR' }
      );
    });
  }
});

test('SemanticCoreProvider rejects malformed JSON and propagates model failure', async () => {
  await assert.rejects(
    providerReturning('{bad json').understand({ text: 'مرحبا' }),
    { code: 'VALIDATION_ERROR' }
  );
  const modelError = new Error('model unavailable');
  await assert.rejects(
    providerReturning(modelError).understand({ text: 'مرحبا' }),
    modelError
  );
});

test('SemanticCoreProvider represents routing families without runtime behavior', async (t) => {
  const cases = [
    ['medical information', 'هل هذا العلاج يحتاج تحضير؟', 'information', 'request', 'clear', []],
    ['service information', 'أبغى أعرف أكثر عن خدمات البشرة', 'information', 'request', 'clear', []],
    ['booking', 'أرغب بحجز جلسة', 'booking', 'request', 'clear', []],
    ['availability', 'هل توجد مواعيد متاحة هذا الأسبوع؟', 'availability', 'request', 'clear', []],
    ['appointment query', 'ممكن أعرف تفاصيل موعدي؟', 'appointment_query', 'request', 'clear', []],
    ['cancellation', 'أرغب بإلغاء الموعد', 'appointment_cancel', 'request', 'clear', []],
    ['reschedule', 'أحتاج أنقل موعدي ليوم آخر', 'appointment_reschedule', 'request', 'clear', []],
    ['appointment change', 'لا أقصد الفرع الأول، أريد الثاني', 'appointment_change', 'correct', 'clear', []],
    ['human handover', 'أحتاج أتواصل مع موظفة', 'human_handover', 'request', 'clear', []],
    ['complaint', 'انتظرت كثيرًا ولم أحصل على الخدمة', 'unknown', 'complaint', 'clear', []],
    ['objection', 'التكلفة أعلى مما يناسبني', 'unknown', 'objection', 'clear', []],
    ['hesitation', 'أحتاج وقتًا حتى أقرر', 'unknown', 'hesitation', 'clear', []],
    ['courtesy', 'أسلوبك لطيف', 'social_engagement', 'social', 'clear', []],
    ['small talk', 'كيف حالك اليوم؟', 'social_engagement', 'social', 'clear', []],
    ['correction', 'لا أقصد الطبيبة الأولى بل الأخرى', 'appointment_change', 'correct', 'clear', []],
    ['dependent follow-up', 'وماذا بعدها؟', 'unknown', 'request', 'dependent', []],
    ['compound', 'أريد معلومات وإذا ناسبني أحجز', 'information', 'request', 'clear', ['booking']],
  ];
  for (const [name, text, primaryGoal, conversationAct, status, additionalGoals] of cases) {
    await t.test(name, async () => {
      const result = await providerReturning(output({
        primaryGoal, conversationAct, interpretation: { status }, additionalGoals,
      })).understand({ text });
      assert.equal(result.primaryGoal, primaryGoal);
      assert.equal(result.conversationAct, conversationAct);
      assert.equal(result.interpretation.status, status);
      assert.deepEqual(result.additionalGoals, additionalGoals);
      assert.equal('action' in result, false);
      assert.equal('reply' in result, false);
    });
  }
});
