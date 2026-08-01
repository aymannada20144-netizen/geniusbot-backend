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
      ['confirmation', 'day_before', 'same_day']
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
      'confirmation',
      'day_before',
      'same_day',
    ]);
  });

  test('marks successful and failed deliveries deterministically', async () => {
    const states = [];
    const contexts = new Map([
      ['one', {
        recipient: '966500000001',
        appointment_start: '2026-08-04T09:00:00.000Z',
      }],
      ['two', {
        recipient: '966500000002',
        appointment_start: '2026-08-04T10:00:00.000Z',
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
      async (recipient) => {
        if (recipient.endsWith('2')) throw new Error('transport failed');
      }
    );

    const result = await service.processDue();
    assert.deepEqual(states, ['sent:one', 'failed:two']);
    assert.deepEqual(
      result.map(({ id, sent }) => ({ id, sent })),
      [{ id: 'one', sent: true }, { id: 'two', sent: false }]
    );
  });
});
