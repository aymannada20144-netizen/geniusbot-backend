'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const BookingEngine = require('../../src/modules/bookings/BookingEngine');
const BookingOrchestrator = require('../../src/services/booking/BookingOrchestrator');

function orchestrator() {
  return new BookingOrchestrator({
    clinics: {
      async findById() {
        return { id: 'clinic-1', timezone: 'Asia/Riyadh' };
      },
    },
    patients: {},
    serviceAssignments: {},
  }, {});
}

describe('availability alternative selection', () => {
  test('BookingEngine preserves the booking context when requesting alternatives', async () => {
    let received;
    const engine = new BookingEngine({ bookingService: {
      async bookAppointment() {
        return { success: false };
      },
      async getAvailableAlternatives(command) {
        received = command;
        return { success: true, alternatives: [] };
      },
    } });

    await engine.getAvailableAlternatives({
      clinicId: 'clinic-1',
      service: { id: 'service-1' },
      branch: { id: 'branch-1' },
      doctor: { id: 'doctor-1' },
      preferredStart: '2026-08-07T15:00:00.000Z',
      limit: 3,
    });

    assert.deepEqual(received, {
      clinic_id: 'clinic-1',
      service_id: 'service-1',
      branch_id: 'branch-1',
      doctor_id: 'doctor-1',
      preferred_start: '2026-08-07T15:00:00.000Z',
      limit: 3,
    });
  });

  test('orders same-day slots by distance before later available dates', async () => {
    const service = orchestrator();
    const calls = [];
    service.getAvailableTimes = async ({ date }) => {
      calls.push(date);
      if (date === '2026-08-07') {
        return { success: true, times: ['20:00', '16:00', '19:00', '17:00'] };
      }
      return { success: true, times: ['09:00'] };
    };
    service.getAvailableDates = async () => ({
      success: true,
      dates: ['2026-08-08'],
    });

    const result = await service.getAvailableAlternatives({
      clinic_id: 'clinic-1',
      service_id: 'service-1',
      branch_id: 'branch-1',
      doctor_id: 'doctor-1',
      preferred_start: '2026-08-07T15:00:00.000Z',
      limit: 3,
    });

    assert.deepEqual(result.alternatives, [
      { date: '2026-08-07', time: '17:00' },
      { date: '2026-08-07', time: '19:00' },
      { date: '2026-08-07', time: '16:00' },
    ]);
    assert.deepEqual(calls, ['2026-08-07']);
  });

  test('fills remaining positions from the nearest later available dates', async () => {
    const service = orchestrator();
    const dateCommands = [];
    service.getAvailableTimes = async ({ date }) => ({
      success: true,
      times: date === '2026-08-07' ? ['17:00'] : ['09:00', '11:00'],
    });
    service.getAvailableDates = async (command) => {
      dateCommands.push(command);
      return { success: true, dates: ['2026-08-08'] };
    };

    const result = await service.getAvailableAlternatives({
      clinic_id: 'clinic-1',
      service_id: 'service-1',
      branch_id: 'branch-1',
      doctor_id: 'doctor-1',
      preferred_start: '2026-08-07T15:00:00.000Z',
      limit: 3,
    });

    assert.deepEqual(result.alternatives, [
      { date: '2026-08-07', time: '17:00' },
      { date: '2026-08-08', time: '09:00' },
      { date: '2026-08-08', time: '11:00' },
    ]);
    assert.equal(dateCommands[0].from_date, '2026-08-08');
    assert.equal(dateCommands[0].doctor_id, 'doctor-1');
  });
});
