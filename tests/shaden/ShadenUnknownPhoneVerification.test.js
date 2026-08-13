'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const AppointmentService = require(
  '../../src/modules/appointments/AppointmentService'
);
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  otherClinic: '22222222-2222-4222-8222-222222222222',
  patient: '33333333-3333-4333-8333-333333333333',
  otherPatient: '44444444-4444-4444-8444-444444444444',
  appointment: '55555555-5555-4555-8555-555555555555',
  unrelated: '66666666-6666-4666-8666-666666666666',
  conversation: '77777777-7777-4777-8777-777777777777',
};

describe('Shaden unknown-phone ownership verification', () => {
  test('missing reference requests it without revealing booking data', async () => {
    const harness = createHarness();
    const result = await turn(harness.service, null, 'إلغاء موعدي');

    assert.match(result.reply, /يرجى إرسال رقم الحجز/u);
    assertNoAppointmentDisclosure(result.reply);
    assert.equal(result.nextState.cancellation.step, 'awaiting_reference');
    assert.equal(result.nextState.cancellation.bookingReference, null);
  });

  test('valid, invalid, and wrong-clinic references are indistinguishable before verification', async () => {
    const replies = [];
    for (const [text, harness] of [
      ['إلغاء الحجز 25DD4527', createHarness()],
      ['إلغاء الحجز BADREF', createHarness({ referenceExists: false })],
      ['إلغاء الحجز A1B2C3D4', createHarness({ wrongClinic: true })],
    ]) {
      const result = await turn(harness.service, null, text);
      replies.push(result.reply);
      assert.equal(result.nextState.cancellation.step, 'awaiting_verification');
      assertNoAppointmentDisclosure(result.reply);
    }
    assert.equal(new Set(replies).size, 1);
    assert.match(replies[0], /رقم الجوال الكامل/u);
  });

  test('reference supplied on the next turn receives the same neutral mobile challenge', async () => {
    const harness = createHarness();
    const first = await turn(harness.service, null, 'إلغاء موعدي');
    const valid = await turn(harness.service, first.nextState, '25dd4527');

    assert.equal(valid.nextState.cancellation.bookingReference, '25DD4527');
    assert.match(valid.reply, /رقم الجوال الكامل/u);
    assertNoAppointmentDisclosure(valid.reply);
  });

  test('exact normalized full mobile verifies and reveals only selected summary', async () => {
    for (const mobile of ['+966501234567', '050 123 4567']) {
      const harness = createHarness();
      const reference = await turn(
        harness.service,
        null,
        'إلغاء الحجز 25DD4527'
      );
      const verified = await turn(
        harness.service,
        reference.nextState,
        mobile
      );

      assert.equal(verified.nextState.cancellation.ownershipVerified, true);
      assert.equal(verified.nextState.cancellation.verificationRequired, true);
      assert.equal(
        verified.nextState.cancellation.selectedAppointmentId,
        IDS.appointment
      );
      assert.deepEqual(
        verified.nextState.cancellation.candidateAppointmentIds,
        [IDS.appointment]
      );
      assert.match(verified.reply, /25DD4527/u);
      assert.match(verified.reply, /خدمة الليزر/u);
      assert.match(verified.reply, /فرع الرياض/u);
      assert.match(verified.reply, /د\. نورة/u);
      assert.match(verified.reply, /الحالة: مؤكد/u);
      assert.match(verified.reply, /تأكيد إلغاء هذا الموعد/u);
      assert.doesNotMatch(verified.reply, /نورة المريضة|خدمة أخرى/u);
      assert.equal(harness.cancelCalls, 0);
      assert.equal(harness.attachCalls, 0);
      assertNoPersistedMobile(verified.nextState.cancellation);
    }
  });

  test('wrong mobile is rejected neutrally without persisting it', async () => {
    const harness = createHarness();
    const reference = await turn(
      harness.service,
      null,
      'إلغاء الحجز 25DD4527'
    );
    const rejected = await turn(
      harness.service,
      reference.nextState,
      '+966509999999'
    );

    assert.match(rejected.reply, /تعذر التحقق من بيانات الحجز/u);
    assert.doesNotMatch(rejected.reply, /تحققي|حاولي|يمكنكِ/u);
    assertNoAppointmentDisclosure(rejected.reply);
    assert.equal(rejected.nextState.cancellation.verificationAttempts, 1);
    assertNoPersistedMobile(rejected.nextState.cancellation);
  });

  test('third failed attempt clears cancellation state', async () => {
    const harness = createHarness({ referenceExists: false });
    let result = await turn(
      harness.service,
      null,
      'إلغاء الحجز 25DD4527'
    );
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      result = await turn(
        harness.service,
        result.nextState,
        '+966509999999'
      );
      assert.match(result.reply, /تعذر التحقق من بيانات الحجز/u);
      if (attempt < 3) {
        assert.equal(
          result.nextState.cancellation.verificationAttempts,
          attempt
        );
      }
    }

    assert.equal('cancellation' in result.nextState, false);
    assert.doesNotMatch(result.reply, /تحققي|حاولي|يمكنكِ/u);
  });

  test('cross-patient and cross-clinic candidates never leak after verification', async () => {
    for (const options of [
      { candidatePatientId: IDS.otherPatient },
      { candidateClinicId: IDS.otherClinic },
    ]) {
      const harness = createHarness(options);
      const reference = await turn(
        harness.service,
        null,
        'إلغاء الحجز 25DD4527'
      );
      const result = await turn(
        harness.service,
        reference.nextState,
        '+966501234567'
      );

      assert.match(result.reply, /تعذر التحقق من بيانات الحجز/u);
      assertNoAppointmentDisclosure(result.reply);
      assert.equal(result.nextState.cancellation.ownershipVerified, false);
    }
  });

  test('volunteered reason remains optional and no cancellation executes', async () => {
    const harness = createHarness();
    const reference = await turn(
      harness.service,
      null,
      'إلغاء الحجز 25DD4527'
    );
    const verified = await turn(
      harness.service,
      reference.nextState,
      '+966501234567'
    );
    const reason = await turn(
      harness.service,
      verified.nextState,
      'سبب الإلغاء: السفر'
    );

    assert.equal(reason.nextState.cancellation.cancellationReason, 'السفر');
    assert.match(reason.reply, /تأكيد إلغاء هذا الموعد/u);
    assert.equal(harness.cancelCalls, 0);
  });

  test('explicit abandonment clears state and a new request replaces stale state', async () => {
    const harness = createHarness();
    const first = await turn(harness.service, null, 'إلغاء موعدي');
    const abandoned = await turn(harness.service, first.nextState, 'تراجع');
    assert.equal('cancellation' in abandoned.nextState, false);

    const stale = await turn(harness.service, null, 'إلغاء موعدي');
    const replaced = await turn(
      harness.service,
      stale.nextState,
      'إلغاء الحجز 25DD4527'
    );
    assert.equal(replaced.nextState.cancellation.step, 'awaiting_verification');
    assert.equal(replaced.nextState.cancellation.verificationAttempts, 0);
  });
});

