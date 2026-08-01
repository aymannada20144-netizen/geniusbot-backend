'use strict';

const CONTEXT_FIELDS = Object.freeze([
  'message',
  'interpretation',
  'activeFlow',
  'pendingAction',
  'bookingResult',
  'knowledgeResult',
]);

const BOOKING_INTENTS = Object.freeze([
  'booking',
  'book',
  'create_booking',
  'appointment_booking',
]);

const BOOKING_FLOWS = Object.freeze([
  'booking',
  'appointment_booking',
]);

class ConversationDecisionEngine {
  constructor() {}

  decide(context) {
    const fields = readContext(context);
    const pendingAction = fieldValue(fields.pendingAction);

    if (pendingAction !== null) {
      return decision(
        'execute_pending_action',
        'pending_action',
        pendingAction,
        'A pending action must be resolved before selecting a new conversation path.'
      );
    }

    const bookingResult = fieldValue(fields.bookingResult);
    if (bookingResult !== null) {
      validateResult(
        bookingResult,
        'bookingResult',
        'booking_result'
      );
      return decision(
        'continue_booking',
        'booking_result',
        bookingResult,
        'A booking result is available and must be handled by the booking response path.'
      );
    }

    const knowledgeResult = fieldValue(fields.knowledgeResult);
    if (knowledgeResult !== null) {
      validateResult(
        knowledgeResult,
        'knowledgeResult',
        'knowledge_result'
      );
      return decision(
        'answer_knowledge',
        'knowledge_result',
        knowledgeResult,
        'A knowledge result is available and must be handled by the knowledge response path.'
      );
    }

    const interpretation = fieldValue(fields.interpretation);
    let interpretationIntent = null;
    if (interpretation !== null) {
      if (!isPlainObject(interpretation)) {
        throw new TypeError(
          'ConversationDecisionEngine interpretation must be a plain object'
        );
      }
      interpretationIntent = nestedValue(
        interpretation,
        'intent',
        'interpretation.intent'
      );
      if (BOOKING_INTENTS.includes(interpretationIntent)) {
        return decision(
          'start_booking',
          'interpretation',
          interpretation,
          'The interpreted user intent requests a booking flow.'
        );
      }
    }

    const activeFlow = fieldValue(fields.activeFlow);
    if (activeFlow !== null && isActiveBookingFlow(activeFlow)) {
      return decision(
        'continue_booking',
        'active_flow',
        activeFlow,
        'An active booking flow must continue before selecting a new intent.'
      );
    }

    if (interpretation !== null) {
      return decision(
        'clarify_intent',
        'interpretation',
        interpretation,
        'The interpretation does not identify a supported executable conversation path.'
      );
    }

    return decision(
      'idle',
      'none',
      null,
      'No pending action, result, active flow, or interpreted intent is available.'
    );
  }
}

function readContext(context) {
  if (!isPlainObject(context)) {
    throw new TypeError(
      'ConversationDecisionEngine context must be a plain object'
    );
  }

  const allowed = new Set(CONTEXT_FIELDS);
  const keys = Object.keys(context);
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new TypeError(
        `ConversationDecisionEngine received unsupported field: ${key}`
      );
    }
  }

  const fields = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(context, key);
    if (descriptor.get || descriptor.set) {
      throw new TypeError(
        `ConversationDecisionEngine does not accept accessor property: ${key}`
      );
    }
    fields[key] = descriptor;
  }
  return fields;
}

function validateResult(result, fieldName, expectedKind) {
  if (!isPlainObject(result)) {
    throw new TypeError(
      `ConversationDecisionEngine ${fieldName} must be a plain object`
    );
  }
  const kind = nestedValue(result, 'kind', `${fieldName}.kind`);
  if (kind !== expectedKind) {
    throw new TypeError(
      `ConversationDecisionEngine ${fieldName}.kind must equal ${expectedKind}`
    );
  }
}

function isActiveBookingFlow(activeFlow) {
  if (typeof activeFlow === 'string') {
    return BOOKING_FLOWS.includes(activeFlow);
  }
  if (!isPlainObject(activeFlow)) {
    throw new TypeError(
      'ConversationDecisionEngine activeFlow must be a string, plain object, or null'
    );
  }
  const type = nestedValue(activeFlow, 'type', 'activeFlow.type');
  return BOOKING_FLOWS.includes(type);
}

function nestedValue(object, fieldName, path) {
  const descriptor = Object.getOwnPropertyDescriptor(object, fieldName);
  if (!descriptor) return null;
  if (descriptor.get || descriptor.set) {
    throw new TypeError(
      `ConversationDecisionEngine does not accept accessor property: ${path}`
    );
  }
  return descriptor.value === undefined ? null : descriptor.value;
}

function fieldValue(descriptor) {
  return !descriptor || descriptor.value === undefined
    ? null
    : descriptor.value;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function decision(action, source, payload, reason) {
  return Object.freeze({
    kind: 'conversation_decision',
    action,
    source,
    payload,
    reason,
  });
}

module.exports = ConversationDecisionEngine;
