'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const NotificationService = require('../../src/services/NotificationService');
const NotificationRepository = require('../../src/repositories/NotificationRepository');
const MessageFactory = require('../../src/communication/factories/MessageFactory');
const MessageTypes = require('../../src/communication/types/MessageTypes');

const appointmentId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const clinicId = '33333333-3333-4333-8333-333333333333';

function context() {
  return {
    reminder_type: 'cancellation',
    appointment_status: 'cancelled',
    recipient: '+966 50 123 4567',
    patient_name: 'Patient',
    service_name: 'خدمة الليزر',
    doctor_name: null,
    branch_name: 'فرع الرياض',
    room_number: null,
    appointment_start: '2026-08-20T08:00:00.000Z',
    appointment_reference: '25DD4527',
    appointment_id: appointmentId,
    patient_id: patientId,
    clinic_id: clinicId,
    clinic_timezone: 'Asia/Riyadh',
    inbound_sender: '966599999999',
    submitted_mobile: '966588888888',
  };
}

test('immediate cancellation uses authoritative context and exact template contract', async () => {
  const states = [];
  const sends = [];
  const service = new NotificationService({
    scheduleCancellation: async () => ({ id: 'cancel-1' }),
    claimCancellation: async () => ({ id: 'cancel-1', reminder_type: 'cancellation' }),
    loadDeliveryContext: async () => context(),
    markSent: async (id) => states.push(`sent:${id}`),
  }, {
    send: async (type, payload) => {
      sends.push({ type, payload });
      return { success: true };
    },
  });

  const result = await service.sendCancellationConfirmation(appointmentId);

  assert.equal(result.status, 'sent');
  assert.deepEqual(states, ['sent:cancel-1']);
  assert.equal(sends[0].type, MessageTypes.APPOINTMENT_CANCELLED);
  assert.equal(sends[0].payload.phone, '966501234567');
  assert.equal(sends[0].payload.patientName, 'Patient');
  assert.equal(sends[0].payload.appointmentNumber, '25DD4527');
  assert.deepEqual(Object.keys(sends[0].payload), [
    'phone', 'patientName', 'appointmentNumber', 'serviceName',
    'branchName', 'appointmentDate', 'appointmentTime', 'appointmentId',
    'patientId', 'clinicId',
  ]);

  const message = MessageFactory.build(sends[0].type, sends[0].payload);
  assert.equal(message.template.name, 'appointment_cancelled');
  assert.equal(message.template.language, 'ar');
  assert.deepEqual(Object.keys(message.template.variables), [
    'patientName', 'appointmentNumber', 'serviceName', 'branchName',
    'appointmentDate', 'appointmentTime',
  ]);
  assert.equal(Object.keys(message.template.variables).length, 6);
  assert.equal(Object.hasOwn(message.template.variables, 'cancellationReason'), false);
});

test('failed immediate cancellation delivery remains pending for scheduler recovery', async () => {
  const states = [];
  let sends = 0;
  const repository = {
    scheduleCancellation: async () => ({ id: 'cancel-1' }),
    claimCancellation: async () => ({ id: 'cancel-1', reminder_type: 'cancellation' }),
    loadDeliveryContext: async () => context(),
    releaseForRetry: async (id) => states.push(`pending:${id}`),
    markSent: async (id) => states.push(`sent:${id}`),
    claimDue: async () => [{ id: 'cancel-1', reminder_type: 'cancellation' }],
  };
  const service = new NotificationService(repository, {
    send: async () => {
      sends += 1;
      return sends === 1
        ? { success: false, error: { code: 'META_503', retryable: true } }
        : { success: true };
    },
  });

  const immediate = await service.sendCancellationConfirmation(appointmentId);
  assert.equal(immediate.status, 'pending_retry');
  const recovered = await service.processDue();
  assert.equal(recovered[0].status, 'sent');
  assert.deepEqual(states, ['pending:cancel-1', 'sent:cancel-1']);
  assert.equal(sends, 2);
});

test('existing cancellation record prevents another immediate send', async () => {
  let sends = 0;
  const service = new NotificationService({
    scheduleCancellation: async () => null,
  }, {
    send: async () => { sends += 1; },
  });
  const result = await service.sendCancellationConfirmation(appointmentId);
  assert.equal(result.status, 'already_scheduled');
  assert.equal(sends, 0);
});

test('missing authoritative identity fields fail safely and remain recoverable', async () => {
  const states = [];
  let sends = 0;
  const service = new NotificationService({
    scheduleCancellation: async () => ({ id: 'cancel-1' }),
    claimCancellation: async () => ({ id: 'cancel-1', reminder_type: 'cancellation' }),
    loadDeliveryContext: async () => ({
      ...context(),
      patient_name: null,
      appointment_reference: null,
    }),
    releaseForRetry: async (id) => states.push(`pending:${id}`),
  }, {
    send: async () => { sends += 1; },
  });

  const result = await service.sendCancellationConfirmation(appointmentId);
  assert.equal(result.status, 'pending_retry');
  assert.equal(sends, 0);
  assert.deepEqual(states, ['pending:cancel-1']);
});

test('repository cancellation scheduling preserves sent rows on conflict', async () => {
  let sql;
  const repository = new NotificationRepository({
    query: async (statement) => {
      sql = statement;
      return { rows: [] };
    },
  });
  await repository.scheduleCancellation(appointmentId);
  assert.match(sql, /ON CONFLICT \(appointment_id, reminder_type\) DO NOTHING/);
  assert.doesNotMatch(sql, /status = 'pending'[\s\S]*DO UPDATE/);
});
