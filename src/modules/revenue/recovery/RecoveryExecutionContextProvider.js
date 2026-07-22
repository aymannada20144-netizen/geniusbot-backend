'use strict';

const {
  RECOVERY_ATTEMPT_STATUS,
} = require('../../../constants/recoveryAttemptStatus');

const {
  RecoveryExecutionContextError,
} = require('./errors/RecoveryExecutionContextError');

const REQUIRED_ATTEMPT_PROPERTIES = Object.freeze([
  'id',
  'clinic_id',
  'opportunity_id',
  'channel',
  'attempt_type',
  'status',
]);

const REQUIRED_CONTEXT_SECTIONS = Object.freeze([
  'policyContext',
  'messageContext',
  'providers',
]);

/**
 * Validates a claimed attempt and adapts an injected loader result to the
 * execution-context contract consumed by RecoveryExecutionService.
 */
class RecoveryExecutionContextProvider {
  #load;

  /**
   * @param {object} dependencies
   * @param {Function} dependencies.load
   */
  constructor({ load } = {}) {
    if (typeof load !== 'function') {
      throw new TypeError(
        'RecoveryExecutionContextProvider: "load" must be a function.'
      );
    }

    this.#load = load;
  }

  /**
   * @param {object} claimedAttempt
   * @returns {Promise<Readonly<object>>}
   */
  async getExecutionContext(claimedAttempt) {
    const identifiers = this.#validateClaimedAttempt(claimedAttempt);

    let loadedContext;

    try {
      loadedContext = await this.#load(claimedAttempt);
    } catch (cause) {
      throw new RecoveryExecutionContextError(
        'Recovery execution context loading failed.',
        {
          cause,
          details: identifiers,
        }
      );
    }

    const sections = this.#validateLoadedContext(
      loadedContext,
      identifiers
    );

    return Object.freeze({
      policyContext: sections.policyContext,
      messageContext: sections.messageContext,
      providers: sections.providers,
    });
  }

  #validateClaimedAttempt(claimedAttempt) {
    this.#assertPlainObject(claimedAttempt, 'claimedAttempt');

    const values = {};

    for (const propertyName of REQUIRED_ATTEMPT_PROPERTIES) {
      const descriptor = Object.getOwnPropertyDescriptor(
        claimedAttempt,
        propertyName
      );

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        throw new TypeError(
          `RecoveryExecutionContextProvider: claimedAttempt.${propertyName} must be an own data property.`
        );
      }

      if (
        typeof descriptor.value !== 'string' ||
        descriptor.value.trim().length === 0
      ) {
        throw new TypeError(
          `RecoveryExecutionContextProvider: claimedAttempt.${propertyName} must be a non-empty string.`
        );
      }

      values[propertyName] = descriptor.value;
    }

    if (values.status !== RECOVERY_ATTEMPT_STATUS.PROCESSING) {
      throw new TypeError(
        'RecoveryExecutionContextProvider: claimedAttempt.status must be processing.'
      );
    }

    return {
      attemptId: values.id,
      clinicId: values.clinic_id,
      opportunityId: values.opportunity_id,
    };
  }

  #validateLoadedContext(loadedContext, identifiers) {
    if (!this.#isPlainObject(loadedContext)) {
      this.#throwContextError(
        'Loaded recovery execution context must be a plain object.',
        identifiers
      );
    }

    const ownKeys = Reflect.ownKeys(loadedContext);

    if (
      ownKeys.length !== REQUIRED_CONTEXT_SECTIONS.length ||
      ownKeys.some(
        (key) =>
          typeof key !== 'string' ||
          !REQUIRED_CONTEXT_SECTIONS.includes(key)
      )
    ) {
      this.#throwContextError(
        'Loaded recovery execution context must contain exactly the required sections.',
        identifiers
      );
    }

    const sections = {};

    for (const sectionName of REQUIRED_CONTEXT_SECTIONS) {
      const descriptor = Object.getOwnPropertyDescriptor(
        loadedContext,
        sectionName
      );

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        this.#throwContextError(
          `Loaded recovery execution context section "${sectionName}" must be an own data property.`,
          identifiers
        );
      }

      if (!this.#isPlainObject(descriptor.value)) {
        this.#throwContextError(
          `Loaded recovery execution context section "${sectionName}" must be a plain object.`,
          identifiers
        );
      }

      sections[sectionName] = descriptor.value;
    }

    return sections;
  }

  #throwContextError(message, identifiers) {
    throw new RecoveryExecutionContextError(message, {
      details: identifiers,
    });
  }

  #assertPlainObject(value, fieldName) {
    if (!this.#isPlainObject(value)) {
      throw new TypeError(
        `RecoveryExecutionContextProvider: "${fieldName}" must be a plain object.`
      );
    }
  }

  #isPlainObject(value) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }
}

module.exports = RecoveryExecutionContextProvider;
