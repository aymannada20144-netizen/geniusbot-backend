'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const AppointmentService = require('../../src/modules/appointments/AppointmentService');
const fs = require('node:fs');
const path = require('node:path');

const IDS = {
  clinic: '11111111-1111-4111-8111-111111111111',
  appointment: '22222222-2222-4222-8222-222222222222',
  patient: '33333333-3333-4333-8333-333333333333',
  oldService: '44444444-4444-4444-8444-444444444444',
  newService: '55555555-5555-4555-8555-555555555555',
  branch: '66666666-6666-4666-8666-666666666666',
  doctor: '77777777-7777-4777-8777-777777777777',
  room: '88888888-8888-4888-8888-888888888888',
  payment: '99999999-9999-4999-8999-999999999999',
};

function fixture(status = 'pending') {
  const appointment = {
    id: IDS.appointment, clinic_id: IDS.clinic, patient_id: IDS.patient,
    service_id: IDS.oldService, branch_id: IDS.branch,
    doctor_id: null, room_id: null, payment_method_id: IDS.payment,
    insurance_company_id: null, insurance_class_id: null,
    booking_reference: 'ABC12345', status,
    appointment_start: '2026-08-20T09:00:00.000Z',
    appointment_end: '2026-08-20T09:30:00.000Z',
    quoted_price: '100.00', currency: 'SAR',
    updated_at: '2026-08-13T08:00:00.000Z',
  };
  let atomicInput = null;
  const repository = {
    async findByIdAndClinic() { return { ...appointment }; },
    async applyAtomicChange(input) {
      atomicInput = input;
      return { appointment: { ...appointment, ...input.patch }, audit: {}, event: {} };
    },
  };
  const bookingService = {
    repositories: { services: { async findActiveById() {
      return { id: IDS.newService, name: 'بوتكس', is_booking_enabled: true, duration_minutes: 60 };
    } } },
    assignmentResolver: { async resolve(input) {
      assert.equal(input.excludeAppointmentId, IDS.appointment);
      assert.equal(input.appointment_end, '2026-08-20T10:00:00.000Z');
      return { resolved: true, assignment: { doctor_id: IDS.doctor, room_id: IDS.room } };
    } },
  };
  const priceService = { async resolvePrice(input) {
    assert.equal(input.serviceId, IDS.newService);
    assert.equal(input.paymentMethodId, IDS.payment);
    return { price: '250.00', currency: 'SAR' };
  } };
  return {
    service: new AppointmentService(repository, null, null, { bookingService, priceService }),
    appointment, getAtomicInput: () => atomicInput,
  };
}

for (const status of ['pending', 'confirmed']) {
  test(`changes ${status} appointment service atomically on the same row`, async () => {
    const value = fixture(status);
    const result = await value.service.changeAppointmentService(
      IDS.clinic, IDS.appointment, IDS.newService, null,
      { patientId: IDS.patient, source: 'shaden' }, value.appointment.updated_at
    );
    const atomic = value.getAtomicInput();
    assert.equal(atomic.operation, 'change_service');
    assert.deepEqual(atomic.patch, {
      service_id: IDS.newService, doctor_id: IDS.doctor, room_id: IDS.room,
      appointment_start: '2026-08-20T09:00:00.000Z',
      appointment_end: '2026-08-20T10:00:00.000Z',
      quoted_price: '250.00', currency: 'SAR',
    });
    assert.equal(result.id, IDS.appointment);
    assert.equal(result.booking_reference, 'ABC12345');
    assert.equal(result.status, status);
  });
}

test('rejects ineligible and same-service appointments before mutation', async () => {
  for (const status of ['cancelled', 'completed', 'no_show', 'checked_in']) {
    const value = fixture(status);
    await assert.rejects(() => value.service.previewServiceChange(
      IDS.clinic, IDS.appointment, IDS.newService, null, IDS.patient
    ), /not eligible/);
    assert.equal(value.getAtomicInput(), null);
  }
  const value = fixture();
  await assert.rejects(() => value.service.previewServiceChange(
    IDS.clinic, IDS.appointment, IDS.oldService, null, IDS.patient
  ), { code: 'APPOINTMENT_SERVICE_UNCHANGED' });
});

test('invalid current slot requests reselection without mutation', async () => {
  const value = fixture();
  value.service.bookingService.assignmentResolver.resolve = async () => ({
    resolved: false, reason: 'no_available_assignment',
  });
  const proposal = await value.service.previewServiceChange(
    IDS.clinic, IDS.appointment, IDS.newService, null, IDS.patient
  );
  assert.equal(proposal.requiresNewSlot, true);
  assert.equal(value.getAtomicInput(), null);
});

test('migration permits the dedicated change_service audit operation', () => {
  const sql = fs.readFileSync(path.join(__dirname,
    '../../database/migrations/023_appointment_change_service_operation.sql'), 'utf8');
  assert.match(sql, /'change_service'/);
  assert.doesNotMatch(sql, /UPDATE\s+geniusbot\.appointments/i);
});
