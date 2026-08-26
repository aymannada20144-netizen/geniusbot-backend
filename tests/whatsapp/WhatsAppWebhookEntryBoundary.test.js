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
