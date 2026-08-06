'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const BookingEngine = require('../../src/modules/bookings/BookingEngine');
const BookingOrchestrator = require('../../src/services/booking/BookingOrchestrator');

function repositories(calls, { closed = false, noAssignments = false } = {}) {
  return {
    clinics: {
      async findById() {
        return { id: 'clinic-1', is_active: true, timezone: 'Asia/Riyadh' };
      },
    },
    branches: {
      async findActiveById() {
        return { id: 'branch-1', is_active: true };
      },
    },
    services: {
      async findActiveById() {
        return {
          id: 'service-1',
          is_booking_enabled: true,
          duration_minutes: 60,
        };
      },
    },
    patients: {},
    serviceAssignments: {
      async findAvailabilityWindow(command) {
        calls.push(command);
        const doctorId = command.doctorId || 'doctor-auto';
        return {
          time_zone: 'Asia/Riyadh',
          assignments: noAssignments ? [] : [{
            doctor_id: doctorId,
            room_id: 'room-auto',
            requires_doctor: true,
            requires_room: true,
          }],
          branch_hours: Array.from({ length: 7 }, (_, day) => ({
            day_of_week: day,
            opens_at: '09:00:00',
            closes_at: '17:00:00',
            is_closed: closed,
          })),
          doctor_hours: Array.from({ length: 7 }, (_, day) => ({
            doctor_id: doctorId,
            day_of_week: day,
            start_time: '09:00:00',
            end_time: '17:00:00',
          })),
          holidays: [],
          doctor_time_off: [],
          room_time_off: [],
          appointments: [],
        };
      },
    },
  };
}

describe('preferred availability search', () => {
  test('BookingEngine delegates the structured preference and booking scope', async () => {
    let received;
    const engine = new BookingEngine({ bookingService: {
      async bookAppointment() {
        return { success: false };
      },
      async getPreferredAvailability(command) {
        received = command;
        return { success: false };
      },
    } });

    await engine.getPreferredAvailability({
      clinicId: 'clinic-1',
      service: { id: 'service-1' },
      branch: { id: 'branch-1' },
      doctor: null,
      mode: 'nearest_available',
      date: null,
      from: '2026-08-05T08:00:00.000Z',
    });

    assert.deepEqual(received, {
      clinic_id: 'clinic-1',
      service_id: 'service-1',
      branch_id: 'branch-1',
      doctor_id: null,
      mode: 'nearest_available',
      date: null,
      from: '2026-08-05T08:00:00.000Z',
    });
  });

  test('nearest search returns the first executable slot and assigned resources', async () => {
    const calls = [];
    const service = new BookingOrchestrator(repositories(calls), {});
    const result = await service.getPreferredAvailability({
      clinic_id: 'clinic-1',
      service_id: 'service-1',
      branch_id: 'branch-1',
      doctor_id: null,
      mode: 'nearest_available',
      date: null,
      from: '2026-08-05T08:00:00.000Z',
    });

    assert.equal(result.preferredStart, '2026-08-05T08:00:00.000Z');
    assert.equal(result.doctorId, 'doctor-auto');
    assert.equal(result.roomId, 'room-auto');
    assert.equal(calls[0].doctorId, null);
  });

  test('any-time search stays inside its requested date and keeps an explicit doctor filter', async () => {
    const calls = [];
    const service = new BookingOrchestrator(repositories(calls), {});
    const result = await service.getPreferredAvailability({
      clinic_id: 'clinic-1',
      service_id: 'service-1',
      branch_id: 'branch-1',
      doctor_id: 'doctor-explicit',
      mode: 'any_time',
      date: '2026-08-06',
      from: '2026-08-05T08:00:00.000Z',
    });

    assert.equal(result.date, '2026-08-06');
    assert.equal(result.preferredStart, '2026-08-06T06:00:00.000Z');
    assert.equal(result.doctorId, 'doctor-explicit');
    assert.equal(calls[0].doctorId, 'doctor-explicit');
    assert.equal(
      Math.round((calls[0].windowEnd - calls[0].windowStart) / 86400000),
      1
    );
  });

  for (const [closed, expected] of [
    [true, 'closed_day'],
    [false, 'no_availability'],
  ]) {
    test(`bounded search reports ${expected}`, async () => {
      const calls = [];
      const service = new BookingOrchestrator(
        repositories(calls, { closed, noAssignments: true }),
        {}
      );
      const result = await service.getPreferredAvailability({
        clinic_id: 'clinic-1',
        service_id: 'service-1',
        branch_id: 'branch-1',
        doctor_id: null,
        mode: 'any_time',
        date: '2026-08-07',
        from: '2026-08-06T08:00:00.000Z',
      });

      assert.equal(result.success, false);
      assert.equal(result.unavailableReason, expected);
    });
  }
});
