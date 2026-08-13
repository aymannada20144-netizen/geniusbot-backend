'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  otherClinic: '22222222-2222-4222-8222-222222222222',
  patient: '33333333-3333-4333-8333-333333333333',
  otherPatient: '44444444-4444-4444-8444-444444444444',
  first: '55555555-5555-4555-8555-555555555555',
  second: '66666666-6666-4666-8666-666666666666',
};

describe('Shaden known-phone cancellation flow', () => {
  test('known patient with zero candidates receives a safe no-active response', async () => {
    const result = await turn(service({ candidates: [] }), null, 'إلغاء موعدي');

    assert.match(result.reply, /لا يوجد موعد نشط أو قادم/u);
    assert.equal('cancellation' in result.nextState, false);
  });

  test('one candidate is selected and reviewed without cancellation execution', async () => {
    const appointmentService = service({ candidates: [candidate()] });
    const result = await turn(appointmentService, null, 'إلغاء موعدي');

    assert.match(result.reply, /25DD4527/u);
    assert.match(result.reply, /خدمة الليزر/u);
    assert.match(result.reply, /تأكيد إلغاء هذا الموعد/u);
    assert.equal(result.interaction.purpose, 'confirm_appointment_cancellation');
    assert.equal(result.nextState.cancellation.selectedAppointmentId, IDS.first);
    assert.equal(result.nextState.cancellation.step, 'awaiting_confirmation');
    assert.equal(result.nextState.cancellation.confirmationPending, true);
    assert.equal(appointmentService.cancelCalls, 0);
  });

  test('multiple candidates require explicit numbered selection', async () => {
    const appointmentService = service({
      candidates: [candidate(), candidate({
        id: IDS.second,
        booking_reference: 'A1B2C3D4',
        service_name: 'خدمة البشرة',
      })],
    });
    const result = await turn(appointmentService, null, 'إلغاء موعدي');

    assert.match(result.reply, /1\. خدمة الليزر/u);
    assert.match(result.reply, /2\. خدمة البشرة/u);
    assert.equal(result.nextState.cancellation.step, 'awaiting_selection');
    assert.deepEqual(result.nextState.cancellation.candidateAppointmentIds, [
      IDS.first,
      IDS.second,
    ]);
    assert.equal(result.nextState.cancellation.selectedAppointmentId, null);
    assert.equal(result.interaction.mode, 'list');
    assert.equal(result.interaction.purpose, 'select_cancellation_appointment');
    assert.deepEqual(result.interaction.options.map(({ id }) => id), [
      `cancellation-appointment:${IDS.first}`,
      `cancellation-appointment:${IDS.second}`,
    ]);
  });

  test('valid numbered selection shows only the selected appointment summary', async () => {
    const candidates = [candidate(), candidate({
      id: IDS.second,
      booking_reference: 'A1B2C3D4',
      service_name: 'خدمة البشرة',
      branch_name: 'فرع جدة',
    })];
    const appointmentService = service({ candidates });
    const first = await turn(appointmentService, null, 'إلغاء موعدي');
    const selected = await turn(appointmentService, first.nextState, '2');

    assert.match(selected.reply, /A1B2C3D4/u);
    assert.match(selected.reply, /خدمة البشرة/u);
    assert.doesNotMatch(selected.reply, /25DD4527|خدمة الليزر/u);
    assert.match(selected.reply, /تأكيد إلغاء هذا الموعد/u);
    assert.equal(selected.nextState.cancellation.selectedAppointmentId, IDS.second);
    assert.equal(appointmentService.cancelCalls, 0);
  });

  test('invalid selection preserves the candidate list safely', async () => {
    const appointmentService = service({
      candidates: [candidate(), candidate({ id: IDS.second })],
    });
    const first = await turn(appointmentService, null, 'إلغاء موعدي');
    const invalid = await turn(appointmentService, first.nextState, '3');

    assert.match(invalid.reply, /الاختيار غير صحيح/u);
    assert.deepEqual(
      invalid.nextState.cancellation.candidateAppointmentIds,
      first.nextState.cancellation.candidateAppointmentIds
    );
    assert.equal(invalid.nextState.cancellation.selectedAppointmentId, null);
  });

  test('interactive selection uses the same candidate validation path', async () => {
    const candidates = [candidate(), candidate({ id: IDS.second })];
    const appointmentService = service({ candidates });
    const first = await turn(appointmentService, null, 'إلغاء موعدي');
    const selected = await turn(appointmentService, first.nextState, {
      text: 'الموعد الثاني',
      rawPayload: { value: `cancellation-appointment:${IDS.second}` },
    });
    assert.equal(selected.nextState.cancellation.selectedAppointmentId, IDS.second);

    const stale = await turn(appointmentService, first.nextState, {
      text: 'موعد غير صالح',
      rawPayload: {
        value: `cancellation-appointment:${IDS.otherPatient}`,
      },
    });
    assert.match(stale.reply, /الاختيار غير صحيح/u);
    assert.equal(stale.nextState.cancellation.selectedAppointmentId, null);
  });

  test('more than ten candidates preserves numbered text fallback', async () => {
    const candidates = Array.from({ length: 11 }, (_, index) => candidate({
      id: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
      booking_reference: String(index + 1).padStart(8, 'A'),
    }));
    const result = await turn(service({ candidates }), null, 'إلغاء موعدي');
    assert.equal(result.interaction, undefined);
    assert.match(result.reply, /1\./u);
    assert.match(result.reply, /11\./u);
  });

  test('supplied reference must resolve to the same clinic and patient', async () => {
    const matching = service({
      candidates: [candidate()],
      resolved: {
        appointmentId: IDS.first,
        clinicId: IDS.clinic,
        patientId: IDS.patient,
      },
    });
    const accepted = await turn(
      matching,
      null,
      'إلغاء الحجز 25dd4527'
    );
    assert.equal(accepted.nextState.cancellation.selectedAppointmentId, IDS.first);

    for (const resolved of [
      {
        appointmentId: IDS.first,
        clinicId: IDS.clinic,
        patientId: IDS.otherPatient,
      },
      {
        appointmentId: IDS.first,
        clinicId: IDS.otherClinic,
        patientId: IDS.patient,
      },
    ]) {
      const rejected = await turn(
        service({ candidates: [candidate()], resolved }),
        null,
        'إلغاء الحجز 25DD4527'
      );
      assert.match(rejected.reply, /لا يوجد موعد نشط أو قادم/u);
      assert.equal('cancellation' in rejected.nextState, false);
    }
  });

  test('candidate lookup filters cross-patient and cross-clinic rows', async () => {
    const appointmentService = service({
      candidates: [
        candidate({ patient_id: IDS.otherPatient, service_name: 'مسرب مريض' }),
        candidate({
          id: IDS.second,
          clinic_id: IDS.otherClinic,
          service_name: 'مسرب عيادة',
        }),
      ],
    });
    const result = await turn(appointmentService, null, 'إلغاء موعدي');

    assert.match(result.reply, /لا يوجد موعد نشط أو قادم/u);
    assert.doesNotMatch(result.reply, /مسرب/u);
  });

  test('a volunteered reason is optional and cancellation is still not executed', async () => {
    const appointmentService = service({ candidates: [candidate()] });
    const first = await turn(appointmentService, null, 'إلغاء موعدي');
    const reason = await turn(
      appointmentService,
      first.nextState,
      'سبب الإلغاء: السفر'
    );

    assert.equal(reason.nextState.cancellation.cancellationReason, 'السفر');
    assert.match(reason.reply, /تأكيد إلغاء هذا الموعد/u);
    assert.equal(appointmentService.cancelCalls, 0);
  });

  test('active booking cancellation keeps the existing draft-booking behavior', async () => {
    const appointmentService = service({ candidates: [candidate()] });
    const state = rootState();
    state.booking = {
      step: 'confirmation',
      serviceId: 'service-1',
      branchId: 'branch-1',
      doctorId: null,
      preferredStart: '2026-08-20T08:00:00.000Z',
      paymentMethodId: 'cash',
    };
    const result = await turn(appointmentService, state, 'إلغاء الحجز');

    assert.match(result.reply, /تم إلغاء طلب الحجز/u);
    assert.equal(result.nextState.booking, undefined);
    assert.equal(result.nextState.cancellation, undefined);
    assert.equal(appointmentService.candidateCalls, 0);
  });

  test('explicit appointment cancellation replaces active booking stages', async () => {
    for (const step of ['specialty', 'service', 'date', 'time', 'confirmation']) {
      const appointmentService = service({ candidates: [] });
      const state = rootState();
      state.booking = bookingAt(step);

      const result = await turn(
        appointmentService,
        state,
        'اريد الغاء موعد'
      );

      assert.equal(appointmentService.candidateCalls, 1, step);
      assert.equal(result.nextState.booking, undefined, step);
      assert.equal(result.nextState.cancellation, undefined, step);
      assert.match(result.reply, /لا يوجد موعد نشط أو قادم/u, step);
    }
  });

  test('explicit appointment cancellation without a draft remains unchanged', async () => {
    const appointmentService = service({ candidates: [] });
    const result = await turn(
      appointmentService,
      null,
      'اريد الغاء موعد'
    );

    assert.equal(appointmentService.candidateCalls, 1);
    assert.equal(result.nextState.booking, undefined);
    assert.match(result.reply, /لا يوجد موعد نشط أو قادم/u);
  });
});

