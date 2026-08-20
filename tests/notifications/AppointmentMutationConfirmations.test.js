'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const AppointmentController = require(
  '../../src/modules/appointments/AppointmentController'
);
const AppointmentService = require(
  '../../src/modules/appointments/AppointmentService'
);
const NotificationService = require('../../src/services/NotificationService');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const MessageFactory = require('../../src/communication/factories/MessageFactory');
const MessageTypes = require('../../src/communication/types/MessageTypes');

const IDS = Object.freeze({
  clinic: '11111111-1111-4111-8111-111111111111',
  appointment: '22222222-2222-4222-8222-222222222222',
  patient: '33333333-3333-4333-8333-333333333333',
  service: '44444444-4444-4444-8444-444444444444',
  branch: '55555555-5555-4555-8555-555555555555',
  doctor: '66666666-6666-4666-8666-666666666666',
  room: '77777777-7777-4777-8777-777777777777',
  conversation: '88888888-8888-4888-8888-888888888888',
});
const OLD_START = '2026-08-20T08:00:00.000Z';
const OLD_END = '2026-08-20T08:30:00.000Z';
const NEW_START = '2026-08-25T11:40:00.000Z';
const NEW_END = '2026-08-25T12:10:00.000Z';

test('appointment_rescheduled defaults to English and allows an explicit override', () => {
  const payload = {
    phone: '966501234567',
    patientName: 'Noura',
    appointmentNumber: '25DD4527',
    serviceName: 'Laser',
    branchName: 'Al Hamdaniyah',
    appointmentDate: '25 August 2026',
    appointmentTime: '02:40 PM',
    appointmentId: IDS.appointment,
    patientId: IDS.patient,
    clinicId: IDS.clinic,
  };

  const defaultMessage = MessageFactory.build(
    MessageTypes.APPOINTMENT_RESCHEDULED,
    payload
  );
  const overriddenMessage = MessageFactory.build(
    MessageTypes.APPOINTMENT_RESCHEDULED,
    { ...payload, language: 'ar' }
  );

  assert.equal(defaultMessage.template.language, 'en');
  assert.equal(overriddenMessage.template.language, 'ar');
});

function appointment(status = 'confirmed') {
  return {
    id: IDS.appointment,
    clinic_id: IDS.clinic,
    patient_id: IDS.patient,
    service_id: IDS.service,
    branch_id: IDS.branch,
    doctor_id: IDS.doctor,
    room_id: IDS.room,
    booking_reference: '25DD4527',
    service_name: 'خدمة الليزر',
    branch_name: 'فرع الحمدانية',
    appointment_start: OLD_START,
    appointment_end: OLD_END,
    status,
    updated_at: '2026-08-12T08:00:00.000Z',
  };
}

