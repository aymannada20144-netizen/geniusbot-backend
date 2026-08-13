'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ShadenConversationalSignalDetector =
  require('../../src/services/shaden/ShadenConversationalSignalDetector');

test('ShadenConversationalSignalDetector', async (t) => {
  const detector =
    new ShadenConversationalSignalDetector();

  await t.test('returns safe neutral signals for empty input', () => {
    const result = detector.detect('');

    assert.equal(result.sentiment, 'neutral');
    assert.equal(result.correction, false);
    assert.equal(result.interruption, false);
    assert.equal(result.hesitation, false);
    assert.equal(result.objection, false);
    assert.equal(result.complaint, false);
    assert.equal(result.medicalQuestion, false);
    assert.equal(result.medicalRisk, false);
    assert.equal(result.humanHandover, false);
    assert.equal(result.legalEscalation, false);
  });

  await t.test('detects correction language', () => {
    const cases = [
      'لا قصدي فرع الرياض',
      'قصدي الليزر مو الفيلر',
      'لا اقصد موعد بكرة',
      'مو كذا، أبي وقت ثاني',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.correction,
        true,
        text
      );
    }
  });

  await t.test('detects interruption and conversational pause', () => {
    const cases = [
      'لحظة بس',
      'استني شوي',
      'ثواني',
      'طيب قبل كذا بس عندي سؤال',
      'ارجعي خطوة',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.interruption,
        true,
        text
      );
    }
  });

  await t.test('detects hesitation from Saudi conversational language', () => {
    const cases = [
      'أنا مترددة شوي',
      'والله مدري',
      'خليني افكر',
      'بفكر وبرد عليكم',
      'بشاور زوجي',
      'أنا محتارة',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.hesitation,
        true,
        text
      );

      assert.equal(
        result.sentiment,
        'worried',
        text
      );
    }
  });

  await t.test('detects common objections without treating them as complaints', () => {
    const cases = [
      'السعر غالي',
      'الفرع بعيد علي',
      'خايفة من الإبرة',
      'ما عندي وقت',
      'مو مقتنعة بالسعر',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.objection,
        true,
        text
      );
    }

    const priceOnly = detector.detect(
      'السعر غالي'
    );

    assert.equal(
      priceOnly.complaint,
      false
    );
  });

  await t.test('detects service complaints', () => {
    const cases = [
      'الخدمة سيئة',
      'الموظفة كانت فظة',
      'انتظرت ساعة',
      'النتيجة ما عجبتني',
      'ما شفت فرق',
      'المكان مو نظيف',
      'ما أحد رد علي',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.complaint,
        true,
        text
      );

      assert.equal(
        result.sentiment,
        'frustrated',
        text
      );
    }
  });

  await t.test('distinguishes strong anger from ordinary complaint', () => {
    const cases = [
      'أنتم نصابين',
      'ما عندكم ذمة',
      'هذا أسوأ مكان رحت له',
      'أنا معصبة جدًا',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.sentiment,
        'angry',
        text
      );
    }
  });

  await t.test('detects legal or official escalation language', () => {
    const cases = [
      'بشتكي عليكم',
      'بروح للإعلام',
      'برفع شكوى رسمية',
      'بكلم محامي',
      'بقدم شكوى لوزارة الصحة',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.legalEscalation,
        true,
        text
      );
    }
  });

  await t.test('detects explicit request for a human receptionist', () => {
    const cases = [
      'أبي إنسان',
      'أبغى موظفة',
      'حوليني موظفة',
      'أبي أكلم وحدة',
      'أبغى أكلم موظف',
      'أبي خدمة العملاء',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.humanHandover,
        true,
        text
      );
    }
  });

  await t.test('detects frustration directed at the bot', () => {
    const cases = [
      'انتي غبية',
      'ما تفهمين',
      'ردودك سيئة',
      'انتي بطيئة',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.botFrustration,
        true,
        text
      );
    }
  });

  await t.test('detects medical questions without marking normal questions as red flags', () => {
    const result = detector.detect(
      'هل الليزر يسبب احمرار؟'
    );

    assert.equal(
      result.medicalQuestion,
      true
    );

    assert.equal(
      result.medicalRisk,
      false
    );
  });

  await t.test('detects medical red flags separately from ordinary medical questions', () => {
    const cases = [
      'عندي حروق ليزر',
      'صار لي تورم شديد',
      'عندي فقاقيع بعد الجلسة',
      'عندي نزيف',
      'الألم غير محتمل',
      'في صديد',
      'فقدت الإحساس',
      'صار لي اغماء',
      'عندي ضيق تنفس',
      'عندي دوخة شديدة',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.medicalRisk,
        true,
        text
      );
    }
  });

  await t.test('does not treat every medical word as a red flag', () => {
    const result = detector.detect(
      'هل التورم البسيط طبيعي بعد الفيلر؟'
    );

    assert.equal(
      result.medicalRisk,
      false
    );
  });

  await t.test('detects positive sentiment without inventing another intent', () => {
    const cases = [
      'ممتاز',
      'شكرا',
      'يعطيك العافية',
      'تسلمين',
    ];

    for (const text of cases) {
      const result = detector.detect(text);

      assert.equal(
        result.sentiment,
        'positive',
        text
      );

      assert.equal(
        result.complaint,
        false,
        text
      );
    }
  });

  await t.test('keeps state-dependent confirmation and rejection unset', () => {
    const confirmation = detector.detect(
      'تمام'
    );

    const rejection = detector.detect(
      'لا'
    );

    assert.equal(
      confirmation.confirmation,
      false
    );

    assert.equal(
      rejection.rejection,
      false
    );

    assert.equal(
      confirmation.conditional,
      false
    );
  });

  await t.test('supports object input', () => {
    const result = detector.detect({
      text: 'بفكر شوي',
    });

    assert.equal(
      result.hesitation,
      true
    );
  });

  await t.test('returns immutable results', () => {
    const result = detector.detect(
      'مرحبا'
    );

    assert.equal(
      Object.isFrozen(result),
      true
    );
  });
});