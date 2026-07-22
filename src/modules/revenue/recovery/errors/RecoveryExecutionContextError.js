'use strict';

/**
 * Represents a loader failure or invalid loaded execution-context contract.
 */
class RecoveryExecutionContextError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {unknown} [options.cause]
   * @param {object} [options.details]
   */
  constructor(message, options = {}) {
    if (!RecoveryExecutionContextError.#isPlainObject(options)) {
      throw new TypeError(
        'RecoveryExecutionContextError: "options" must be a plain object.'
      );
    }

    const hasCause = Object.prototype.hasOwnProperty.call(options, 'cause');

    if (hasCause) {
      super(message, { cause: options.cause });
    } else {
      super(message);
    }

    const details = options.details ?? {};

    if (!RecoveryExecutionContextError.#isPlainObject(details)) {
      throw new TypeError(
        'RecoveryExecutionContextError: "details" must be a plain object.'
      );
    }

    this.name = 'RecoveryExecutionContextError';
    this.details = Object.freeze({ ...details });

    Error.captureStackTrace?.(this, RecoveryExecutionContextError);
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
  RecoveryExecutionContextError,
};