function createHarness({ mutationError = null, deliveryFails = false } = {}) {
  let current = appointment();
  const sends = [];
  const mutationCalls = [];
  const repository = {
    async findByIdAndClinic() { return current; },
    async findFutureForManagementByPatient() { return [current]; },
    async findByBookingReference() { return current; },
    async findPresentationById() {
      return {
        ...current,
        patient_phone: '0501234567',
      };
    },
    async hasDoctorConflict() { return false; },
    async hasRoomConflict() { return false; },
    async applyAtomicChange(input) {
      mutationCalls.push(input);
      if (mutationError) throw mutationError;
      current = {
        ...current,
        ...input.patch,
        updated_at: '2026-08-12T09:00:00.000Z',
      };
      return { appointment: current };
    },
  };
  const notificationRepository = {
    async cancelPendingByAppointment() { return []; },
    async scheduleReminder(input) { return input; },
    async loadAppointmentDeliveryContext() {
      return {
        appointment_id: current.id,
        clinic_id: current.clinic_id,
        appointment_status: current.status,
        appointment_reference: current.booking_reference,
        appointment_start: current.appointment_start,
        patient_id: current.patient_id,
        patient_name: 'نورة',
        recipient: '0501234567',
        service_name: current.service_name,
        branch_name: current.branch_name,
        clinic_timezone: 'Asia/Riyadh',
      };
    },
    async scheduleCancellation() { return { id: 'cancel-1' }; },
    async claimCancellation() {
      return { id: 'cancel-1', reminder_type: 'cancellation' };
    },
    async loadDeliveryContext() {
      return {
        reminder_type: 'cancellation',
        appointment_status: current.status,
        appointment_id: current.id,
        clinic_id: current.clinic_id,
        appointment_reference: current.booking_reference,
        appointment_start: current.appointment_start,
        patient_id: current.patient_id,
        patient_name: 'نورة',
        recipient: '0501234567',
        service_name: current.service_name,
        doctor_name: null,
        branch_name: current.branch_name,
        room_number: null,
        clinic_timezone: 'Asia/Riyadh',
      };
    },
    async markSent() {},
    async releaseForRetry() {},
  };
  const notificationService = new NotificationService(
    notificationRepository,
    {
      async send(type, payload) {
        sends.push({ type, payload });
        return deliveryFails
          ? { success: false, error: { code: 'META_503', retryable: true } }
          : { success: true, transportResult: { messageId: 'wamid-1' } };
      },
    }
  );
  const service = new AppointmentService(repository, null, notificationService, {
    bookingService: {
      async getAvailableDates() { return { success: true, dates: ['2026-08-25'] }; },
      async getAvailableTimes() { return { success: true, times: ['14:40'] }; },
    },
  });
  return { service, sends, mutationCalls, current: () => current };
}

test('dashboard reschedule sends exactly one new committed confirmation', async () => {
  const harness = createHarness();
  const controller = new AppointmentController(harness.service);
  const result = await controller.rescheduleAppointment({
    params: { clinicId: IDS.clinic, appointmentId: IDS.appointment },
    body: { appointmentStart: NEW_START, appointmentEnd: NEW_END },
    user: { id: null },
  }, { send: (value) => value });

  assert.equal(result.success, true);
  assert.equal(harness.sends.length, 1);
  assert.equal(harness.sends[0].type, MessageTypes.APPOINTMENT_RESCHEDULED);
  assert.equal(harness.sends[0].payload.appointmentDate, 'الثلاثاء 25 أغسطس 2026');
  assert.equal(harness.sends[0].payload.appointmentTime, '02:40 مساءً');
  assert.equal(harness.current().appointment_start, NEW_START);
  const message = MessageFactory.build(
    harness.sends[0].type,
    harness.sends[0].payload
  );
  assert.equal(message.template.name, 'appointment_rescheduled');
  assert.deepEqual(Object.keys(message.template.variables), [
    'patientName', 'appointmentNumber', 'serviceName', 'branchName',
    'appointmentDate', 'appointmentTime',
  ]);
});

test('Shaden reschedule converges on the same single confirmation sender', async () => {
  const harness = createHarness();
  const engine = new ShadenEngine({
    appointmentService: harness.service,
    bookingEngine: {
      async getAvailableDates() { return { success: true, dates: ['2026-08-25'] }; },
      async getAvailableTimes() { return { success: true, times: ['14:40'] }; },
    },
    clock: { now: () => new Date('2026-08-12T09:00:00.000Z') },
  });
  const result = await runShadenReschedule(engine);

  assert.equal(result.reply, null);
  assert.equal(result.notificationAttempted, true);
  assert.equal(harness.sends.length, 1);
  assert.equal(harness.sends[0].type, MessageTypes.APPOINTMENT_RESCHEDULED);
});

test('failed reschedule mutation sends no confirmation', async () => {
  const error = new Error('database unavailable');
  const harness = createHarness({ mutationError: error });
  await assert.rejects(
    harness.service.rescheduleAppointment(
      IDS.clinic, IDS.appointment, NEW_START, NEW_END
    ),
    error
  );
  assert.equal(harness.sends.length, 0);
});

