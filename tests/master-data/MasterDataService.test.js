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
    findBranch: async () => ({
      id: 'branch-1',
      clinic_id: 'clinic-1',
      is_active: true,
    }),
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
        'GET /api/clinics/:clinicId/master-data/service-assignments',
        'GET /api/clinics/:clinicId/master-data/service-assignments/options',
        'POST /api/clinics/:clinicId/master-data/service-assignments',
        'PATCH /api/clinics/:clinicId/master-data/service-assignments/:id',
        'PATCH /api/clinics/:clinicId/master-data/service-assignments/:id/status',
        'DELETE /api/clinics/:clinicId/master-data/service-assignments/:id',
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

    assert.equal(calls.length, 16);
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
        room_name: 'Room 101',
        room_type: 'consultation',
      }),
      (error) => error.code === 'ROOM_BRANCH_NOT_FOUND'
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
      city: '  Riyadh  ',
      timezone: ' Asia/Riyadh ',
    });

    assert.deepEqual(written, {
      name: 'Main Branch',
      city: 'Riyadh',
      timezone: 'Asia/Riyadh',
    });
  });

  test('enforces the branch city contract and clinic-safe filtering', async () => {
    const service = new MasterDataService(repository());
    await assert.rejects(
      service.create('branches', 'clinic-1', {
        name: 'Main Branch',
        timezone: 'Asia/Riyadh',
      }),
      (error) => error.code === 'VALIDATION_ERROR'
    );
    for (const city of [null, 7, [], {}, '   ', 'x'.repeat(81)]) {
      await assert.rejects(
        service.create('branches', 'clinic-1', {
          name: 'Main Branch',
          city,
          timezone: 'Asia/Riyadh',
        }),
        (error) => ['VALIDATION_ERROR', 'BRANCH_CITY_INVALID'].includes(error.code)
      );
    }
    await assert.rejects(
      service.create('branches', 'clinic-1', {
        name: 'Main Branch',
        city: 'Riyadh',
        timezone: 'Asia/Riyadh',
        clinic_id: 'other-clinic',
      }),
      /Unsupported branch field/
    );

    const calls = [];
    const repo = new MasterDataRepository({
      query: async (sql, values) => {
        calls.push({ sql, values });
        return { rows: [{ city: 'Riyadh' }] };
      },
    });
    const rows = await repo.list(configs.branches, 'clinic-1', {
      city: ' Riyadh ',
      search: 'Main',
    });
    assert.equal(rows[0].city, 'Riyadh');
    assert.match(calls[0].sql, /lower\(btrim\(r\.city\)\)/);
    assert.match(calls[0].sql, /r\.address::text ILIKE/);
    assert.deepEqual(calls[0].values, ['clinic-1', '%Main%', 'Riyadh']);
  });

  test('maps exact live constraint names to specific safe messages', () => {
    assert.equal(
      mapPostgresError({
        code: '23505',
        constraint: 'uq_branches_clinic_city_name_normalized',
      }).message,
      'This branch name already exists in the selected city.'
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
