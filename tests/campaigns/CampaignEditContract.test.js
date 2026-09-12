'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fastify = require('fastify');
process.env.JWT_ACCESS_SECRET = 'campaign-edit-isolated-test-secret-0000000000';
const campaignsModule = require('../../src/modules/campaigns');
const { tokenService } = require('../../src/core/auth');
const errorHandler = require('../../src/core/middlewares/errorHandler');

const clinicId = '00000000-0000-0000-0000-000000000001';
const campaignId = '00000000-0000-0000-0000-000000000002';
const otherClinic = '00000000-0000-0000-0000-000000000003';
const branchId = '00000000-0000-0000-0000-000000000004';
const future = () => new Date(Date.now() + 86400000).toISOString();
const input = () => ({ name: 'Updated', templateName: 'eid_al_fitr', audienceType: 'all', scheduledAt: future() });

// No production pool, app startup, schedulers, transport or network is used.
// SQL assertions cover repository boundaries; this is not a PostgreSQL integration test.
async function fixture(t, status = 'scheduled') {
  let row = { id: campaignId, clinic_id: clinicId, status, scheduled_at: status === 'scheduled' ? future() : null };
  let recipients = ['old'];
  const statements = [];
  let sends = 0;
  let created = false;
  const db = {
    async query(sql, params = []) {
      const q = sql.split(/\s+/).join(' ').trim();
      statements.push({ q, params });
      if (q.includes('FROM geniusbot.branches')) return { rows: [], rowCount: 0 };
      if (q.includes('AS eligible')) return { rows: [{ eligible: 1 }] };
      if (q.startsWith('INSERT INTO geniusbot.campaigns ')) {
        row = { id: campaignId, clinic_id: params[0], name: params[1], template_name: params[2],
          status: params[8], scheduled_at: params[9] };
        created = true;
        return { rows: [{ ...row }] };
      }
      if (q.includes('FROM geniusbot.campaigns c')) {
        assert.ok(q.includes('c.*'));
        assert.ok(q.includes('WHERE c.clinic_id = $1'));
        assert.ok(q.includes('ORDER BY c.created_at DESC, c.id DESC'));
        return { rows: created ? [{ ...row, total_recipients: 1, sent_count: 0 }] : [] };
      }
      if (q.startsWith('SELECT id, status') || q.startsWith('SELECT * FROM geniusbot.campaigns')) {
        assert.ok(q.includes('clinic_id = $1 AND id = $2'));
        return { rows: row.clinic_id === params[0] && row.id === params[1] ? [{ ...row }] : [] };
      }
      if (q.startsWith('UPDATE geniusbot.campaigns SET name')) {
        assert.ok(q.includes("status IN ('draft','scheduled')"));
        row = { ...row, name: params[2], template_name: params[3], variables: JSON.parse(params[8]), status: params[9], scheduled_at: params[10] };
        return { rows: [{ ...row }] };
      }
      if (q.startsWith('DELETE FROM geniusbot.campaign_recipients')) {
        assert.equal(params[0], campaignId);
        recipients = [];
        return { rows: [] };
      }
      if (q.startsWith('INSERT INTO geniusbot.campaign_recipients')) {
        assert.ok(q.includes('p.clinic_id = $2'));
        assert.ok(q.includes('p.is_active = TRUE'));
        assert.ok(q.includes('p.marketing_opt_in = TRUE'));
        assert.ok(q.includes('IS NOT NULL'));
        assert.equal(params[0], campaignId);
        assert.equal(params[1], clinicId);
        recipients = ['eligible-consented-patient'];
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${q}`);
    },
    async transaction(fn) { return fn(this); },
  };
  const app = fastify();
  app.setErrorHandler(errorHandler);
  const token = tokenService.createAccessToken({ id: branchId, clinic_id: clinicId, role: 'clinic_admin' });
  t.after(async () => { await app.close(); });
  campaignsModule.register({ app, db, communicationService: { send: async () => { sends++; throw new Error('Edit must never send'); } } });
  await app.ready();
  return {
    app, statements,
    row: () => row, recipients: () => recipients, sends: () => sends,
    patch: (body = input(), clinic = clinicId) => app.inject({ method: 'PATCH', url: `/api/clinics/${clinic}/campaigns/${campaignId}`, headers: { authorization: `Bearer ${token}` }, payload: body }),
    create: body => app.inject({ method: 'POST', url: `/api/clinics/${clinicId}/campaigns`, headers: { authorization: `Bearer ${token}` }, payload: body }),
    list: () => app.inject({ method: 'GET', url: `/api/clinics/${clinicId}/campaigns`, headers: { authorization: `Bearer ${token}` } }),
    moveToOtherClinic: () => { row.clinic_id = otherClinic; },
  };
}

for (const status of ['draft', 'scheduled']) {
  test(`POST then GET immediately returns canonical ${status} status and identity without dispatch`, async t => {
    const f = await fixture(t);
    assert.deepEqual((await f.list()).json().data, []);
    const response = await f.create({ ...input(), scheduledAt: status === 'draft' ? null : future() });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.status, status);
    for (let read = 0; read < 2; read++) {
      const fetched = await f.list();
      assert.equal(fetched.statusCode, 200, fetched.body);
      assert.equal(fetched.json().data.length, 1);
      assert.equal(fetched.json().data[0].id, response.json().data.id);
      assert.equal(fetched.json().data[0].status, status);
    }
    assert.equal(f.sends(), 0);
  });
}

test('module registers PATCH at the frontend URL and enforces authentication', async t => {
  const f = await fixture(t);
  const response = await f.app.inject({ method: 'PATCH', url: `/api/clinics/${clinicId}/campaigns/${campaignId}`, payload: input() });
  assert.equal(response.statusCode, 401);
  assert.equal(f.statements.length, 0);
});

for (const status of ['draft', 'scheduled']) {
  test(`PATCH updates same ${status} campaign, rebuilds consented recipients and never sends`, async t => {
    const f = await fixture(t, status);
    const body = { ...input(), scheduledAt: status === 'draft' ? null : future() };
    const response = await f.patch(body);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().success, true);
    assert.equal(response.json().data.id, campaignId);
    assert.equal(f.row().status, status);
    assert.equal(f.row().scheduled_at, body.scheduledAt);
    assert.equal(f.row().name, body.name);
    assert.deepEqual(f.recipients(), ['eligible-consented-patient']);
    assert.equal(f.statements.filter(({ q }) => q.startsWith('UPDATE geniusbot.campaigns')).length, 1);
    assert.equal(f.statements.some(({ q }) => q.startsWith('INSERT INTO geniusbot.campaigns ')), false);
    assert.ok(f.statements.some(({ q }) => q.includes('FOR UPDATE')));
    assert.equal(f.sends(), 0);
  });
}

for (const status of ['running', 'completed', 'cancelled', 'sent']) {
  test(`PATCH rejects ${status} without mutations or delivery`, async t => {
    const f = await fixture(t, status);
    const response = await f.patch();
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(f.statements.some(({ q }) => q.startsWith('UPDATE') || q.startsWith('DELETE') || q.startsWith('INSERT')), false);
    assert.equal(f.sends(), 0);
  });
}

test('PATCH rejects cross-clinic route before repository access', async t => {
  const f = await fixture(t);
  assert.equal((await f.patch(input(), otherClinic)).statusCode, 403);
  assert.equal(f.statements.length, 0);
});

test('PATCH returns application 404 for campaign owned by another clinic', async t => {
  const f = await fixture(t);
  f.moveToOtherClinic();
  const response = await f.patch();
  assert.equal(response.statusCode, 404);
  assert.equal(response.json().error.message, 'Campaign not found.');
  assert.equal(f.statements.some(({ q }) => q.startsWith('UPDATE')), false);
});

test('PATCH rejects cross-clinic branch', async t => {
  const f = await fixture(t);
  const response = await f.patch({ ...input(), audienceType: 'branch', branchId });
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(f.statements.length, 1);
  assert.deepEqual(f.statements[0].params, [clinicId, branchId]);
});

test('PATCH rejects a past schedule without updating or sending', async t => {
  const f = await fixture(t);
  assert.equal((await f.patch({ ...input(), scheduledAt: '2020-01-01T00:00:00Z' })).statusCode, 400);
  assert.equal(f.statements.length, 0);
  assert.equal(f.sends(), 0);
});
