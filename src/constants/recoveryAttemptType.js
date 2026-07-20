'use strict';

/**
 * ============================================================================
 * Recovery Attempt Type Constants
 * ============================================================================
 *
 * These values MUST remain synchronized with:
 * geniusbot.recovery_attempts.attempt_type
 *
 * Database values:
 * - missed_call_recovery
 * - unanswered_message_followup
 * - abandoned_booking_followup
 * - no_show_recovery
 * - cancelled_appointment_recovery
 * - patient_reactivation
 * - manual_followup
 * ============================================================================
 */

/**
 * Supported recovery attempt types.
 */
const RECOVERY_ATTEMPT_TYPE = Object.freeze({
  MISSED_CALL_RECOVERY: 'missed_call_recovery',

  UNANSWERED_MESSAGE_FOLLOWUP: 'unanswered_message_followup',

  ABANDONED_BOOKING_FOLLOWUP: 'abandoned_booking_followup',

  NO_SHOW_RECOVERY: 'no_show_recovery',

  CANCELLED_APPOINTMENT_RECOVERY: 'cancelled_appointment_recovery',

  PATIENT_REACTIVATION: 'patient_reactivation',

  MANUAL_FOLLOWUP: 'manual_followup',
});

/**
 * All supported recovery attempt type values.
 */
const RECOVERY_ATTEMPT_TYPE_VALUES = Object.freeze(
  Object.values(RECOVERY_ATTEMPT_TYPE),
);

/**
 * Recovery attempt types executed automatically by the system.
 *
 * These attempts are attributed to the AI initiator.
 */
const AUTOMATED_RECOVERY_ATTEMPT_TYPES = Object.freeze([
  RECOVERY_ATTEMPT_TYPE.MISSED_CALL_RECOVERY,
  RECOVERY_ATTEMPT_TYPE.UNANSWERED_MESSAGE_FOLLOWUP,
  RECOVERY_ATTEMPT_TYPE.ABANDONED_BOOKING_FOLLOWUP,
  RECOVERY_ATTEMPT_TYPE.NO_SHOW_RECOVERY,
  RECOVERY_ATTEMPT_TYPE.CANCELLED_APPOINTMENT_RECOVERY,
  RECOVERY_ATTEMPT_TYPE.PATIENT_REACTIVATION,
]);

/**
 * Recovery attempt types initiated manually by clinic staff.
 */
const MANUAL_RECOVERY_ATTEMPT_TYPES = Object.freeze([
  RECOVERY_ATTEMPT_TYPE.MANUAL_FOLLOWUP,
]);

/**
 * Determines whether a value is a supported recovery attempt type.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecoveryAttemptType(value) {
  return (
    typeof value === 'string' &&
    RECOVERY_ATTEMPT_TYPE_VALUES.includes(value)
  );
}

/**
 * Determines whether a recovery attempt type is automated.
 *
 * Automated attempts must be attributed to the AI initiator.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isAutomatedRecoveryAttemptType(value) {
  return (
    typeof value === 'string' &&
    AUTOMATED_RECOVERY_ATTEMPT_TYPES.includes(value)
  );
}

/**
 * Determines whether a recovery attempt type is initiated manually
 * by clinic staff.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isManualRecoveryAttemptType(value) {
  return (
    typeof value === 'string' &&
    MANUAL_RECOVERY_ATTEMPT_TYPES.includes(value)
  );
}

module.exports = {
  RECOVERY_ATTEMPT_TYPE,
  RECOVERY_ATTEMPT_TYPE_VALUES,

  AUTOMATED_RECOVERY_ATTEMPT_TYPES,
  MANUAL_RECOVERY_ATTEMPT_TYPES,

  isRecoveryAttemptType,
  isAutomatedRecoveryAttemptType,
  isManualRecoveryAttemptType,
};