'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const DoctorWorkingHoursService = require('../../src/modules/master-data/DoctorWorkingHoursService');
const DoctorWorkingHoursRepository = require('../../src/modules/master-data/DoctorWorkingHoursRepository');
const registerRoutes = require('../../src/modules/master-data/DoctorWorkingHoursRoutes');
const DoctorRepository = require('../../src/repositories/DoctorRepository');
const AvailabilityService = require('../../src/services/availability/AvailabilityService');
const { ForbiddenError, ValidationError } = require('../../src/core/errors');

const clinicId = '00000000-0000-0000-0000-000000000001';
const doctorId = '00000000-0000-0000-0000-000000000002';
const branchOne = '00000000-0000-0000-0000-000000000003';
const branchTwo = '00000000-0000-0000-0000-000000000004';

function repository(overrides = {}) {
  return {
    doctorBelongsToClinic: async () => true,
    branchBelongsToClinic: async () => true,
    getBranchWorkingHours: async () => ({
      opens_at: '08:00:00',
      closes_at: '23:00:00',
      is_closed: false,
    }),
    list: async () => [],
    replace: async (_clinic, _doctor, periods) => periods,
    ...overrides,
  };
}

const service = (overrides) => new DoctorWorkingHoursService(repository(overrides));
const period = (patch = {}) => ({
  branch_id: branchOne,
  day_of_week: 0,
  start_time: '10:00',
  end_time: '14:00',
  ...patch,
});

