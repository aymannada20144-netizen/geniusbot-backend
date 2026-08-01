'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const AvailabilityService = require(
  '../../src/services/availability/AvailabilityService'
);
const BookingAssignmentResolver = require(
  '../../src/services/booking/BookingAssignmentResolver'
);
const BookingOrchestrator = require(
  '../../src/services/booking/BookingOrchestrator'
);

const ids = {
  clinic: '00000000-0000-0000-0000-000000000001',
  branch: '00000000-0000-0000-0000-000000000002',
  service: '00000000-0000-0000-0000-000000000003',
  doctor: '00000000-0000-0000-0000-000000000004',
  room: '00000000-0000-0000-0000-000000000005',
  patient: '00000000-0000-0000-0000-000000000006',
  payment: '00000000-0000-0000-0000-000000000007',
};

function repositories(overrides = {}) {
  return {
    clinics: {
      findById: async () => ({
        id: ids.clinic,
        is_active: true,
        timezone: 'Asia/Riyadh',
      }),
      findHoliday: async () => null,
      findBranchWorkingHours: async () => ({
        opens_at: '10:00:00',
        closes_at: '22:00:00',
        is_closed: false,
      }),
    },
    doctors: {
      getWorkingHours: async () => ({
        start_time: '10:00:00',
        end_time: '22:00:00',
        matches_requested_time: true,
      }),
      hasTimeOff: async () => false,
    },
    rooms: {
      findActiveById: async () => ({
        id: ids.room,
        branch_id: ids.branch,
        is_active: true,
      }),
      hasTimeOff: async () => false,
    },
    appointments: {
      hasDoctorConflict: async () => false,
      hasRoomConflict: async () => false,
    },
    ...overrides,
  };
}

function availabilityInput() {
  return {
    clinic_id: ids.clinic,
    branch_id: ids.branch,
    doctor_id: ids.doctor,
    room_id: ids.room,
    appointment_start: '2026-08-01T08:00:00.000Z',
    appointment_end: '2026-08-01T08:20:00.000Z',
  };
}

