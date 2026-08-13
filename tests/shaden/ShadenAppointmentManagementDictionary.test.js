'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const { normalizeArabic } = require('../../src/services/shaden/ShadenArabicNormalizer');

const policy = new ShadenPolicy();

describe('appointment management intent dictionary', () => {
  test('recognizes representative explicit reschedule groups', () => {
    const phrases = [
      'اريد تغيير موعدي', 'ابغى اغير موعدي', 'اريد تأجيل موعدي',
      'ابغى موعد ابكر', 'عدلي موعدي', 'اريد تغير موعد',
      'reschedule', 'change my appointment', 'move my appointment',
    ];
    for (const phrase of phrases) {
      assert.equal(policy.recognize(phrase).type, 'booking_modification_request', phrase);
    }
  });

  test('recognizes representative explicit cancellation groups', () => {
    const phrases = [
      'اريد إلغاء الموعد', 'ابغى الغي موعدي', 'حذف الحجز',
      'كنسل موعدي', 'ما ابغى الموعد', 'cancel appointment',
    ];
    for (const phrase of phrases) {
      assert.equal(policy.recognize(phrase).type, 'booking_cancellation_request', phrase);
    }
  });

  test('normalizes alef variants, tatweel, diacritics, punctuation, and whitespace', () => {
    assert.equal(normalizeArabic('  أُرِيــد،   تَغْيير موعدي؟ '), 'اريد تغيير موعدي');
    assert.equal(policy.recognize('  أُرِيــد،   تَغْيير موعدي؟ ').type,
      'booking_modification_request');
  });

  test('captures recognized date/time expressions without treating them as authorization', () => {
    assert.deepEqual(policy.recognize('اجلي موعدي لبكرة العصر'), {
      type: 'booking_modification_request',
      dateTimeExpressions: ['بكره', 'العصر'],
    });
    assert.equal(policy.recognize('غيري موعدي لوقت يناسبني').dateTimeExpressions, undefined);
  });

  test('ambiguous attendance statements request an explicit interactive choice', async () => {
    const result = await new ShadenEngine().handle({
      message: { text: 'ما اقدر احضر' },
      currentState: policy.initialState(),
      clinicData: {},
    });
    assert.equal(result.interaction.mode, 'reply_buttons');
    assert.equal(result.interaction.purpose, 'clarify_appointment_management');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      'management-clarify:cancel',
      'management-clarify:reschedule',
    ]);
    assert.equal(result.nextState.cancellation, undefined);
  });

  test('clarification choices remain namespaced and deterministic', async () => {
    const state = policy.initialState();
    state.context = { inquiry: 'appointment_management_clarification' };
    const reschedule = await new ShadenEngine().handle({
      message: { text: '', rawPayload: { value: 'management-clarify:reschedule' } },
      currentState: state,
      clinicData: {},
    });
    assert.match(reschedule.reply, /موعد/);
    assert.equal(reschedule.nextState.cancellation, undefined);
    assert.equal(reschedule.nextState.context, null);
  });

  test('does not broaden ordinary booking or unrelated statements', () => {
    assert.equal(policy.recognize('اريد حجز موعد').type, 'booking');
    assert.equal(policy.recognize('عندي موعد').type, 'booking');
    assert.equal(policy.recognize('ظروفي ممتازة').type, 'unknown');
  });
});
