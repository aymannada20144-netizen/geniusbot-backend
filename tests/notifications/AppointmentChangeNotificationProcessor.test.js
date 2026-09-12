'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const Processor = require('../../src/services/AppointmentChangeNotificationProcessor');
const NotificationService = require('../../src/services/NotificationService');
const CommunicationService = require('../../src/communication/services/CommunicationService');
const CommunicationJob = require('../../src/communication/jobs/CommunicationJob');
const ProductionTransport = require('../../src/channels/whatsapp/ProductionWhatsAppTransport');
const EventBus = require('../../src/core/events/LocalEventBus');
const OutboxPublisher = require('../../src/core/events/OutboxPublisher');
const AppointmentService = require('../../src/modules/appointments/AppointmentService');
const AppointmentRepository = require('../../src/modules/appointments/AppointmentRepository');
const id = n => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;

function harness() {
  const h = { committed: false, events: [], sends: [], receipts: new Map(), logs: [], metaError: null,
    appointment: { id: id(1), clinic_id: id(2), patient_id: id(3), service_id: id(4), branch_id: id(6),
      status: 'confirmed', updated_at: '2026-09-11T09:00:00.000Z', booking_reference: 'ABC12345',
      appointment_start: '2027-08-20T09:00:00.000Z', appointment_end: '2027-08-20T09:30:00.000Z' } };
  const db = { async transaction(callback) {
    const pending = [];
    let appointment = structuredClone(h.appointment);
    const result = await callback({ async query(sql, args) {
      if (sql.includes('FOR UPDATE')) return { rows: [structuredClone(appointment)] };
      if (sql.includes('UPDATE') && sql.includes('RETURNING *')) {
        const fields = sql.slice(sql.indexOf('SET ') + 4, sql.indexOf(', "updated_at"')).split(', ');
        fields.forEach((field, index) => { appointment[field.split('"')[1]] = args[index]; });
        return { rows: [appointment] };
      }
      if (sql.includes('appointment_change_logs')) return { rows: [{ id: id(9) }] };
      if (sql.includes('outbox_events')) { pending.push({ id: id(10), event_name: args[0], payload: args[2] }); return { rows: [] }; }
      throw new Error('Unexpected transaction query');
    } });
    assert.equal(h.sends.length, 0);
    if (h.failCommit) throw new Error('commit failed');
    h.appointment = appointment; h.events.push(...pending); h.committed = true;
    return result;
  } };
  h.service = new AppointmentService(new AppointmentRepository(db));
  h.service.previewServiceChange = async () => ({
    appointment: h.appointment, assignment: { doctor_id: id(7), room_id: id(8) },
    appointmentStart: '2027-08-20T09:00:00.000Z', appointmentEnd: '2027-08-20T10:00:00.000Z',
    price: { price: '250.00', currency: 'SAR' }, requiresNewSlot: false,
  });
  const deliveries = {
    async claim(key) {
      const old = h.receipts.get(key);
      if (old && !(old.status === 'failed' && old.retryable && old.due)) return null;
      const record = { status: 'processing', attempts: (old?.attempts || 0) + 1 };
      h.receipts.set(key, record); return record;
    },
    async find(key) { return h.receipts.get(key); },
    async markSent(key, wamid) {
      if (h.failReceipt) throw new Error('receipt store offline');
      Object.assign(h.receipts.get(key), { status: 'sent', wamid });
    },
    async markFailed(key, { uncertain, retryable, errorCode }) {
      Object.assign(h.receipts.get(key), { status: uncertain ? 'uncertain' : 'failed', retryable, errorCode });
    },
  };
  const notifications = new NotificationService({
    async loadAppointmentDeliveryContext(appointmentId) {
      assert.equal(h.committed, true); assert.equal(appointmentId, id(1));
      assert.equal(h.appointment.service_id, id(5));
      return { appointment_id: id(1), clinic_id: id(2), patient_id: id(3), recipient: '0501234567',
        patient_name: 'نورة', service_name: 'تقشير كيميائي', branch_name: 'الروضة',
        appointment_reference: h.appointment.booking_reference, appointment_start: h.appointment.appointment_start,
        clinic_timezone: 'Asia/Riyadh' };
    },
  }, new CommunicationService({ job: new CommunicationJob({ maxAttempts: 1,
    transport: new ProductionTransport({ sender: async input => {
      h.sends.push(input);
      if (h.metaError) throw h.metaError;
      return { messageId: 'wamid.test-accepted' };
    } }),
  }) }));
  const processor = new Processor({ deliveryRepository: deliveries, notificationService: notifications,
    logger: { info: e => h.logs.push(e), error: e => h.logs.push(e) } });
  const bus = new EventBus(); bus.subscribe('appointment.changed', (payload, metadata) => processor.process(payload, metadata));
  h.publisher = new OutboxPublisher({ async findUnpublished() { return h.events.filter(e => !e.published); },
    async markPublished(key) { if (h.failPublish) throw new Error('outbox store offline'); h.events.find(e => e.id === key).published = true; },
  }, bus);
  h.change = () => h.service.changeAppointmentService(id(2), id(1), id(5), null,
    { patientId: id(3), source: 'shaden' }, h.appointment.updated_at);
  return h;
}

