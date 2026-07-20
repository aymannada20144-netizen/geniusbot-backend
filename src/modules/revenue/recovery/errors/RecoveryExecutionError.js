'use strict';

/**
 * ============================================================================
 * Recovery Execution Error
 * ============================================================================
 *
 * Thrown when a recovery attempt cannot be executed due to an
 * operational or infrastructure failure.
 *
 * Examples:
 * - Provider timeout.
 * - WhatsApp API failure.
 * - SMS gateway unavailable.
 * - Email delivery failure.
 * - Phone provider error.
 * - Database transaction failure.
 * - Unexpected runtime exception.
 *
 * This error represents execution failures, not business-policy or
 * state-transition violations.
 * ============================================================================
 */
class RecoveryExecutionError extends Error {
  /**
   * @param {string} message
   * @param {object} [details={}]
   * @param {string} [details.reason]
   * @param {string} [details.channel]
   * @param {string} [details.provider]
   * @param {string} [details.operation]
   * @param {string} [details.attemptId]
   * @param {string} [details.opportunityId]
   * @param {number} [details.statusCode]
   * @param {boolean} [details.retryable]
   * @param {Error} [options.cause]
   */
  constructor(message, details = {}, options = {}) {
    super(message, options);

    this.name = 'RecoveryExecutionError';
    this.code = 'RECOVERY_EXECUTION_ERROR';

    this.details = Object.freeze({
      retryable: false,
      ...details,
    });

    Error.captureStackTrace?.(this, RecoveryExecutionError);
  }

  /**
   * Indicates whether this execution failure may be retried.
   *
   * @returns {boolean}
   */
  isRetryable() {
    return this.details.retryable === true;
  }
}

module.exports = {
  RecoveryExecutionError,
};