function createHarness({
  referenceExists = true,
  wrongClinic = false,
  candidatePatientId = IDS.patient,
  candidateClinicId = IDS.clinic,
} = {}) {
  const appointment = {
    id: IDS.appointment,
    clinic_id: wrongClinic ? IDS.otherClinic : IDS.clinic,
    patient_id: IDS.patient,
    booking_reference: '25DD4527',
    status: 'confirmed',
    updated_at: '2026-08-12T08:00:00.000Z',
  };
  const presentation = {
    ...appointment,
    patient_phone: '+966501234567',
  };
  const candidate = {
    ...appointment,
    clinic_id: candidateClinicId,
    patient_id: candidatePatientId,
    service_name: 'خدمة الليزر',
    branch_name: 'فرع الرياض',
    doctor_name: 'د. نورة',
    appointment_start: '2026-08-20T08:00:00.000Z',
  };
  const unrelated = {
    ...candidate,
    id: IDS.unrelated,
    patient_id: IDS.otherPatient,
    booking_reference: 'A1B2C3D4',
    service_name: 'خدمة أخرى',
  };
  const repository = {
    async findByBookingReference(clinicId, bookingReference) {
      if (
        !referenceExists ||
        clinicId !== IDS.clinic ||
        bookingReference !== '25DD4527'
      ) return null;
      return appointment;
    },
    async findPresentationById() { return presentation; },
    async findFutureForManagementByPatient() {
      return [candidate, unrelated];
    },
  };
  const service = new AppointmentService(repository);
  const harness = {
    service,
    cancelCalls: 0,
    attachCalls: 0,
  };
  service.cancelAppointment = async () => {
    harness.cancelCalls += 1;
    throw new Error('cancelAppointment must not run in Step 5');
  };
  service.attachPatient = async () => {
    harness.attachCalls += 1;
    throw new Error('unknown conversation must not be rebound');
  };
  return harness;
}

function turn(appointmentService, currentState, text) {
  return new ShadenEngine({ appointmentService }).handle({
    message: { text },
    currentState: currentState || rootState(),
    clinicData: {},
    patientIdentity: {
      patient: null,
      customerName: null,
    },
    bookingContext: {
      clinicId: IDS.clinic,
      conversationId: IDS.conversation,
      patientId: null,
    },
  });
}

function rootState() {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: null },
    context: null,
    options: [],
  };
}

function assertNoAppointmentDisclosure(reply) {
  assert.doesNotMatch(
    reply,
    /نورة المريضة|\+966|خدمة الليزر|خدمة أخرى|فرع الرياض|د\. نورة|2026|confirmed|25DD4527|A1B2C3D4/u
  );
}

function assertNoPersistedMobile(cancellation) {
  const serialized = JSON.stringify(cancellation);
  assert.doesNotMatch(serialized, /966501234567|050 123 4567/u);
  assert.equal(Object.hasOwn(cancellation, 'phone'), false);
  assert.equal(Object.hasOwn(cancellation, 'registeredMobile'), false);
}
