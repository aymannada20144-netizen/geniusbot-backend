'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  patient: '33333333-3333-4333-8333-333333333333',
  appointment: '55555555-5555-4555-8555-555555555555',
  conversation: '77777777-7777-4777-8777-777777777777',
};

describe('Shaden final cancellation execution', () => {
  test('explicit confirmation executes once with patient and Shaden attribution', async () => {
    const harness = createHarness();
    const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
    const result = await knownTurn(harness, reviewed.nextState, 'نعم');

    assert.match(result.reply, /تم إلغاء الموعد بنجاح/u);
    assert.equal(harness.calls.length, 1);
    assert.deepEqual(harness.calls[0], [
      IDS.clinic,
      IDS.appointment,
      null,
      null,
      {
        patientId: IDS.patient,
        source: 'shaden',
        conversationId: IDS.conversation,
      },
    ]);
    assert.equal('cancellation' in result.nextState, false);

    await knownTurn(harness, result.nextState, 'نعم');
    assert.equal(harness.calls.length, 1);
  });

  test('negative confirmation clears state without service execution', async () => {
    const harness = createHarness();
    const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
    const result = await knownTurn(harness, reviewed.nextState, 'لا');

    assert.match(result.reply, /تم التراجع/u);
    assert.equal(harness.calls.length, 0);
    assert.equal('cancellation' in result.nextState, false);
  });

  test('successful cancellation leaves the next message in neutral booking routing', async () => {
    const harness = createHarness();
    const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
    const completed = await knownTurn(harness, reviewed.nextState, 'نعم');
    const next = await knownTurn(harness, completed.nextState, 'ابغى حجز جديد');
    assert.ok(next.nextState.booking);
    assert.equal(next.nextState.cancellation, undefined);
    assert.deepEqual(next.nextState.options, []);
  });

  test('interactive confirmation IDs match text execution and refusal gates', async () => {
    const confirmedHarness = createHarness();
    const reviewed = await knownTurn(confirmedHarness, null, 'إلغاء موعدي');
    const confirmed = await knownTurn(confirmedHarness, reviewed.nextState, {
      text: 'تأكيد الإلغاء',
      rawPayload: { value: 'cancellation-confirm:yes' },
    });
    assert.match(confirmed.reply, /تم إلغاء الموعد بنجاح/u);
    assert.equal(confirmedHarness.calls.length, 1);

    const keptHarness = createHarness();
    const keepReview = await knownTurn(keptHarness, null, 'إلغاء موعدي');
    const kept = await knownTurn(keptHarness, keepReview.nextState, {
      text: 'الاحتفاظ بالموعد',
      rawPayload: { value: 'cancellation-confirm:keep' },
    });
    assert.match(kept.reply, /تم التراجع/u);
    assert.equal(keptHarness.calls.length, 0);

    await knownTurn(confirmedHarness, confirmed.nextState, {
      text: 'تأكيد الإلغاء',
      rawPayload: { value: 'cancellation-confirm:yes' },
    });
    assert.equal(confirmedHarness.calls.length, 1);
  });

  test('unrelated acknowledgement and unverified state cannot execute', async () => {
    const harness = createHarness();
    const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
    const unrelated = await knownTurn(harness, reviewed.nextState, 'تمام');
    assert.match(unrelated.reply, /يرجى الرد بنعم أو لا/u);
    assert.equal(harness.calls.length, 0);

    const unsafe = structuredClone(reviewed.nextState);
    unsafe.cancellation.ownershipVerified = false;
    const rejected = await knownTurn(harness, unsafe, 'نعم');
    assert.equal(harness.calls.length, 0);
    assert.equal('cancellation' in rejected.nextState, false);
  });

  test('unknown-phone cancellation cannot execute before verification', async () => {
    const harness = createHarness();
    const challenge = await unknownTurn(harness, null, 'إلغاء موعدي');
    const result = await unknownTurn(harness, challenge.nextState, 'نعم');

    assert.equal(harness.calls.length, 0);
    assert.equal(result.nextState.cancellation.ownershipVerified, false);
  });

  test('confirmation button without pending confirmation cannot execute', async () => {
    const harness = createHarness();
    const result = await knownTurn(harness, null, {
      text: 'تأكيد الإلغاء',
      rawPayload: { value: 'cancellation-confirm:yes' },
    });
    assert.equal(harness.calls.length, 0);
    assert.equal(result.nextState.cancellation, undefined);
  });

  test('optional reason is forwarded without becoming required', async () => {
    const harness = createHarness();
    const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
    const reason = await knownTurn(
      harness,
      reviewed.nextState,
      'سبب الإلغاء: السفر'
    );
    await knownTurn(harness, reason.nextState, 'نعم');

    assert.equal(harness.calls[0][2], 'السفر');
  });

  test('verified unknown-phone flow resolves owner without rebinding', async () => {
    const harness = createHarness();
    let result = await unknownTurn(
      harness,
      null,
      'إلغاء الحجز 25DD4527'
    );
    result = await unknownTurn(harness, result.nextState, '+966501234567');
    result = await unknownTurn(harness, result.nextState, 'نعم');

    assert.match(result.reply, /تم إلغاء الموعد بنجاح/u);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0][4].patientId, IDS.patient);
    assert.equal(harness.calls[0][4].source, 'shaden');
    assert.equal(harness.attachCalls, 0);
  });

  test('terminal service outcomes are deterministic and clear state', async () => {
    const cases = [
      [{ outcome: 'already_cancelled' }, /ملغى بالفعل/u],
      [error('ValidationError'), /لم تعد تسمح بالإلغاء/u],
      [error('ConflictError'), /تغيرت بيانات الموعد/u],
      [error('NotFoundError'), /تعذر إلغاء الموعد المطلوب/u],
      [new Error('database unavailable'), /تعذر إلغاء الموعد حاليًا/u],
    ];

    for (const [outcome, expected] of cases) {
      const harness = createHarness({ outcome });
      const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
      const result = await knownTurn(harness, reviewed.nextState, 'نعم');
      assert.match(result.reply, expected);
      assert.equal(result.nextState.cancellation, undefined);
      assert.equal(harness.calls.length, 1);
    }
  });

  test('shared template attempt suppresses a second Shaden success reply', async () => {
    const harness = createHarness({
      outcome: {
        status: 'cancelled',
        communication: { attempted: true, success: true, status: 'sent' },
      },
    });
    const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
    const result = await knownTurn(harness, reviewed.nextState, 'نعم');
    assert.equal(result.reply, null);
    assert.equal(result.notificationAttempted, true);
    assert.equal(harness.calls.length, 1);
  });

  test('notification failure uses a non-success delivery fallback', async () => {
    const harness = createHarness({
      outcome: {
        status: 'cancelled',
        communication: {
          attempted: true,
          success: false,
          status: 'pending_retry',
          retryable: false,
        },
      },
    });
    const reviewed = await knownTurn(harness, null, 'إلغاء موعدي');
    const result = await knownTurn(harness, reviewed.nextState, 'نعم');
    assert.match(result.reply, /تعذر إرسال إشعار التأكيد الآن/u);
    assert.doesNotMatch(result.reply, /تم إلغاء الموعد بنجاح/u);
  });
});

function createHarness({ outcome = { status: 'cancelled' } } = {}) {
  const appointment = {
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
  return {
    calls: [],
    attachCalls: 0,
    async getFutureManagementCandidates() { return [appointment]; },
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
      this.calls.push(args);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    async attachPatient() { this.attachCalls += 1; },
  };
}

function error(name) {
  const value = new Error(name);
  value.name = name;
  return value;
}

function knownTurn(service, currentState, text) {
  return turn(service, currentState, text, {
    patient: { id: IDS.patient },
    customerName: 'نورة',
  });
}

function unknownTurn(service, currentState, text) {
  return turn(service, currentState, text, {
    patient: null,
    customerName: null,
  });
}

function turn(appointmentService, currentState, text, patientIdentity) {
  return new ShadenEngine({ appointmentService }).handle({
    message: typeof text === 'object' ? text : { text },
    currentState: currentState || {
      version: 1,
      mode: 'idle',
      step: null,
      customer: { name: null },
      context: null,
      options: [],
    },
    clinicData: {},
    patientIdentity,
    bookingContext: {
      clinicId: IDS.clinic,
      conversationId: IDS.conversation,
    },
  });
}
