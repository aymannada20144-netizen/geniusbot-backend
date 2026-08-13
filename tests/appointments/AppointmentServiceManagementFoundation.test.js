'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const AppointmentService = require(
  '../../src/modules/appointments/AppointmentService'
);

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  otherClinic: '22222222-2222-4222-8222-222222222222',
  patient: '33333333-3333-4333-8333-333333333333',
  otherPatient: '44444444-4444-4444-8444-444444444444',
  appointment: '55555555-5555-4555-8555-555555555555',
  conversation: '66666666-6666-4666-8666-666666666666',
  staff: '77777777-7777-4777-8777-777777777777',
};

function appointment(status = 'confirmed') {
  return {
    id: IDS.appointment,
    clinic_id: IDS.clinic,
    patient_id: IDS.patient,
    booking_reference: '25DD4527',
    patient_phone: '+966501234567',
    status,
    updated_at: '2026-08-11T08:00:00.000Z',
  };
}

describe('AppointmentService management foundation', () => {
  test('resolves a clinic-scoped booking reference without presentation data', async () => {
    const calls = [];
    const service = new AppointmentService({
      async findByBookingReference(...args) {
        calls.push(args);
        return appointment();
      },
    });

    const result = await service.resolveAppointmentForManagementByBookingReference(
      IDS.clinic,
      ' 25dd4527 '
    );

    assert.deepEqual(calls, [[IDS.clinic, '25DD4527']]);
    assert.deepEqual(result, {
      appointmentId: IDS.appointment,
      clinicId: IDS.clinic,
      patientId: IDS.patient,
      bookingReference: '25DD4527',
    });
    assert.equal(Object.hasOwn(result, 'patient_phone'), false);
    assert.equal(Object.hasOwn(result, 'appointment_start'), false);
  });

  test('wrong-clinic booking result is treated as unresolved', async () => {
    const service = new AppointmentService({
      async findByBookingReference() {
        return { ...appointment(), clinic_id: IDS.otherClinic };
      },
    });

    assert.equal(
      await service.resolveAppointmentForManagementByBookingReference(
        IDS.clinic,
        '25DD4527'
      ),
      null
    );
  });

  test('returns all future management candidates for the known patient', async () => {
    const expected = [appointment(), { ...appointment(), id: 'appointment-2' }];
    const calls = [];
    const service = new AppointmentService({
      async findFutureForManagementByPatient(...args) {
        calls.push(args);
        return expected;
      },
    });

    const result = await service.getFutureManagementCandidates(
      IDS.clinic,
      IDS.patient
    );

    assert.equal(result, expected);
    assert.deepEqual(calls, [[IDS.clinic, IDS.patient]]);
  });

  test('verifies ownership by exact normalized full registered mobile', async () => {
    const service = new AppointmentService({
      async findByBookingReference() { return appointment(); },
      async findPresentationById() { return appointment(); },
    });

    assert.deepEqual(
      await service.verifyAppointmentOwnership(
        IDS.clinic,
        '25DD4527',
        '050 123 4567'
      ),
      {
        verified: true,
        appointmentId: IDS.appointment,
        patientId: IDS.patient,
      }
    );
  });

  test('wrong mobile and invalid input share the same verification failure', async () => {
    const service = new AppointmentService({
      async findByBookingReference() { return appointment(); },
      async findPresentationById() { return appointment(); },
    });

    const wrong = await service.verifyAppointmentOwnership(
      IDS.clinic,
      '25DD4527',
      '+966509999999'
    );
    const invalid = await service.verifyAppointmentOwnership(
      IDS.clinic,
      '25DD4527',
      'invalid'
    );

    assert.deepEqual(wrong, { verified: false });
    assert.deepEqual(invalid, { verified: false });
  });

  test('all non-verifiable references use the same failure result', async () => {
    const cases = [
      { bookingReference: '', appointment: null },
      { bookingReference: 'NOTFOUND', appointment: null },
      {
        bookingReference: '25DD4527',
        appointment: { ...appointment(), clinic_id: IDS.otherClinic },
      },
      {
        bookingReference: '25DD4527',
        appointment: appointment(),
        presentation: null,
      },
    ];

    for (const testCase of cases) {
      const service = new AppointmentService({
        async findByBookingReference() { return testCase.appointment; },
        async findPresentationById() { return testCase.presentation; },
      });
      assert.deepEqual(
        await service.verifyAppointmentOwnership(
          IDS.clinic,
          testCase.bookingReference,
          '+966501234567'
        ),
        { verified: false }
      );
    }
  });

  test('verification rejects cross-patient and cross-clinic presentation data', async () => {
    for (const leaked of [
      { ...appointment(), patient_id: IDS.otherPatient },
      { ...appointment(), clinic_id: IDS.otherClinic },
    ]) {
      const service = new AppointmentService({
        async findByBookingReference() { return appointment(); },
        async findPresentationById() { return leaked; },
      });
      assert.deepEqual(
        await service.verifyAppointmentOwnership(
          IDS.clinic,
          '25DD4527',
          '+966501234567'
        ),
        { verified: false }
      );
    }
  });

  test('existing cancellation signature retains staff and api attribution', async () => {
    let change;
    const service = new AppointmentService({
      async findByIdAndClinic() { return appointment(); },
      async applyAtomicChange(input) {
        change = input;
        return { appointment: appointment('cancelled') };
      },
    });

    await service.cancelAppointment(
      IDS.clinic,
      IDS.appointment,
      'Patient request',
      IDS.staff
    );

    assert.deepEqual(change.actor, {
      staffId: IDS.staff,
      patientId: null,
      source: 'api',
    });
    assert.deepEqual(change.metadata, {
      requestId: null,
      conversationId: null,
    });
  });

  test('supports Shaden patient and conversation cancellation attribution', async () => {
    let change;
    const service = new AppointmentService({
      async findByIdAndClinic() { return appointment(); },
      async applyAtomicChange(input) {
        change = input;
        return { appointment: appointment('cancelled') };
      },
    });

    await service.cancelAppointment(
      IDS.clinic,
      IDS.appointment,
      null,
      null,
      {
        patientId: IDS.patient,
        source: 'shaden',
        conversationId: IDS.conversation,
      }
    );

    assert.deepEqual(change.actor, {
      staffId: null,
      patientId: IDS.patient,
      source: 'shaden',
    });
    assert.deepEqual(change.metadata, {
      requestId: null,
      conversationId: IDS.conversation,
    });
  });
});
