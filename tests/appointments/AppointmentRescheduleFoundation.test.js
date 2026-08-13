'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const AppointmentService = require('../../src/modules/appointments/AppointmentService');

const clinicId = '11111111-1111-4111-8111-111111111111';
const appointmentId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const serviceId = '44444444-4444-4444-8444-444444444444';
const branchId = '55555555-5555-4555-8555-555555555555';
const doctorId = '66666666-6666-4666-8666-666666666666';
const roomId = '77777777-7777-4777-8777-777777777777';
const oldStart = '2026-08-15T08:00:00.000Z';
const oldEnd = '2026-08-15T08:30:00.000Z';
const newStart = '2026-08-16T09:00:00.000Z';
const newEnd = '2026-08-16T09:30:00.000Z';
const updatedAt = '2026-08-12T08:00:00.000Z';

function appointment(status = 'confirmed') {
  return {
    id: appointmentId,
    clinic_id: clinicId,
    patient_id: patientId,
    service_id: serviceId,
    branch_id: branchId,
    doctor_id: doctorId,
    room_id: roomId,
    booking_reference: '25DD4527',
    appointment_start: oldStart,
    appointment_end: oldEnd,
    status,
    updated_at: updatedAt,
  };
}

function harness(status = 'confirmed', overrides = {}) {
  const calls = [];
  const current = appointment(status);
  const repository = {
    findByIdAndClinic: async () => current,
    hasDoctorConflict: async (...args) => {
      calls.push(['doctor', args]);
      return overrides.doctorConflict || false;
    },
    hasRoomConflict: async (...args) => {
      calls.push(['room', args]);
      return overrides.roomConflict || false;
    },
    applyAtomicChange: async (input) => {
      calls.push(['atomic', input]);
      if (overrides.atomicError) throw overrides.atomicError;
      return {
        appointment: {
          ...current,
          ...input.patch,
          updated_at: '2026-08-12T09:00:00.000Z',
        },
      };
    },
  };
  return {
    service: new AppointmentService(repository, null, overrides.notifications, {
      availabilityService: overrides.availabilityService || null,
    }),
    calls,
  };
}

for (const status of ['pending', 'confirmed']) {
  test(`${status} reschedules atomically while preserving identity and status`, async () => {
    const { service, calls } = harness(status);
    const result = await service.rescheduleAppointment(
      clinicId, appointmentId, newStart, newEnd
    );
    assert.equal(result.status, status);
    assert.deepEqual(
      [result.id, result.booking_reference, result.patient_id, result.service_id,
        result.branch_id, result.doctor_id, result.room_id],
      [appointmentId, '25DD4527', patientId, serviceId, branchId, doctorId, roomId]
    );
    assert.equal(result.appointment_start, newStart);
    assert.equal(result.appointment_end, newEnd);
    const command = calls.find(([name]) => name === 'atomic')[1];
    assert.equal(command.operation, 'reschedule');
    assert.equal(command.expectedStatus, status);
    assert.equal(command.expectedUpdatedAt, updatedAt);
    assert.deepEqual(command.patch, {
      appointment_start: newStart,
      appointment_end: newEnd,
    });
  });
}

test('terminal and otherwise ineligible statuses are rejected', async () => {
  for (const status of ['cancelled', 'completed', 'no_show', 'rescheduled', 'checked_in']) {
    const { service, calls } = harness(status);
    await assert.rejects(
      service.rescheduleAppointment(clinicId, appointmentId, newStart, newEnd),
      /not eligible/
    );
    assert.equal(calls.length, 0);
  }
});

test('provider and room checks exclude the current appointment', async () => {
  const { service, calls } = harness();
  await service.rescheduleAppointment(clinicId, appointmentId, newStart, newEnd);
  assert.deepEqual(calls[0], [
    'doctor', [doctorId, newStart, newEnd, appointmentId],
  ]);
  assert.deepEqual(calls[1], [
    'room', [roomId, newStart, newEnd, appointmentId],
  ]);
});

test('provider and room conflicts stop before atomic mutation', async () => {
  for (const key of ['doctorConflict', 'roomConflict']) {
    const { service, calls } = harness('confirmed', { [key]: true });
    await assert.rejects(
      service.rescheduleAppointment(clinicId, appointmentId, newStart, newEnd),
      /not available/
    );
    assert.equal(calls.some(([name]) => name === 'atomic'), false);
  }
});

