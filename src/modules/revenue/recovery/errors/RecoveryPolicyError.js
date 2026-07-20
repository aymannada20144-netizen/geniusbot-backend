'use strict';

/**
 * ============================================================================
 * Recovery Policy Error
 * ============================================================================
 *
 * Thrown when a recovery attempt violates business policy.
 *
 * Examples:
 * - Maximum recovery attempts exceeded.
 * - Opportunity is no longer eligible.
 * - Recovery window has expired.
 * - Patient opted out.
 * - Clinic configuration disables recovery.
 * ============================================================================
 */
class RecoveryPolicyError extends Error {
  /**
   * @param {string} message
   * @param {object} [details={}]
   * @param {string} [details.reason]
   * @param {string} [details.policy]
   * @param {string} [details.opportunityId]
   * @param {string} [details.clinicId]
   * @param {string} [details.patientId]
   * @param {Error} [options.cause]
   */
  constructor(message, details = {}, options = {}) {
    super(message, options);

    this.name = 'RecoveryPolicyError';
    this.code = 'RECOVERY_POLICY_ERROR';
    this.details = Object.freeze({ ...details });

    Error.captureStackTrace?.(this, RecoveryPolicyError);
  }
}

module.exports = {
  RecoveryPolicyError,
};