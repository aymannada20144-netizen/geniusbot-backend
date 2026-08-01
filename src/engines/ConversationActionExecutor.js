'use strict';

const DEPENDENCY_FIELDS = Object.freeze([
  'pendingActionExecutor',
  'bookingHandler',
  'knowledgeHandler',
  'intentClarifier',
]);

const DECISION_FIELDS = Object.freeze([
  'kind',
  'action',
  'source',
  'payload',
  'reason',
]);

const ACTIONS = Object.freeze([
  'execute_pending_action',
  'continue_booking',
  'answer_knowledge',
  'start_booking',
  'clarify_intent',
  'idle',
]);

const SOURCES = Object.freeze([
  'pending_action',
  'booking_result',
  'knowledge_result',
  'interpretation',
  'active_flow',
  'none',
]);

class ConversationActionExecutor {
  #pendingActionExecutor;
  #bookingHandler;
  #knowledgeHandler;
  #intentClarifier;

  constructor(dependencies) {
    const fields = readDependencies(dependencies);

    this.#pendingActionExecutor = dependencyValue(
      fields.pendingActionExecutor,
      'pendingActionExecutor'
    );
    this.#bookingHandler = dependencyValue(
      fields.bookingHandler,
      'bookingHandler'
    );
    this.#knowledgeHandler = dependencyValue(
      fields.knowledgeHandler,
      'knowledgeHandler'
    );
    this.#intentClarifier = dependencyValue(
      fields.intentClarifier,
      'intentClarifier'
    );

    Object.freeze(this);
  }

  execute(decision, executionContext) {
    const fields = readDecision(decision);
    const action = fields.action.value;
    const payload = fields.payload.value;
    const context = executionContext === undefined ? null : executionContext;

    switch (action) {
      case 'execute_pending_action':
        return callHandler(
          this.#pendingActionExecutor,
          'execute_pending_action',
          'pendingActionExecutor',
          payload,
          context,
          decision
        );
      case 'continue_booking':
        return callHandler(
          this.#bookingHandler,
          'continue_booking',
          'bookingHandler',
          payload,
          context,
          decision
        );
      case 'answer_knowledge':
        return callHandler(
          this.#knowledgeHandler,
          'answer_knowledge',
          'knowledgeHandler',
          payload,
          context,
          decision
        );
      case 'start_booking':
        return callHandler(
          this.#bookingHandler,
          'start_booking',
          'bookingHandler',
          payload,
          context,
          decision
        );
      case 'clarify_intent':
        return callHandler(
          this.#intentClarifier,
          'clarify_intent',
          'intentClarifier',
          payload,
          context,
          decision
        );
      default:
        return Object.freeze({
          kind: 'action_execution_result',
          action: 'idle',
          status: 'skipped',
          result: null,
          reason: 'No executable conversation action was selected.',
        });
    }
  }
}

function readDependencies(dependencies) {
  if (!isPlainObject(dependencies)) {
    throw new TypeError(
      'ConversationActionExecutor dependencies must be a plain object'
    );
  }

  const allowed = new Set(DEPENDENCY_FIELDS);
  const keys = Reflect.ownKeys(dependencies);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(
        `ConversationActionExecutor received unsupported dependency: ${String(key)}`
      );
    }
  }

  const fields = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(dependencies, key);
    if (descriptor.get || descriptor.set) {
      throw new TypeError(
        `ConversationActionExecutor does not accept accessor dependency: ${key}`
      );
    }
    fields[key] = descriptor;
  }
  return fields;
}

function dependencyValue(descriptor, fieldName) {
  const value = !descriptor || descriptor.value === undefined
    ? null
    : descriptor.value;
  if (value !== null && typeof value !== 'function') {
    throw new TypeError(
      `ConversationActionExecutor dependency must be a function or null: ${fieldName}`
    );
  }
  return value;
}

function readDecision(decision) {
  if (!isPlainObject(decision)) {
    throw new TypeError(
      'ConversationActionExecutor decision must be a plain object'
    );
  }

  const allowed = new Set(DECISION_FIELDS);
  const keys = Reflect.ownKeys(decision);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new TypeError(
        `ConversationActionExecutor received unsupported decision field: ${String(key)}`
      );
    }
  }

  const fields = Object.create(null);
  for (const field of DECISION_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(decision, field);
    if (!descriptor) {
      throw new TypeError(
        `ConversationActionExecutor decision must define own field: ${field}`
      );
    }
    if (descriptor.get || descriptor.set) {
      throw new TypeError(
        `ConversationActionExecutor does not accept accessor property: decision.${field}`
      );
    }
    fields[field] = descriptor;
  }

  if (fields.kind.value !== 'conversation_decision') {
    throw new TypeError(
      'ConversationActionExecutor decision.kind must equal conversation_decision'
    );
  }
  if (!ACTIONS.includes(fields.action.value)) {
    throw new TypeError(
      `ConversationActionExecutor decision.action is unsupported: ${String(fields.action.value)}`
    );
  }
  if (!SOURCES.includes(fields.source.value)) {
    throw new TypeError(
      `ConversationActionExecutor decision.source is unsupported: ${String(fields.source.value)}`
    );
  }
  if (typeof fields.reason.value !== 'string') {
    throw new TypeError(
      'ConversationActionExecutor decision.reason must be a string'
    );
  }

  return fields;
}

function callHandler(
  handler,
  action,
  dependencyName,
  payload,
  executionContext,
  decision
) {
  if (handler === null) {
    throw new Error(
      `ConversationActionExecutor missing dependency for action ${action}: ${dependencyName}`
    );
  }
  return handler(payload, executionContext, decision);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

module.exports = ConversationActionExecutor;
