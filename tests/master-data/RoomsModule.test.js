'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const MasterDataService = require(
  '../../src/modules/master-data/MasterDataService'
);
const MasterDataRepository = require(
  '../../src/modules/master-data/MasterDataRepository'
);
const roomTypes = require(
  '../../src/modules/master-data/roomTypes'
);

const clinicId = '00000000-0000-0000-0000-000000000001';
const branchId = '00000000-0000-0000-0000-000000000002';
const otherBranchId = '00000000-0000-0000-0000-000000000003';
const roomId = '00000000-0000-0000-0000-000000000004';

function repository(overrides = {}) {
  const room = {
    id: roomId,
    branch_id: branchId,
    room_number: '101',
    room_name: 'Consultation room',
    room_type: 'consultation',
    is_active: true,
  };
  return {
    findBranch: async () => ({
      id: branchId,
      clinic_id: clinicId,
      is_active: true,
    }),
    parentBelongsToClinic: async () => true,
    findRoomForClinic: async () => ({
      ...room,
      clinic_id: clinicId,
      branch_is_active: true,
    }),
    roomUsage: async () => ({
      has_assignments: false,
      has_active_assignments: false,
      has_appointments: false,
      has_future_appointments: false,
      has_time_off: false,
    }),
    find: async () => room,
    create: async (_config, _clinic, data) => ({ id: roomId, ...data }),
    update: async (_config, _clinic, id, data) => ({ ...room, id, ...data }),
    remove: async () => room,
    ...overrides,
  };
}

function validRoom(overrides = {}) {
  return {
    branch_id: branchId,
    room_number: ' 101 ',
    room_name: ' Consultation room ',
    room_type: 'consultation',
    is_active: true,
    ...overrides,
  };
}

describe('Rooms master data backend', () => {
  test('uses the approved room type allowlist', () => {
    assert.deepEqual(roomTypes, [
      'consultation',
      'laser',
      'peeling',
      'injection',
      'skin_care',
    ]);
  });

  test('maps duplicate room numbers to a stable room error code', () => {
    const mapPostgresError = require(
      '../../src/core/errors/postgresErrorMapper'
    );
    const error = mapPostgresError({
      code: '23505',
      constraint: 'rooms_branch_id_room_number_key',
    });
    assert.equal(error.code, 'ROOM_NUMBER_DUPLICATE_IN_BRANCH');
  });

  test('creates a valid room and trims text values', async () => {
    const result = await new MasterDataService(repository())
      .create('rooms', clinicId, validRoom());
    assert.equal(result.room_number, '101');
    assert.equal(result.room_name, 'Consultation room');
    assert.equal(result.room_type, 'consultation');
  });

  for (const field of ['branch_id', 'room_number', 'room_name', 'room_type']) {
    test(`rejects missing ${field}`, async () => {
      const input = validRoom();
      delete input[field];
      await assert.rejects(
        new MasterDataService(repository()).create('rooms', clinicId, input),
        (error) => error.code.includes('REQUIRED')
      );
    });
  }

  test('rejects whitespace values, unknown fields, and unsupported room types', async () => {
    const service = new MasterDataService(repository());
    await assert.rejects(
      service.create('rooms', clinicId, validRoom({ room_name: '   ' })),
      (error) => error.code === 'ROOM_NAME_REQUIRED'
    );
    await assert.rejects(
      service.create('rooms', clinicId, validRoom({ unexpected: true })),
      (error) => error.code === 'ROOM_UNKNOWN_FIELD'
    );
    await assert.rejects(
      service.create('rooms', clinicId, validRoom({ room_type: 'other' })),
      (error) => error.code === 'ROOM_TYPE_INVALID'
    );
  });

  test('rejects invalid, cross-clinic, and inactive branches', async () => {
    await assert.rejects(
      new MasterDataService(repository()).create(
        'rooms',
        clinicId,
        validRoom({ branch_id: 'not-a-uuid' })
      ),
      (error) => error.code === 'ROOM_BRANCH_NOT_FOUND'
    );
    await assert.rejects(
      new MasterDataService(repository({
        findBranch: async () => ({
          id: branchId,
          clinic_id: 'other-clinic',
          is_active: true,
        }),
      })).create('rooms', clinicId, validRoom()),
      (error) => error.code === 'ROOM_CLINIC_MISMATCH'
    );
    await assert.rejects(
      new MasterDataService(repository({
        findBranch: async () => ({
          id: branchId,
          clinic_id: clinicId,
          is_active: false,
        }),
      })).create('rooms', clinicId, validRoom()),
      (error) => error.code === 'ROOM_BRANCH_INACTIVE'
    );
  });

  test('prevents changing the room branch', async () => {
    await assert.rejects(
      new MasterDataService(repository()).update(
        'rooms',
        clinicId,
        roomId,
        { branch_id: otherBranchId }
      ),
      (error) => error.code === 'ROOM_CANNOT_CHANGE_BRANCH'
    );
  });

  test('prevents deactivation with active assignments or future appointments', async () => {
    await assert.rejects(
      new MasterDataService(repository({
        roomUsage: async () => ({
          has_active_assignments: true,
          has_future_appointments: false,
        }),
      })).update('rooms', clinicId, roomId, { is_active: false }),
      (error) => error.code === 'ROOM_HAS_ACTIVE_ASSIGNMENTS'
    );
    await assert.rejects(
      new MasterDataService(repository({
        roomUsage: async () => ({
          has_active_assignments: false,
          has_future_appointments: true,
        }),
      })).update('rooms', clinicId, roomId, { is_active: false }),
      (error) => error.code === 'ROOM_HAS_FUTURE_APPOINTMENTS'
    );
  });

  test('allows deactivation when only historical appointments exist', async () => {
    const result = await new MasterDataService(repository({
      roomUsage: async () => ({
        has_active_assignments: false,
        has_future_appointments: false,
      }),
    })).update('rooms', clinicId, roomId, { is_active: false });
    assert.equal(result.is_active, false);
  });

  test('prevents hard delete for every supported usage relationship', async () => {
    for (const field of ['has_assignments', 'has_appointments', 'has_time_off']) {
      await assert.rejects(
        new MasterDataService(repository({
          roomUsage: async () => ({
            has_assignments: false,
            has_appointments: false,
            has_time_off: false,
            [field]: true,
          }),
        })).remove('rooms', clinicId, roomId),
        (error) => error.code === 'ROOM_HARD_DELETE_FORBIDDEN'
      );
    }
  });

  test('prevents inactive and cross-branch rooms in specialized service assignments', () => {
    const migration = fs.readFileSync(path.join(
      __dirname, '..', '..', 'database', 'migrations',
      '010_service_assignments_hardening.sql'
    ), 'utf8');
    assert.match(migration, /chk_service_assignment_room_active/);
    assert.match(migration, /chk_service_assignment_room_branch/);
    assert.match(migration, /v_room_branch_id IS DISTINCT FROM NEW\.branch_id/);
  });

  test('room update and delete SQL retain clinic ownership predicates', async () => {
    const calls = [];
    const repositoryInstance = new MasterDataRepository({
      query: async (sql, values) => {
        calls.push({ sql, values });
        return {
          rows: [{
            id: roomId,
            branch_id: branchId,
            room_number: '101',
          }],
          rowCount: 1,
        };
      },
    });
    const config = require('../../src/modules/master-data/resourceConfig').rooms;
    await repositoryInstance.update(config, clinicId, roomId, {
      room_name: 'Updated',
    });
    await repositoryInstance.remove(config, clinicId, roomId);
    assert.match(calls.find((call) => call.sql.startsWith('UPDATE'))?.sql, /scope_branch\.clinic_id/);
    assert.match(calls.at(-1).sql, /b\.clinic_id = \$1/);
  });
});

