'use strict';

const {
  createConversationalUnderstandingResult,
} = require('../../contracts/shaden/ConversationalUnderstandingResult');

const {
  createDialogueDecision,
} = require('../../contracts/shaden/DialogueDecision');
const {
  buildSemanticContext,
} = require('./SemanticContextBuilder');
const {
  createSemanticInteractionEvent,
} = require('../../contracts/shaden/SemanticInteractionEvent');

const DOMAIN_CONSTRAINT_FIELDS = Object.freeze([
  'specialtyId', 'specialtyText', 'serviceId', 'serviceText', 'city',
  'branchId', 'branchText', 'doctorId', 'doctorText', 'date', 'timePeriod',
]);

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

    const analyzed = await this.#understand(input);
    const understanding = analyzed.understanding;
    const decision = await this.#decide({
      input,
      understanding,
    });

    const result = Object.freeze({
      version: 1,
      mode: 'shadow',
      input,
      understanding,
      interactionEvent: analyzed.interactionEvent,
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
      return normalizedUnderstanding();
    }

    try {
      const raw = typeof this.understandingProvider.understandWithMetadata === 'function'
        ? await this.understandingProvider.understandWithMetadata(input)
        : { understanding: await this.understandingProvider.understand(input) };
      return normalizedUnderstanding(raw.understanding, raw.interactionEvent);
    } catch {
      return normalizedUnderstanding();
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

      return createDialogueDecision({
        ...raw,
        proposedDomainConstraints: proposedDomainConstraints(
          understanding.entities,
          raw?.proposedDomainConstraints
        ),
      });
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
    context: buildSemanticContext(currentState),
    interactive: Boolean(
      message && typeof message === 'object' && message.rawPayload?.value
    ),
    state: freezePlainSnapshot(currentState),
    clinic: freezeClinicSnapshot(clinicContext),
    patient: freezePlainSnapshot(patientContext),
  });
}

function proposedDomainConstraints(entities, existing = null) {
  if (!entities || typeof entities !== 'object' || Array.isArray(entities)) {
    return {};
  }
  const constraints = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...existing }
    : {};
  DOMAIN_CONSTRAINT_FIELDS.reduce((result, field) => {
    if (Object.hasOwn(entities, field)) result[field] = entities[field];
    return result;
  }, constraints);
  applySemanticMentions(constraints, entities.serviceMentions, 'service');
  applySemanticMentions(constraints, entities.branchMentions, 'branch');
  return constraints;
}

function applySemanticMentions(constraints, mentions, entityType) {
  if (!Array.isArray(mentions)) return;
  const candidates = [...new Set(mentions
    .filter((mention) => mention?.role !== 'excluded' && mention?.confidence >= 0.85)
    .map((mention) => mention.concept || mention.text)
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()))];
  const textField = `${entityType}Text`;
  const candidateField = `${entityType}Candidates`;
  if (candidates.length === 1) {
    constraints[textField] = candidates[0];
  } else if (candidates.length > 1) {
    delete constraints[textField];
    constraints[candidateField] = candidates;
  }
}

function normalizedUnderstanding(understanding, interactionEvent = null) {
  let event = null;
  if (interactionEvent !== null && interactionEvent !== undefined) {
    try {
      event = createSemanticInteractionEvent(interactionEvent);
    } catch {
      event = null;
    }
  }
  return Object.freeze({
    understanding: createConversationalUnderstandingResult(understanding),
    interactionEvent: event,
  });
}

function freezeClinicSnapshot(value) {
  const snapshot = { ...freezePlainSnapshot(value) };
  if (Array.isArray(value?.services)) {
    snapshot.services = Object.freeze(
      value.services.slice(0, 100).map((service) => Object.freeze({
        name: boundedString(service?.name),
        aliases: Object.freeze(
          Array.isArray(service?.aliases)
            ? service.aliases.slice(0, 20).map(boundedString).filter(Boolean)
            : []
        ),
      })).filter(({ name }) => name)
    );
  }
  return Object.freeze(snapshot);
}

function boundedString(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 200)
    : null;
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