function service({ candidates, resolved = null }) {
  return {
    candidateCalls: 0,
    cancelCalls: 0,
    async getFutureManagementCandidates(clinicId, patientId) {
      this.candidateCalls += 1;
      assert.equal(clinicId, IDS.clinic);
      assert.equal(patientId, IDS.patient);
      return candidates;
    },
    async resolveAppointmentForManagementByBookingReference() {
      return resolved;
    },
    async cancelAppointment() {
      this.cancelCalls += 1;
      throw new Error('cancelAppointment must not run in Step 4');
    },
  };
}

function candidate(overrides = {}) {
  return {
    id: IDS.first,
    clinic_id: IDS.clinic,
    patient_id: IDS.patient,
    booking_reference: '25DD4527',
    service_name: 'خدمة الليزر',
    branch_name: 'فرع الرياض',
    doctor_name: 'د. نورة',
    appointment_start: '2026-08-20T08:00:00.000Z',
    appointment_end: '2026-08-20T09:00:00.000Z',
    status: 'confirmed',
    updated_at: '2026-08-12T08:00:00.000Z',
    ...overrides,
  };
}

function bookingAt(step) {
  const booking = {
    step,
    specialtyId: null,
    serviceId: null,
    city: null,
    branchId: null,
    doctorId: null,
    roomId: null,
    date: null,
    datePeriod: null,
    timePeriod: null,
    preferredStart: null,
    paymentMethodId: null,
    insuranceCompanyId: null,
    insuranceClassId: null,
  };
  if (['date', 'time', 'confirmation'].includes(step)) {
    booking.serviceId = 'service-1';
    booking.branchId = 'branch-1';
  }
  if (step === 'time') booking.date = '2026-08-20';
  if (step === 'confirmation') {
    booking.preferredStart = '2026-08-20T08:00:00.000Z';
    booking.paymentMethodId = 'cash';
  }
  return booking;
}

function rootState() {
  return {
    version: 1,
    mode: 'idle',
    step: null,
    customer: { name: 'نورة' },
    context: { inquiry: 'services' },
    options: [],
  };
}

function turn(appointmentService, currentState, text) {
  return new ShadenEngine({ appointmentService }).handle({
    message: typeof text === 'object' ? text : { text },
    currentState: currentState || rootState(),
    clinicData: {},
    patientIdentity: {
      patient: { id: IDS.patient, fullName: 'نورة' },
      customerName: 'نورة',
    },
    bookingContext: { clinicId: IDS.clinic },
  });
}
