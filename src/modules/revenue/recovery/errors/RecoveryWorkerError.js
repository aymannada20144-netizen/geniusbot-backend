'use strict';

/**
 * Represents a recovery-worker orchestration or infrastructure failure.
 */
class RecoveryWorkerError extends Error {
  constructor(message, options = {}) {
    if (!RecoveryWorkerError.#isPlainObject(options)) {
      throw new TypeError(
        'RecoveryWorkerError: "options" must be a plain object.'
      );
    }

    const hasCause = Object.prototype.hasOwnProperty.call(options, 'cause');

    if (hasCause) {
      super(message, { cause: options.cause });
    } else {
      super(message);
    }

    const details = options.details ?? {};

    if (!RecoveryWorkerError.#isPlainObject(details)) {
      throw new TypeError(
        'RecoveryWorkerError: "details" must be a plain object.'
      );
    }

    this.name = 'RecoveryWorkerError';
    this.details = Object.freeze({ ...details });

    Error.captureStackTrace?.(this, RecoveryWorkerError);
  }

  static #isPlainObject(value) {
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

module.exports = {
  RecoveryWorkerError,
};
