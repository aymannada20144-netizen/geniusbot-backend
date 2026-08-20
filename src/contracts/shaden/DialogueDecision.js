'use strict';

const {
  createClinicDomainEntityProposals,
} = require('./ClinicDomainEntityProposals');

const ALLOWED_ACTIONS = new Set([
  'NOOP',

  // Conversational actions
  'ANSWER',
  'CLARIFY',
  'ACKNOWLEDGE',
  'REASSURE',
  'APOLOGIZE',
  'HANDLE_OBJECTION',
  'OFFER_BOOKING',
  'START_BOOKING',
  'RESUME_GOAL',
  'ESCALATE',

  // Knowledge / information
  'RETRIEVE_KNOWLEDGE',
  'CHECK_AVAILABILITY',
  'LOOKUP_APPOINTMENT',

  // Sensitive appointment-management intents
  'REQUEST_CANCELLATION',
  'REQUEST_RESCHEDULE',
  'REQUEST_CHANGE_SERVICE',
  'REQUEST_CHANGE_BRANCH',
  'REQUEST_CHANGE_PROVIDER',

  // Explicit safety / execution gates
  'REQUEST_VERIFICATION',
  'REQUEST_CONFIRMATION',
]);

const ALLOWED_GOALS = new Set([
  'none',
  'assist_customer',
  'answer_question',
  'resolve_concern',
  'resolve_complaint',
  'book_appointment',
  'manage_appointment',
  'handover_to_human',
]);

const SENSITIVE_ACTIONS = new Set([
  'REQUEST_CANCELLATION',
  'REQUEST_RESCHEDULE',
  'REQUEST_CHANGE_SERVICE',
  'REQUEST_CHANGE_BRANCH',
  'REQUEST_CHANGE_PROVIDER',
]);

function createDialogueDecision(input = {}) {
  const action = normalizeAction(input.action);

  const decision = {
    version: 1,

    action,

    goal: normalizeGoal(input.goal),

    reason: normalizeNullableString(input.reason),

    targetIntent: normalizeNullableString(input.targetIntent),

    requiredKnowledge: normalizeStringArray(input.requiredKnowledge),

    resumeGoal: normalizeNullableString(input.resumeGoal),

    proposedDomainConstraints: normalizeProposedDomainConstraints(
      input.proposedDomainConstraints
    ),

    flags: {
      sensitive: SENSITIVE_ACTIONS.has(action),
      requiresKnowledge: input.flags?.requiresKnowledge === true,
      requiresVerification: input.flags?.requiresVerification === true,
      requiresConfirmation: input.flags?.requiresConfirmation === true,
      requiresHuman: input.flags?.requiresHuman === true,
      preserveCurrentFlow: input.flags?.preserveCurrentFlow === true,
    },

    executable: false,
  };

  enforceSafety(decision);

  return Object.freeze({
    ...decision,
    requiredKnowledge: Object.freeze([...decision.requiredKnowledge]),
    proposedDomainConstraints: decision.proposedDomainConstraints,
    flags: Object.freeze({ ...decision.flags }),
  });
}

function normalizeProposedDomainConstraints(value) {
  try {
    return createClinicDomainEntityProposals(value);
  } catch {
    return createClinicDomainEntityProposals();
  }
}

function enforceSafety(decision) {
  // A DialogueDecision is never authorization to execute a domain mutation.
  // Execution permission belongs to the deterministic Action Gate / Domain layer.
  decision.executable = false;

  if (decision.flags.sensitive) {
    decision.flags.requiresConfirmation = true;
  }

  if (
    decision.action === 'ESCALATE' ||
    decision.goal === 'handover_to_human'
  ) {
    decision.flags.requiresHuman = true;
  }
}

function normalizeAction(value) {
  if (typeof value !== 'string') return 'NOOP';
  return ALLOWED_ACTIONS.has(value) ? value : 'NOOP';
}

function normalizeGoal(value) {
  if (typeof value !== 'string') return 'none';
  return ALLOWED_GOALS.has(value) ? value : 'none';
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  return normalized || null;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

module.exports = Object.freeze({
  createDialogueDecision,
  ALLOWED_ACTIONS,
  ALLOWED_GOALS,
  SENSITIVE_ACTIONS,
});
