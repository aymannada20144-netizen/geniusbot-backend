'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const BookingOrchestrator = require(
  '../../src/services/booking/BookingOrchestrator'
);

test('notification failure does not invalidate a created appointment', async () => {
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
  const repositories = {
    clinics: { findById: async () => ({ id: ids.clinic, is_active: true }) },
    services: { findActiveById: async () => ({
      id: ids.service, is_booking_enabled: true, duration_minutes: 30,
      requires_doctor: true, requires_room: true,
    }) },
    patients: { findById: async () => ({
      id: ids.patient, clinic_id: ids.clinic, is_active: true,
      full_name: 'Test Patient', phone_number: '+966500000001',
    }) },
    serviceAssignments: { findAssignments: async () => [{
      id: ids.assignment, doctor_id: ids.doctor, room_id: ids.room,
    }] },
    prices: {
      findResolutionContext: async () => ({
        clinic_id: ids.clinic, clinic_is_active: true,
        clinic_timezone: 'Asia/Riyadh', service_id: ids.service,
        service_clinic_id: ids.clinic, service_is_active: true,
        payment_method_id: ids.payment,
        payment_method_clinic_id: ids.clinic,
        payment_method_is_active: true, payment_method_code: 'cash',
      }),
      findApplicablePrices: async () => [{
        id: 'price-1', price: '100.00', currency: 'SAR',
      }],
    },
    appointments: { createAppointment: async (data) => ({
      id: 'appointment-1', ...data,
    }) },
    notifications: {
      scheduleReminder: async () => { throw new Error('queue unavailable'); },
    },
  };
  const availability = {
    checkAppointmentAvailability: async () => ({ available: true }),
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await new BookingOrchestrator(
      repositories,
      availability
    ).bookAppointment({
      clinic_id: ids.clinic, service_id: ids.service,
      branch_id: ids.branch, patient_id: ids.patient,
      payment_method_id: ids.payment,
      preferred_start: '2026-08-02T08:00:00.000Z', confirmed: true,
    });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.appointment.id, 'appointment-1');
    assert.deepEqual(result.notification, {
      scheduled: false, reason: 'scheduling_failed',
    });
  } finally {
    console.error = originalError;
  }
});
