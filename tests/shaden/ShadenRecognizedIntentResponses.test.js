'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const ShadenPolicy = require('../../src/services/shaden/ShadenPolicy');

const policy = new ShadenPolicy();

function state() {
  return {
    version: 1, mode: 'idle', step: null, customer: { name: null },
    context: null, options: [],
  };
}

describe('recognized unsupported intent responses', () => {
  test('routes recognized intents to specific safe responses without mutation', async () => {
    let mutationCalls = 0;
    const engine = new ShadenEngine({
      appointmentService: new Proxy({}, {
        get() {
          return async () => { mutationCalls += 1; };
        },
      }),
    });

    for (const [message, expected] of [
      ['كم رسوم الالغاء؟', /معلومات سياسة الإلغاء/u],
      ['ابي اغير الفيلر لبوتكس', /تغيير الخدمة/u],
      ['غيري الفرع', /تغيير الفرع/u],
      ['ابي دكتوره ثانيه', /تغيير مقدم الخدمة/u],
    ]) {
      const result = await engine.handle({
        message: { text: message }, currentState: state(), clinicData: {},
      });
      assert.match(result.reply, expected, message);
      assert.notEqual(result.reply, policy.unknown(), message);
      assert.equal(result.nextState.cancellation, undefined, message);
      assert.equal(result.nextState.reschedule, undefined, message);
      assert.equal(result.nextState.booking, undefined, message);
    }
    assert.equal(mutationCalls, 0);
  });
});
