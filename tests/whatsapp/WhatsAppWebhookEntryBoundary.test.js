const test = require('node:test');
const assert = require('node:assert/strict');

const WhatsAppController = require('../../src/channels/whatsapp/WhatsAppController');
const WhatsAppWebhookParser = require('../../src/channels/whatsapp/WhatsAppWebhookParser');

function messageChange(id = 'wamid.inbound') {
  return {
    field: 'messages',
    value: {
      metadata: {
        display_phone_number: '15550000000',
        phone_number_id: 'phone-number-id',
      },
      contacts: [{ wa_id: '966500000000', profile: { name: 'Patient' } }],
      messages: [{
        from: '966500000000',
        id,
        timestamp: '1700000000',
        type: 'text',
        text: { body: 'Hello' },
      }],
    },
  };
}

function statusChange() {
  return {
    field: 'messages',
    value: {
      statuses: [{ id: 'wamid.outbound', status: 'read' }],
    },
  };
}

function reply() {
  return {
    statusCode: null,
    body: undefined,
    code(value) { this.statusCode = value; return this; },
    send(value) { this.body = value; this.sent = true; return this; },
  };
}

function payload(changes) {
  return { object: 'whatsapp_business_account', entry: [{ changes }] };
}

test('parser finds inbound text when an earlier change is a status callback', () => {
  const parsed = WhatsAppWebhookParser.parse(payload([statusChange(), messageChange()]));

  assert.equal(parsed.waMessageId, 'wamid.inbound');
  assert.equal(parsed.messageType, 'text');
  assert.equal(parsed.text, 'Hello');
});

test('parser ignores a status-only callback', () => {
  assert.equal(WhatsAppWebhookParser.parse(payload([statusChange()])), null);
});

test('parser preserves the Meta interactive UUID as the trusted raw payload', () => {
  const optionId = '00000000-0000-4000-8000-000000000114';
  const parsed = WhatsAppWebhookParser.parse(payload([{
    field: 'messages',
    value: {
      metadata: { display_phone_number: '15550000000', phone_number_id: 'phone-number-id' },
      messages: [{
        from: '966500000000', id: 'wamid.insurance-class', timestamp: '1700000000',
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: optionId, title: 'VIP' } },
      }],
    },
  }]));

  assert.equal(parsed.text, 'VIP');
  assert.equal(parsed.rawPayload, optionId);
  assert.deepEqual(parsed.inputProvenance, {
    trusted: true, source: 'meta_whatsapp', kind: 'meta_interactive_button',
  });
});

test('controller acknowledges and dispatches a parsed inbound message', async () => {
  const dispatched = [];
  const controller = new WhatsAppController({
    processMessage: async (message) => dispatched.push(message),
  });
  const reply = {
    statusCode: null,
    code(value) { this.statusCode = value; return this; },
    send() { this.sent = true; return this; },
  };

  await controller.receiveWebhook({ body: payload([statusChange(), messageChange()]) }, reply);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(reply.statusCode, 200);
  assert.equal(reply.sent, true);
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].waMessageId, 'wamid.inbound');
});

test('controller acknowledges but does not dispatch a status-only callback', async () => {
  let dispatchCount = 0;
  const controller = new WhatsAppController({
    processMessage: async () => { dispatchCount += 1; },
  });
  const reply = {
    code() { return this; },
    send() { return this; },
  };

  await controller.receiveWebhook({ body: payload([statusChange()]) }, reply);

  assert.equal(dispatchCount, 0);
});

test('webhook verification accepts only the configured token without logging it', async () => {
  const entries = [];
  const controller = new WhatsAppController({ processMessage: async () => {} }, {
    verifyToken: 'test-verify-token',
    logger: { info: entry => entries.push(entry), warn: entry => entries.push(entry) },
  });
  const accepted = reply();
  await controller.verifyWebhook({ query: {
    'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': 'challenge',
  } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body, 'challenge');
  assert.equal(entries[0].outcome, 'VERIFIED');
  assert.equal(JSON.stringify(entries), JSON.stringify(entries).replace(/test-verify-token/g, ''));
});

test('webhook verification rejects an invalid token', async () => {
  const controller = new WhatsAppController({ processMessage: async () => {} }, { verifyToken: 'expected' });
  const rejected = reply();
  await controller.verifyWebhook({ query: {
    'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'challenge',
  } }, rejected);
  assert.equal(rejected.statusCode, 403);
  assert.equal(rejected.body, 'Forbidden');
});

test('status callback invokes status handler but never Shaden', async () => {
  let shadenCount = 0;
  let receivedBody = null;
  const controller = new WhatsAppController({ processMessage: async () => { shadenCount += 1; } }, {
    statusHandler: async body => { receivedBody = body; },
  });
  await controller.receiveWebhook({ body: payload([statusChange()]) }, reply());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(shadenCount, 0);
  assert.ok(receivedBody);
});
