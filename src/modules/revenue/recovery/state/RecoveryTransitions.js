'use strict';

const {
  RECOVERY_ATTEMPT_STATUS,
} = require('../../../../constants/recoveryAttemptStatus');

/**
 * ============================================================================
 * Recovery State Transitions
 * ============================================================================
 *
 * Defines every valid business transition for a recovery attempt.
 *
 * Any transition not listed here is considered invalid.
 *
 * State diagram:
 *
 * scheduled
 *     ├── processing
 *     └── cancelled
 *
 * processing
 *     ├── sent
 *     ├── failed
 *     └── cancelled
 *
 * sent
 *     ├── delivered
 *     ├── replied
 *     └── failed
 *
 * delivered
 *     └── replied
 *
 * replied
 *     └── (terminal)
 *
 * failed
 *     └── (terminal)
 *
 * cancelled
 *     └── (terminal)
 * ============================================================================
 */

const RECOVERY_TRANSITIONS = Object.freeze({

  [RECOVERY_ATTEMPT_STATUS.SCHEDULED]: Object.freeze([
    RECOVERY_ATTEMPT_STATUS.PROCESSING,
    RECOVERY_ATTEMPT_STATUS.CANCELLED,
  ]),

  [RECOVERY_ATTEMPT_STATUS.PROCESSING]: Object.freeze([
    RECOVERY_ATTEMPT_STATUS.SCHEDULED,
    RECOVERY_ATTEMPT_STATUS.SENT,
    RECOVERY_ATTEMPT_STATUS.FAILED,
    RECOVERY_ATTEMPT_STATUS.CANCELLED,
  ]),

  [RECOVERY_ATTEMPT_STATUS.SENT]: Object.freeze([
    RECOVERY_ATTEMPT_STATUS.DELIVERED,
    RECOVERY_ATTEMPT_STATUS.REPLIED,
    RECOVERY_ATTEMPT_STATUS.FAILED,
  ]),

  [RECOVERY_ATTEMPT_STATUS.DELIVERED]: Object.freeze([
    RECOVERY_ATTEMPT_STATUS.REPLIED,
  ]),

  [RECOVERY_ATTEMPT_STATUS.REPLIED]: Object.freeze([]),

  [RECOVERY_ATTEMPT_STATUS.FAILED]: Object.freeze([]),

  [RECOVERY_ATTEMPT_STATUS.CANCELLED]: Object.freeze([]),

});

/**
 * Returns all valid transitions from a status.
 *
 * @param {string} status
 * @returns {readonly string[]}
 */
function getAllowedRecoveryTransitions(status) {
  return RECOVERY_TRANSITIONS[status] || [];
}

/**
 * Determines whether a transition is allowed.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {boolean}
 */
function isAllowedRecoveryTransition(fromStatus, toStatus) {
  return getAllowedRecoveryTransitions(fromStatus)
    .includes(toStatus);
}

module.exports = {
  RECOVERY_TRANSITIONS,
  getAllowedRecoveryTransitions,
  isAllowedRecoveryTransition,
};
