'use strict';

const {
  createDialogueDecision,
} = require('../../contracts/shaden/DialogueDecision');
const CLINIC_INFORMATION_INTENTS = new Set([
  'services',
  'specialties',
  'branches',
  'branch_address',
  'working_hours',
  'payment_methods',
  'insurance',
  'price_inquiry',
]);

const SOCIAL_INTENTS = new Set([
  'greeting',
  'courtesy',
  'farewell',
  'identity',
  'presence',
  'small_talk',
]);
class DeterministicDialogueDecisionProvider {
  async decide({
    understanding = {},
  } = {}) {
    const signals = understanding?.signals || {};

    // P0 — Safety / mandatory human escalation
    if (
      signals.medicalRisk === true ||
      signals.legalEscalation === true ||
      signals.humanHandover === true ||
      signals.abuseOrThreat === true
    ) {
      return createDialogueDecision({
        action: 'ESCALATE',
        goal: 'handover_to_human',
        reason: escalationReason(signals),
        flags: {
          requiresHuman: true,
        },
      });
    }

    // P1 — Complaint
    if (signals.complaint === true) {
      return createDialogueDecision({
        action: 'APOLOGIZE',
        goal: 'resolve_complaint',
        reason: 'complaint_detected',
        targetIntent: understanding.primaryIntent || null,
        flags: {
          preserveCurrentFlow: true,
        },
      });
    }

    // P2 — Objection
    if (signals.objection === true) {
      return createDialogueDecision({
        action: 'HANDLE_OBJECTION',
        goal: 'resolve_concern',
        reason: 'objection_detected',
        targetIntent: understanding.primaryIntent || null,
        flags: {
          preserveCurrentFlow: true,
        },
      });
    }

    // P3 — Hesitation
    if (signals.hesitation === true) {
      return createDialogueDecision({
        action: 'REASSURE',
        goal: 'resolve_concern',
        reason: 'hesitation_detected',
        targetIntent: understanding.primaryIntent || null,
        flags: {
          preserveCurrentFlow: true,
        },
      });
    }

    // P4 — Medical question
    if (signals.medicalQuestion === true) {
      return createDialogueDecision({
        action: 'RETRIEVE_KNOWLEDGE',
        goal: 'answer_question',
        reason: 'medical_question',
        targetIntent: understanding.primaryIntent || null,
        requiredKnowledge: ['medical_question'],
        flags: {
          requiresKnowledge: true,
          preserveCurrentFlow: true,
        },
      });
    }
// P5 — Sensitive appointment management
if (understanding.primaryIntent === 'appointment_cancellation') {
  return createDialogueDecision({
    action: 'REQUEST_CANCELLATION',
    goal: 'manage_appointment',
    reason: 'appointment_cancellation_intent',
    targetIntent: 'appointment_cancellation',
    flags: {
      requiresConfirmation: true,
    },
  });
}

if (understanding.primaryIntent === 'appointment_reschedule') {
  return createDialogueDecision({
    action: 'REQUEST_RESCHEDULE',
    goal: 'manage_appointment',
    reason: 'appointment_reschedule_intent',
    targetIntent: 'appointment_reschedule',
    flags: {
      requiresConfirmation: true,
    },
  });
}

if (understanding.primaryIntent === 'appointment_change_service') {
  return createDialogueDecision({
    action: 'REQUEST_CHANGE_SERVICE',
    goal: 'manage_appointment',
    reason: 'appointment_change_service_intent',
    targetIntent: 'appointment_change_service',
    flags: {
      requiresConfirmation: true,
    },
  });
}

if (understanding.primaryIntent === 'appointment_change_branch') {
  return createDialogueDecision({
    action: 'REQUEST_CHANGE_BRANCH',
    goal: 'manage_appointment',
    reason: 'appointment_change_branch_intent',
    targetIntent: 'appointment_change_branch',
    flags: {
      requiresConfirmation: true,
    },
  });
}

if (understanding.primaryIntent === 'appointment_change_provider') {
  return createDialogueDecision({
    action: 'REQUEST_CHANGE_PROVIDER',
    goal: 'manage_appointment',
    reason: 'appointment_change_provider_intent',
    targetIntent: 'appointment_change_provider',
    flags: {
      requiresConfirmation: true,
    },
  });
}

// P6 — Appointment information
if (understanding.primaryIntent === 'availability_request') {
  return createDialogueDecision({
    action: 'CHECK_AVAILABILITY',
    goal: 'answer_question',
    reason: 'availability_request',
    targetIntent: 'availability_request',
  });
}

if (understanding.primaryIntent === 'appointment_query') {
  return createDialogueDecision({
    action: 'LOOKUP_APPOINTMENT',
    goal: 'manage_appointment',
    reason: 'appointment_query',
    targetIntent: 'appointment_query',
  });
}

// P7 — Booking
if (understanding.primaryIntent === 'booking') {
  return createDialogueDecision({
    action: 'START_BOOKING',
    goal: 'book_appointment',
    reason: 'booking_intent',
    targetIntent: 'booking',
  });
}
// P8 — Conversational primary intents
if (understanding.primaryIntent === 'human_handover_request') {
  return createDialogueDecision({
    action: 'ESCALATE',
    goal: 'handover_to_human',
    reason: 'human_handover_intent',
    targetIntent: 'human_handover_request',
    flags: {
      requiresHuman: true,
    },
  });
}

if (understanding.primaryIntent === 'complaint') {
  return createDialogueDecision({
    action: 'APOLOGIZE',
    goal: 'resolve_complaint',
    reason: 'complaint_intent',
    targetIntent: 'complaint',
  });
}

if (understanding.primaryIntent === 'objection') {
  return createDialogueDecision({
    action: 'HANDLE_OBJECTION',
    goal: 'resolve_concern',
    reason: 'objection_intent',
    targetIntent: 'objection',
  });
}

if (understanding.primaryIntent === 'hesitation') {
  return createDialogueDecision({
    action: 'REASSURE',
    goal: 'resolve_concern',
    reason: 'hesitation_intent',
    targetIntent: 'hesitation',
  });
}

if (understanding.primaryIntent === 'medical_question') {
  return createDialogueDecision({
    action: 'RETRIEVE_KNOWLEDGE',
    goal: 'answer_question',
    reason: 'medical_question_intent',
    targetIntent: 'medical_question',
    requiredKnowledge: ['medical_question'],
    flags: {
      requiresKnowledge: true,
    },
  });
}

// P9 — Clinic information
if (CLINIC_INFORMATION_INTENTS.has(understanding.primaryIntent)) {
  return createDialogueDecision({
    action: 'RETRIEVE_KNOWLEDGE',
    goal: 'answer_question',
    reason: 'clinic_information_intent',
    targetIntent: understanding.primaryIntent,
    requiredKnowledge: [understanding.primaryIntent],
    flags: {
      requiresKnowledge: true,
    },
  });
}

// P10 — Social / conversational
if (understanding.primaryIntent === 'acknowledgement') {
  return createDialogueDecision({
    action: 'ACKNOWLEDGE',
    goal: 'assist_customer',
    reason: 'acknowledgement',
    targetIntent: 'acknowledgement',
  });
}

if (SOCIAL_INTENTS.has(understanding.primaryIntent)) {
  return createDialogueDecision({
    action: 'ANSWER',
    goal: 'assist_customer',
    reason: 'social_conversation',
    targetIntent: understanding.primaryIntent,
  });
}
    return createDialogueDecision();
  }
}

function escalationReason(signals) {
  if (signals.medicalRisk === true) {
    return 'medical_risk';
  }

  if (signals.legalEscalation === true) {
    return 'legal_escalation';
  }

  if (signals.humanHandover === true) {
    return 'explicit_human_handover';
  }

  if (signals.abuseOrThreat === true) {
    return 'abuse_or_threat';
  }

  return 'unknown';
}

module.exports = DeterministicDialogueDecisionProvider;