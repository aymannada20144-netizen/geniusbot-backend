'use strict';

const {
  isRecoveryAttemptType,
  isAutomatedRecoveryAttemptType,
  isManualRecoveryAttemptType,
} = require('../../../constants/recoveryAttemptType');

const {
  isRecoveryChannel,
} = require('../../../constants/recoveryChannel');

const {
  RecoveryPolicyError,
} = require('./errors/RecoveryPolicyError');

/**
 * ============================================================================
 * Recovery Scheduler Service
 * ============================================================================
 *
 * Application service responsible for scheduling recovery attempts.
 *
 * Responsibilities:
 * - Validate recovery scheduling commands.
 * - Enforce scheduling-time business invariants.
 * - Normalize the requested execution time.
 * - Delegate persistence to RecoveryAttemptRepository.
 * - Preserve clinic boundaries.
 *
 * Non-responsibilities:
 * - Deciding whether a revenue opportunity is recoverable.
 * - Selecting a recovery channel automatically.
 * - Building recovery messages.
 * - Claiming or executing scheduled attempts.
 * - Calling external communication providers.
 * - Applying retry policy.
 * - Performing lifecycle transitions after creation.
 *
 * Attribution:
 * - Automated attempt types are attributed to AI.
 * - Manual follow-ups are attributed to STAFF.
 * - The database trigger remains authoritative for initiator_id.
 * ============================================================================
 */
class RecoverySchedulerService {
  /**
   * @param {object} dependencies
   * @param {object} dependencies.recoveryAttemptRepository
   * @param {() => Date} [dependencies.clock]
   */
  constructor({
    recoveryAttemptRepository,
    clock = () => new Date(),
  } = {}) {
    if (
      !recoveryAttemptRepository ||
      typeof recoveryAttemptRepository.createScheduledAttempt !== 'function'
    ) {
      throw new TypeError(
        'RecoverySchedulerService requires a recoveryAttemptRepository ' +
          'with createScheduledAttempt().'
      );
    }

    if (typeof clock !== 'function') {
      throw new TypeError(
        'RecoverySchedulerService: clock must be a function.'
      );
    }

    this.recoveryAttemptRepository = recoveryAttemptRepository;
    this.clock = clock;
  }

  /**
   * Schedules a recovery attempt.
   *
   * @param {object} command
   * @param {string} command.clinicId
   * @param {string} command.opportunityId
   * @param {string|null} [command.patientId]
   * @param {string|null} [command.conversationId]
   * @param {string|null} [command.notificationLogId]
   * @param {string} command.channel
   * @param {string} command.attemptType
   * @param {Date|string|null} [command.scheduledAt]
   * @param {string|null} [command.staffId]
   * @param {string|null} [command.notes]
   * @param {object} [command.metadata]
   * @returns {Promise<object>}
   */
  async schedule(command = {}) {
    this.#assertPlainObject(command, 'command');

    const clinicId = this.#normalizeRequiredString(
      command.clinicId,
      'clinicId'
    );

