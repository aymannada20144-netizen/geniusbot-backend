'use strict';

const {
  RECOVERY_CHANNEL_VALUES,
  isRecoveryChannel,
} = require('../../../constants/recoveryChannel');

const {
  RECOVERY_ATTEMPT_TYPE_VALUES,
  isRecoveryAttemptType,
} = require('../../../constants/recoveryAttemptType');

/**
 * ============================================================================
 * Recovery Execution Context
 * ============================================================================
 *
 * Immutable DTO passed between the Scheduler, Workers and
 * RecoveryExecutionService.
 *
 * Responsibilities:
 * - Carry all information required to execute a recovery attempt.
 * - Validate mandatory fields.
 * - Prevent accidental mutation.
 *
 * Non-responsibilities:
 * - Database access.
 * - Business rules.
 * - State transitions.
 * - Provider communication.
 * ============================================================================
 */
class RecoveryExecutionContext {
  /**
   * @param {object} data
   * @param {string} data.attemptId
   * @param {string} data.opportunityId
   * @param {string} data.clinicId
   * @param {string} data.patientId
   * @param {string} data.channel
   * @param {string} data.attemptType
   * @param {Date|string|null} [data.scheduledAt]
   * @param {object} [data.metadata]
   */
  constructor(data = {}) {
    this.#assertRequired(data);

    if (!isRecoveryChannel(data.channel)) {
      throw new TypeError(
        `Unsupported recovery channel "${data.channel}". Supported channels: ${RECOVERY_CHANNEL_VALUES.join(', ')}.`
      );
    }

    if (!isRecoveryAttemptType(data.attemptType)) {
      throw new TypeError(
        `Unsupported recovery attempt type "${data.attemptType}". Supported types: ${RECOVERY_ATTEMPT_TYPE_VALUES.join(', ')}.`
      );
    }

    this.attemptId = data.attemptId;
    this.opportunityId = data.opportunityId;
    this.clinicId = data.clinicId;
    this.patientId = data.patientId;
    this.channel = data.channel;
    this.attemptType = data.attemptType;
    this.scheduledAt = data.scheduledAt ?? null;
    this.metadata = Object.freeze({
      ...(data.metadata || {}),
    });

    Object.freeze(this);
  }

  /**
   * Returns a plain object representation.
   *
   * @returns {object}
   */
  toJSON() {
    return {
      attemptId: this.attemptId,
      opportunityId: this.opportunityId,
      clinicId: this.clinicId,
      patientId: this.patientId,
      channel: this.channel,
      attemptType: this.attemptType,
      scheduledAt: this.scheduledAt,
      metadata: this.metadata,
    };
  }

  /**
   * Creates a new immutable context from an existing one with overrides.
   *
   * @param {object} overrides
   * @returns {RecoveryExecutionContext}
   */
  clone(overrides = {}) {
    return new RecoveryExecutionContext({
      ...this.toJSON(),
      ...overrides,
    });
  }

  /**
   * @private
   */
  #assertRequired(data) {
    const requiredFields = [
      'attemptId',
      'opportunityId',
      'clinicId',
      'patientId',
      'channel',
      'attemptType',
    ];

    for (const field of requiredFields) {
      if (
        data[field] === undefined ||
        data[field] === null ||
        data[field] === ''
      ) {
        throw new TypeError(
          `RecoveryExecutionContext: "${field}" is required.`
        );
      }
    }
  }
}

module.exports = {
  RecoveryExecutionContext,
};