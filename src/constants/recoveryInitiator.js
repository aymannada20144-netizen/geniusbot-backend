'use strict';

/**
 * ============================================================================
 * Recovery Initiator Constants
 * ============================================================================
 *
 * These values MUST remain synchronized with:
 * geniusbot.lookup_categories
 *
 * Category:
 * RECOVERY_INITIATOR
 *
 * Values:
 * - AI
 * - STAFF
 * ============================================================================
 */

/**
 * Supported recovery initiators.
 */
const RECOVERY_INITIATOR = Object.freeze({
  AI: 'AI',
  STAFF: 'STAFF',
});

/**
 * All supported recovery initiator values.
 */
const RECOVERY_INITIATOR_VALUES = Object.freeze(
  Object.values(RECOVERY_INITIATOR),
);

/**
 * Determines whether a value is a valid recovery initiator.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isRecoveryInitiator(value) {
  return (
    typeof value === 'string' &&
    RECOVERY_INITIATOR_VALUES.includes(value)
  );
}

/**
 * Determines whether the recovery attempt
 * was initiated automatically by the AI.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isAiRecoveryInitiator(value) {
  return value === RECOVERY_INITIATOR.AI;
}

/**
 * Determines whether the recovery attempt
 * was initiated manually by a staff member.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isStaffRecoveryInitiator(value) {
  return value === RECOVERY_INITIATOR.STAFF;
}

module.exports = {
  RECOVERY_INITIATOR,
  RECOVERY_INITIATOR_VALUES,

  isRecoveryInitiator,
  isAiRecoveryInitiator,
  isStaffRecoveryInitiator,
};