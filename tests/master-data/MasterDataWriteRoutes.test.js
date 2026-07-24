'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const { after, before, describe, test } = require('node:test');

const clinicId = '00000000-0000-0000-0000-000000000001';
const otherClinicId = '00000000-0000-0000-0000-000000000002';
const resourcePath = `/api/clinics/${clinicId}/master-data/specialties`;
const records = new Map();
const services = new Map();
const referencedSpecialtyId = '00000000-0000-0000-0000-000000000299';

let app;
let token;
let originalDbModule;
let originalRecoveryModule;

function completes(promise, timeoutMs = 1000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Request remained open after ${timeoutMs}ms.`)),
        timeoutMs
      );
    }),
  ]);
}

before(async () => {
  const dbPath = require.resolve('../../src/db/pool');
  const recoveryPath = require.resolve(
    '../../src/modules/revenue/recovery/createRecoveryComposition'
  );
  originalDbModule = require.cache[dbPath];
  originalRecoveryModule = require.cache[recoveryPath];

  const db = {
    pool: {},
    query: async (sql, values = []) => {
      if (values.includes('Database failure')) {
        throw new Error('Simulated database failure.');
      }
      if (sql.includes('INSERT INTO geniusbot.specialties')) {
        const record = {
          id: '00000000-0000-0000-0000-000000000201',
          clinic_id: values[0],
          name: values[1],
          description: values[2],
          is_active: values[3],
        };
        records.set(record.id, record);
        return { rows: [record], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO geniusbot.services')) {
        const record = {
          id: '00000000-0000-0000-0000-000000000301',
          clinic_id: values[0],
          name: values[1],
        };
        services.set(record.id, record);
        return { rows: [record], rowCount: 1 };
      }
      if (sql.includes('UPDATE geniusbot.specialties')) {
        const id = values.at(-1);
        const record = { ...records.get(id), description: values[0] };
        records.set(id, record);
        return { rows: [record], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM geniusbot.specialties')) {
        if (values[0] === referencedSpecialtyId) {
          const error = new Error('Referenced specialty.');
          error.code = '23503';
          error.constraint = 'services_specialty_id_fkey';
          throw error;
        }
        records.delete(values[0]);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('DELETE FROM geniusbot.services')) {
        services.delete(values[0]);
        return { rows: [], rowCount: 1 };
      }
      if (
        sql.includes('FROM geniusbot.specialties') &&
        sql.includes('r.id = $2')
      ) {
        const record = records.get(values[1]);
        return {
          rows: record && record.clinic_id === values[0] ? [record] : [],
          rowCount: record && record.clinic_id === values[0] ? 1 : 0,
        };
      }
      if (sql.includes('FROM geniusbot.specialties')) {
        const rows = [...records.values()].filter(
          (record) => record.clinic_id === values[0]
        );
        return { rows, rowCount: rows.length };
      }
      if (
        sql.includes('FROM geniusbot.services') &&
        sql.includes('r.id = $2')
      ) {
        const record = services.get(values[1]);
        return {
          rows: record && record.clinic_id === values[0] ? [record] : [],
          rowCount: record && record.clinic_id === values[0] ? 1 : 0,
        };
      }
      if (sql.includes('FROM geniusbot.services')) {
        const rows = [...services.values()].filter(
          (record) => record.clinic_id === values[0]
        );
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: 0 };
    },
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
  app = await require('../../src/app')();
  await app.ready();

  const { tokenService } = require('../../src/core/auth');
  token = tokenService.createAccessToken({
    id: 'master-data-write-owner',
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

describe('Master Data write routes', () => {
  test('service and specialty DELETE requests complete successfully', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const service = await completes(app.inject({
      method: 'POST',
      url: `/api/clinics/${clinicId}/master-data/services`,
      headers,
      payload: {
        name: 'Temporary service',
        duration_minutes: 30,
        is_active: true,
      },
    }));
    assert.equal(service.statusCode, 201);
    const serviceDelete = await completes(app.inject({
      method: 'DELETE',
      url: `/api/clinics/${clinicId}/master-data/services/${service.json().data.id}`,
      headers,
    }));
    assert.equal(serviceDelete.statusCode, 200);

    const specialty = await completes(app.inject({
      method: 'POST',
      url: resourcePath,
      headers,
      payload: { name: 'Temporary specialty', is_active: true },
    }));
    assert.equal(specialty.statusCode, 201);
    const specialtyDelete = await completes(app.inject({
      method: 'DELETE',
      url: `${resourcePath}/${specialty.json().data.id}`,
      headers,
    }));
    assert.equal(specialtyDelete.statusCode, 200);
  });

  test('deleting a referenced specialty returns 409 promptly', async () => {
    records.set(referencedSpecialtyId, {
      id: referencedSpecialtyId,
      clinic_id: clinicId,
      name: 'Referenced specialty',
      is_active: true,
    });
    const response = await completes(app.inject({
      method: 'DELETE',
      url: `${resourcePath}/${referencedSpecialtyId}`,
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(response.statusCode, 409);
    assert.equal(records.has(referencedSpecialtyId), true);
  });

  test('unauthorized and cross-clinic DELETE requests are blocked promptly', async () => {
    const unauthorized = await completes(app.inject({
      method: 'DELETE',
      url: `${resourcePath}/${referencedSpecialtyId}`,
    }));
    assert.equal(unauthorized.statusCode, 401);

    const crossClinic = await completes(app.inject({
      method: 'DELETE',
      url: `/api/clinics/${otherClinicId}/master-data/specialties/${referencedSpecialtyId}`,
      headers: { authorization: `Bearer ${token}` },
    }));
    assert.equal(crossClinic.statusCode, 403);
  });

  test('POST, PATCH, DELETE, and GET all complete', async () => {
    const headers = { authorization: `Bearer ${token}` };
    const created = await completes(app.inject({
      method: 'POST',
      url: resourcePath,
      headers,
      payload: {
        name: 'Write route test',
        description: 'Created',
        is_active: true,
      },
    }));
    assert.equal(created.statusCode, 201);
    const id = created.json().data.id;

    const updated = await completes(app.inject({
      method: 'PATCH',
      url: `${resourcePath}/${id}`,
      headers,
      payload: { description: 'Updated' },
    }));
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().data.description, 'Updated');

    const listed = await completes(app.inject({
      method: 'GET',
      url: resourcePath,
      headers,
    }));
    assert.equal(listed.statusCode, 200);
    assert.equal(
      listed.json().data.some((record) => record.id === id),
      true
    );

    const removed = await completes(app.inject({
      method: 'DELETE',
      url: `${resourcePath}/${id}`,
      headers,
    }));
    assert.equal(removed.statusCode, 200);
  });

  test('invalid input returns promptly', async () => {
    const response = await completes(app.inject({
      method: 'POST',
      url: resourcePath,
      headers: { authorization: `Bearer ${token}` },
      payload: { description: 'Missing required name' },
    }));
    assert.equal(response.statusCode, 400);
  });

  test('unauthorized requests return promptly', async () => {
    const response = await completes(app.inject({
      method: 'POST',
      url: resourcePath,
      payload: { name: 'Unauthorized' },
    }));
    assert.equal(response.statusCode, 401);
  });

  test('cross-clinic writes are blocked promptly', async () => {
    const response = await completes(app.inject({
      method: 'POST',
      url: `/api/clinics/${otherClinicId}/master-data/specialties`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Other clinic' },
    }));
    assert.equal(response.statusCode, 403);
  });

  test('database failures reach the error handler promptly', async () => {
    const response = await completes(app.inject({
      method: 'POST',
      url: resourcePath,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Database failure test',
        description: 'Database failure',
        is_active: true,
      },
    }));
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().error.name, 'InternalServerError');
  });
});
