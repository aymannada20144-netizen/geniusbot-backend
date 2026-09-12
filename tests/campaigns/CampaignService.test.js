'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CampaignService = require('../../src/modules/campaigns/CampaignService');

const clinicId = '00000000-0000-0000-0000-000000000001';
const staffId = '00000000-0000-0000-0000-000000000002';
const campaignId = '00000000-0000-0000-0000-000000000003';

function fixture(overrides = {}) {
  const calls = [];
  const repository = {
    branchBelongsToClinic: async () => true,
    previewAudience: async () => ({ eligible: 2, inactive: 0, no_marketing_consent: 1, no_whatsapp: 0 }),
    createCampaignWithRecipients: async (input) => ({ id: campaignId, ...input }),
    updateCampaignWithRecipients: async (input) => ({ id: campaignId, ...input }),
    claimForRun: async () => ({ id: campaignId, clinic_id: clinicId, template_name: 'eid_al_fitr', variables: {}, status: 'running' }),
    getCampaign: async () => ({ id: campaignId, clinic_id: clinicId, status: 'completed' }),
    listPendingRecipients: async () => [{ id: 'r1', recipient_phone: '966500000000', patient_name: 'منة', patient_id: '00000000-0000-0000-0000-000000000004' }],
    markRecipientSent: async (...args) => { calls.push(['sent', ...args]); },
    markRecipientFailed: async (...args) => { calls.push(['failed', ...args]); },
    completeCampaign: async (...args) => { calls.push(['complete', ...args]); },
    claimNextScheduled: async () => null,
    ...overrides.repository,
  };
  const communicationService = {
    send: async (type, payload) => {
      calls.push(['send', type, payload]);
      return { success: true, transportResult: { messageId: 'wamid.test' } };
    },
    ...overrides.communicationService,
  };
  return { service: new CampaignService(repository, communicationService), repository, calls };
}

test('create campaign snapshots only an eligible consented audience', async () => {
  const { service } = fixture();
  const campaign = await service.createCampaign(clinicId, staffId, {
    name: 'عيد الفطر',
    templateName: 'eid_al_fitr',
    audienceType: 'all',
  });
  assert.equal(campaign.templateName, 'eid_al_fitr');
  assert.equal(campaign.templateLanguage, 'ar');
  assert.equal(campaign.status, 'draft');
});

test('special offer requires all three offer variables', async () => {
  const { service } = fixture();
  await assert.rejects(
    service.createCampaign(clinicId, staffId, {
      name: 'عرض',
      templateName: 'special_offer',
      audienceType: 'all',
      variables: { offerTitle: 'عرض ليزر', priceOrDiscount: '20%' },
    }),
    /variables.validUntil is required/
  );
});

test('send campaign records provider id and completes campaign', async () => {
  const { service, calls } = fixture();
  await service.sendCampaign(clinicId, campaignId);
  assert.equal(calls.find((call) => call[0] === 'send')[1], 'eid_al_fitr');
  assert.ok(calls.some((call) => call[0] === 'sent' && call[2] === 'wamid.test'));
  assert.ok(calls.some((call) => call[0] === 'complete'));
});


test('branch audience rejects a branch outside the current clinic before preview or creation', async () => {
  let previewCalled = false;
  const { service } = fixture({
    repository: {
      branchBelongsToClinic: async () => false,
      previewAudience: async () => {
        previewCalled = true;
        return { eligible: 1 };
      },
    },
  });

  await assert.rejects(
    service.previewAudience(clinicId, {
      audienceType: 'branch',
      branchId: '00000000-0000-0000-0000-000000000099',
    }),
    /branchId does not belong to this clinic/
  );
  assert.equal(previewCalled, false);

  await assert.rejects(
    service.createCampaign(clinicId, staffId, {
      name: 'حملة فرع',
      templateName: 'eid_al_fitr',
      audienceType: 'branch',
      branchId: '00000000-0000-0000-0000-000000000099',
    }),
    /branchId does not belong to this clinic/
  );
});