describe('Rooms migration and dashboard contract', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '../../database/migrations/007_rooms_hardening.sql'),
    'utf8'
  );
  const config = fs.readFileSync(
    path.join(__dirname, '../../geniusbot-dashboard/src/pages/master-data/masterDataConfig.ts'),
    'utf8'
  );
  const page = fs.readFileSync(
    path.join(__dirname, '../../geniusbot-dashboard/src/pages/master-data/MasterDataPage.tsx'),
    'utf8'
  );

  test('migration fails on unmapped values before normalization and adds the allowlist check', () => {
    assert.match(migration, /unmapped room_type values found/);
    assert.ok(migration.indexOf('unmapped room_type values found') < migration.indexOf('UPDATE geniusbot.rooms'));
    assert.match(migration, /ADD CONSTRAINT chk_rooms_room_type/);
    for (const type of roomTypes) assert.match(migration, new RegExp(`'${type}'`));
    assert.doesNotMatch(migration, /DELETE FROM geniusbot\.rooms/);
  });

  test('dashboard uses a select, Arabic labels, required name, and read-only branch', () => {
    assert.match(config, /readOnlyOnEdit: true/);
    assert.match(config, /room_name'.*required: true/);
    assert.match(config, /room_type'.*type: 'select'.*required: true/);
    for (const label of ['كشف / استشارة', 'ليزر', 'تقشير', 'حقن', 'عناية بالبشرة']) {
      assert.match(config, new RegExp(label));
    }
  });

  test('dashboard exposes room filters, sorting, pagination, status actions, and safe lookup fallback', () => {
    assert.match(page, /Filter by branch/);
    assert.match(page, /Filter by status/);
    assert.match(page, /Filter by room type/);
    assert.match(page, /changeSort/);
    assert.match(page, /Page \{page\} of \{totalPages\}/);
    assert.match(page, /Deactivate/);
    assert.match(page, /Activate/);
    assert.match(page, /\?\? 'Unavailable'/);
    assert.match(page, /if \(mutation\.isPending\) return/);
  });
});
