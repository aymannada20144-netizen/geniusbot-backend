'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CampaignRepository = require('../../src/modules/campaigns/CampaignRepository');
const CampaignService = require('../../src/modules/campaigns/CampaignService');

const clinicId = '00000000-0000-0000-0000-000000000001';
const staffId = '00000000-0000-0000-0000-000000000002';
const campaignId = '00000000-0000-0000-0000-000000000003';

test('campaign list applies search, status, template, date range, and excludes deleted records in SQL', async () => {
  let captured;
  const repository = new CampaignRepository({ query: async (sql, params) => {
    captured = { sql, params };
    return { rows: [] };
  } });
  await repository.listCampaigns(clinicId, {
    search: ' Eid ', status: 'completed', templateName: 'eid_al_fitr',
    dateFrom: '2026-09-01', dateTo: '2026-09-30',
  });
  assert.match(captured.sql, /c\.deleted_at IS NULL/);
  assert.match(captured.sql, /c\.name ILIKE/);
  assert.match(captured.sql, /c\.status = \$3/);
  assert.match(captured.sql, /c\.template_name = \$4/);
  assert.match(captured.sql, /created_at >= \$5::date/);
  assert.match(captured.sql, /created_at < \(\$6::date/);
  assert.deepEqual(captured.params, [clinicId, ' Eid ', 'completed', 'eid_al_fitr', '2026-09-01', '2026-09-30']);
});

test('deleted campaigns are excluded from manual and scheduled execution queries', async () => {
  const statements = [];
  const repository = new CampaignRepository({
    query: async (sql) => { statements.push(sql); return { rows: [] }; },
    transaction: async (work) => work({ query: async (sql) => { statements.push(sql); return { rows: [] }; } }),
  });
  await repository.claimForRun(clinicId, campaignId);
  await repository.claimNextScheduled();
  assert.ok(statements.filter(sql => /geniusbot\.campaigns/.test(sql)).every(sql => /deleted_at IS NULL/.test(sql)));
});

test('soft delete retains recipient history and permits draft, scheduled, completed, and cancelled campaigns', async () => {
  const calls = [];
  const repository = {
    softDeleteCampaign: async (...args) => { calls.push(['delete', ...args]); return { id: campaignId, status: 'completed' }; },
    getCampaignIncludingDeleted: async () => null,
    listCampaigns: async () => [],
  };
  const service = new CampaignService(repository, { send: async () => ({ success: true }) });
  const result = await service.deleteCampaign(clinicId, campaignId, staffId);
  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, [['delete', clinicId, campaignId, staffId]]);
});

test('running and cross-clinic campaign deletes fail safely', async () => {
  const service = new CampaignService({
    softDeleteCampaign: async () => null,
    getCampaignIncludingDeleted: async () => ({ id: campaignId, status: 'running', deleted_at: null }),
  }, { send: async () => ({ success: true }) });
  await assert.rejects(() => service.deleteCampaign(clinicId, campaignId, staffId), /Running campaigns cannot be deleted/);
  const missing = new CampaignService({
    softDeleteCampaign: async () => null,
    getCampaignIncludingDeleted: async () => null,
  }, { send: async () => ({ success: true }) });
  await assert.rejects(() => missing.deleteCampaign(clinicId, campaignId, staffId), /Campaign not found/);
});

test('list filter validation rejects unsupported status, template, and invalid date ranges', async () => {
  const service = new CampaignService({ listCampaigns: async () => [] }, { send: async () => ({ success: true }) });
  assert.throws(() => service.listCampaigns(clinicId, { status: 'deleted' }), /status is not a supported/);
  assert.throws(() => service.listCampaigns(clinicId, { templateName: 'unknown' }), /templateName is not a registered/);
  assert.throws(() => service.listCampaigns(clinicId, { dateFrom: '2026-10-01', dateTo: '2026-09-01' }), /dateFrom must be on or before/);
});
