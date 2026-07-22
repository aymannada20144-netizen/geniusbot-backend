'use strict';

const BaseRepository = require('../../../core/BaseRepository');

const {
  RECOVERY_ATTEMPT_STATUS,
  isRecoveryAttemptStatus,
} = require('../../../constants/recoveryAttemptStatus');

const {
  isRecoveryAttemptType,
} = require('../../../constants/recoveryAttemptType');

const {
  isRecoveryChannel,
} = require('../../../constants/recoveryChannel');

const {
  RecoveryStateMachine,
} = require('./state/RecoveryStateMachine');

/**
 * ============================================================================
 * Recovery Attempt Repository
 * ============================================================================
 *
 * Data-access layer for geniusbot.recovery_attempts.
 *
 * Responsibilities:
 * - Create scheduled recovery attempts.
 * - Read recovery attempts within clinic boundaries.
 * - Atomically claim due attempts using FOR UPDATE SKIP LOCKED.
 * - Persist lifecycle transitions.
 * - Store provider identifiers, failures, replies and metadata.
 * - Protect concurrent workers from processing the same attempt.
 *
 * Non-responsibilities:
 * - Selecting the recovery channel.
 * - Building messages.
 * - Calling external providers.
 * - Deciding whether an opportunity is eligible.
 * - Retry policy.
 * ============================================================================
 */
class RecoveryAttemptRepository extends BaseRepository {
  /**
   * @param {object} db PostgreSQL Pool-compatible database instance.
   */
  constructor(db) {
    super(db, 'recovery_attempts');

    this.defaultOrderBy = 'created_at';

    this.allowedOrderColumns = [
      'id',
      'clinic_id',
      'opportunity_id',
      'patient_id',
      'attempt_number',
      'channel',
      'attempt_type',
      'status',
      'scheduled_at',
      'started_at',
      'attempted_at',
      'finished_at',
      'replied_at',
      'created_at',
      'updated_at',
    ];
  }

  // ==========================================================================
  // Creation
  // ==========================================================================

