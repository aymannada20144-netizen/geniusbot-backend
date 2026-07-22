'use strict';

const {
  RECOVERY_ATTEMPT_STATUS_VALUES,
  isRecoveryAttemptStatus,
  isRecoveryTerminalStatus,
} = require('../../../../constants/recoveryAttemptStatus');

const {
  getAllowedRecoveryTransitions,
  isAllowedRecoveryTransition,
} = require('./RecoveryTransitions');

const {
  RecoveryTransitionError,
} = require('../errors/RecoveryTransitionError');

/**
 * ============================================================================
 * Recovery State Machine
 * ============================================================================
 *
 * Central validation layer for recovery-attempt status transitions.
 *
 * Responsibilities:
 * - Validate source and target statuses.
 * - Reject unsupported transitions.
 * - Reject transitions from terminal states.
 * - Expose allowed next statuses.
 *
 * Non-responsibilities:
 * - Database persistence.
 * - Transactions or row locking.
 * - Timestamp updates.
 * - Provider communication.
 * - Business policy decisions.
 * ============================================================================
 */
class RecoveryStateMachine {
  /**
   * Returns all statuses supported by the state machine.
   *
   * @returns {readonly string[]}
   */
  static getSupportedStatuses() {
    return RECOVERY_ATTEMPT_STATUS_VALUES;
  }

  /**
   * Returns all valid next statuses from the supplied status.
   *
   * @param {string} currentStatus
   * @returns {readonly string[]}
   *
   * @throws {RecoveryTransitionError}
   */
  static getAllowedTransitions(currentStatus) {
    this.assertValidStatus(currentStatus, 'currentStatus');

    return getAllowedRecoveryTransitions(currentStatus);
  }

  /**
   * Determines whether a transition is valid.
   *
   * Invalid or unsupported status values return false rather than throwing.
   *
   * @param {unknown} fromStatus
   * @param {unknown} toStatus
   * @returns {boolean}
   */
  static canTransition(fromStatus, toStatus) {
    if (
      !isRecoveryAttemptStatus(fromStatus) ||
      !isRecoveryAttemptStatus(toStatus)
    ) {
      return false;
    }

    return isAllowedRecoveryTransition(fromStatus, toStatus);
  }

  /**
   * Validates a requested status transition.
   *
   * Returns true when the transition is allowed.
   *
   * @param {string} fromStatus
   * @param {string} toStatus
   * @returns {true}
   *
   * @throws {RecoveryTransitionError}
   */
  static assertTransition(fromStatus, toStatus) {
    this.assertValidStatus(fromStatus, 'fromStatus');
    this.assertValidStatus(toStatus, 'toStatus');

    if (fromStatus === toStatus) {
      throw new RecoveryTransitionError(
        `Recovery attempt is already in status "${toStatus}".`,
        {
          fromStatus,
          toStatus,
          reason: 'same_status_transition',
          allowedTransitions: this.getAllowedTransitions(fromStatus),
        },
      );
    }

    if (isRecoveryTerminalStatus(fromStatus)) {
      throw new RecoveryTransitionError(
        `Recovery attempt cannot transition from terminal status "${fromStatus}".`,
        {
          fromStatus,
          toStatus,
          reason: 'terminal_status',
          allowedTransitions: [],
        },
      );
    }

    if (!isAllowedRecoveryTransition(fromStatus, toStatus)) {
      throw new RecoveryTransitionError(
        `Invalid recovery transition from "${fromStatus}" to "${toStatus}".`,
        {
          fromStatus,
          toStatus,
          reason: 'transition_not_allowed',
          allowedTransitions: this.getAllowedTransitions(fromStatus),
        },
      );
    }

    return true;
  }

  /**
   * Alias expressing business intent when validating a transition.
   *
   * @param {string} fromStatus
   * @param {string} toStatus
   * @returns {true}
   *
   * @throws {RecoveryTransitionError}
   */
  static validateTransition(fromStatus, toStatus) {
    return this.assertTransition(fromStatus, toStatus);
  }

  /**
   * Validates an individual recovery status value.
   *
   * @param {unknown} status
   * @param {string} [fieldName='status']
   * @returns {true}
   *
   * @throws {RecoveryTransitionError}
   */
  static assertValidStatus(status, fieldName = 'status') {
    if (!isRecoveryAttemptStatus(status)) {
      throw new RecoveryTransitionError(
        `Unsupported recovery status in "${fieldName}": "${String(status)}".`,
        {
          fieldName,
          status,
          reason: 'unsupported_status',
          supportedStatuses: RECOVERY_ATTEMPT_STATUS_VALUES,
        },
      );
    }

    return true;
  }
}

module.exports = {
  RecoveryStateMachine,
};
