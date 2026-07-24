'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const MasterDataService = require('../../src/modules/master-data/MasterDataService');
const { ForbiddenError, ValidationError } = require('../../src/core/errors');
const masterDataModule = require('../../src/modules/master-data');
const MasterDataRepository = require('../../src/modules/master-data/MasterDataRepository');
const configs = require('../../src/modules/master-data/resourceConfig');
const mapPostgresError = require('../../src/core/errors/postgresErrorMapper');

function repository(overrides = {}) {
  return {
    parentBelongsToClinic: async () => true,
    create: async (_config, _clinicId, data) => ({ id: 'created', ...data }),
    update: async (_config, _clinicId, id, data) => ({ id, ...data }),
    ...overrides,
  };
}

describe('MasterDataService', () => {
  test('registers generic and atomic doctor schedule route shapes', () => {
    const routes = [];
    const app = {};
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      app[method] = (path, options, handler) => {
        routes.push({ method, path, options, handler });
      };
    }

    masterDataModule.register({
      app,
      db: { query: async () => ({ rows: [] }) },
    });

    assert.deepEqual(
      routes.map(({ method, path }) => `${method.toUpperCase()} ${path}`),
      [
        'GET /api/clinics/:clinicId/doctors/:doctorId/working-hours',
        'PUT /api/clinics/:clinicId/doctors/:doctorId/working-hours',
        'GET /api/clinics/:clinicId/master-data/:resource',
        'GET /api/clinics/:clinicId/master-data/:resource/:id',
        'POST /api/clinics/:clinicId/master-data/:resource',
        'PATCH /api/clinics/:clinicId/master-data/:resource/:id',
        'DELETE /api/clinics/:clinicId/master-data/:resource/:id',
      ]
    );
    for (const route of routes) {
      assert.ok(Array.isArray(route.options.preHandler));
      assert.equal(typeof route.handler, 'function');
    }
  });

  test('backend application initializes with Master Data routes registered', async () => {
    const compositionPath = require.resolve(
      '../../src/modules/revenue/recovery/createRecoveryComposition'
    );
    const originalComposition = require.cache[compositionPath];
    require.cache[compositionPath] = {
      id: compositionPath,
      filename: compositionPath,
      loaded: true,
      exports: () => ({
        recoveryWorkerService: { runNext: async () => null },
      }),
      children: [],
      paths: [],
    };

    let app;
    try {
      delete require.cache[require.resolve('../../src/app')];
      const buildApp = require('../../src/app');
      app = await buildApp();
      await app.ready();
      const routes = app.printRoutes();
      assert.match(routes, /master-data/);
    } finally {
      await app?.close();
      if (originalComposition) {
        require.cache[compositionPath] = originalComposition;
      } else {
        delete require.cache[compositionPath];
      }
    }
  });

  test('builds a parameterized clinic-scoped list query for every resource', async () => {
    const calls = [];
    const repo = new MasterDataRepository({
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: [] };
      },
    });

    for (const config of Object.values(configs)) {
      await repo.list(config, 'clinic-1', {});
    }

    assert.equal(calls.length, 17);
    for (const call of calls) {
      assert.match(call.sql, /WHERE .+ = \$1/);
      assert.deepEqual(call.values, ['clinic-1']);
      assert.equal(call.sql.includes('clinic-1'), false);
    }
  });

  test('rejects a cross-clinic parent before writing', async () => {
    let creates = 0;
    const service = new MasterDataService(repository({
      parentBelongsToClinic: async () => false,
      create: async () => {
        creates += 1;
      },
    }));

    await assert.rejects(
      service.create('rooms', 'clinic-1', {
        branch_id: 'other-clinic-branch',
        room_number: '101',
      }),
      ForbiddenError
    );
    assert.equal(creates, 0);
  });

  test('rejects invalid time ordering before writing', async () => {
    const service = new MasterDataService(repository());

    await assert.rejects(
      service.create('doctor-time-off', 'clinic-1', {
        doctor_id: 'doctor-1',
        start_datetime: '2026-07-24T12:00:00Z',
        end_datetime: '2026-07-24T11:00:00Z',
      }),
      ValidationError
    );
  });

  test('trims values and writes only allowlisted schema fields', async () => {
    let written;
    const service = new MasterDataService(repository({
      create: async (_config, _clinicId, data) => {
        written = data;
        return { id: 'branch-1', ...data };
      },
    }));

    await service.create('branches', 'clinic-1', {
      name: '  Main Branch  ',
      timezone: ' Asia/Riyadh ',
      clinic_id: 'other-clinic',
      unexpected: 'ignored',
    });

    assert.deepEqual(written, {
      name: 'Main Branch',
      timezone: 'Asia/Riyadh',
    });
  });

  test('maps exact live constraint names to specific safe messages', () => {
    assert.equal(
      mapPostgresError({
        code: '23505',
        constraint: 'branches_clinic_id_name_key',
      }).message,
      'This branch name already exists.'
    );
    assert.equal(
      mapPostgresError({
        code: '23514',
        constraint: 'services_duration_minutes_check',
      }).message,
      'Service duration must be greater than zero.'
    );
  });
});