describe('Doctor weekly working hours', () => {
  test('empty schedules and normalized multi-branch periods are supported', async () => {
    assert.deepEqual(await service().replaceWeeklySchedule(clinicId, doctorId, { periods: [] }), []);
    const result = await service().replaceWeeklySchedule(clinicId, doctorId, {
      periods: [
        period(),
        period({ branch_id: branchTwo, start_time: '17:00', end_time: '22:00' }),
      ],
    });
    assert.deepEqual(result.map(({ branch_id, start_time }) => [branch_id, start_time]), [
      [branchOne, '10:00:00'],
      [branchTwo, '17:00:00'],
    ]);
  });

  test('duplicates, same-branch overlap, and cross-branch overlap are rejected', async () => {
    await assert.rejects(
      service().replaceWeeklySchedule(clinicId, doctorId, { periods: [period(), period()] }),
      /Duplicate/
    );
    await assert.rejects(
      service().replaceWeeklySchedule(clinicId, doctorId, {
        periods: [period(), period({ start_time: '13:00', end_time: '17:00' })],
      }),
      /overlap/
    );
    await assert.rejects(
      service().replaceWeeklySchedule(clinicId, doctorId, {
        periods: [period(), period({ branch_id: branchTwo, start_time: '13:00', end_time: '17:00' })],
      }),
      /overlap/
    );
  });

  test('adjacent periods are allowed', async () => {
    const result = await service().replaceWeeklySchedule(clinicId, doctorId, {
      periods: [period(), period({ branch_id: branchTwo, start_time: '14:00', end_time: '18:00' })],
    });
    assert.equal(result.length, 2);
  });

  test('invalid day, invalid time, overnight, and branch closure are rejected', async () => {
    await assert.rejects(
      service().replaceWeeklySchedule(clinicId, doctorId, { periods: [period({ day_of_week: 7 })] }),
      ValidationError
    );
    await assert.rejects(
      service().replaceWeeklySchedule(clinicId, doctorId, { periods: [period({ start_time: '25:00' })] }),
      ValidationError
    );
    await assert.rejects(
      service().replaceWeeklySchedule(clinicId, doctorId, { periods: [period({ start_time: '22:00', end_time: '02:00' })] }),
      ValidationError
    );
    await assert.rejects(
      service({ getBranchWorkingHours: async () => ({ is_closed: true }) })
        .replaceWeeklySchedule(clinicId, doctorId, { periods: [period()] }),
      /not open/
    );
  });

  test('cross-clinic branch and doctor are rejected', async () => {
    await assert.rejects(
      service({ branchBelongsToClinic: async () => false })
        .replaceWeeklySchedule(clinicId, doctorId, { periods: [period()] }),
      ForbiddenError
    );
    await assert.rejects(
      service({ doctorBelongsToClinic: async () => false })
        .getWeeklySchedule(clinicId, doctorId),
      /Doctor not found/
    );
  });

  test('periods outside existing branch opening hours are rejected', async () => {
    await assert.rejects(
      service({
        getBranchWorkingHours: async () => ({
          opens_at: '11:00:00', closes_at: '18:00:00', is_closed: false,
        }),
      }).replaceWeeklySchedule(clinicId, doctorId, { periods: [period()] }),
      /within branch opening/
    );
  });

  test('repository replacement is one transaction and rollback is delegated on failure', async () => {
    const statements = [];
    let rolledBack = false;
    const client = {
      query: async (sql) => {
        statements.push(sql.trim().split(/\s+/).slice(0, 2).join(' '));
        if (sql.includes('INSERT') && statements.filter((value) => value === 'INSERT INTO').length === 2) {
          throw new Error('insert failed');
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const db = {
      transaction: async (callback) => {
        try {
          return await callback(client);
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    };
    const repo = new DoctorWorkingHoursRepository(db);
    await assert.rejects(
      repo.replace(clinicId, doctorId, [
        period(), period({ day_of_week: 1 }),
      ]),
      /insert failed/
    );
    assert.equal(statements[0], 'DELETE FROM');
    assert.equal(rolledBack, true);
  });

  test('read ordering is normalized by day then time', async () => {
    let sql;
    const repo = new DoctorWorkingHoursRepository({
      query: async (statement) => {
        sql = statement;
        return { rows: [] };
      },
    });
    await repo.list(clinicId, doctorId);
    assert.match(sql, /ORDER BY dwh\.day_of_week ASC, dwh\.start_time ASC/);
  });

  test('routes reuse existing doctor permissions', () => {
    const registered = [];
    const app = {
      get: (route, options) => registered.push(['GET', route, options.preHandler]),
      put: (route, options) => registered.push(['PUT', route, options.preHandler]),
    };
    const protect = (permission) => [`protected:${permission}`];
    registerRoutes(app, {
      getWeeklySchedule() {},
      replaceWeeklySchedule() {},
    }, protect);
    assert.deepEqual(registered.map(([method, , hooks]) => [method, hooks[0]]), [
      ['GET', 'protected:doctor:view'],
      ['PUT', 'protected:doctor:update'],
    ]);
  });

  test('availability repository selects the period containing the requested time and branch', async () => {
    let captured;
    const repo = new DoctorRepository({
      query: async (sql, values) => {
        captured = { sql, values };
        return { rows: [{ matches_requested_time: true }] };
      },
    });
    await repo.getWorkingHours(clinicId, doctorId, branchTwo, 0, '17:30:00', '18:00:00');
    assert.match(captured.sql, /dwh\.branch_id = \$3/);
    assert.match(captured.sql, /dwh\.start_time <= \$5/);
    assert.match(captured.sql, /ORDER BY matches_requested_time DESC/);
    assert.deepEqual(captured.values, [
      clinicId, doctorId, branchTwo, 0, '17:30:00', '18:00:00',
    ]);
  });

  test('availability evaluates the requested branch period before existing time-off and conflict rules', async () => {
    let workingHoursArgs;
    const availability = new AvailabilityService({
      clinics: {
        findById: async () => ({ is_active: true, timezone: 'UTC' }),
        findHoliday: async () => null,
        findBranchWorkingHours: async () => ({
          opens_at: '08:00:00', closes_at: '23:00:00', is_closed: false,
        }),
      },
      doctors: {
        getWorkingHours: async (...args) => {
          workingHoursArgs = args;
          return {
            start_time: '17:00:00',
            end_time: '22:00:00',
            matches_requested_time: true,
          };
        },
        hasTimeOff: async () => false,
      },
      rooms: {
        findActiveById: async () => ({ id: branchTwo }),
        hasTimeOff: async () => false,
      },
      appointments: {
        hasDoctorConflict: async () => false,
        hasRoomConflict: async () => false,
      },
    });

    const result = await availability.checkAppointmentAvailability({
      clinic_id: clinicId,
      branch_id: branchTwo,
      doctor_id: doctorId,
      room_id: '00000000-0000-0000-0000-000000000005',
      appointment_start: '2026-07-26T17:30:00.000Z',
      appointment_end: '2026-07-26T18:00:00.000Z',
    });

    assert.equal(result.available, true);
    assert.deepEqual(workingHoursArgs, [
      clinicId, doctorId, branchTwo, 0, '17:30:00', '18:00:00',
    ]);
  });

  test('availability rejects a slot not contained by any period for that branch', async () => {
    const availability = new AvailabilityService({
      clinics: {
        findById: async () => ({ is_active: true, timezone: 'UTC' }),
        findHoliday: async () => null,
        findBranchWorkingHours: async () => ({
          opens_at: '08:00:00', closes_at: '23:00:00', is_closed: false,
        }),
      },
      doctors: {
        getWorkingHours: async () => ({
          start_time: '10:00:00',
          end_time: '14:00:00',
          matches_requested_time: false,
        }),
      },
    });
    const result = await availability.checkAppointmentAvailability({
      clinic_id: clinicId,
      branch_id: branchTwo,
      doctor_id: doctorId,
      room_id: '00000000-0000-0000-0000-000000000005',
      appointment_start: '2026-07-26T17:30:00.000Z',
      appointment_end: '2026-07-26T18:00:00.000Z',
    });
    assert.equal(result.available, false);
    assert.equal(result.reason, 'outside_doctor_working_hours');
  });

  test('frontend provides seven-day editing, Quick Apply conflict choices, and one atomic save', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'geniusbot-dashboard', 'src', 'pages', 'master-data', 'DoctorWorkingHoursPage.tsx'),
      'utf8'
    );
    assert.match(source, /const days = \['Sunday'.*'Saturday'\]/);
    assert.match(source, /Quick Apply/);
    assert.match(source, />Replace</);
    assert.match(source, />Add</);
    assert.match(source, />Cancel</);
    assert.match(source, /Save Weekly Schedule/);
    assert.match(source, /replaceDoctorWorkingHours/);
    assert.match(source, /Working periods cannot overlap/);
    assert.match(source, /Not Working/);
  });
});
