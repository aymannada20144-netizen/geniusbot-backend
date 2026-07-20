'use strict';

/**
 * ============================================================================
 * Recovery Transition Error
 * ============================================================================
 *
 * Thrown when a recovery-attempt status transition is invalid.
 *
 * Examples:
 * - Unsupported source or target status.
 * - Transitioning to the same status.
 * - Transitioning from a terminal status.
 * - Attempting a transition not defined in RecoveryTransitions.
 * ============================================================================
 */
class RecoveryTransitionError extends Error {
  /**
   * @param {string} message
   * @param {object} [details={}]
   * @param {string} [details.fromStatus]
   * @param {string} [details.toStatus]
   * @param {string} [details.reason]
   * @param {string} [details.fieldName]
   * @param {unknown} [details.status]
   * @param {readonly string[]} [details.allowedTransitions]
   * @param {readonly string[]} [details.supportedStatuses]
   * @param {Error} [options.cause]
   */
  constructor(message, details = {}, options = {}) {
    super(message, options);

    this.name = 'RecoveryTransitionError';
    this.code = 'RECOVERY_TRANSITION_ERROR';
    this.details = Object.freeze({ ...details });

    Error.captureStackTrace?.(this, RecoveryTransitionError);
  }
}

module.exports = {
  RecoveryTransitionError,
};