'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');

const clinicId = '00000000-0000-0000-0000-000000000001';
const approvedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

let app;
let token;
let originalDbModule;
let originalRecoveryModule;

before(async () => {
  const dbPath = require.resolve('../../src/db/pool');
  const recoveryPath = require.resolve(
    '../../src/modules/revenue/recovery/createRecoveryComposition'
  );

  originalDbModule = require.cache[dbPath];
  originalRecoveryModule = require.cache[recoveryPath];

  const db = {
    query: async (sql) => ({
      rows: sql.includes('FROM geniusbot.branches')
        ? [{
            id: '00000000-0000-0000-0000-000000000101',
            clinic_id: clinicId,
            name: 'Test Branch',
            timezone: 'Asia/Riyadh',
            is_active: true,
          }]
        : [],
    }),
    pool: {},
  };

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: db,
    children: [],
    paths: [],
  };
  require.cache[recoveryPath] = {
    id: recoveryPath,
    filename: recoveryPath,
    loaded: true,
    exports: () => ({
      recoveryWorkerService: { runNext: async () => null },
    }),
    children: [],
    paths: [],
  };

  delete require.cache[require.resolve('../../src/app')];
  const buildApp = require('../../src/app');
  app = await buildApp();
  await app.ready();

  const { tokenService } = require('../../src/core/auth');
  token = tokenService.createAccessToken({
    id: 'cors-test-owner',
    clinic_id: clinicId,
    branch_id: null,
    role: 'owner',
  });
});

after(async () => {
  await app?.close();

  const dbPath = require.resolve('../../src/db/pool');
  const recoveryPath = require.resolve(
    '../../src/modules/revenue/recovery/createRecoveryComposition'
  );
  if (originalDbModule) require.cache[dbPath] = originalDbModule;
  else delete require.cache[dbPath];
  if (originalRecoveryModule) require.cache[recoveryPath] = originalRecoveryModule;
  else delete require.cache[recoveryPath];
  delete require.cache[require.resolve('../../src/app')];
});

describe('CORS allowlist', () => {
  for (const origin of approvedOrigins) {
    test(`reflects the approved origin ${origin}`, async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(
        response.headers['access-control-allow-origin'],
        origin
      );
    });

    test(`accepts preflight from ${origin}`, async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: `/api/clinics/${clinicId}/master-data/branches`,
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      });

      assert.equal(response.statusCode, 204);
      assert.equal(
        response.headers['access-control-allow-origin'],
        origin
      );
      assert.match(
        response.headers['access-control-allow-methods'],
        /GET/
      );
    });
  }

  test('does not authorize an origin outside the allowlist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://unauthorized.example' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers['access-control-allow-origin'],
      undefined
    );
  });

  test('keeps the authenticated Master Data branches request operational', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/clinics/${clinicId}/master-data/branches`,
      headers: {
        origin: 'http://127.0.0.1:5173',
        authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers['access-control-allow-origin'],
      'http://127.0.0.1:5173'
    );
    assert.deepEqual(response.json(), {
      success: true,
      data: [{
        id: '00000000-0000-0000-0000-000000000101',
        clinic_id: clinicId,
        name: 'Test Branch',
        timezone: 'Asia/Riyadh',
        is_active: true,
      }],
    });
  });
});
