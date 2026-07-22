'use strict';

const MAX_TOTAL_ATTEMPTS = 3;
const RETRY_DELAYS_MS = Object.freeze({
  1: 5 * 60 * 1000,
  2: 30 * 60 * 1000,
});

class RecoveryRetryPolicy {
  isRetryable(input) {
    this.#assertPlainObject(input, 'argument');

    const error = this.#requiredDataProperty(input, 'error', 'argument');
    const attempt = this.#requiredDataProperty(
      input,
      'attempt',
      'argument'
    );

    this.#assertPlainObject(attempt, 'attempt');

    const attemptNumber = this.#resolveAttemptNumber(attempt);

    if (attemptNumber >= MAX_TOTAL_ATTEMPTS) {
      return false;
    }

    if (
      error === null ||
      (typeof error !== 'object' && typeof error !== 'function')
    ) {
      return false;
    }

    const retryableDescriptor = Object.getOwnPropertyDescriptor(
      error,
      'retryable'
    );

    return Boolean(
      retryableDescriptor &&
      Object.prototype.hasOwnProperty.call(
        retryableDescriptor,
        'value'
      ) &&
      retryableDescriptor.value === true
    );
  }

  calculateNextScheduledAt(input) {
    this.#assertPlainObject(input, 'argument');

    const error = this.#requiredDataProperty(input, 'error', 'argument');
    const attempt = this.#requiredDataProperty(
      input,
      'attempt',
      'argument'
    );
    const now = this.#requiredDataProperty(input, 'now', 'argument');

    this.#assertPlainObject(attempt, 'attempt');

    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError(
        'RecoveryRetryPolicy: now must be a valid Date.'
      );
    }

    if (!this.isRetryable({ error, attempt })) {
      throw new TypeError(
        'RecoveryRetryPolicy: failure is not retryable.'
      );
    }

    const attemptNumber = this.#resolveAttemptNumber(attempt);

    return new Date(now.getTime() + RETRY_DELAYS_MS[attemptNumber]);
  }

  #resolveAttemptNumber(attempt) {
    const snakeCaseDescriptor = Object.getOwnPropertyDescriptor(
      attempt,
      'attempt_number'
    );
    const camelCaseDescriptor = Object.getOwnPropertyDescriptor(
      attempt,
      'attemptNumber'
    );
    const descriptor = snakeCaseDescriptor || camelCaseDescriptor;

    if (!descriptor) {
      return 1;
    }

    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(
        'RecoveryRetryPolicy: attempt number must be an own data property.'
      );
    }

    if (
      !Number.isFinite(descriptor.value) ||
      !Number.isInteger(descriptor.value) ||
      descriptor.value < 1
    ) {
      throw new TypeError(
        'RecoveryRetryPolicy: attempt number must be a positive finite integer.'
      );
    }

    return descriptor.value;
  }

  #requiredDataProperty(object, propertyName, objectName) {
    const descriptor = Object.getOwnPropertyDescriptor(
      object,
      propertyName
    );

    if (
      !descriptor ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(
        `RecoveryRetryPolicy: ${objectName}.${propertyName} must be an own data property.`
      );
    }

    return descriptor.value;
  }

  #assertPlainObject(value, fieldName) {
    if (!this.#isPlainObject(value)) {
      throw new TypeError(
        `RecoveryRetryPolicy: ${fieldName} must be a plain object.`
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

module.exports = RecoveryRetryPolicy;
