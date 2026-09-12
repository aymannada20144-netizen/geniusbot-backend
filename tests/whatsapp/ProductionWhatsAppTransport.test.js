'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ProductionWhatsAppTransport = require('../../src/channels/whatsapp/ProductionWhatsAppTransport');
const MessageFactory = require('../../src/communication/factories/MessageFactory');

const base = Object.freeze({
  phone: '966500000000', patientName: 'منة',
  clinicId: '00000000-0000-0000-0000-000000000001',
  patientId: '00000000-0000-0000-0000-000000000002',
  campaignId: '00000000-0000-0000-0000-000000000003',
});

for (const scenario of [
  { type: 'eid_al_fitr', payload: base, ordered: ['منة'] },
  { type: 'special_offer', payload: { ...base, offerTitle: 'عرض ليزر', priceOrDiscount: '25%', validUntil: '30 سبتمبر 2026' }, ordered: ['منة', 'عرض ليزر', '25%', '30 سبتمبر 2026'] },
]) {
  test(`campaign ${scenario.type} uses the production sender Meta contract`, async () => {
    let request = null;
    const transport = new ProductionWhatsAppTransport({
      runtime: { httpClient: { async post(endpoint, payload, config) {
        request = { endpoint, payload, config };
        return { status: 200, data: { messages: [{ id: `wamid.${scenario.type}` }] } };
      } } },
    });
    const result = await transport.send(MessageFactory.build(scenario.type, {
      ...scenario.payload, messageType: scenario.type,
    }));
    assert.equal(result.messageId, `wamid.${scenario.type}`);
    assert.match(request.endpoint, /https:\/\/graph\.facebook\.com\/v25\.0\/[^/]+\/messages$/);
    assert.equal(request.payload.messaging_product, 'whatsapp');
    assert.equal(request.payload.recipient_type, 'individual');
    assert.equal(request.payload.to, scenario.payload.phone);
    assert.equal(request.payload.type, 'template');
    assert.equal(request.payload.template.name, scenario.type);
    assert.equal(request.payload.template.language.code, 'ar');
    assert.deepEqual(request.payload.template.components, [{
      type: 'body', parameters: scenario.ordered.map(text => ({ type: 'text', text })),
    }]);
    assert.match(request.config.headers.Authorization, /^Bearer /);
    assert.equal(request.config.headers['Content-Type'], 'application/json');
  });
}

test('prebuilt standard template components retain their supplied order through the production sender', async () => {
  let input = null;
  const transport = new ProductionWhatsAppTransport({ sender: async value => { input = value; return { messageId: 'wamid.components' }; } });
  await transport.send({
    channel: 'whatsapp', recipient: { phone: ' 966500000000 ' },
    template: { name: 'special_offer', language: 'ar', components: [{ type: 'body', parameters: [{ type: 'text', text: 'first' }, { type: 'text', text: 'second' }] }] },
  });
  assert.equal(input.to, '966500000000');
  assert.deepEqual(input.components[0].parameters.map(item => item.text), ['first', 'second']);
});
