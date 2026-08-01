'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
process.env.JWT_ACCESS_SECRET ||= 'reports-tests-only-secret-with-32-characters';
const ReportsService = require('../../src/modules/reports/ReportsService');
const registerReportsRoutes = require('../../src/modules/reports/ReportsRoutes');

const clinicId = '00000000-0000-0000-0000-000000000001';
const branchId = '00000000-0000-0000-0000-000000000002';

function repository(overrides = {}) {
  return {
    getClinicTimezone: async () => 'Asia/Riyadh',
    resourceBelongsToClinic: async () => true,
    getAppointmentSummary: async () => ({
      total: 0, pending: 0, confirmed: 0, checked_in: 0, completed: 0,
      cancelled: 0, no_show: 0, rescheduled: 2,
    }),
    getAppointmentTrend: async () => [],
    getAppointmentBreakdown: async () => [],
    getPatientSummary: async () => ({
      new_patient_records: 1, patients_with_appointments: 2,
      first_time_booked_patients: 1, returning_booked_patients: 1,
    }),
    getConversationSummary: async () => ({
      total_conversations: 3, human_takeovers: 1,
      ai_present_conversations: 2,
    }),
    ...overrides,
  };
}

describe('Reports V1 service', () => {
  test('returns null rates and keeps rescheduled outside total', async () => {
    const result = await new ReportsService(repository()).appointmentSummary(
      clinicId, { from: '2026-07-01', to: '2026-07-01' }, { role: 'owner' }
    );
    assert.equal(result.data.total, 0);
    assert.equal(result.data.rescheduled, 2);
    assert.equal(result.data.checkedIn, 0);
    assert.equal(result.data.completionRate, null);
  });

  test('rejects invalid, excessive, reversed and unknown date queries', async () => {
    const service = new ReportsService(repository());
    for (const query of [
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-08-01', to: '2026-07-01' },
      { from: '2024-01-01', to: '2026-01-01' },
      { from: '2026-07-01', to: '2026-07-02', surprise: 'yes' },
    ]) {
      await assert.rejects(
        service.appointmentSummary(clinicId, query, { role: 'owner' })
      );
    }
  });

  test('forces branch manager scope and rejects another branch', async () => {
    let received;
    const service = new ReportsService(repository({
      getAppointmentSummary: async (_clinic, _timezone, filters) => {
        received = filters;
        return {
          total: 1, pending: 1, confirmed: 0, checked_in: 0, completed: 0,
          cancelled: 0, no_show: 0, rescheduled: 0,
        };
      },
    }));
    await service.appointmentSummary(
      clinicId, { from: '2026-07-01', to: '2026-07-02' },
      { role: 'branch_manager', branchId }
    );
    assert.equal(received.branchId, branchId);
    await assert.rejects(
      service.appointmentSummary(
        clinicId,
        {
          from: '2026-07-01', to: '2026-07-02',
          branchId: '00000000-0000-0000-0000-000000000099',
        },
        { role: 'branch_manager', branchId }
      ),
      /assigned branch/
    );
  });

  test('accepts checked_in filters and maps checked-in operational counts', async () => {
    const service = new ReportsService(repository({
      getAppointmentSummary: async () => ({
        total: 2, pending: 0, confirmed: 0, checked_in: 2,
        completed: 0, cancelled: 0, no_show: 0, rescheduled: 0,
      }),
    }));
    const result = await service.appointmentSummary(
      clinicId,
      { from: '2026-07-01', to: '2026-07-02', status: 'checked_in' },
      { role: 'owner' }
    );
    assert.equal(result.data.checkedIn, 2);
    assert.equal(result.meta.filters.status, 'checked_in');
  });

  test('rejects a branch manager without a branch', async () => {
    await assert.rejects(
      new ReportsService(repository()).appointmentSummary(
        clinicId, { from: '2026-07-01', to: '2026-07-02' },
        { role: 'branch_manager', branchId: null }
      ),
      /must be assigned/
    );
  });

  test('validates ownership and groupBy allowlists', async () => {
    const service = new ReportsService(repository({
      resourceBelongsToClinic: async () => false,
    }));
    await assert.rejects(
      service.appointmentSummary(
        clinicId,
        { from: '2026-07-01', to: '2026-07-02', branchId },
        { role: 'owner' }
      ),
      /does not belong/
    );
    await assert.rejects(
      new ReportsService(repository()).appointmentTrend(
        clinicId,
        { from: '2026-07-01', to: '2026-07-02', groupBy: 'month' },
        { role: 'owner' }
      )
    );
  });

  test('maps patient and conversation summaries without PII', async () => {
    const service = new ReportsService(repository());
    const query = { from: '2026-07-01', to: '2026-07-02' };
    const patients = await service.patientSummary(clinicId, query, { role: 'owner' });
    const conversations = await service.conversationSummary(clinicId, query, { role: 'owner' });
    assert.deepEqual(patients.data, {
      newPatientRecords: 1,
      patientsWithAppointments: 2,
      firstTimeBookedPatients: 1,
      returningBookedPatients: 1,
    });
    assert.deepEqual(conversations.data, {
      totalConversations: 3,
      humanTakeovers: 1,
      aiPresentConversations: 2,
    });
    assert.equal(JSON.stringify({ patients, conversations }).includes('phone'), false);
  });

  test('registers all five routes with operational report permission', () => {
    const routes = [];
    const app = {
      get(path, options) {
        routes.push({ path, options });
      },
    };
    const permissions = [];
    const protect = (permission) => {
      permissions.push(permission);
      return ['protected'];
    };
    const handler = async () => {};
    registerReportsRoutes(app, {
      summary: handler, trend: handler, breakdown: handler,
      patients: handler, conversations: handler,
    }, protect);
    assert.equal(routes.length, 5);
    assert.deepEqual(permissions, ['report:view_operational']);
    assert.ok(routes.every((route) => route.options.preHandler[0] === 'protected'));
  });
});
