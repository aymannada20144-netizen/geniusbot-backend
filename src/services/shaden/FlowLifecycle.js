'use strict';

const ShadenEngine = require('./ShadenEngine');
const {
  createFlowLifecycleOutcome,
  FLOW_OWNERS,
} = require('../../contracts/shaden/FlowLifecycleOutcome');

const LEGAL_STEPS = ShadenEngine.FLOW_LIFECYCLE_STEPS;

const CANONICAL_CONSTRUCTORS = Object.freeze({
  booking: ShadenEngine.createBookingState,
  cancellation: ShadenEngine.createCancellationState,
  reschedule: ShadenEngine.createRescheduleState,
  changeService: ShadenEngine.createChangeServiceState,
  changeBranch: ShadenEngine.createChangeBranchState,
});

const PROHIBITED_PERSISTED_KEYS = Object.freeze([
  'pendingInteractionEvent',
  'interactionEvent',
  'semanticEvidence',
  'semanticCoreResult',
]);

function deriveFlowOwnership(state) {
  const owners = isPlainObject(state)
    ? FLOW_OWNERS.filter((owner) => isPlainObject(state[owner]))
    : [];
  return Object.freeze({
    status: owners.length === 0 ? 'none' : owners.length === 1 ? 'single' : 'conflict',
    owners: Object.freeze(owners),
  });
}

function createCanonicalFlowState(owner) {
  const constructor = CANONICAL_CONSTRUCTORS[owner];
  if (typeof constructor !== 'function') throw new TypeError('Unsupported lifecycle owner.');
  return constructor();
}

function validatePersistedFlowState(state) {
  const ownership = deriveFlowOwnership(state);
  if (ownership.status === 'conflict') throw new TypeError('Multiple business flows own the conversation.');
  if (containsProhibitedEvidence(state)) throw new TypeError('Turn-scoped semantic evidence cannot be persisted.');
  return ownership;
}

function validateLifecycleTransition({ outcome, resultingState } = {}) {
  const validated = createFlowLifecycleOutcome(outcome);
  const ownership = validatePersistedFlowState(resultingState);
  if (validated.type === 'terminal') {
    if (ownership.owners.includes(validated.owner)) {
      throw new TypeError('Terminal outcome left its transient flow active.');
    }
    return validated;
  }
  if (!LEGAL_STEPS[validated.owner].includes(validated.nextStep)) {
    throw new TypeError('Lifecycle outcome names an illegal flow step.');
  }
  if (ownership.status !== 'single' || ownership.owners[0] !== validated.owner) {
    throw new TypeError('Non-terminal outcome must retain exactly its declared owner.');
  }
  if (resultingState[validated.owner].step !== validated.nextStep) {
    throw new TypeError('Declared lifecycle step differs from authoritative state.');
  }
  return validated;
}

function containsProhibitedEvidence(value, seen = new Set()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === 'string' && PROHIBITED_PERSISTED_KEYS.includes(key)) return true;
    if (containsProhibitedEvidence(value[key], seen)) return true;
  }
  return false;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

module.exports = Object.freeze({
  deriveFlowOwnership,
  createCanonicalFlowState,
  validatePersistedFlowState,
  validateLifecycleTransition,
  LEGAL_STEPS,
  PROHIBITED_PERSISTED_KEYS,
});
