'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const ID = {
  clinic: '11111111-1111-4111-8111-111111111111', patient: '22222222-2222-4222-8222-222222222222',
  appointment: '33333333-3333-4333-8333-333333333333', service: '44444444-4444-4444-8444-444444444444',
  oldBranch: '55555555-5555-4555-8555-555555555555', newBranch: '66666666-6666-4666-8666-666666666666',
  doctor: '77777777-7777-4777-8777-777777777777', room: '88888888-8888-4888-8888-888888888888',
};
const oldBranch = { id: ID.oldBranch, name: 'العليا', city: 'الرياض' };
const newBranch = { id: ID.newBranch, name: 'الروضة', city: 'الرياض' };
function candidate() { return {
  id: ID.appointment, clinic_id: ID.clinic, patient_id: ID.patient, service_id: ID.service,
  branch_id: ID.oldBranch, booking_reference: 'ABC12345', status: 'confirmed',
  appointment_start: '2026-08-20T09:00:00.000Z', appointment_end: '2026-08-20T09:30:00.000Z',
  updated_at: '2026-08-13T08:00:00.000Z', service_name: 'ليزر', branch_name: 'العليا',
  quoted_price: '100.00', currency: 'SAR',
}; }
function proposal() { return {
  appointment: candidate(), branch: newBranch,
  assignment: { doctor_id: ID.doctor, doctor_name: 'د. نورة', room_id: ID.room, room_number: '4' },
  price: { price: '120.00', currency: 'SAR' }, requiresNewSlot: false,
  appointmentStart: candidate().appointment_start, appointmentEnd: candidate().appointment_end,
}; }
function state() { return { version: 1, mode: 'idle', step: null, customer: { name: null }, context: null, options: [] }; }
function input(currentState, text, value, known = true) { return {
  message: { text, ...(value ? { rawPayload: { value } } : {}) }, currentState,
  clinicData: { branches: [oldBranch, newBranch] }, bookingContext: { clinicId: ID.clinic },
  patientIdentity: known ? { patient: { id: ID.patient }, customerName: null } : null,
}; }

test('target branch hint retains current slot and confirmation executes once', async () => {
  let changes = 0;
  const appointmentService = {
    async getFutureManagementCandidates() { return [candidate()]; },
    async listEligibleBranchChanges() { return [newBranch]; },
    async previewBranchChange() { return proposal(); },
    async changeAppointmentBranch() { changes += 1; return candidate(); },
  };
  const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
  const started = await engine.handle(input(state(), 'ابي اغير الفرع للروضة'));
  assert.equal(started.nextState.changeBranch.step, 'awaiting_confirmation');
  assert.match(started.reply, /ABC12345|الروضة/u);
  const completed = await engine.handle(input(
    started.nextState, 'تأكيد تغيير الفرع', 'change-branch-confirm:yes'
  ));
  assert.equal(changes, 1);
  assert.equal(completed.nextState.changeBranch, undefined);
  await engine.handle(input(completed.nextState, '', 'change-branch-confirm:yes'));
  assert.equal(changes, 1);
});

test('generic request lists eligible branches and free text can interrupt', async () => {
  const appointmentService = {
    async getFutureManagementCandidates() { return [candidate()]; },
    async listEligibleBranchChanges() { return [newBranch]; },
  };
  const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
  const started = await engine.handle(input(state(), 'ابي اغير الفرع'));
  assert.equal(started.nextState.changeBranch.step, 'awaiting_branch');
  assert.equal(started.interaction.options[0].id, `change-branch-branch:${ID.newBranch}`);
  const interrupted = await engine.handle(input(started.nextState, 'ابغى الغي حجزي'));
  assert.equal(interrupted.nextState.changeBranch, undefined);
  assert.ok(interrupted.nextState.cancellation);
});

test('unknown phone discloses nothing and stops after three failed attempts', async () => {
  const appointmentService = { async verifyAppointmentOwnership() { return { verified: false }; } };
  const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
  let result = await engine.handle(input(state(), 'ابي اغير الفرع للروضة', null, false));
  assert.doesNotMatch(result.reply, /العليا|ليزر/u);
  result = await engine.handle(input(result.nextState, 'ABC12345', null, false));
  for (let i = 0; i < 3; i += 1) {
    result = await engine.handle(input(result.nextState, '0500000000', null, false));
  }
  assert.equal(result.nextState.changeBranch, undefined);
});
