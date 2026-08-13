'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ServiceAssignmentRepository = require(
  '../../src/repositories/ServiceAssignmentRepository'
);
const BookingAvailabilityService = require(
  '../../src/services/booking/BookingAvailabilityService'
);

const clinicId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const wrongClinicAppointmentId = '33333333-3333-4333-8333-333333333333';

test('availability window exclusion is exact and remains clinic scoped', async () => {
  const calls = [];
  const repository = new ServiceAssignmentRepository({
    query: async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [{ assignments: [], appointments: [] }] };
    },
  });
  const common = {
    clinicId,
    branchId: '44444444-4444-4444-8444-444444444444',
    serviceId: '55555555-5555-4555-8555-555555555555',
    doctorId: '66666666-6666-4666-8666-666666666666',
    roomId: '77777777-7777-4777-8777-777777777777',
    windowStart: new Date('2026-08-15T00:00:00.000Z'),
    windowEnd: new Date('2026-08-16T00:00:00.000Z'),
    timeZone: 'Asia/Riyadh',
  };
  await repository.findAvailabilityWindow({
    ...common,
    excludeAppointmentId: appointmentId,
  });
  await repository.findAvailabilityWindow({
    ...common,
    excludeAppointmentId: wrongClinicAppointmentId,
  });
  assert.match(calls[0].sql, /a\.clinic_id = \$1/);
  assert.match(calls[0].sql, /a\.id <> \$8/);
  assert.equal(calls[0].values[0], clinicId);
  assert.equal(calls[0].values[7], appointmentId);
  assert.equal(calls[1].values[7], wrongClinicAppointmentId);
  assert.equal(calls[1].values[0], clinicId);
});

test('normal availability calls omit exclusion without changing the contract', async () => {
  let received;
  const service = new BookingAvailabilityService({
    checkAppointmentAvailability: async (input) => {
      received = input;
      return { available: true };
    },
  });
  await service.check({
    clinic_id: clinicId,
    branch_id: '44444444-4444-4444-8444-444444444444',
    service_id: '55555555-5555-4555-8555-555555555555',
    doctor_id: null,
    room_id: null,
    appointment_start: '2026-08-15T08:00:00.000Z',
    appointment_end: '2026-08-15T08:30:00.000Z',
  });
  assert.equal(received.excludeAppointmentId, undefined);
});

