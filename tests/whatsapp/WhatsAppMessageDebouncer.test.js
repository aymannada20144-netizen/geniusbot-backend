'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const WhatsAppMessageDebouncer = require(
  '../../src/channels/whatsapp/WhatsAppMessageDebouncer'
);

test('debouncer combines adjacent text messages for one sender', async () => {
  const timers = [];
  const received = [];
  const debouncer = new WhatsAppMessageDebouncer({
    target: { async processMessage(message) { received.push(message); return message.text; } },
    windowMs: 10,
    setTimer(callback) { timers.push(callback); return timers.length; },
    clearTimer() {},
    logger: { info() {} },
  });
  const first = debouncer.processMessage(message('one', 'm1'));
  const second = debouncer.processMessage(message('two', 'm2'));
  await timers.at(-1)();
  assert.equal(await first, 'one\ntwo');
  assert.equal(await second, 'one\ntwo');
  assert.equal(received.length, 1);
  assert.equal(received[0].aggregationCount, 2);
});

function message(text, waMessageId) {
  return {
    text, waMessageId, senderPhone: '+966500000001',
    metaPhoneNumberId: 'phone-number-id', messageType: 'text',
  };
}
