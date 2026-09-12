'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const frontendRequire = createRequire(path.resolve(__dirname, '../../geniusbot-dashboard/package.json'));
const ts = frontendRequire('typescript');
const React = frontendRequire('react');
const { renderToStaticMarkup } = frontendRequire('react-dom/server');
const src = path.resolve(__dirname, '../../geniusbot-dashboard/src');

// Compile the real TS/TSX modules without a second frontend build toolchain.
// SSR exercises actual row JSX; it does not simulate browser layout or MutationObserver.
function load(file, mocks = {}) {
  const filename = path.join(src, file);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  function requireModule(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.endsWith('.css')) return {};
    if (name.startsWith('.')) {
      const base = path.resolve(path.dirname(filename), name);
      const resolved = ['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync);
      if (resolved) return load(path.relative(src, resolved), mocks);
    }
    return frontendRequire(name);
  }
  new Function('require', 'module', 'exports', compiled)(requireModule, module, module.exports);
  return module.exports;
}

function renderRows(rows, language, permitted = true) {
  let stateIndex = 0;
  const { CampaignsPage } = load('pages/dashboard/CampaignsPage.tsx', {
    react: { ...React, useState(initial) {
      const index = stateIndex++;
      return React.useState(index === 0 ? rows : index === 3 ? false : initial);
    } },
    '../../api/campaignErrors': { campaignErrorMessage: () => '' },
    '../../api/campaignsApi': {},
    '../../api/masterDataApi': {},
    '../../auth/hooks/useAuth': { useAuth: () => ({ user: { clinicId: 'clinic', permissions: permitted ? ['notification:send'] : [] } }) },
    '../../i18n/useLanguage': { useLanguage: () => ({ language }) },
  });
  return renderToStaticMarkup(React.createElement(CampaignsPage));
}

function row(id, status) {
  return { id, name: id, status, template_name: 'eid_al_fitr', scheduled_at: null,
    total_recipients: 1, sent_count: 0, delivered_count: 0, read_count: 0, failed_count: 0 };
}
function assertActions(html, expected) {
  assert.equal((html.match(/class="campaign-action-edit"/g) || []).length, expected);
  assert.equal((html.match(/campaign-action-cancel/g) || []).length, expected);
}

test('campaign composer timing only supplies scheduledAt after explicit scheduling', () => {
  const page = load('pages/dashboard/CampaignsPage.tsx', {
    '../../api/campaignErrors': { campaignErrorMessage: () => '' },
    '../../api/campaignsApi': {},
    '../../api/masterDataApi': {},
    '../../auth/hooks/useAuth': { useAuth: () => ({ user: null }) },
    '../../i18n/useLanguage': { useLanguage: () => ({ language: 'en' }) },
  });
  const selectedDate = '2099-01-01T10:30';

  assert.deepEqual(page.newCampaignComposerTiming(), { deliveryMode: 'sendNow', scheduledAt: '' });
  assert.equal(page.scheduledAtForCampaignSubmission('sendNow', selectedDate), null);
  assert.equal(page.scheduledAtForCampaignSubmission('schedule', ''), null);
  assert.equal(page.scheduledAtForCampaignSubmission('schedule', 'not-a-date'), null);
  assert.equal(
    page.scheduledAtForCampaignSubmission('schedule', selectedDate),
    new Date(selectedDate).toISOString(),
  );
});

test('campaign composer preserves a scheduled campaign date but does not inherit it for drafts', () => {
  const page = load('pages/dashboard/CampaignsPage.tsx', {
    '../../api/campaignErrors': { campaignErrorMessage: () => '' },
    '../../api/campaignsApi': {},
    '../../api/masterDataApi': {},
    '../../auth/hooks/useAuth': { useAuth: () => ({ user: null }) },
    '../../i18n/useLanguage': { useLanguage: () => ({ language: 'en' }) },
  });

  const scheduledAt = '2099-01-01T10:30:00.000Z';
  assert.equal(page.deliveryModeForCampaign({ status: 'scheduled', scheduled_at: scheduledAt }), 'schedule');
  assert.equal(
    page.scheduledAtForCampaignSubmission('schedule', page.toLocalDateTimeInput(scheduledAt)),
    scheduledAt,
  );
  assert.equal(page.deliveryModeForCampaign({ status: 'draft', scheduled_at: '2099-01-01T10:30:00.000Z' }), 'sendNow');
  assert.equal(page.deliveryModeForCampaign({ status: 'scheduled', scheduled_at: null }), 'sendNow');
});

test('Send now creates a draft then immediately sends that returned campaign id', async () => {
  const page = load('pages/dashboard/CampaignsPage.tsx', {
    '../../api/campaignErrors': { campaignErrorMessage: () => '' },
    '../../api/campaignsApi': {},
    '../../api/masterDataApi': {},
    '../../auth/hooks/useAuth': { useAuth: () => ({ user: null }) },
    '../../i18n/useLanguage': { useLanguage: () => ({ language: 'en' }) },
  });
  const calls = [];

  await page.createAndDispatchCampaign(
    'sendNow',
    async () => { calls.push('create'); return { id: 'campaign-123' }; },
    async (campaignId) => { calls.push(`send:${campaignId}`); },
  );

  assert.deepEqual(calls, ['create', 'send:campaign-123']);
});

