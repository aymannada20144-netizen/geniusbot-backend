'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const WhatsAppStatusRouter = require('../../src/channels/whatsapp/WhatsAppStatusRouter');

function payload(id, status = 'delivered') {
  return { entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: '1700000000' }] } }] }] };
}

test('routes campaign WAMID only to campaign ownership handler', async () => {
  const calls = [];
  const router = new WhatsAppStatusRouter({
    campaignService: { handleOwnedStatus: async item => { calls.push(['campaign', item.id]); return { id: 'campaign-recipient' }; } },
    appointmentChangeDeliveries: { updateProviderStatus: async () => { calls.push(['change']); return null; } },
  });
  assert.equal(await router.handle(payload('wamid.campaign')), 1);
  assert.deepEqual(calls, [['campaign', 'wamid.campaign']]);
});

test('routes appointment-change WAMID without campaign recipient-not-found handling', async () => {
  const calls = [];
  const router = new WhatsAppStatusRouter({
    campaignService: { handleOwnedStatus: async () => { calls.push('campaign'); return null; } },
    appointmentChangeDeliveries: { updateProviderStatus: async (...args) => { calls.push(args); return { wamid: args[0], status: 'delivered' }; } },
  });
  assert.equal(await router.handle(payload('wamid.change')), 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], 'wamid.change');
});

test('unknown WAMID is neutral and duplicate callback handling remains idempotent', async () => {
  const logs = []; let updates = 0;
  const router = new WhatsAppStatusRouter({
    campaignService: { handleOwnedStatus: async () => null },
    appointmentChangeDeliveries: { updateProviderStatus: async () => { updates += 1; return null; } },
    logger: { info: entry => logs.push(entry) },
  });
  assert.equal(await router.handle(payload('wamid.unknown')), 0);
  assert.equal(await router.handle(payload('wamid.unknown')), 0);
  assert.equal(updates, 2);
  assert.equal(logs.filter(entry => entry.event === 'WHATSAPP_STATUS_UNTRACKED').length, 2);
});
