'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const AppointmentService = require('../../src/modules/appointments/AppointmentService');

const ID = {
  clinic: '11111111-1111-4111-8111-111111111111', appointment: '22222222-2222-4222-8222-222222222222',
  patient: '33333333-3333-4333-8333-333333333333', service: '44444444-4444-4444-8444-444444444444',
  oldBranch: '55555555-5555-4555-8555-555555555555', newBranch: '66666666-6666-4666-8666-666666666666',
  doctor: '77777777-7777-4777-8777-777777777777', room: '88888888-8888-4888-8888-888888888888',
  payment: '99999999-9999-4999-8999-999999999999',
};

function fixture(status = 'pending') {
  const appointment = {
    id: ID.appointment, clinic_id: ID.clinic, patient_id: ID.patient,
    service_id: ID.service, branch_id: ID.oldBranch, doctor_id: null, room_id: null,
    payment_method_id: ID.payment, booking_reference: 'ABC12345', status,
    appointment_start: '2026-08-20T09:00:00.000Z', appointment_end: '2026-08-20T09:30:00.000Z',
    quoted_price: '100.00', currency: 'SAR', updated_at: '2026-08-13T08:00:00.000Z',
  };
  let atomic = null;
  const repository = {
    async findByIdAndClinic() { return { ...appointment }; },
    async applyAtomicChange(input) {
      atomic = input;
      return { appointment: { ...appointment, ...input.patch }, audit: {}, event: {} };
    },
  };
  const bookingService = {
    repositories: {
      branches: { async findActiveById() { return { id: ID.newBranch, name: 'الروضة' }; } },
      services: { async findActiveById() { return { id: ID.service, is_booking_enabled: true, duration_minutes: 30 }; } },
    },
    assignmentResolver: { async resolve(input) {
      assert.equal(input.excludeAppointmentId, ID.appointment);
      assert.equal(input.branch_id, ID.newBranch);
      return { resolved: true, assignment: { doctor_id: ID.doctor, room_id: ID.room } };
    } },
  };
  const priceService = { async resolvePrice(input) {
    assert.equal(input.serviceId, ID.service);
    return { price: '120.00', currency: 'SAR' };
  } };
  return { appointment, getAtomic: () => atomic,
    service: new AppointmentService(repository, null, null, { bookingService, priceService }) };
}

for (const status of ['pending', 'confirmed']) {
  test(`changes ${status} appointment branch atomically on the same row`, async () => {
    const value = fixture(status);
    const result = await value.service.changeAppointmentBranch(
      ID.clinic, ID.appointment, ID.newBranch, null,
      { patientId: ID.patient, source: 'shaden' }, value.appointment.updated_at
    );
    assert.equal(value.getAtomic().operation, 'change_branch');
    assert.deepEqual(value.getAtomic().patch, {
      branch_id: ID.newBranch, doctor_id: ID.doctor, room_id: ID.room,
      appointment_start: value.appointment.appointment_start,
      appointment_end: value.appointment.appointment_end,
      quoted_price: '120.00', currency: 'SAR',
    });
    assert.equal(result.id, ID.appointment);
    assert.equal(result.booking_reference, 'ABC12345');
    assert.equal(result.service_id, ID.service);
  });
}

test('same branch and terminal appointments never mutate', async () => {
  const same = fixture();
  await assert.rejects(() => same.service.previewBranchChange(
    ID.clinic, ID.appointment, ID.oldBranch, null, ID.patient
  ), { code: 'APPOINTMENT_BRANCH_UNCHANGED' });
  for (const status of ['cancelled', 'completed', 'no_show', 'checked_in']) {
    const value = fixture(status);
    await assert.rejects(() => value.service.previewBranchChange(
      ID.clinic, ID.appointment, ID.newBranch, null, ID.patient
    ), /not eligible/);
    assert.equal(value.getAtomic(), null);
  }
});

test('migration permits change_branch without mutating appointments', () => {
  const sql = fs.readFileSync(path.join(__dirname,
    '../../database/migrations/024_appointment_change_branch_operation.sql'), 'utf8');
  assert.match(sql, /'change_branch'/);
  assert.doesNotMatch(sql, /UPDATE\s+geniusbot\.appointments/i);
});