describe('Runtime availability boundaries', () => {
  test('11:00 Asia/Riyadh is compared as 11:00 local after receiving 08:00Z', async () => {
    let hoursArguments;
    const repos = repositories();
    repos.doctors.getWorkingHours = async (...args) => {
      hoursArguments = args;
      return {
        start_time: '10:00:00',
        end_time: '22:00:00',
        matches_requested_time: true,
      };
    };
    const result = await new AvailabilityService(repos)
      .checkAppointmentAvailability(availabilityInput());

    assert.equal(result.available, true);
    assert.deepEqual(hoursArguments.slice(3), [
      6,
      '11:00:00',
      '11:20:00',
    ]);
  });

  test('empty appointment conflict queries do not make a valid slot unavailable', async () => {
    const result = await new AvailabilityService(repositories())
      .checkAppointmentAvailability(availabilityInput());
    assert.equal(result.available, true);
    assert.equal(result.reason, null);
  });

  test('missing doctor schedule returns doctor_not_working', async () => {
    const repos = repositories();
    repos.doctors.getWorkingHours = async () => null;
    const result = await new AvailabilityService(repos)
      .checkAppointmentAvailability(availabilityInput());
    assert.equal(result.available, false);
    assert.equal(result.reason, 'doctor_not_working');
  });

  test('accepts first and last slots and rejects a slot starting at period end', async () => {
    const repos = repositories();
    repos.doctors.getWorkingHours = async (_clinic, _doctor, _branch, _day, start, end) => ({
      start_time: '10:00:00',
      end_time: '14:00:00',
      matches_requested_time: start >= '10:00:00' && end <= '14:00:00',
    });
    const service = new AvailabilityService(repos);
    for (const [start, end] of [
      ['2026-08-01T07:00:00.000Z', '2026-08-01T07:30:00.000Z'],
      ['2026-08-01T10:30:00.000Z', '2026-08-01T11:00:00.000Z'],
    ]) {
      const result = await service.checkAppointmentAvailability({
        ...availabilityInput(), appointment_start: start, appointment_end: end,
      });
      assert.equal(result.available, true);
    }
    const rejected = await service.checkAppointmentAvailability({
      ...availabilityInput(),
      appointment_start: '2026-08-01T11:00:00.000Z',
      appointment_end: '2026-08-01T11:30:00.000Z',
    });
    assert.equal(rejected.reason, 'outside_doctor_working_hours');
  });

  test('supports split shifts and rejects service duration crossing a shift end', async () => {
    const repos = repositories();
    repos.doctors.getWorkingHours = async (_clinic, _doctor, _branch, _day, start, end) => {
      const periods = [['10:00:00', '12:00:00'], ['16:00:00', '20:00:00']];
      const match = periods.find(([from, to]) => from <= start && to >= end);
      return match
        ? { start_time: match[0], end_time: match[1], matches_requested_time: true }
        : { start_time: '10:00:00', end_time: '12:00:00', matches_requested_time: false };
    };
    const service = new AvailabilityService(repos);
    const evening = await service.checkAppointmentAvailability({
      ...availabilityInput(),
      appointment_start: '2026-08-01T13:00:00.000Z',
      appointment_end: '2026-08-01T13:30:00.000Z',
    });
    assert.equal(evening.available, true);
    const crossing = await service.checkAppointmentAvailability({
      ...availabilityInput(),
      appointment_start: '2026-08-01T08:45:00.000Z',
      appointment_end: '2026-08-01T09:15:00.000Z',
    });
    assert.equal(crossing.reason, 'outside_doctor_working_hours');
  });

  test('applies holiday, doctor time off, and room time off independently', async () => {
    const holidayRepos = repositories();
    holidayRepos.clinics.findHoliday = async () => ({ is_closed: true });
    assert.equal(
      (await new AvailabilityService(holidayRepos)
        .checkAppointmentAvailability(availabilityInput())).reason,
      'clinic_holiday',
    );

    const doctorOffRepos = repositories();
    doctorOffRepos.doctors.hasTimeOff = async () => true;
    assert.equal(
      (await new AvailabilityService(doctorOffRepos)
        .checkAppointmentAvailability(availabilityInput())).reason,
      'doctor_time_off',
    );

    const roomOffRepos = repositories();
    roomOffRepos.rooms.hasTimeOff = async () => true;
    assert.equal(
      (await new AvailabilityService(roomOffRepos)
        .checkAppointmentAvailability(availabilityInput())).reason,
      'room_time_off',
    );
  });

  test('branch hours remain the outer bound when a doctor schedule is wider', async () => {
    const repos = repositories();
    repos.clinics.findBranchWorkingHours = async () => ({
      opens_at: '12:00:00', closes_at: '13:00:00', is_closed: false,
    });
    repos.doctors.getWorkingHours = async () => ({
      start_time: '10:00:00', end_time: '14:00:00', matches_requested_time: true,
    });
    const result = await new AvailabilityService(repos)
      .checkAppointmentAvailability(availabilityInput());
    assert.equal(result.reason, 'outside_branch_working_hours');
  });

  test('a room from another branch is unavailable', async () => {
    const repos = repositories();
    repos.rooms.findActiveById = async () => ({
      id: ids.room,
      branch_id: '00000000-0000-0000-0000-000000000099',
      is_active: true,
    });
    const result = await new AvailabilityService(repos)
      .checkAppointmentAvailability(availabilityInput());
    assert.equal(result.available, false);
    assert.equal(result.reason, 'room_branch_mismatch');
  });

  test('no eligible service assignment returns unavailable without checking unrelated resources', async () => {
    let availabilityChecks = 0;
    const resolver = new BookingAssignmentResolver({
      serviceAssignments: {
        findAssignments: async () => [],
      },
    }, {
      check: async () => {
        availabilityChecks += 1;
        return { available: true };
      },
    });
    const result = await resolver.resolve({
      clinic_id: ids.clinic,
      branch_id: ids.branch,
      service_id: ids.service,
      appointment_start: new Date('2026-08-01T08:00:00Z'),
      appointment_end: new Date('2026-08-01T08:20:00Z'),
    });
    assert.equal(result.resolved, false);
    assert.equal(result.reason, 'service_assignment_not_found');
    assert.equal(availabilityChecks, 0);
  });

  test('invalid availability never creates a database appointment', async () => {
    let creates = 0;
    const repos = repositories({
      services: {
        findActiveById: async () => ({
          id: ids.service,
          is_booking_enabled: true,
          duration_minutes: 20,
        }),
      },
      patients: {
        findById: async () => ({
          id: ids.patient,
          clinic_id: ids.clinic,
          full_name: 'Test Patient',
          phone_number: '+966500000001',
          is_active: true,
          is_temporary: false,
        }),
      },
      serviceAssignments: {
        findAssignments: async () => [],
      },
      appointments: {
        createAppointment: async () => {
          creates += 1;
          return {};
        },
      },
    });
    const result = await new BookingOrchestrator(
      repos,
      new AvailabilityService(repos)
    ).bookAppointment({
      clinic_id: ids.clinic,
      branch_id: ids.branch,
      service_id: ids.service,
      patient_id: ids.patient,
      preferred_start: '2026-08-01T08:00:00.000Z',
      payment_method_id: ids.payment,
      confirmed: true,
    });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'service_assignment_not_found');
    assert.equal(creates, 0);
  });
});