    const opportunityId = this.#normalizeRequiredString(
      command.opportunityId,
      'opportunityId'
    );

    const patientId = this.#normalizeOptionalString(
      command.patientId,
      'patientId'
    );

    const conversationId = this.#normalizeOptionalString(
      command.conversationId,
      'conversationId'
    );

    const notificationLogId = this.#normalizeOptionalString(
      command.notificationLogId,
      'notificationLogId'
    );

    const staffId = this.#normalizeOptionalString(
      command.staffId,
      'staffId'
    );

    const notes = this.#normalizeOptionalString(
      command.notes,
      'notes'
    );

    const channel = this.#normalizeChannel(command.channel);

    const attemptType = this.#normalizeAttemptType(
      command.attemptType
    );

    const scheduledAt = this.#normalizeScheduledAt(
      command.scheduledAt
    );

    const metadata = this.#normalizeMetadata(
      command.metadata
    );

    this.#assertInitiatorPolicy({
      attemptType,
      staffId,
      clinicId,
      opportunityId,
      patientId,
    });

    return this.recoveryAttemptRepository.createScheduledAttempt({
      clinicId,
      opportunityId,
      patientId,
      conversationId,
      notificationLogId,
      channel,
      attemptType,
      scheduledAt,
      staffId,
      notes,
      metadata,
    });
  }

  /**
   * Schedules an attempt for immediate worker eligibility.
   *
   * This method does not claim or execute the attempt.
   *
   * @param {object} command
   * @returns {Promise<object>}
   */
  async scheduleNow(command = {}) {
    this.#assertPlainObject(command, 'command');

    return this.schedule({
      ...command,
      scheduledAt: this.#currentTime(),
    });
  }

  /**
   * Validates the initiator policy implied by attemptType.
   *
   * automated attempt type -> AI
   * manual follow-up       -> STAFF
   *
   * initiator_id itself is derived by the database trigger.
   *
   * @private
   */
  #assertInitiatorPolicy({
    attemptType,
    staffId,
    clinicId,
    opportunityId,
    patientId,
  }) {
    if (isAutomatedRecoveryAttemptType(attemptType)) {
      return;
    }

    if (isManualRecoveryAttemptType(attemptType)) {
      if (!staffId) {
        throw new RecoveryPolicyError(
          'Manual recovery attempts require a staff member.',
          {
            reason: 'STAFF_ID_REQUIRED',
            policy: 'MANUAL_RECOVERY_REQUIRES_STAFF',
            clinicId,
            opportunityId,
            patientId,
          }
        );
      }

      return;
    }

    throw new RecoveryPolicyError(
      `Recovery attempt type "${attemptType}" has no initiator classification.`,
      {
        reason: 'UNCLASSIFIED_ATTEMPT_TYPE',
        policy: 'ATTEMPT_TYPE_INITIATOR_CLASSIFICATION',
        clinicId,
        opportunityId,
        patientId,
      }
    );
  }

  /**
   * @private
   */
  #normalizeChannel(value) {
    if (!isRecoveryChannel(value)) {
      throw new RecoveryPolicyError(
        `Unsupported recovery channel "${String(value)}".`,
        {
          reason: 'UNSUPPORTED_CHANNEL',
          policy: 'SUPPORTED_RECOVERY_CHANNEL',
        }
      );
    }

    return value;
  }

  /**
   * @private
   */
  #normalizeAttemptType(value) {
    if (!isRecoveryAttemptType(value)) {
      throw new RecoveryPolicyError(
        `Unsupported recovery attempt type "${String(value)}".`,
        {
          reason: 'UNSUPPORTED_ATTEMPT_TYPE',
          policy: 'SUPPORTED_RECOVERY_ATTEMPT_TYPE',
        }
      );
    }

    return value;
  }

  /**
   * Missing scheduledAt means immediate scheduling.
   *
   * Explicit invalid or past dates are rejected.
   *
   * @private
   */
  #normalizeScheduledAt(value) {
    const now = this.#currentTime();

    if (value === null || value === undefined) {
      return now;
    }

    const scheduledAt =
      value instanceof Date
        ? new Date(value.getTime())
        : new Date(value);

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new RecoveryPolicyError(
        'Recovery scheduledAt must be a valid date.',
        {
          reason: 'INVALID_SCHEDULED_AT',
          policy: 'VALID_RECOVERY_SCHEDULE_TIME',
        }
      );
    }

    if (scheduledAt.getTime() < now.getTime()) {
      throw new RecoveryPolicyError(
        'Recovery attempts cannot be scheduled in the past.',
        {
          reason: 'SCHEDULED_AT_IN_PAST',
          policy: 'RECOVERY_SCHEDULE_NOT_IN_PAST',
        }
      );
    }

    return scheduledAt;
  }

  /**
   * @private
   */
  #currentTime() {
    const value = this.clock();

    if (!(value instanceof Date)) {
      throw new TypeError(
        'RecoverySchedulerService: clock must return a Date instance.'
      );
    }

    if (Number.isNaN(value.getTime())) {
      throw new TypeError(
        'RecoverySchedulerService: clock returned an invalid Date.'
      );
    }

    return new Date(value.getTime());
  }

  /**
   * @private
   */
  #normalizeRequiredString(value, fieldName) {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0
    ) {
      throw new TypeError(
        `RecoverySchedulerService: "${fieldName}" is required.`
      );
    }

    return value.trim();
  }

  /**
   * @private
   */
  #normalizeOptionalString(value, fieldName) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new TypeError(
        `RecoverySchedulerService: "${fieldName}" must be a string or null.`
      );
    }

    const normalizedValue = value.trim();

    return normalizedValue.length > 0
      ? normalizedValue
      : null;
  }

  /**
   * @private
   */
  #normalizeMetadata(metadata) {
    if (metadata === null || metadata === undefined) {
      return {};
    }

    this.#assertPlainObject(metadata, 'metadata');

    return { ...metadata };
  }

  /**
   * @private
   */
  #assertPlainObject(value, fieldName) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new TypeError(
        `RecoverySchedulerService: "${fieldName}" must be an object.`
      );
    }
  }
}

module.exports = RecoverySchedulerService;