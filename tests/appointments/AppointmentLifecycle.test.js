'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const AppointmentService = require('../../src/modules/appointments/AppointmentService');
const AppointmentRepository = require(
  '../../src/modules/appointments/AppointmentRepository'
);
const {
  validateAppointmentTransition,
} = require('../../src/modules/appointments/appointmentLifecycle');

const clinicId = '00000000-0000-0000-0000-000000000001';
const appointmentId = '00000000-0000-0000-0000-000000000002';
const root = path.resolve(__dirname, '../..');

describe('Appointment lifecycle v1', () => {
  test('allows only the approved lifecycle transitions', () => {
    for (const [from, to] of [
      ['pending', 'confirmed'],
      ['confirmed', 'checked_in'],
      ['checked_in', 'completed'],
      ['pending', 'cancelled'],
      ['pending', 'rescheduled'],
      ['confirmed', 'cancelled'],
      ['confirmed', 'rescheduled'],
      ['confirmed', 'no_show'],
      ['checked_in', 'cancelled'],
    ]) assert.doesNotThrow(() => validateAppointmentTransition(from, to));

    for (const [from, to] of [
      ['pending', 'completed'],
      ['pending', 'checked_in'],
      ['confirmed', 'completed'],
      ['completed', 'confirmed'],
      ['completed', 'pending'],
      ['cancelled', 'confirmed'],
      ['no_show', 'confirmed'],
    ]) assert.throws(
      () => validateAppointmentTransition(from, to),
      /transition is not allowed/
    );
  });

  test('appointment API service persists checked_in then completed', async () => {
    let currentStatus = 'confirmed';
    const repository = {
      findByIdAndClinic: async () => ({ id: appointmentId, status: currentStatus }),
      updateStatus: async (_clinicId, id, status) => {
        currentStatus = status;
        return { id, status };
      },
    };
    const service = new AppointmentService(repository);
    assert.equal(
      (await service.updateAppointmentStatus(clinicId, appointmentId, 'checked_in')).status,
      'checked_in'
    );
    assert.equal(
      (await service.updateAppointmentStatus(clinicId, appointmentId, 'completed')).status,
      'completed'
    );
  });

  test('cancel and no-show wrappers retain their non-idempotent validation', async () => {
    for (const [method, status] of [
      ['cancelAppointment', 'cancelled'],
      ['markAppointmentAsNoShow', 'no_show'],
    ]) {
      let writes = 0;
      const repository = {
        findByIdAndClinic: async () => ({ id: appointmentId, status }),
        updateStatus: async () => {
          writes += 1;
          return { id: appointmentId, status };
        },
      };
      const service = new AppointmentService(repository);

      await assert.rejects(
        service[method](clinicId, appointmentId),
        /transition is not allowed/
      );
      assert.equal(writes, 0);
    }
  });

  test('only the cancellation entry point applies cancellation notes', async () => {
    const calls = [];
    const repository = new AppointmentRepository({
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    });

    await repository.updateStatus(
      clinicId,
      appointmentId,
      'cancelled',
      'pending',
      null,
      true
    );
    await repository.updateStatus(
      clinicId,
      appointmentId,
      'cancelled',
      'pending'
    );

    assert.deepEqual(calls[0].params, [
      clinicId,
      appointmentId,
      'cancelled',
      'pending',
      null,
      true,
    ]);
    assert.deepEqual(calls[1].params, [
      clinicId,
      appointmentId,
      'cancelled',
      'pending',
      null,
      false,
    ]);
    assert.match(calls[0].sql, /WHEN \$3 = 'cancelled' AND \$6::boolean THEN \$5/);
  });

  test('database constraints, transition trigger, and existing history trigger support checked_in', () => {
    const constraints = fs.readFileSync(path.join(root, 'database/schema/004_constraints.sql'), 'utf8');
    const functions = fs.readFileSync(path.join(root, 'database/schema/005_functions.sql'), 'utf8');
    const triggers = fs.readFileSync(path.join(root, 'database/schema/006_triggers.sql'), 'utf8');
    assert.match(constraints, /''checked_in''/);
    assert.match(functions, /OLD\.status = 'checked_in'/);
    assert.match(functions, /OLD\.status = 'confirmed'[\s\S]*?'checked_in'/);
    assert.match(triggers, /log_appointment_status_change/);
  });

  test('dashboard exposes only status-appropriate buttons, badge, counters, and API values', () => {
    const page = fs.readFileSync(path.join(root, 'geniusbot-dashboard/src/pages/dashboard/AppointmentsPage.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'geniusbot-dashboard/src/pages/dashboard/AppointmentsPage.css'), 'utf8');
    const api = fs.readFileSync(path.join(root, 'geniusbot-dashboard/src/api/appointmentsApi.ts'), 'utf8');
    assert.match(page, /checked_in: 'Checked In'/);
    assert.match(page, /canCheckIn = appointment\.status === 'confirmed'/);
    assert.match(page, /canComplete = appointment\.status === 'checked_in'/);
    assert.match(page, /checkedIn: filteredAppointments\.filter/);
    assert.match(css, /appointment-status--checked_in/);
    assert.match(api, /\| 'checked_in'/);
  });
});
