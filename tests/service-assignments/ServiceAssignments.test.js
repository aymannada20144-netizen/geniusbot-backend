'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const ServiceAssignmentService = require(
  '../../src/modules/master-data/ServiceAssignmentService'
);

const ids = {
  clinic: '00000000-0000-0000-0000-000000000001',
  branch: '00000000-0000-0000-0000-000000000002',
  service: '00000000-0000-0000-0000-000000000003',
  doctor: '00000000-0000-0000-0000-000000000004',
  room: '00000000-0000-0000-0000-000000000005',
  assignment: '00000000-0000-0000-0000-000000000006',
};

function repository(overrides = {}) {
  return {
    transaction: async (callback) => callback({}),
    lockResources: async () => ({
      branch: { id: ids.branch, is_active: true },
      service: {
        id: ids.service,
        is_active: true,
        is_booking_enabled: true,
        requires_doctor: true,
        requires_room: true,
      },
    }),
    create: async (_client, clinicId, data) => ({ id: ids.assignment, clinic_id: clinicId, ...data }),
    findForUpdate: async () => ({
      id: ids.assignment,
      clinic_id: ids.clinic,
      branch_id: ids.branch,
      service_id: ids.service,
      doctor_id: ids.doctor,
      room_id: ids.room,
      is_default: false,
      is_active: true,
    }),
    update: async (_client, _clinicId, _id, data) => data,
    hasMatchingAppointment: async () => false,
    remove: async () => ({ id: ids.assignment }),
    ...overrides,
  };
}

describe('Service Assignments specialized module', () => {
  test('rejects unknown fields, clinic_id, invalid UUIDs, and non-boolean flags', async () => {
    const service = new ServiceAssignmentService(repository());
    assert.throws(
      () => service.create(ids.clinic, { branch_id: ids.branch, service_id: ids.service, surprise: true }),
      (error) => error.code === 'SERVICE_ASSIGNMENT_UNKNOWN_FIELD',
    );
    assert.throws(
      () => service.create(ids.clinic, { branch_id: ids.branch, service_id: ids.service, clinic_id: ids.clinic }),
      (error) => error.code === 'SERVICE_ASSIGNMENT_UNKNOWN_FIELD',
    );
    assert.throws(
      () => service.create(ids.clinic, { branch_id: 'bad', service_id: ids.service }),
      (error) => error.code === 'SERVICE_ASSIGNMENT_UUID_INVALID',
    );
    assert.throws(
      () => service.create(ids.clinic, { branch_id: ids.branch, service_id: ids.service, is_active: 'true' }),
      (error) => error.code === 'SERVICE_ASSIGNMENT_BOOLEAN_INVALID',
    );
  });

  test('enforces service-required resources and permits optional null resources', async () => {
    const required = new ServiceAssignmentService(repository());
    await assert.rejects(
      () => required.create(ids.clinic, { branch_id: ids.branch, service_id: ids.service }),
      (error) => error.code === 'SERVICE_ASSIGNMENT_DOCTOR_REQUIRED',
    );

    const optional = new ServiceAssignmentService(repository({
      lockResources: async () => ({
        branch: { id: ids.branch },
        service: { id: ids.service, requires_doctor: false, requires_room: false },
      }),
    }));
    const result = await optional.create(ids.clinic, {
      branch_id: ids.branch,
      service_id: ids.service,
      is_active: false,
    });
    assert.equal(result.doctor_id, null);
    assert.equal(result.room_id, null);
  });

  test('uses one transaction and preserves clinic scoping on writes', async () => {
    const calls = [];
    const service = new ServiceAssignmentService(repository({
      transaction: async (callback) => {
        calls.push('begin');
        const result = await callback({ tx: true });
        calls.push('commit');
        return result;
      },
      create: async (_client, clinicId) => {
        calls.push(clinicId);
        return { id: ids.assignment };
      },
    }));
    await service.create(ids.clinic, {
      branch_id: ids.branch,
      service_id: ids.service,
      doctor_id: ids.doctor,
      room_id: ids.room,
    });
    assert.deepEqual(calls, ['begin', ids.clinic, 'commit']);
  });

  test('hard delete is blocked when usage cannot be disproved', async () => {
    const service = new ServiceAssignmentService(repository({
      hasMatchingAppointment: async () => true,
    }));
    await assert.rejects(
      () => service.remove(ids.clinic, ids.assignment),
      (error) => error.code === 'SERVICE_ASSIGNMENT_DELETE_UNSAFE',
    );
  });

  test('dashboard is specialized and validates branch-first requirements', () => {
    const source = fs.readFileSync(path.join(
      __dirname, '..', '..', 'geniusbot-dashboard', 'src', 'pages',
      'master-data', 'ServiceAssignmentsPage.tsx',
    ), 'utf8');
    assert.match(source, /branch_id: event\.target\.value, doctor_id: '', room_id: ''/);
    assert.match(source, /selectedService\?\.requires_doctor/);
    assert.match(source, /selectedService\?\.requires_room/);
    assert.match(source, /duplicateDefault/);
    assert.match(source, /if \(save\.isPending\) return/);
    assert.match(source, /role="dialog"/);
  });

  test('availability and booking preserve optional-resource semantics', () => {
    const availability = fs.readFileSync(path.join(
      __dirname, '..', '..', 'src', 'services', 'availability',
      'AvailabilityService.js',
    ), 'utf8');
    const resolver = fs.readFileSync(path.join(
      __dirname, '..', '..', 'src', 'services', 'booking',
      'BookingAssignmentResolver.js',
    ), 'utf8');
    const factory = fs.readFileSync(path.join(
      __dirname, '..', '..', 'src', 'services', 'booking',
      'BookingAppointmentFactory.js',
    ), 'utf8');
    assert.match(availability, /if \(requires_doctor \|\| doctor_id\) validateUuid/);
    assert.match(availability, /if \(doctor_id\) \{/);
    assert.match(availability, /if \(room_id\) \{/);
    assert.doesNotMatch(resolver, /room_id cannot be provided without doctor_id/);
    assert.match(factory, /service\.requires_doctor/);
    assert.match(factory, /service\.requires_room/);
  });
});
