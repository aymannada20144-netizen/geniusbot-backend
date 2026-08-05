'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const NotificationScheduler = require('../../src/services/NotificationScheduler');

test('scheduler starts once and stop clears its timer', () => {
  const originalSetInterval = global.setInterval;
  const originalClearInterval = global.clearInterval;
  let scheduled = 0;
  let cleared = 0;
  global.setInterval = () => {
    scheduled += 1;
    return { unref() {} };
  };
  global.clearInterval = () => { cleared += 1; };
  try {
    const scheduler = new NotificationScheduler(
      { processDue: async () => [] },
      { logger: { info() {}, error() {} } }
    );
    assert.equal(scheduler.start(), true);
    assert.equal(scheduler.start(), false);
    assert.equal(scheduled, 1);
    assert.equal(scheduler.stop(), true);
    assert.equal(cleared, 1);
  } finally {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  }
});

test('scheduler prevents overlapping cycles', async () => {
  let release;
  let calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  const scheduler = new NotificationScheduler({
    processDue: async () => {
      calls += 1;
      await pending;
      return [];
    },
  }, { logger: { info() {}, error() {} } });

  const first = scheduler.runOnce();
  const second = await scheduler.runOnce();
  assert.deepEqual(second, { skipped: true, reason: 'already_running' });
  assert.equal(calls, 1);
  release();
  await first;
});
