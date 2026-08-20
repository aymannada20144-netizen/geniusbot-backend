'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const createShadenEngine = require(
  '../../src/services/shaden/createShadenEngine'
);

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  patient: '33333333-3333-4333-8333-333333333333',
  appointment: '55555555-5555-4555-8555-555555555555',
  conversation: '77777777-7777-4777-8777-777777777777',
};

describe('Shaden cancellation production wiring', () => {
  test('app passes its existing AppointmentService instance to Shaden', () => {
    const appSource = fs.readFileSync(
      path.join(__dirname, '../../src/app.js'),
      'utf8'
    );
    assert.match(
      appSource,
      /const appointmentService = new AppointmentService[\s\S]*createShadenEngine\(\{[\s\S]*\bappointmentService,/
    );
    assert.equal(
      (appSource.match(/new AppointmentService\s*\(/g) || []).length,
      1
    );
  });

  test('known patient reaches the injected cancellation service end to end', async () => {
    const harness = createHarness({ knownPatient: true });
    await harness.send('إلغاء موعدي');
    const result = await harness.send('نعم');

    assert.match(result.replyText, /تم إلغاء الموعد بنجاح/u);
    assert.equal(harness.cancelCalls.length, 1);
    assert.deepEqual(harness.cancelCalls[0][4], {
      patientId: IDS.patient,
      source: 'shaden',
      conversationId: IDS.conversation,
    });
  });

  test('raw bare cancellation enters review before production execution', async () => {
    const harness = createHarness({ knownPatient: true });
    const reviewed = await harness.send('الغاء');

    assert.match(reviewed.replyText, /تأكيد إلغاء هذا الموعد/u);
    assert.equal(harness.cancelCalls.length, 0);

    await harness.send('نعم');
    assert.equal(harness.cancelCalls.length, 1);
  });

  test('unknown patient verifies before the injected service can cancel', async () => {
    const harness = createHarness({ knownPatient: false });
    const challenge = await harness.send('إلغاء الحجز 25DD4527');
    assert.match(challenge.replyText, /رقم الجوال الكامل/u);
    assert.doesNotMatch(challenge.replyText, /خدمة الليزر|فرع الرياض/u);
    assert.equal(harness.cancelCalls.length, 0);

    const reviewed = await harness.send('+966501234567');
    assert.match(reviewed.replyText, /خدمة الليزر|فرع الرياض/u);
    assert.equal(harness.cancelCalls.length, 0);

    const result = await harness.send('نعم');
    assert.match(result.replyText, /تم إلغاء الموعد بنجاح/u);
    assert.equal(harness.cancelCalls.length, 1);
    assert.equal(harness.cancelCalls[0][4].patientId, IDS.patient);
    assert.equal(harness.conversation.patientId, null);
  });
});

function createHarness({ knownPatient }) {
  let state = null;
  let messageNumber = 0;
  const conversation = {
    id: IDS.conversation,
    patientId: knownPatient ? IDS.patient : null,
    botEnabled: true,
  };
  const candidate = {
    id: IDS.appointment,
    clinic_id: IDS.clinic,
    patient_id: IDS.patient,
    booking_reference: '25DD4527',
    service_name: 'خدمة الليزر',
    branch_name: 'فرع الرياض',
    appointment_start: '2026-08-20T08:00:00.000Z',
    status: 'confirmed',
    updated_at: '2026-08-12T08:00:00.000Z',
  };
  const appointmentService = {
    async getFutureManagementCandidates() { return [candidate]; },
    async resolveAppointmentForManagementByBookingReference() {
      return {
        appointmentId: IDS.appointment,
        clinicId: IDS.clinic,
        patientId: IDS.patient,
      };
    },
    async verifyAppointmentOwnership() {
      return {
        verified: true,
        appointmentId: IDS.appointment,
        patientId: IDS.patient,
      };
    },
    async cancelAppointment(...args) {
      harness.cancelCalls.push(args);
      return { id: IDS.appointment, status: 'cancelled' };
    },
  };
  const runtime = createShadenEngine({
    clinicService: {
      async resolveWhatsAppClinic() {
        return { id: IDS.clinic, name: 'Clinic' };
      },
    },
    conversationService: {
      async findOrCreateForChannel() { return conversation; },
      async loadState() { return state; },
      async updateState(_id, nextState) { state = nextState; },
    },
    patientService: {
      async resolveChannelIdentity() {
        return knownPatient
          ? { id: IDS.patient, full_name: 'نورة' }
          : null;
      },
    },
    messageRepository: {
      async findByExternalId() { return null; },
      async saveIncomingMessage() {},
      async saveOutgoingMessage() {},
    },
    catalogService: { async list() { return []; } },
    clinicConfigurationSource: { async get() { return {}; } },
    appointmentService,
    async sendMessage() { return { messageId: 'out-1' }; },
  });
  const harness = {
    cancelCalls: [],
    conversation,
    async send(text) {
      return runtime.processMessage({
        channel: 'whatsapp',
        waMessageId: `in-${++messageNumber}`,
        senderPhone: '+966501234567',
        receiverPhone: '+966500000002',
        metaPhoneNumberId: '123456789',
        messageType: 'text',
        text,
        rawPayload: {},
      });
    },
  };
  return harness;
}