test('edit scheduled campaign revalidates and resnapshots the requested configuration', async () => {
  let received = null;
  const { service } = fixture({
    repository: {
      updateCampaignWithRecipients: async (input) => {
        received = input;
        return { id: campaignId, ...input };
      },
    },
  });
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const campaign = await service.updateCampaign(clinicId, campaignId, {
    name: 'عرض معدل',
    templateName: 'special_offer',
    audienceType: 'all',
    variables: {
      offerTitle: 'ليزر',
      priceOrDiscount: '25%',
      validUntil: '30 سبتمبر 2026',
    },
    scheduledAt: future,
  });
  assert.equal(campaign.status, 'scheduled');
  assert.equal(received.templateName, 'special_offer');
  assert.equal(received.variables.priceOrDiscount, '25%');
});

test('edit campaign fails closed once campaign is no longer draft or scheduled', async () => {
  const { service } = fixture({
    repository: {
      updateCampaignWithRecipients: async () => null,
      getCampaign: async () => ({ id: campaignId, clinic_id: clinicId, status: 'running' }),
    },
  });
  await assert.rejects(
    service.updateCampaign(clinicId, campaignId, {
      name: 'لا يجب تعديله',
      templateName: 'eid_al_fitr',
      audienceType: 'all',
    }),
    /Campaign can only be edited while it is draft or scheduled/
  );
});

test('create scheduled campaign and cancel preserve the explicit workflow without sending', async () => {
  const { service, calls } = fixture({ repository: {
    cancelCampaign: async (clinic, id) => ({ id, clinic_id: clinic, status: 'cancelled' }),
  } });
  const scheduled = await service.createCampaign(clinicId, staffId, {
    name: 'Scheduled', templateName: 'eid_al_fitr', audienceType: 'all',
    scheduledAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(scheduled.status, 'scheduled');
  assert.equal((await service.cancelCampaign(clinicId, campaignId)).status, 'cancelled');
  assert.equal(calls.length, 0);
});

function statusPayload(status, overrides = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { statuses: [{
      id: 'wamid.status-test', status, timestamp: '1700000000', ...overrides,
    }] } }] }],
  };
}

test('status webhook records sent to delivered by provider WAMID', async () => {
  const updates = [];
  const { service, calls } = fixture({ repository: {
    updateDeliveryStatus: async (...args) => {
      updates.push(args);
      return { id: 'recipient-1', campaign_id: campaignId, status: 'delivered' };
    },
  } });
  assert.equal(await service.handleStatusWebhook(statusPayload('delivered')), 1);
  assert.deepEqual(updates[0].slice(0, 2), ['wamid.status-test', 'delivered']);
  assert.equal(calls.some(call => call[0] === 'send'), false);
});

test('status webhook records sent to read by provider WAMID', async () => {
  const { service } = fixture({ repository: {
    updateDeliveryStatus: async (_id, status) => ({ id: 'recipient-1', campaign_id: campaignId, status }),
  } });
  assert.equal(await service.handleStatusWebhook(statusPayload('read')), 1);
});

test('status webhook records failed error code and message', async () => {
  let received = null;
  const { service } = fixture({ repository: {
    updateDeliveryStatus: async (...args) => {
      received = args;
      return { id: 'recipient-1', campaign_id: campaignId, status: 'failed' };
    },
  } });
  await service.handleStatusWebhook(statusPayload('failed', {
    errors: [{ code: 131026, title: 'Message undeliverable' }],
  }));
  assert.deepEqual(received[3], { code: '131026', message: 'Message undeliverable' });
});

test('status webhook records unknown WAMID without sending', async () => {
  const logs = [];
  const { repository, calls } = fixture({ repository: {
    updateDeliveryStatus: async () => null,
  } });
  const service = new CampaignService(repository, { send: async () => { calls.push(['send']); } }, {
    logger: { info: entry => logs.push(entry) },
  });
  assert.equal(await service.handleStatusWebhook(statusPayload('delivered')), 0);
  assert.ok(logs.some(entry => entry.outcome === 'RECIPIENT_NOT_FOUND' && entry.providerMessageId === 'wamid.status-test'));
  assert.equal(calls.some(call => call[0] === 'send'), false);
});
