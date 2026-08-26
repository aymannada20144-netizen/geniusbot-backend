'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const WhatsAppMessageDebouncer = require(
  '../../src/channels/whatsapp/WhatsAppMessageDebouncer'
);

test('trusted interactive input bypasses debounce without transformation', async () => {
  const received = [];
  const input = {
    text: 'selected', waMessageId: 'interactive-1',
    inputProvenance: {
      trusted: true, source: 'meta_whatsapp', kind: 'meta_interactive_button',
    },
  };
  const debouncer = new WhatsAppMessageDebouncer({
    target: { async processMessage(message) { received.push(message); return 'ok'; } },
    setTimer() { throw new Error('trusted input must not be scheduled'); },
    logger: { info() {} },
  });
  assert.equal(await debouncer.processMessage(input), 'ok');
  assert.equal(received[0], input);
});
