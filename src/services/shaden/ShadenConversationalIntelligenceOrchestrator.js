'use strict';

const {
  createConversationalUnderstandingResult,
} = require('../../contracts/shaden/ConversationalUnderstandingResult');

const {
  createDialogueDecision,
} = require('../../contracts/shaden/DialogueDecision');

class ShadenConversationalIntelligenceOrchestrator {
  constructor({
    understandingProvider = null,
    decisionProvider = null,
    logger = null,
  } = {}) {
    this.understandingProvider = understandingProvider;
    this.decisionProvider = decisionProvider;
    this.logger = logger;
  }

  async analyze({
    message,
    currentState = null,
    clinicContext = null,
    patientContext = null,
  } = {}) {
    const input = createSafeInput({
      message,
      currentState,
      clinicContext,
      patientContext,
    });

    const understanding = await this.#understand(input);
    const decision = await this.#decide({
      input,
      understanding,
    });

    const result = Object.freeze({
      version: 1,
      mode: 'shadow',
      input,
      understanding,
      decision,

      affectsRuntime: false,
      affectsReply: false,
      affectsState: false,
      executable: false,
    });

    this.#log(result);

    return result;
  }

  async #understand(input) {
    if (typeof this.understandingProvider?.understand !== 'function') {
      return createConversationalUnderstandingResult();
    }

    try {
      const raw = await this.understandingProvider.understand(input);

      return createConversationalUnderstandingResult(raw);
    } catch {
      return createConversationalUnderstandingResult();
    }
  }

  async #decide({ input, understanding }) {
    if (typeof this.decisionProvider?.decide !== 'function') {
      return createDialogueDecision();
    }

    try {
      const raw = await this.decisionProvider.decide({
        input,
        understanding,
      });

      return createDialogueDecision(raw);
    } catch {
      return createDialogueDecision();
    }
  }

  #log(result) {
    if (typeof this.logger?.debug !== 'function') return;

    try {
      this.logger.debug('Shaden CI shadow result', result);
    } catch {
      // Shadow telemetry must never affect production behavior.
    }
  }
}

function createSafeInput({
  message,
  currentState,
  clinicContext,
  patientContext,
}) {
  return Object.freeze({
    text: normalizeText(message),
    state: freezePlainSnapshot(currentState),
    clinic: freezePlainSnapshot(clinicContext),
    patient: freezePlainSnapshot(patientContext),
  });
}

function normalizeText(message) {
  const value = message && typeof message === 'object'
    ? message.text
    : message;

  return typeof value === 'string'
    ? value.trim()
    : '';
}

function freezePlainSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.freeze({});
  }

  const snapshot = {};

  for (const [key, item] of Object.entries(value)) {
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {
      snapshot[key] = item;
    }
  }

  return Object.freeze(snapshot);
}

module.exports = ShadenConversationalIntelligenceOrchestrator;