test('committed service change emits one existing event and one approved template with authoritative variables', async () => {
  const h = harness(); await h.publisher.publishPending(); assert.equal(h.sends.length, 0);
  await h.change(); assert.equal(h.events.length, 1); assert.equal(h.sends.length, 0);
  assert.equal(h.events[0].event_name, 'appointment.changed'); assert.equal(h.events[0].payload.operation, 'change_service');
  assert.equal(h.events[0].payload.after.service_id, id(5));
  await h.publisher.publishPending(); assert.equal(h.sends.length, 1);
  assert.equal(h.sends[0].templateName, 'appointment_rescheduled'); assert.equal(h.sends[0].language, 'en');
  const values = h.sends[0].components[0].parameters.map(p => p.text);
  assert.deepEqual(values.slice(0, 4), ['نورة', 'ABC12345', 'تقشير كيميائي', 'الروضة']);
  assert.equal(values.length, 6); assert.ok(values[4].includes('2027')); assert.ok(values[5].includes('12:00'));
  assert.equal(h.receipts.get(id(10)).wamid, 'wamid.test-accepted'); assert.equal(h.events[0].published, true);
});
test('Meta rejection preserves commit, records retryable failure, and retry sends once without duplicate after success', async () => {
  const h = harness(); await h.change(); h.metaError = Object.assign(new Error('rate limit'), { code: 'RATE_LIMIT', statusCode: 429, retryable: true });
  await h.publisher.publishPending(); assert.equal(h.committed, true); assert.equal(h.appointment.service_id, id(5));
  assert.equal(h.events[0].published, undefined); assert.equal(h.receipts.get(id(10)).status, 'failed');
  assert.equal(h.logs.at(-1).retryable, true); await h.publisher.publishPending(); assert.equal(h.sends.length, 1);
  h.receipts.get(id(10)).due = true; h.metaError = null;
  await h.publisher.publishPending(); await h.publisher.publishPending();
  assert.equal(h.sends.length, 2); assert.equal(h.receipts.get(id(10)).attempts, 2);
});
test('outbox acknowledgement failure and concurrent publishers never repeat accepted delivery', async () => {
  const h = harness(); await h.change(); h.failPublish = true;
  await Promise.all([h.publisher.publishPending(), h.publisher.publishPending()]);
  assert.equal(h.sends.length, 1); h.failPublish = false;
  await h.publisher.publishPending(); assert.equal(h.sends.length, 1); assert.equal(h.events[0].published, true);
});
test('ambiguous network outcome is retained for reconciliation, never blindly retried', async () => {
  const h = harness(); await h.change(); h.metaError = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
  await h.publisher.publishPending(); await h.publisher.publishPending();
  assert.equal(h.receipts.get(id(10)).status, 'uncertain'); assert.equal(h.sends.length, 1);
});
test('receipt persistence failure after Meta acceptance does not resend', async () => {
  const h = harness(); await h.change(); h.failReceipt = true;
  await h.publisher.publishPending(); await h.publisher.publishPending();
  assert.equal(h.receipts.get(id(10)).status, 'processing'); assert.equal(h.sends.length, 1);
});
test('branch, reschedule, cancellation events retain their existing behavior without additional templates', async () => {
  for (const operation of ['change_branch', 'reschedule', 'cancel']) {
    const h = harness(); h.events.push({ id: id(10), event_name: 'appointment.changed', payload: { operation, appointmentId: id(1) } });
    await h.publisher.publishPending(); assert.equal(h.sends.length, 0); assert.equal(h.receipts.size, 0);
  }
});
test('failed appointment commit exposes no event and sends no notification', async () => {
  const h = harness(); h.failCommit = true;
  await assert.rejects(h.change(), /commit failed/);
  await h.publisher.publishPending();
  assert.equal(h.committed, false); assert.equal(h.events.length, 0); assert.equal(h.sends.length, 0);
});
