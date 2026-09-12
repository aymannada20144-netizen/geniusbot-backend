'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');

const DB_ID = {
  clinic: '11111111-1111-4111-8111-111111111111',
  patient: '22222222-2222-4222-8222-222222222222',
  appointment: '33333333-3333-4333-8333-333333333333',
  service: '00000000-0000-0000-0000-000000000401',
  oldBranch: '55555555-5555-4555-8555-555555555555',
  newBranch: '00000000-0000-0000-0000-000000000101',
  doctor: '77777777-7777-4777-8777-777777777777',
  room: '88888888-8888-4888-8888-888888888888',
};

function candidate() {
  return {
    id: DB_ID.appointment,
    clinic_id: DB_ID.clinic,
    patient_id: DB_ID.patient,
    service_id: DB_ID.service,
    branch_id: DB_ID.oldBranch,
    booking_reference: '9A3EB9C0',
    status: 'confirmed',
    appointment_start: '2026-09-10T07:00:00.000Z',
    appointment_end: '2026-09-10T07:30:00.000Z',
    updated_at: '2026-09-07T14:30:00.000Z',
    service_name: 'فيلر',
    branch_name: 'فرع الصالحية',
  };
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

function input(currentState, text, value, branches) {
  return {
    message: { text, ...(value ? { rawPayload: { value } } : {}) },
    currentState,
    clinicData: { branches },
    bookingContext: { clinicId: DB_ID.clinic },
    patientIdentity: { patient: { id: DB_ID.patient }, customerName: null },
  };
}

test('database UUID-shaped service and branch identifiers are preserved without RFC version bits', () => {
  assert.equal(
    ShadenEngine.createChangeBranchState({ targetBranchId: DB_ID.newBranch }).targetBranchId,
    DB_ID.newBranch
  );
  assert.equal(
    ShadenEngine.createChangeServiceState({ targetServiceId: DB_ID.service }).targetServiceId,
    DB_ID.service
  );
  assert.equal(
    ShadenEngine.createChangeBranchState({ targetBranchId: 'not-a-uuid' }).targetBranchId,
    null
  );
});

test('seed-style PostgreSQL branch id survives confirmation normalization and executes once', async () => {
  const oldBranch = { id: DB_ID.oldBranch, name: 'فرع الصالحية', city: 'جدة' };
  const newBranch = { id: DB_ID.newBranch, name: 'فرع الحمدانية', city: 'جدة' };
  let changes = 0;
  const appointmentService = {
    async getFutureManagementCandidates() { return [candidate()]; },
    async listEligibleBranchChanges() { return [newBranch]; },
    async previewBranchChange() {
      return {
        appointment: candidate(),
        branch: newBranch,
        assignment: {
          doctor_id: DB_ID.doctor,
          doctor_name: 'د. آلاء أيمن',
          room_id: DB_ID.room,
          room_number: '201',
        },
        price: null,
        requiresNewSlot: false,
        appointmentStart: candidate().appointment_start,
        appointmentEnd: candidate().appointment_end,
      };
    },
    async changeAppointmentBranch() {
      changes += 1;
      return candidate();
    },
  };
  const engine = new ShadenEngine({ appointmentService, bookingEngine: {} });
  const branches = [oldBranch, newBranch];

  const started = await engine.handle(input(rootState(), 'ابي اغير الفرع', null, branches));
  assert.equal(started.nextState.changeBranch.step, 'awaiting_branch');

  const selected = await engine.handle(input(
    started.nextState,
    'فرع الحمدانية',
    `change-branch-branch:${DB_ID.newBranch}`,
    branches
  ));
  assert.equal(selected.nextState.changeBranch.step, 'awaiting_confirmation');
  assert.equal(selected.nextState.changeBranch.targetBranchId, DB_ID.newBranch);

  const completed = await engine.handle(input(
    selected.nextState,
    'تأكيد تغيير الفرع',
    'change-branch-confirm:yes',
    branches
  ));
  assert.equal(changes, 1);
  assert.equal(completed.nextState.changeBranch, undefined);
});
