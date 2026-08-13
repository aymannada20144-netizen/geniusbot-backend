'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');

const policy = new ShadenPolicy();

describe('Shaden intent architecture expansion', () => {
  test('applies appointment-management precedence over booking', () => {
    for (const [phrase, type] of [
      ['ابغى حجز', 'booking'], ['ابغى حجز جديد', 'booking'],
      ['ابغى الغي حجز', 'booking_cancellation_request'],
      ['شيلي حجزي', 'booking_cancellation_request'],
      ['ابغى اغير موعدي', 'booking_modification_request'],
      ['قدمي موعدي', 'booking_modification_request'],
      ['اجلي موعدي', 'booking_modification_request'],
    ]) assert.equal(policy.recognize(phrase).type, type, phrase);
  });

  test('separates query and availability from booking', () => {
    for (const [phrase, type] of [
      ['متى موعدي', 'appointment_query_request'],
      ['who is my doctor', 'appointment_query_request'],
      ['عندكم موعد بكره', 'availability_request'],
      ['earliest appointment', 'availability_request'],
    ]) assert.equal(policy.recognize(phrase).type, type, phrase);
  });

  test('recognizes future management categories distinctly', () => {
    for (const [phrase, type] of [
      ['ابي اغير الفيلر لبوتكس', 'change_service_request'],
      ['غيري الفرع', 'change_branch_request'],
      ['ابي دكتوره ثانيه', 'change_provider_request'],
      ['الغي كل مواعيدي', 'bulk_cancel_request'],
    ]) assert.equal(policy.recognize(phrase).type, type, phrase);
  });

  test('keeps information, ambiguity, conditions, and compounds non-destructive', () => {
    assert.equal(policy.recognize('كم رسوم الالغاء').type,
      'cancellation_information_request');
    assert.equal(policy.recognize('ما راح اقدر اجي').type,
      'appointment_management_clarification');
    assert.deepEqual(policy.recognize('تمام بس خليها مساء'), {
      type: 'conditional_confirmation', destructive: false,
    });
    const compound = policy.recognize(
      'الغي موعد الليزر واحجزي لي فيلر الاسبوع الجاي'
    );
    assert.equal(compound.type, 'compound_appointment_request');
    assert.deepEqual(compound.intents, [
      'booking_cancellation_request', 'booking',
    ]);
    assert.equal(compound.destructive, false);
  });
});
