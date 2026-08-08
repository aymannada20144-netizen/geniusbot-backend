'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');

function data() {
  return {
    clinic: { id: 'clinic-1', name: 'العيادة' },
    branches: [{ id: 'branch-1', name: 'فرع جدة', city: 'جدة', timezone: 'Asia/Riyadh' }],
    services: [{ id: 'laser-1', name: 'ليزر' }],
    specialties: [], paymentMethods: [], insuranceCompanies: [], insuranceClasses: [], workingHours: [],
  };
}

function state() {
  return {
    version: 1, mode: 'idle', step: null, customer: { name: 'مها' },
    context: null, options: [],
  };
}

function handle(text) {
  return new ShadenEngine({ clock: { now: () => new Date('2026-07-31T09:00:00.000Z') } }).handle({
    message: { text }, currentState: state(), clinicData: data(),
  });
}

describe('Shaden natural booking entry', () => {
  test('recognizes a natural request with an initial date and retains it', () => {
    const result = handle('فيه حجز بعد بكره');
    assert.equal(result.nextState.booking.step, 'service');
    assert.equal(result.nextState.booking.preferredStart, 'date:2026-08-02');
    assert.equal(result.interaction.purpose, 'select_service');
    for (const text of ['أبغى حجز', 'ممكن حجز', 'عندكم موعد بكرة', 'أبغى موعد بعد بكرة']) {
      assert.equal(handle(text).nextState.booking.step, 'service');
    }
  });

  test('does not treat another-booking wording as a service', () => {
    const result = handle('ممكن حجز تاني');
    assert.equal(result.nextState.booking.step, 'service');
    assert.equal(result.nextState.booking.serviceId, null);
    assert.equal(result.interaction.purpose, 'select_service');
  });

  test('keeps booking with a named service', () => {
    const result = handle('أبغى حجز ليزر');
    assert.equal(result.nextState.booking.serviceId, 'laser-1');
    assert.equal(result.nextState.booking.step, 'branch');
  });

  test('routes gratitude to courtesy and unknown text to fallback', () => {
    const policy = new ShadenPolicy();
    assert.deepEqual(policy.recognize('شكراً لك'), { type: 'courtesy', kind: 'thanks' });
    assert.equal(handle('طلب غير مفهوم تماماً').reply, policy.unknown());
  });
});
