'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const AppointmentService = require('../../src/modules/appointments/AppointmentService');

const clinicId = '00000000-0000-0000-0000-000000000001';
const appointmentId = '00000000-0000-0000-0000-000000000002';

function harness(sendResult = { success: true }) {
  let status = 'checked_in';
  const sends = [];
  const schedules = [];
  const repository = {
    findByIdAndClinic: async () => ({ id: appointmentId, status }),
    updateStatus: async (clinic, id, next) => {
      status = next;
      return { id, status };
    },
    findPresentationById: async () => ({
      id: appointmentId,
      clinic_id: clinicId,
      patient_id: '00000000-0000-0000-0000-000000000003',
      patient_phone: '966500000001',
      patient_name: 'Test Patient',
      clinic_name: 'Test Clinic',
      doctor_name: 'Dr Test',
      review_url: 'https://maps.google.com/test',
    }),
  };
  const service = new AppointmentService(
    repository,
    {
      send: async (type, payload) => {
        sends.push({ type, payload });
        return sendResult;
      },
    },
    {
      scheduleFollowup: async (...args) => {
        schedules.push(args);
        return { id: 'followup-1' };
      },
    },
    { googleReviewDelayMinutes: 1 }
  );
  return { service, sends, schedules };
}

test('completed schedules followup once', async () => {
  const { service, sends, schedules } = harness();
  const first = await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'completed'
  );
  const second = await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'completed'
  );

  assert.equal(first.status, 'completed');
  assert.equal(first.communication.success, true);
  assert.equal(first.communication.status, 'scheduled');
  assert.equal(sends.length, 0);
  assert.equal(schedules.length, 1);
  assert.equal(second.communication.status, 'not_required');
});

test('failed followup scheduling does not undo completed', async () => {
  const { service } = harness();
  service.notificationService.scheduleFollowup = async () => {
    throw new Error('database failed');
  };
  const result = await service.updateAppointmentStatus(
    clinicId,
    appointmentId,
    'completed'
  );
  assert.equal(result.status, 'completed');
  assert.equal(result.communication.success, false);
});
