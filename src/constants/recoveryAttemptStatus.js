'use strict';

/**
 * ============================================================================
 * Recovery Attempt Status Constants
 * ============================================================================
 *
 * These values MUST remain synchronized with:
 * geniusbot.recovery_attempts.status
 *
 * Database values:
 * - scheduled
 * - processing
 * - sent
 * - delivered
 * - replied
 * - failed
 * - cancelled
 * ============================================================================
 */

/**
 * Recovery attempt lifecycle statuses.
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
 * All supported recovery attempt status values.
 */
const RECOVERY_ATTEMPT_STATUS_VALUES = Object.freeze(
  Object.values(RECOVERY_ATTEMPT_STATUS),
);

/**
 * Statuses eligible to be claimed by the Recovery Worker.
 *
 * Only scheduled attempts can be picked for execution.
 */
const RECOVERY_CLAIMABLE_STATUSES = Object.freeze([
  RECOVERY_ATTEMPT_STATUS.SCHEDULED,
]);

/**
 * Statuses considered active.
 *
 * These attempts have not yet reached a terminal business state.
 */
const RECOVERY_ACTIVE_STATUSES = Object.freeze([
  RECOVERY_ATTEMPT_STATUS.SCHEDULED,
  RECOVERY_ATTEMPT_STATUS.PROCESSING,
  RECOVERY_ATTEMPT_STATUS.SENT,
  RECOVERY_ATTEMPT_STATUS.DELIVERED,
]);

/**
 * Statuses indicating that worker execution has completed.
 *
 * Provider webhooks may later move:
 * SENT -> DELIVERED -> REPLIED
 */
const RECOVERY_EXECUTION_COMPLETED_STATUSES = Object.freeze([
  RECOVERY_ATTEMPT_STATUS.SENT,
  RECOVERY_ATTEMPT_STATUS.DELIVERED,
  RECOVERY_ATTEMPT_STATUS.REPLIED,
  RECOVERY_ATTEMPT_STATUS.FAILED,
  RECOVERY_ATTEMPT_STATUS.CANCELLED,
]);

/**
 * Terminal business statuses.
 *
 * Once an attempt reaches one of these states,
 * no further business transition should normally occur.
 */
const RECOVERY_TERMINAL_STATUSES = Object.freeze([
  RECOVERY_ATTEMPT_STATUS.REPLIED,
  RECOVERY_ATTEMPT_STATUS.FAILED,
  RECOVERY_ATTEMPT_STATUS.CANCELLED,
]);

/**
 * Determines whether a value is a valid recovery attempt status.
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

/**
 * Determines whether the worker has finished actively
 * executing the recovery attempt.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecoveryExecutionCompletedStatus(value) {
  return (
    typeof value === 'string' &&
    RECOVERY_EXECUTION_COMPLETED_STATUSES.includes(value)
  );
}

/**
 * Determines whether the recovery attempt
 * reached a terminal business state.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecoveryTerminalStatus(value) {
  return (
    typeof value === 'string' &&
    RECOVERY_TERMINAL_STATUSES.includes(value)
  );
}

module.exports = {
  RECOVERY_ATTEMPT_STATUS,
  RECOVERY_ATTEMPT_STATUS_VALUES,

  RECOVERY_CLAIMABLE_STATUSES,
  RECOVERY_ACTIVE_STATUSES,

  RECOVERY_EXECUTION_COMPLETED_STATUSES,
  RECOVERY_TERMINAL_STATUSES,

  isRecoveryAttemptStatus,
  isRecoveryExecutionCompletedStatus,
  isRecoveryTerminalStatus,
};