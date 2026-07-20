'use strict';

const {
  RECOVERY_ATTEMPT_STATUS_VALUES,
  isRecoveryAttemptStatus,
} = require('../../../constants/recoveryAttemptStatus');

/**
 * ============================================================================
 * Recovery Execution Result
 * ============================================================================
 *
 * Immutable DTO returned by every recovery channel implementation.
 *
 * All execution channels (WhatsApp, SMS, Email, Phone, Dashboard)
 * must return this object so RecoveryExecutionService can process
 * results consistently.
 *
 * Responsibilities:
 * - Standardize execution results.
 * - Validate returned status.
 * - Carry provider metadata.
 * - Remain immutable.
 *
 * Non-responsibilities:
 * - State transitions.
 * - Database persistence.
 * - Retry logic.
 * - Business policy.
 * ============================================================================
 */
class RecoveryExecutionResult {
  /**
   * @param {object} data
   * @param {boolean} data.success
   * @param {string} data.status
   * @param {string|null} [data.provider]
   * @param {string|null} [data.providerMessageId]
   * @param {number|null} [data.statusCode]
   * @param {string|null} [data.failureReason]
   * @param {boolean} [data.retryable=false]
   * @param {object} [data.metadata]
   */
  constructor(data = {}) {
    if (typeof data.success !== 'boolean') {
      throw new TypeError(
        'RecoveryExecutionResult: "success" must be a boolean.'
      );
    }

    if (!isRecoveryAttemptStatus(data.status)) {
      throw new TypeError(
        `Unsupported recovery status "${data.status}". Supported statuses: ${RECOVERY_ATTEMPT_STATUS_VALUES.join(', ')}.`
      );
    }

    this.success = data.success;
    this.status = data.status;

    this.provider = data.provider ?? null;
    this.providerMessageId = data.providerMessageId ?? null;
    this.statusCode = data.statusCode ?? null;

    this.failureReason = data.failureReason ?? null;
    this.retryable = data.retryable === true;

    this.metadata = Object.freeze({
      ...(data.metadata || {}),
    });

    Object.freeze(this);
  }

  /**
   * Returns a plain JSON object.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      success: this.success,
      status: this.status,
      provider: this.provider,
      providerMessageId: this.providerMessageId,
      statusCode: this.statusCode,
      failureReason: this.failureReason,
      retryable: this.retryable,
      metadata: this.metadata,
    };
  }

  /**
   * Indicates whether execution succeeded.
   *
   * @returns {boolean}
   */
  isSuccess() {
    return this.success;
  }

  /**
   * Indicates whether execution failed.
   *
   * @returns {boolean}
   */
  isFailure() {
    return !this.success;
  }
}

module.exports = {
  RecoveryExecutionResult,
};