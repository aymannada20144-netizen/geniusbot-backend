'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

function state(context = null) {
  return {
    version: 1, mode: 'idle', step: null, customer: { name: null },
    context, options: [],
  };
}

function turn(engine, currentState, text, value) {
  return engine.handle({
    message: { text, ...(value ? { rawPayload: { value } } : {}) },
    currentState, clinicData: {},
  });
}

describe('final intent UX closure', () => {
  test('ambiguity uses guarded namespaced reply buttons with typed fallback', async () => {
    const engine = new ShadenEngine();
    const ambiguous = await turn(engine, state(), 'ما راح اقدر اجي');
    assert.equal(ambiguous.interaction.mode, 'reply_buttons');
    assert.deepEqual(ambiguous.interaction.options.map(({ id }) => id), [
      'management-clarify:cancel', 'management-clarify:reschedule',
    ]);

    const typed = await turn(engine, ambiguous.nextState, 'ابغى اغير موعدي');
    assert.doesNotMatch(typed.reply, /لم أفهم/u);

    const stale = await turn(engine, state(), '', 'management-clarify:cancel');
    assert.equal(stale.nextState.cancellation, undefined);
    assert.equal(stale.nextState.reschedule, undefined);
  });

  test('change-service no longer exposes the temporary fallback actions', async () => {
    const result = await turn(new ShadenEngine(), state(), 'ابي اغير الفيلر لبوتكس');
    assert.equal(result.interaction, undefined);
    assert.match(result.reply, /تعذر تغيير الخدمة/u);
  });
});