  /**
   * Creates a scheduled recovery attempt.
   *
   * attempt_number is calculated atomically for the opportunity.
   *
   * @param {object} data
   * @param {string} data.clinicId
   * @param {string} data.opportunityId
   * @param {string|null} [data.patientId]
   * @param {string|null} [data.conversationId]
   * @param {string|null} [data.notificationLogId]
   * @param {string} data.channel
   * @param {string} data.attemptType
   * @param {Date|string|null} [data.scheduledAt]
   * @param {string|null} [data.staffId]
   * @param {string|null} [data.notes]
   * @param {object} [data.metadata]
   * @returns {Promise<object>}
   */
  async createScheduledAttempt(data = {}) {
    this.#assertRequiredString(data.clinicId, 'clinicId');
    this.#assertRequiredString(data.opportunityId, 'opportunityId');

    if (!isRecoveryChannel(data.channel)) {
      throw new TypeError(
        `RecoveryAttemptRepository: unsupported channel "${data.channel}".`
      );
    }

    if (!isRecoveryAttemptType(data.attemptType)) {
      throw new TypeError(
        `RecoveryAttemptRepository: unsupported attempt type "${data.attemptType}".`
      );
    }

    const scheduledAt = data.scheduledAt ?? new Date();
    const metadata = this.#normalizeMetadata(data.metadata);

    return this.#withTransaction(async (client) => {
      /*
       * Serializes attempt-number allocation per clinic/opportunity without
       * locking unrelated opportunities.
       */
      await client.query(
        `
          SELECT pg_advisory_xact_lock(
            hashtextextended($1::text || ':' || $2::text, 0)
          )
        `,
        [data.clinicId, data.opportunityId]
      );

      const attemptNumberResult = await client.query(
        `
          SELECT COALESCE(MAX("attempt_number"), 0) + 1 AS "attempt_number"
          FROM ${this.fullTableName}
          WHERE "clinic_id" = $1
            AND "opportunity_id" = $2
        `,
        [data.clinicId, data.opportunityId]
      );

      const attemptNumber =
        Number(attemptNumberResult.rows[0].attempt_number);

      const result = await client.query(
        `
          INSERT INTO ${this.fullTableName} (
            "clinic_id",
            "opportunity_id",
            "patient_id",
            "conversation_id",
            "notification_log_id",
            "attempt_number",
            "channel",
            "attempt_type",
            "status",
            "scheduled_at",
            "started_at",
            "attempted_at",
            "finished_at",
            "replied_at",
            "provider_message_id",
            "failure_reason",
            "staff_id",
            "notes",
            "metadata"
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            NULL,
            $11,
            $12,
            $13::jsonb
          )
          RETURNING *
        `,
        [
          data.clinicId,
          data.opportunityId,
          data.patientId ?? null,
          data.conversationId ?? null,
          data.notificationLogId ?? null,
          attemptNumber,
          data.channel,
          data.attemptType,
          RECOVERY_ATTEMPT_STATUS.SCHEDULED,
          scheduledAt,
          data.staffId ?? null,
          data.notes ?? null,
          JSON.stringify(metadata),
        ]
      );

      return result.rows[0];
    });
  }

  // ==========================================================================
  // Reading
  // ==========================================================================

  /**
   * Finds a recovery attempt within a clinic.
   *
   * @param {string} clinicId
   * @param {string} attemptId
   * @returns {Promise<object|null>}
   */
  async findByClinicAndId(clinicId, attemptId) {
    this.#assertRequiredString(clinicId, 'clinicId');
    this.#assertRequiredString(attemptId, 'attemptId');

    const result = await this.query(
      `
        SELECT *
        FROM ${this.fullTableName}
        WHERE "clinic_id" = $1
          AND "id" = $2
        LIMIT 1
      `,
      [clinicId, attemptId]
    );

    return result.rows[0] || null;
  }

  /**
   * Returns attempts belonging to a revenue opportunity.
   *
   * @param {string} clinicId
   * @param {string} opportunityId
   * @returns {Promise<object[]>}
   */
  async findByOpportunity(clinicId, opportunityId) {
    this.#assertRequiredString(clinicId, 'clinicId');
    this.#assertRequiredString(opportunityId, 'opportunityId');

    const result = await this.query(
      `
        SELECT *
        FROM ${this.fullTableName}
        WHERE "clinic_id" = $1
          AND "opportunity_id" = $2
        ORDER BY "attempt_number" ASC
      `,
      [clinicId, opportunityId]
    );

    return result.rows;
  }

  /**
   * Returns scheduled attempts that are currently due.
   *
   * This method does not lock or claim rows. Workers should normally use
   * claimNextScheduledAttempt() or claimScheduledAttempts().
   *
   * @param {object} [options]
   * @param {string|null} [options.clinicId]
   * @param {number} [options.limit=50]
   * @param {Date|string} [options.dueAt]
   * @returns {Promise<object[]>}
   */
  async findDueScheduledAttempts({
    clinicId = null,
    limit = 50,
    dueAt = new Date(),
  } = {}) {
    const safeLimit = this.#normalizeLimit(limit, 50, 500);

    const parameters = [dueAt, safeLimit];
    let clinicCondition = '';

    if (clinicId) {
      clinicCondition = 'AND "clinic_id" = $3';
      parameters.push(clinicId);
    }

    const result = await this.query(
      `
        SELECT *
        FROM ${this.fullTableName}
        WHERE "status" = $1::text
          AND COALESCE("scheduled_at", "created_at") <= $2
          ${clinicCondition}
        ORDER BY
          COALESCE("scheduled_at", "created_at") ASC,
          "created_at" ASC
        LIMIT $${clinicId ? 4 : 3}
      `.replace(
        '$1::text',
        `'${RECOVERY_ATTEMPT_STATUS.SCHEDULED}'::text`
      ),
      parameters
    );

    return result.rows;
  }

  /**
   * Counts attempts for an opportunity.
   *
   * @param {string} clinicId
   * @param {string} opportunityId
   * @returns {Promise<number>}
   */
  async countByOpportunity(clinicId, opportunityId) {
    this.#assertRequiredString(clinicId, 'clinicId');
    this.#assertRequiredString(opportunityId, 'opportunityId');

    const result = await this.query(
      `
        SELECT COUNT(*)::integer AS "total"
        FROM ${this.fullTableName}
        WHERE "clinic_id" = $1
          AND "opportunity_id" = $2
      `,
      [clinicId, opportunityId]
    );

    return result.rows[0].total;
  }

  // ==========================================================================
  // Atomic claiming
  // ==========================================================================

  /**
   * Atomically claims the next due scheduled attempt.
   *
   * Multiple workers may call this method concurrently. PostgreSQL
   * FOR UPDATE SKIP LOCKED guarantees that only one worker receives each row.
   *
   * The claimed attempt is transitioned:
   *
   * scheduled -> processing
   *
   * @param {object} [options]
   * @param {string|null} [options.clinicId]
   * @param {Date|string} [options.dueAt]
   * @returns {Promise<object|null>}
   */
  async claimNextScheduledAttempt({
    clinicId = null,
    dueAt = new Date(),
  } = {}) {
    return this.#withTransaction(async (client) => {
      const parameters = [
        RECOVERY_ATTEMPT_STATUS.SCHEDULED,
        RECOVERY_ATTEMPT_STATUS.PROCESSING,
        dueAt,
      ];

      let clinicCondition = '';

      if (clinicId) {
        clinicCondition = 'AND "clinic_id" = $4';
        parameters.push(clinicId);
      }

      const result = await client.query(
        `
          WITH candidate AS (
            SELECT "id"
            FROM ${this.fullTableName}
            WHERE "status" = $1
              AND COALESCE("scheduled_at", "created_at") <= $3
              ${clinicCondition}
            ORDER BY
              COALESCE("scheduled_at", "created_at") ASC,
              "created_at" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          UPDATE ${this.fullTableName} AS attempt
          SET
            "status" = $2,
            "started_at" = COALESCE(attempt."started_at", NOW()),
            "failure_reason" = NULL,
            "updated_at" = NOW()
          FROM candidate
          WHERE attempt."id" = candidate."id"
            AND attempt."status" = $1
          RETURNING attempt.*
        `,
        parameters
      );

      return result.rows[0] || null;
    });
  }

  /**
   * Atomically claims a batch of due attempts.
   *
   * @param {object} [options]
   * @param {string|null} [options.clinicId]
   * @param {number} [options.limit=25]
   * @param {Date|string} [options.dueAt]
   * @returns {Promise<object[]>}
   */
  async claimScheduledAttempts({
    clinicId = null,
    limit = 25,
    dueAt = new Date(),
  } = {}) {
    const safeLimit = this.#normalizeLimit(limit, 25, 100);

    return this.#withTransaction(async (client) => {
      const parameters = [
        RECOVERY_ATTEMPT_STATUS.SCHEDULED,
        RECOVERY_ATTEMPT_STATUS.PROCESSING,
        dueAt,
        safeLimit,
      ];

      let clinicCondition = '';

      if (clinicId) {
        clinicCondition = 'AND "clinic_id" = $5';
        parameters.push(clinicId);
      }

      const result = await client.query(
        `
          WITH candidates AS (
            SELECT "id"
            FROM ${this.fullTableName}
            WHERE "status" = $1
              AND COALESCE("scheduled_at", "created_at") <= $3
              ${clinicCondition}
            ORDER BY
              COALESCE("scheduled_at", "created_at") ASC,
              "created_at" ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $4
          )
          UPDATE ${this.fullTableName} AS attempt
          SET
            "status" = $2,
            "started_at" = COALESCE(attempt."started_at", NOW()),
            "failure_reason" = NULL,
            "updated_at" = NOW()
          FROM candidates
          WHERE attempt."id" = candidates."id"
            AND attempt."status" = $1
          RETURNING attempt.*
        `,
        parameters
      );

      return result.rows;
    });
  }

  /**
   * Claims a specific scheduled attempt.
   *
   * Useful when a job queue carries a concrete attempt ID.
   *
   * @param {string} clinicId
   * @param {string} attemptId
   * @returns {Promise<object|null>}
   */
  async claimScheduledAttemptById(clinicId, attemptId) {
    this.#assertRequiredString(clinicId, 'clinicId');
    this.#assertRequiredString(attemptId, 'attemptId');

    const result = await this.query(
      `
        UPDATE ${this.fullTableName}
        SET
          "status" = $3,
          "started_at" = COALESCE("started_at", NOW()),
          "failure_reason" = NULL,
          "updated_at" = NOW()
        WHERE "clinic_id" = $1
          AND "id" = $2
          AND "status" = $4
          AND COALESCE("scheduled_at", "created_at") <= NOW()
        RETURNING *
      `,
      [
        clinicId,
        attemptId,
        RECOVERY_ATTEMPT_STATUS.PROCESSING,
        RECOVERY_ATTEMPT_STATUS.SCHEDULED,
      ]
    );

    return result.rows[0] || null;
  }

  // ==========================================================================
  // Lifecycle transitions
  // ==========================================================================

  /**
   * Explicit scheduled -> processing transition.
   *
   * Normally performed by a claim method.
   */
  async markProcessing(clinicId, attemptId, metadata = {}) {
    return this.#transition({
      clinicId,
      attemptId,
      fromStatuses: [RECOVERY_ATTEMPT_STATUS.SCHEDULED],
      toStatus: RECOVERY_ATTEMPT_STATUS.PROCESSING,
      setFragments: [
        '"started_at" = COALESCE("started_at", NOW())',
        '"failure_reason" = NULL',
      ],
      metadata,
    });
  }

  /**
   * Reschedules a claimed attempt after a retryable processing failure.
   *
   * processing -> scheduled
   *
   * @param {object} data
   * @param {string} data.clinicId
   * @param {string} data.attemptId
   * @param {Date} data.nextScheduledAt
   * @param {string} data.failureReason
   * @param {object} [data.metadata]
   * @returns {Promise<object|null>}
   */
  async rescheduleAfterFailure({
    clinicId,
    attemptId,
    nextScheduledAt,
    failureReason,
    metadata = {},
  } = {}) {
    this.#assertRequiredString(clinicId, 'clinicId');
    this.#assertRequiredString(attemptId, 'attemptId');
    this.#assertRequiredString(failureReason, 'failureReason');

    if (
      !(nextScheduledAt instanceof Date) ||
      Number.isNaN(nextScheduledAt.getTime())
    ) {
      throw new TypeError(
        'RecoveryAttemptRepository: "nextScheduledAt" must be a valid Date.'
      );
    }

    return this.#transition({
      clinicId,
      attemptId,
      fromStatuses: [RECOVERY_ATTEMPT_STATUS.PROCESSING],
      toStatus: RECOVERY_ATTEMPT_STATUS.SCHEDULED,
      setFragments: [
        '"scheduled_at" = $nextScheduledAt',
        '"started_at" = NULL',
        '"attempted_at" = NULL',
        '"finished_at" = NULL',
        '"duration_seconds" = NULL',
        '"failure_reason" = $failureReason',
      ],
      metadata,
      namedValues: {
        nextScheduledAt,
        failureReason,
      },
    });
  }

  /**
   * processing -> sent
   */
  async markSent(
    clinicId,
    attemptId,
    {
      providerMessageId = null,
      notificationLogId = null,
      metadata = {},
    } = {}
  ) {
    return this.#transition({
      clinicId,
      attemptId,
      fromStatuses: [RECOVERY_ATTEMPT_STATUS.PROCESSING],
      toStatus: RECOVERY_ATTEMPT_STATUS.SENT,
      setFragments: [
        '"attempted_at" = COALESCE("attempted_at", NOW())',
        '"finished_at" = COALESCE("finished_at", NOW())',
        `
          "duration_seconds" = GREATEST(
            0,
            FLOOR(
              EXTRACT(
                EPOCH FROM (
                  COALESCE("finished_at", NOW()) - "started_at"
                )
              )
            )::integer
          )
        `,
        '"provider_message_id" = COALESCE($providerMessageId, "provider_message_id")',
        '"notification_log_id" = COALESCE($notificationLogId, "notification_log_id")',
        '"failure_reason" = NULL',
      ],
      metadata,
      namedValues: {
        providerMessageId,
        notificationLogId,
      },
    });
  }

  /**
   * sent -> delivered
   */
  async markDelivered(
    clinicId,
    attemptId,
    {
      providerMessageId = null,
      metadata = {},
    } = {}
  ) {
    return this.#transition({
      clinicId,
      attemptId,
      fromStatuses: [RECOVERY_ATTEMPT_STATUS.SENT],
      toStatus: RECOVERY_ATTEMPT_STATUS.DELIVERED,
      setFragments: [
        '"provider_message_id" = COALESCE($providerMessageId, "provider_message_id")',
        '"failure_reason" = NULL',
      ],
      metadata,
      namedValues: {
        providerMessageId,
      },
    });
  }

  /**
   * sent|delivered -> replied
   */
  async markReplied(
    clinicId,
    attemptId,
    {
      repliedAt = new Date(),
      resultTypeId = null,
      notes = null,
      metadata = {},
    } = {}
  ) {
    return this.#transition({
      clinicId,
      attemptId,
      fromStatuses: [
        RECOVERY_ATTEMPT_STATUS.SENT,
        RECOVERY_ATTEMPT_STATUS.DELIVERED,
      ],
      toStatus: RECOVERY_ATTEMPT_STATUS.REPLIED,
      setFragments: [
        '"replied_at" = COALESCE("replied_at", $repliedAt)',
        '"finished_at" = COALESCE("finished_at", $repliedAt)',
        '"result_type_id" = COALESCE($resultTypeId, "result_type_id")',
        '"notes" = COALESCE($notes, "notes")',
        '"failure_reason" = NULL',
      ],
      metadata,
      namedValues: {
        repliedAt,
        resultTypeId,
        notes,
      },
    });
  }

  /**
   * processing|sent -> failed
   */
  async markFailed(
    clinicId,
    attemptId,
    {
      failureReason,
      providerMessageId = null,
      attemptedAt = null,
      metadata = {},
    } = {}
  ) {
    this.#assertRequiredString(failureReason, 'failureReason');

    return this.#transition({
      clinicId,
      attemptId,
      fromStatuses: [
        RECOVERY_ATTEMPT_STATUS.PROCESSING,
        RECOVERY_ATTEMPT_STATUS.SENT,
      ],
      toStatus: RECOVERY_ATTEMPT_STATUS.FAILED,
      setFragments: [
        '"attempted_at" = COALESCE("attempted_at", $attemptedAt)',
        '"finished_at" = COALESCE("finished_at", NOW())',
        `
          "duration_seconds" = CASE
            WHEN "started_at" IS NULL THEN "duration_seconds"
            ELSE GREATEST(
              0,
              FLOOR(
                EXTRACT(
                  EPOCH FROM (
                    COALESCE("finished_at", NOW()) - "started_at"
                  )
                )
              )::integer
            )
          END
        `,
        '"failure_reason" = $failureReason',
        '"provider_message_id" = COALESCE($providerMessageId, "provider_message_id")',
      ],
      metadata,
      namedValues: {
        failureReason,
        providerMessageId,
        attemptedAt,
      },
    });
  }

  /**
   * scheduled|processing -> cancelled
   */
  async cancel(
    clinicId,
    attemptId,
    {
      reason = null,
      notes = null,
      metadata = {},
    } = {}
  ) {
    return this.#transition({
      clinicId,
      attemptId,
      fromStatuses: [
        RECOVERY_ATTEMPT_STATUS.SCHEDULED,
        RECOVERY_ATTEMPT_STATUS.PROCESSING,
      ],
      toStatus: RECOVERY_ATTEMPT_STATUS.CANCELLED,
      setFragments: [
        `
          "finished_at" = CASE
            WHEN "started_at" IS NULL THEN NULL
            ELSE COALESCE("finished_at", NOW())
          END
        `,
        `
          "duration_seconds" = CASE
            WHEN "started_at" IS NULL THEN NULL
            ELSE GREATEST(
              0,
              FLOOR(
                EXTRACT(
                  EPOCH FROM (
                    COALESCE("finished_at", NOW()) - "started_at"
                  )
                )
              )::integer
            )
          END
        `,
        '"failure_reason" = COALESCE($reason, "failure_reason")',
        '"notes" = COALESCE($notes, "notes")',
      ],
      metadata,
      namedValues: {
        reason,
        notes,
      },
    });
  }

  // ==========================================================================
  // Metadata and provider updates
  // ==========================================================================

  /**
   * Merges metadata without replacing existing keys.
   *
   * @param {string} clinicId
   * @param {string} attemptId
   * @param {object} metadata
   * @returns {Promise<object|null>}
   */
  async mergeMetadata(clinicId, attemptId, metadata = {}) {
    this.#assertRequiredString(clinicId, 'clinicId');
    this.#assertRequiredString(attemptId, 'attemptId');

    const normalizedMetadata = this.#normalizeMetadata(metadata);

    const result = await this.query(
      `
        UPDATE ${this.fullTableName}
        SET
          "metadata" = COALESCE("metadata", '{}'::jsonb) || $3::jsonb,
          "updated_at" = NOW()
        WHERE "clinic_id" = $1
          AND "id" = $2
        RETURNING *
      `,
      [clinicId, attemptId, JSON.stringify(normalizedMetadata)]
    );

    return result.rows[0] || null;
  }

  /**
   * Finds an attempt using a provider message identifier.
   *
   * @param {string} providerMessageId
   * @param {string|null} [clinicId]
   * @returns {Promise<object|null>}
   */
  async findByProviderMessageId(providerMessageId, clinicId = null) {
    this.#assertRequiredString(
      providerMessageId,
      'providerMessageId'
    );

    const parameters = [providerMessageId];
    let clinicCondition = '';

    if (clinicId) {
      clinicCondition = 'AND "clinic_id" = $2';
      parameters.push(clinicId);
    }

    const result = await this.query(
      `
        SELECT *
        FROM ${this.fullTableName}
        WHERE "provider_message_id" = $1
          ${clinicCondition}
        ORDER BY "created_at" DESC
        LIMIT 1
      `,
      parameters
    );

    return result.rows[0] || null;
  }

  // ==========================================================================
  // Internal transition engine
  // ==========================================================================

  /**
   * Executes a conditional lifecycle transition.
   *
   * State validation is performed before SQL execution, while the WHERE clause
   * provides the final concurrency guarantee.
   *
   * A null result means:
   * - attempt does not exist;
   * - clinic does not own the attempt; or
   * - another worker already changed its state.
   *
   * @private
   */
  async #transition({
    clinicId,
    attemptId,
    fromStatuses,
    toStatus,
    setFragments = [],
    metadata = {},
    namedValues = {},
  }) {
    this.#assertRequiredString(clinicId, 'clinicId');
    this.#assertRequiredString(attemptId, 'attemptId');

    if (!Array.isArray(fromStatuses) || fromStatuses.length === 0) {
      throw new TypeError(
        'RecoveryAttemptRepository: fromStatuses must not be empty.'
      );
    }

    if (!isRecoveryAttemptStatus(toStatus)) {
      throw new TypeError(
        `RecoveryAttemptRepository: unsupported target status "${toStatus}".`
      );
    }

    for (const fromStatus of fromStatuses) {
      RecoveryStateMachine.assertTransition(fromStatus, toStatus);
    }

    const parameters = [
      clinicId,
      attemptId,
      toStatus,
      fromStatuses,
    ];

    const placeholderMap = new Map();

    for (const [key, value] of Object.entries(namedValues)) {
      parameters.push(value);
      placeholderMap.set(key, `$${parameters.length}`);
    }

    const normalizedMetadata = this.#normalizeMetadata(metadata);
    parameters.push(JSON.stringify(normalizedMetadata));

    const metadataPlaceholder = `$${parameters.length}`;

    const resolvedFragments = setFragments.map((fragment) =>
      fragment.replace(
        /\$([a-zA-Z][a-zA-Z0-9_]*)/g,
        (match, key) => {
          const placeholder = placeholderMap.get(key);

          if (!placeholder) {
            throw new Error(
              `RecoveryAttemptRepository: missing SQL value "${key}".`
            );
          }

          return placeholder;
        }
      )
    );

    const additionalSet =
      resolvedFragments.length > 0
        ? `,\n${resolvedFragments.join(',\n')}`
        : '';

    const result = await this.query(
      `
        UPDATE ${this.fullTableName}
        SET
          "status" = $3,
          "metadata" =
            COALESCE("metadata", '{}'::jsonb) || ${metadataPlaceholder}::jsonb,
          "updated_at" = NOW()
          ${additionalSet}
        WHERE "clinic_id" = $1
          AND "id" = $2
          AND "status" = ANY($4::text[])
        RETURNING *
      `,
      parameters
    );

    return result.rows[0] || null;
  }

  // ==========================================================================
  // Transaction support
  // ==========================================================================

  /**
   * Executes a callback inside a PostgreSQL transaction.
   *
   * @private
   * @param {(client: object) => Promise<unknown>} callback
   */
  async #withTransaction(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError(
        'RecoveryAttemptRepository: transaction callback is required.'
      );
    }

    if (!this.db || typeof this.db.connect !== 'function') {
      throw new TypeError(
        'RecoveryAttemptRepository requires a PostgreSQL Pool-compatible database instance with connect().'
      );
    }

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const result = await callback(client);

      await client.query('COMMIT');

      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }

      throw error;
    } finally {
      client.release();
    }
  }

  // ==========================================================================
  // Validation helpers
  // ==========================================================================

  /**
   * @private
   */
  #assertRequiredString(value, fieldName) {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0
    ) {
      throw new TypeError(
        `RecoveryAttemptRepository: "${fieldName}" is required.`
      );
    }
  }

  /**
   * @private
   */
  #normalizeMetadata(metadata) {
    if (metadata === null || metadata === undefined) {
      return {};
    }

    if (
      typeof metadata !== 'object' ||
      Array.isArray(metadata)
    ) {
      throw new TypeError(
        'RecoveryAttemptRepository: metadata must be an object.'
      );
    }

    return { ...metadata };
  }

  /**
   * @private
   */
  #normalizeLimit(value, defaultValue, maximum) {
    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      return defaultValue;
    }

    return Math.min(parsedValue, maximum);
  }
}

module.exports = RecoveryAttemptRepository;
