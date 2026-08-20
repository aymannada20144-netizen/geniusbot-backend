'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const ShadenEngine = require('../../src/services/shaden/ShadenEngine');
const {
  deriveFlowOwnership,
  createCanonicalFlowState,
  validatePersistedFlowState,
  validateLifecycleTransition,
} = require('../../src/services/shaden/FlowLifecycle');

const OUTCOME = {
  lifecycleVersion: 1,
  type: 'continue',
  owner: 'booking',
  nextStep: 'service',
  reason: null,
};

test('derives none, each single owner, and conflicts without precedence', () => {
  assert.deepEqual(deriveFlowOwnership({ version: 1 }), {
    status: 'none', owners: [],
  });
  for (const owner of [
    'booking', 'cancellation', 'reschedule', 'changeService', 'changeBranch',
  ]) {
    assert.deepEqual(deriveFlowOwnership({ version: 1, [owner]: { step: 'x' } }), {
      status: 'single', owners: [owner],
    });
  }
  const conflict = deriveFlowOwnership({
    booking: { step: 'service' },
    cancellation: { step: 'awaiting_selection' },
  });
  assert.deepEqual(conflict, {
    status: 'conflict', owners: ['booking', 'cancellation'],
  });
  assert.throws(() => validatePersistedFlowState({
    booking: {}, cancellation: {},
  }), /Multiple business flows/u);
});

test('reuses canonical constructors and never inherits a previous instance', () => {
  const booking = createCanonicalFlowState('booking');
  booking.serviceId = 'transient-service';
  const fresh = createCanonicalFlowState('booking');
  assert.deepEqual(fresh, ShadenEngine.createBookingState());
  assert.equal(fresh.serviceId, null);
  assert.notEqual(fresh, booking);

  for (const owner of ['cancellation', 'reschedule', 'changeService', 'changeBranch']) {
    assert.deepEqual(createCanonicalFlowState(owner), canonicalFromEngine(owner));
  }
});

test('validates continuation, recovery, and terminal release', () => {
  assert.equal(validateLifecycleTransition({
    outcome: OUTCOME,
    resultingState: { booking: { step: 'service' } },
  }).type, 'continue');

  assert.equal(validateLifecycleTransition({
    outcome: {
      ...OUTCOME,
      type: 'recover',
      nextStep: 'branch',
      reason: 'no_availability',
    },
    resultingState: { booking: { step: 'branch' } },
  }).type, 'recover');

  assert.equal(validateLifecycleTransition({
    outcome: {
      ...OUTCOME,
      type: 'terminal',
      nextStep: null,
      reason: 'completed',
    },
    resultingState: { version: 1 },
  }).type, 'terminal');
});

test('rejects illegal steps, undeclared recovery, and terminal retained ownership', () => {
  assert.throws(() => validateLifecycleTransition({
    outcome: { ...OUTCOME, nextStep: 'not_a_step' },
    resultingState: { booking: { step: 'not_a_step' } },
  }), /illegal flow step/u);
  assert.throws(() => validateLifecycleTransition({
    outcome: undefined,
    resultingState: { booking: { step: 'date_period' } },
  }), /Lifecycle outcome/u);
  assert.throws(() => validateLifecycleTransition({
    outcome: {
      ...OUTCOME,
      type: 'terminal',
      nextStep: null,
      reason: 'completed',
    },
    resultingState: { booking: { step: 'confirmation' } },
  }), /left its transient flow active/u);
});

test('rejects persisted semantic evidence without treating it as ownership', () => {
  const semanticOnly = {
    version: 1,
    pendingInteractionEvent: { type: 'ACCEPT_PENDING' },
  };
  assert.equal(deriveFlowOwnership(semanticOnly).status, 'none');
  assert.throws(() => validatePersistedFlowState(semanticOnly), /semantic evidence/u);
  assert.throws(() => validatePersistedFlowState({
    booking: { step: 'service', semanticCoreResult: {} },
  }), /semantic evidence/u);
});

function canonicalFromEngine(owner) {
  const constructors = {
    cancellation: ShadenEngine.createCancellationState,
    reschedule: ShadenEngine.createRescheduleState,
    changeService: ShadenEngine.createChangeServiceState,
    changeBranch: ShadenEngine.createChangeBranchState,
  };
  return constructors[owner]();
}
