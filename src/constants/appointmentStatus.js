'use strict';

/**
 * Recovery attempt lifecycle statuses.
 *
 * IMPORTANT:
 * These values must stay aligned with:
 * geniusbot.recovery_attempts.status
 *
 * Allowed database values:
 * - scheduled
 * - processing
 * - sent
 * - delivered
 * - replied
 * - failed
 * - cancelled
 */
const RECOVERY_ATTEMPT_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  PROCESSING: 'processing',
  SENT: 'sent',
  DELIVERED: 'delivered',
  REPLIED: 'replied',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/**
 * Immutable list of all supported recovery attempt statuses.
 */
const RECOVERY_ATTEMPT_STATUS_VALUES = Object.freeze(
  Object.values(RECOVERY_ATTEMPT_STATUS)
);

/**
 * Checks whether a value is a supported recovery attempt status.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecoveryAttemptStatus(value) {
  return (
    typeof value === 'string' &&
    RECOVERY_ATTEMPT_STATUS_VALUES.includes(value)
  );
}

module.exports = {
  RECOVERY_ATTEMPT_STATUS,
  RECOVERY_ATTEMPT_STATUS_VALUES,
  isRecoveryAttemptStatus,
};