test('Schedule creates the campaign without sending it', async () => {
  const page = load('pages/dashboard/CampaignsPage.tsx', {
    '../../api/campaignErrors': { campaignErrorMessage: () => '' },
    '../../api/campaignsApi': {},
    '../../api/masterDataApi': {},
    '../../auth/hooks/useAuth': { useAuth: () => ({ user: null }) },
    '../../i18n/useLanguage': { useLanguage: () => ({ language: 'en' }) },
  });
  let sent = false;

  const campaign = await page.createAndDispatchCampaign(
    'schedule',
    async () => ({ id: 'campaign-456' }),
    async () => { sent = true; },
  );

  assert.equal(campaign.id, 'campaign-456');
  assert.equal(sent, false);
});

test('a send failure after creation propagates so the draft remains recoverable and its error is shown', async () => {
  const page = load('pages/dashboard/CampaignsPage.tsx', {
    '../../api/campaignErrors': { campaignErrorMessage: () => 'Unable to send this campaign.' },
    '../../api/campaignsApi': {},
    '../../api/masterDataApi': {},
    '../../auth/hooks/useAuth': { useAuth: () => ({ user: null }) },
    '../../i18n/useLanguage': { useLanguage: () => ({ language: 'en' }) },
  });
  const records = [{ id: 'campaign-draft', status: 'draft' }];
  const sendFailure = new Error('Meta unavailable');

  await assert.rejects(
    () => page.createAndDispatchCampaign(
      'sendNow',
      async () => records[0],
      async () => { throw sendFailure; },
    ),
    sendFailure,
  );
  assert.deepEqual(records, [{ id: 'campaign-draft', status: 'draft' }]);
  const componentSource = fs.readFileSync(path.join(src, 'pages/dashboard/CampaignsPage.tsx'), 'utf8');
  const submitSource = componentSource.slice(
    componentSource.indexOf('async function submit'),
    componentSource.indexOf('async function sendNow'),
  );
  assert.match(submitSource, /catch \(cause\) \{\s*setError\(campaignErrorMessage\(cause, language\)\)/);
  assert.ok(submitSource.indexOf('setShowComposer(false)') < submitSource.indexOf('catch (cause)'));
});

test('campaign list API serializes search and filter query parameters and deletes by campaign id', async () => {
  const calls = [];
  const api = load('api/campaignsApi.ts', { './apiClient': { apiClient: {
    async get(url) { calls.push(['GET', url]); return { data: { data: [] } }; },
    async delete(url) { calls.push(['DELETE', url]); return { data: { data: { id: 'campaign-1' } } }; },
  } } });
  await api.getCampaigns('clinic id', {
    search: ' Eid ', status: 'scheduled', templateName: 'eid_al_fitr', dateFrom: '2026-09-01', dateTo: '2026-09-30',
  });
  await api.deleteCampaign('clinic id', 'campaign/1');
  assert.equal(calls[0][0], 'GET');
  assert.match(calls[0][1], /search=Eid/);
  assert.match(calls[0][1], /status=scheduled/);
  assert.match(calls[0][1], /templateName=eid_al_fitr/);
  assert.match(calls[0][1], /dateFrom=2026-09-01/);
  assert.deepEqual(calls[1], ['DELETE', '/api/clinics/clinic%20id/campaigns/campaign%2F1']);
});

test('campaign history renders search, filters, clear action, and a delete action per permitted row', () => {
  const html = renderRows([row('target', 'draft')], 'ar');
  assert.match(html, /ابحث باسم الحملة أو القالب/);
  assert.match(html, /مسح الفلاتر/);
  assert.match(html, /campaign-action-delete/);
  assert.match(html, />Delete</);
});

for (const language of ['ar', 'en']) {
  test(`${language}: first/newest scheduled row renders actions immediately after POST then GET and fresh GET`, async () => {
    let records = [];
    const requests = [];
    const api = load('api/campaignsApi.ts', { './apiClient': { apiClient: {
      async post(url, body) {
        requests.push(['POST', url]);
        const created = { ...row(`campaign-${records.length + 1}`, body.scheduledAt ? 'scheduled' : 'draft') };
        records = [created, ...records];
        return { data: { success: true, data: structuredClone(created) } };
      },
      async get(url) {
        requests.push(['GET', url]);
        return { data: { success: true, data: structuredClone(records) } };
      },
    } } });
    assertActions(renderRows([], language), 0);
    for (let count = 1; count <= 2; count++) {
      const created = await api.createCampaign('clinic', { name: 'Occasion', templateName: 'eid_al_fitr', scheduledAt: '2099-01-01T00:00:00Z' });
      assert.equal(created.status, 'scheduled');
      const fetched = await api.getCampaigns('clinic');
      assert.equal(fetched[0].id, created.id);
      assertActions(renderRows(fetched, language), count);
      assertActions(renderRows([fetched[0]], language), 1);
      assertActions(renderRows(await api.getCampaigns('clinic'), language), count);
    }
    assert.ok(requests.every(([, url]) => url === '/api/clinics/clinic/campaigns'));
  });
  for (const status of ['draft', 'scheduled', 'completed', 'running', 'sending', 'cancelled']) {
    test(`${language}: ${status} uses the same action rule at every position`, () => {
      const expected = ['draft', 'scheduled'].includes(status) ? 1 : 0;
      assertActions(renderRows([row('target', status), row('other', 'completed')], language), expected);
      assertActions(renderRows([row('other', 'completed'), row('target', status)], language), expected);
    });
  }
  test(`${language}: view-only staff cannot edit or cancel`, () => {
    assertActions(renderRows([row('target', 'scheduled')], language, false), 0);
  });
}