test('final authoritative availability excludes only the current appointment', async () => {
  const availabilityCalls = [];
  const availabilityService = {
    checkAppointmentAvailability: async (input) => {
      availabilityCalls.push(input);
      return { available: true };
    },
  };
  const { service, calls } = harness('confirmed', { availabilityService });
  await service.rescheduleAppointment(clinicId, appointmentId, newStart, newEnd);
  assert.equal(availabilityCalls.length, 1);
  assert.deepEqual(availabilityCalls[0], {
    clinic_id: clinicId, branch_id: branchId, service_id: serviceId,
    doctor_id: doctorId, room_id: roomId, patient_id: patientId,
    requires_doctor: true, requires_room: true,
    appointment_start: newStart, appointment_end: newEnd,
    excludeAppointmentId: appointmentId,
  });
  assert.equal(calls.some(([name]) => name === 'atomic'), true);
});

test('slot taken after presentation is rejected before mutation or reminders', async () => {
  let reminders = 0;
  const { service, calls } = harness('confirmed', {
    availabilityService: {
      checkAppointmentAvailability: async () => ({
        available: false, reason: 'doctor_conflict',
      }),
    },
    notifications: {
      rescheduleAppointmentNotifications: async () => { reminders += 1; },
    },
  });
  await assert.rejects(
    service.rescheduleAppointment(clinicId, appointmentId, newStart, newEnd),
    (error) => error.code === 'APPOINTMENT_SLOT_NO_LONGER_AVAILABLE'
  );
  assert.equal(calls.some(([name]) => name === 'atomic'), false);
  assert.equal(reminders, 0);
});

test('reschedule availability preserves the current assignment and exact exclusion', async () => {
  const received = [];
  const { service } = harness('confirmed');
  service.bookingService = {
    getAvailableDates: async (input) => {
      received.push(['dates', input]);
      return { success: true, dates: ['2026-08-16'] };
    },
    getAvailableTimes: async (input) => {
      received.push(['times', input]);
      return { success: true, times: ['12:00'] };
    },
  };
  await service.getRescheduleAvailableDates(clinicId, appointmentId, '2026-08-16');
  await service.getRescheduleAvailableTimes(clinicId, appointmentId, '2026-08-16');
  for (const [, input] of received) {
    assert.equal(input.clinic_id, clinicId);
    assert.equal(input.service_id, serviceId);
    assert.equal(input.branch_id, branchId);
    assert.equal(input.doctor_id, doctorId);
    assert.equal(input.room_id, roomId);
    assert.equal(input.excludeAppointmentId, appointmentId);
  }
});

test('stale updated_at rejection is preserved', async () => {
  const error = new Error('stale');
  error.code = 'APPOINTMENT_STALE';
  const { service } = harness('confirmed', { atomicError: error });
  await assert.rejects(
    service.rescheduleAppointment(clinicId, appointmentId, newStart, newEnd),
    (value) => value.code === 'APPOINTMENT_STALE'
  );
});

test('reminders recalculate only after commit', async () => {
  const events = [];
  const notifications = {
    rescheduleAppointmentNotifications: async (value) => {
      events.push(['reminders', value.appointment_start]);
      return [{ reminder_type: 'day_before' }];
    },
  };
  const { service, calls } = harness('confirmed', { notifications });
  const result = await service.rescheduleAppointment(
    clinicId, appointmentId, newStart, newEnd
  );
  assert.equal(calls.some(([name]) => name === 'atomic'), true);
  assert.deepEqual(events, [['reminders', newStart]]);
  assert.equal(result.communication.status, 'rescheduled');
});

test('reminder failure does not undo or report the committed time change as failed', async (t) => {
  t.mock.method(console, 'error', () => {});
  const notifications = {
    rescheduleAppointmentNotifications: async () => {
      throw new Error('scheduler unavailable');
    },
  };
  const { service } = harness('confirmed', { notifications });
  const result = await service.rescheduleAppointment(
    clinicId, appointmentId, newStart, newEnd
  );
  assert.equal(result.appointment_start, newStart);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.communication.status, 'failed');
});
