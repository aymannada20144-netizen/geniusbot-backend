'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const NotificationService = require(
  '../../src/services/NotificationService'
);

const APPOINTMENT_ID = '00000000-0000-0000-0000-000000000001';

describe('NotificationService', () => {
  test('schedules only approved lifecycle reminder types', async () => {
    const scheduled = [];
    const repository = {
      scheduleReminder: async (input) => {
        scheduled.push(input);
        return input;
      },
    };
    const service = new NotificationService(repository);
    await service.scheduleAppointmentLifecycle({
      id: APPOINTMENT_ID,
      appointment_start: '2026-08-04T09:00:00.000Z',
    });

    assert.deepEqual(
      scheduled.map((item) => item.reminderType),
      ['day_before', 'same_day']
    );
  });

  test('cancels old reminders before rescheduling', async () => {
    const events = [];
    const repository = {
      cancelPendingByAppointment: async () => {
        events.push('cancel');
        return [];
      },
      scheduleReminder: async ({ reminderType }) => {
        events.push(reminderType);
        return {};
      },
    };
    const service = new NotificationService(repository);
    await service.rescheduleAppointmentNotifications({
      id: APPOINTMENT_ID,
      appointment_start: '2026-08-04T09:00:00.000Z',
    });
    assert.deepEqual(events, [
      'cancel',
      'day_before',
      'same_day',
    ]);
  });

  test('marks successful and failed deliveries deterministically', async () => {
    const states = [];
    const sends = [];
    const baseContext = {
      patient_name: 'Test Patient',
      service_name: 'Dermatology',
      doctor_name: 'Dr Test',
      branch_name: 'Main Branch',
      appointment_start: '2026-08-06T11:00:00.000Z',
      appointment_reference: 'APT-1001',
      appointment_id: APPOINTMENT_ID,
      patient_id: '00000000-0000-0000-0000-000000000002',
      clinic_id: '00000000-0000-0000-0000-000000000003',
      clinic_timezone: 'Asia/Riyadh',
    };
    const contexts = new Map([
      ['one', {
        ...baseContext,
        recipient: '966500000001',
      }],
      ['two', {
        ...baseContext,
        recipient: '966500000002',
      }],
    ]);
    const repository = {
      claimDue: async () => [{ id: 'one' }, { id: 'two' }],
      loadDeliveryContext: async (id) => contexts.get(id),
      markSent: async (id) => states.push(`sent:${id}`),
      markFailed: async (id) => states.push(`failed:${id}`),
    };
    const service = new NotificationService(
      repository,
      {
        send: async (messageType, payload) => {
          sends.push({ messageType, payload });
          return payload.phone.endsWith('2')
            ? { success: false, error: { code: 'META_400' } }
            : { success: true };
        },
      }
    );

    const result = await service.processDue();
    assert.deepEqual(states, ['sent:one', 'failed:two']);
    assert.deepEqual(
      result.map(({ id, sent }) => ({ id, sent })),
      [{ id: 'one', sent: true }, { id: 'two', sent: false }]
    );
    assert.equal(sends[0].messageType, 'appointment_reminder');
    assert.deepEqual(sends[0].payload, {
      phone: '966500000001',
      patientName: 'Test Patient',
      serviceName: 'Dermatology',
      doctorName: 'Dr Test',
      branchName: 'Main Branch',
      appointmentDate: 'الخميس 6 أغسطس 2026',
      appointmentTime: '02:00 مساءً',
      appointmentNumber: 'APT-1001',
      appointmentId: APPOINTMENT_ID,
      patientId: '00000000-0000-0000-0000-000000000002',
      clinicId: '00000000-0000-0000-0000-000000000003',
    });
    assert.equal(result[1].errorCode, 'META_400');
  });

  test('marks a reminder failed when communication throws', async () => {
    const states = [];
    const repository = {
      claimDue: async () => [{ id: 'one' }],
      loadDeliveryContext: async () => ({
        recipient: '966500000001',
        patient_name: 'Test Patient',
        service_name: 'Dermatology',
        doctor_name: 'Dr Test',
        branch_name: 'Main Branch',
        appointment_start: '2026-08-06T11:00:00.000Z',
        appointment_reference: 'APT-1001',
        appointment_id: APPOINTMENT_ID,
        patient_id: '00000000-0000-0000-0000-000000000002',
        clinic_id: '00000000-0000-0000-0000-000000000003',
        clinic_timezone: 'Asia/Riyadh',
      }),
      markSent: async (id) => states.push(`sent:${id}`),
      markFailed: async (id) => states.push(`failed:${id}`),
    };
    const service = new NotificationService(repository, {
      send: async () => {
        const error = new Error('transport failed');
        error.code = 'WHATSAPP_NETWORK_ERROR';
        throw error;
      },
    });

    const result = await service.processDue();

    assert.deepEqual(states, ['failed:one']);
    assert.equal(result[0].sent, false);
    assert.equal(result[0].errorCode, 'WHATSAPP_NETWORK_ERROR');
  });

  test('does not send when the reminder recipient is missing', async () => {
    let sends = 0;
    const states = [];
    const repository = {
      claimDue: async () => [{ id: 'one' }],
      loadDeliveryContext: async () => ({ recipient: null }),
      markFailed: async (id) => states.push(`failed:${id}`),
    };
    const service = new NotificationService(repository, {
      send: async () => {
        sends += 1;
        return { success: true };
      },
    });

    const result = await service.processDue();

    assert.equal(sends, 0);
    assert.deepEqual(states, ['failed:one']);
    assert.equal(result[0].errorCode, 'REMINDER_RECIPIENT_MISSING');
  });

  test('does not send when required delivery context is incomplete', async () => {
    let sends = 0;
    const states = [];
    const repository = {
      claimDue: async () => [{ id: 'one' }],
      loadDeliveryContext: async () => ({
        recipient: '966500000001',
        patient_name: 'Test Patient',
        service_name: 'Dermatology',
        doctor_name: null,
        branch_name: 'Main Branch',
        appointment_start: '2026-08-06T11:00:00.000Z',
        appointment_reference: 'APT-1001',
        appointment_id: APPOINTMENT_ID,
        patient_id: '00000000-0000-0000-0000-000000000002',
        clinic_id: '00000000-0000-0000-0000-000000000003',
        clinic_timezone: 'Asia/Riyadh',
      }),
      markFailed: async (id) => states.push(`failed:${id}`),
    };
    const service = new NotificationService(repository, {
      send: async () => {
        sends += 1;
        return { success: true };
      },
    });

    const result = await service.processDue();

    assert.equal(sends, 0);
    assert.deepEqual(states, ['failed:one']);
    assert.equal(result[0].errorCode, 'REMINDER_CONTEXT_INCOMPLETE');
  });

  test('sends due google_review through the communication pipeline', async () => {
    const sends = [];
    const states = [];
    const repository = {
      claimDue: async () => [{ id: 'review', reminder_type: 'google_review' }],
      loadDeliveryContext: async () => ({
        recipient: '966500000001',
        patient_name: 'Test Patient',
        service_name: 'Dermatology',
        doctor_name: 'Dr Test',
        branch_name: 'Main Branch',
        clinic_name: 'Test Clinic',
        review_url: 'https://maps.google.com/test',
        appointment_start: '2026-08-06T11:00:00.000Z',
        appointment_reference: 'APT-1001',
        appointment_id: APPOINTMENT_ID,
        patient_id: '00000000-0000-0000-0000-000000000002',
        clinic_id: '00000000-0000-0000-0000-000000000003',
        clinic_timezone: 'Asia/Riyadh',
      }),
      markSent: async (id) => states.push(`sent:${id}`),
      markFailed: async (id) => states.push(`failed:${id}`),
    };
    const service = new NotificationService(repository, {
      send: async (type, payload) => {
        sends.push({ type, payload });
        return { success: true };
      },
    });
    await service.processDue();
    assert.equal(sends[0].type, 'google_review');
    assert.equal(sends[0].payload.reviewUrl, 'https://maps.google.com/test');
    assert.deepEqual(states, ['sent:review']);
  });

  test('sends due followup as thank_you then schedules google_review', async () => {
    const sends = [];
    const states = [];
    const scheduled = [];
    const repository = {
      claimDue: async () => [{ id: 'followup', reminder_type: 'followup' }],
      loadDeliveryContext: async () => ({
        recipient: '966500000001',
        patient_name: 'Test Patient',
        service_name: 'Dermatology',
        doctor_name: 'Dr Test',
        branch_name: 'Main Branch',
        clinic_name: 'Test Clinic',
        review_url: 'https://maps.google.com/test',
        appointment_start: '2026-08-06T11:00:00.000Z',
        appointment_reference: 'APT-1001',
        appointment_id: APPOINTMENT_ID,
        patient_id: '00000000-0000-0000-0000-000000000002',
        clinic_id: '00000000-0000-0000-0000-000000000003',
        clinic_timezone: 'Asia/Riyadh',
      }),
      markSent: async (id) => states.push(`sent:${id}`),
      markFailed: async (id) => states.push(`failed:${id}`),
      scheduleReminder: async (input) => {
        scheduled.push(input);
        return { id: 'review' };
      },
    };
    const service = new NotificationService(repository, {
      send: async (type, payload) => {
        sends.push({ type, payload });
        return { success: true };
      },
    }, { googleReviewDelayMinutes: 1 });
    await service.processDue();
    assert.equal(sends[0].type, 'thank_you');
    assert.equal(sends[0].payload.appointmentNumber, 'APT-1001');
    assert.deepEqual(states, ['sent:followup']);
    assert.equal(scheduled[0].reminderType, 'google_review');
  });
});
