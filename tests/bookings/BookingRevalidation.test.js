'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const BookingOrchestrator = require('../../src/services/booking/BookingOrchestrator');

const ids = {
  clinic: '00000000-0000-0000-0000-000000000001',
  service: '00000000-0000-0000-0000-000000000002',
  branch: '00000000-0000-0000-0000-000000000003',
  patient: '00000000-0000-0000-0000-000000000004',
  payment: '00000000-0000-0000-0000-000000000005',
  assignment: '00000000-0000-0000-0000-000000000006',
  doctor: '00000000-0000-0000-0000-000000000007',
  room: '00000000-0000-0000-0000-000000000008',
};

test('slot valid early but occupied before confirmation fails without creating appointment', async () => {
  let checks = 0;
  let creates = 0;
  const repositories = {
    clinics: { findById: async () => ({ id: ids.clinic, is_active: true }) },
    services: { findActiveById: async () => ({ id: ids.service, is_booking_enabled: true, duration_minutes: 30, requires_doctor: true, requires_room: true }) },
    patients: { findById: async () => ({ id: ids.patient, clinic_id: ids.clinic, full_name: 'منة', phone_number: '+966500000001', is_active: true }) },
    serviceAssignments: { findAssignments: async () => [{ id: ids.assignment, doctor_id: ids.doctor, room_id: ids.room, requires_doctor: true, requires_room: true }] },
    appointments: { createAppointment: async () => { creates += 1; return { id: 'unexpected' }; } },
  };
  const availabilityService = {
    checkAppointmentAvailability: async () => {
      checks += 1;
      return checks === 1
        ? { available: true, reason: null }
        : { available: false, reason: 'room_conflict' };
    },
  };
  const result = await new BookingOrchestrator(repositories, availabilityService)
    .bookAppointment({
      clinic_id: ids.clinic, service_id: ids.service, branch_id: ids.branch,
      patient_id: ids.patient, payment_method_id: ids.payment,
      preferred_start: '2026-08-02T08:00:00.000Z', confirmed: true,
    });
  assert.equal(result.success, false);
  assert.equal(result.reason, 'room_conflict');
  assert.equal(creates, 0);
  assert.equal(checks, 2);
});