test('notification failure does not undo a successful reschedule', async () => {
  const harness = createHarness({ deliveryFails: true });
  const result = await harness.service.rescheduleAppointment(
    IDS.clinic, IDS.appointment, NEW_START, NEW_END
  );
  assert.equal(result.appointment_start, NEW_START);
  assert.equal(result.communication.success, false);
  assert.equal(result.communication.status, 'failed');
  assert.equal(harness.mutationCalls.length, 1);
  assert.equal(harness.sends.length, 1);
});

test('Shaden reports notification failure without reporting reschedule failure', async () => {
  const harness = createHarness({ deliveryFails: true });
  const engine = new ShadenEngine({
    appointmentService: harness.service,
    bookingEngine: {
      async getAvailableDates() { return { success: true, dates: ['2026-08-25'] }; },
      async getAvailableTimes() { return { success: true, times: ['14:40'] }; },
    },
    clock: { now: () => new Date('2026-08-12T09:00:00.000Z') },
  });
  const result = await runShadenReschedule(engine);

  assert.match(result.reply, /تم تغيير الموعد بنجاح/u);
  assert.match(result.reply, /تعذر إرسال إشعار التأكيد/u);
  assert.equal(result.notificationAttempted, true);
  assert.equal(result.nextState.reschedule, undefined);
});

test('dashboard cancellation sends exactly one shared cancellation confirmation', async () => {
  const harness = createHarness();
  const controller = new AppointmentController(harness.service);
  const result = await controller.cancelAppointment({
    params: { clinicId: IDS.clinic, appointmentId: IDS.appointment },
    body: { reason: 'طلب المراجع' },
    user: { id: null },
  }, { send: (value) => value });

  assert.equal(result.success, true);
  assert.equal(harness.sends.length, 1);
  assert.equal(harness.sends[0].type, MessageTypes.APPOINTMENT_CANCELLED);
});

test('Shaden cancellation converges on the same single cancellation sender', async () => {
  const harness = createHarness();
  const engine = new ShadenEngine({ appointmentService: harness.service });
  let result = await shadenTurn(engine, null, 'إلغاء موعدي');
  result = await shadenTurn(engine, result.nextState, 'نعم');

  assert.equal(result.reply, null);
  assert.equal(result.notificationAttempted, true);
  assert.equal(harness.sends.length, 1);
  assert.equal(harness.sends[0].type, MessageTypes.APPOINTMENT_CANCELLED);
});

test('failed cancellation sends no confirmation', async () => {
  const error = new Error('database unavailable');
  const harness = createHarness({ mutationError: error });
  await assert.rejects(
    harness.service.cancelAppointment(IDS.clinic, IDS.appointment),
    error
  );
  assert.equal(harness.sends.length, 0);
});

test('notification failure does not undo a successful cancellation', async () => {
  const harness = createHarness({ deliveryFails: true });
  const result = await harness.service.cancelAppointment(
    IDS.clinic, IDS.appointment
  );
  assert.equal(result.status, 'cancelled');
  assert.equal(result.communication.success, false);
  assert.equal(result.communication.status, 'pending_retry');
  assert.equal(harness.mutationCalls.length, 1);
  assert.equal(harness.sends.length, 1);
});

async function runShadenReschedule(engine) {
  let result = await shadenTurn(engine, null, 'اريد تغيير موعدي');
  result = await shadenTurn(engine, result.nextState, '2026-08-25');
  result = await shadenTurn(engine, result.nextState, '14:40');
  return shadenTurn(engine, result.nextState, {
    text: '', rawPayload: { value: 'reschedule-confirm:yes' },
  });
}

function shadenTurn(engine, currentState, message) {
  return engine.handle({
    message,
    currentState,
    clinicData: {},
    bookingContext: { clinicId: IDS.clinic, conversationId: IDS.conversation },
    patientIdentity: { patient: { id: IDS.patient }, customerName: 'نورة' },
  });
}
