'use strict';

const {
  RECOVERY_ATTEMPT_STATUS,
} = require('../../../constants/recoveryAttemptStatus');

const {
  RecoveryWorkerError,
} = require('./errors/RecoveryWorkerError');

const ALLOWED_OPTION_PROPERTIES = Object.freeze([
  'clinicId',
]);

/**
 * Coordinates one claimed recovery attempt through execution and persistence.
 */
class RecoveryWorkerService {
  #recoveryAttemptRepository;
  #recoveryExecutionContextProvider;
  #recoveryExecutionService;
  #retryPolicy;
  #clock;

  constructor({
    recoveryAttemptRepository,
    recoveryExecutionContextProvider,
    recoveryExecutionService,
    retryPolicy,
    clock,
  } = {}) {
    this.#assertCallableMethod(
      recoveryAttemptRepository,
      'claimNextScheduledAttempt',
      'recoveryAttemptRepository'
    );
    this.#assertCallableMethod(
      recoveryAttemptRepository,
      'markSent',
      'recoveryAttemptRepository'
    );
    this.#assertCallableMethod(
      recoveryAttemptRepository,
      'markFailed',
      'recoveryAttemptRepository'
    );
    this.#assertCallableMethod(
      recoveryAttemptRepository,
      'rescheduleAfterFailure',
      'recoveryAttemptRepository'
    );
    this.#assertCallableMethod(
      recoveryExecutionContextProvider,
      'getExecutionContext',
      'recoveryExecutionContextProvider'
    );
    this.#assertCallableMethod(
      recoveryExecutionService,
      'execute',
      'recoveryExecutionService'
    );
    this.#assertCallableMethod(
      retryPolicy,
      'isRetryable',
      'retryPolicy'
    );
    this.#assertCallableMethod(
      retryPolicy,
      'calculateNextScheduledAt',
      'retryPolicy'
    );
    this.#assertCallableMethod(clock, 'now', 'clock');

    this.#recoveryAttemptRepository = recoveryAttemptRepository;
    this.#recoveryExecutionContextProvider =
      recoveryExecutionContextProvider;
    this.#recoveryExecutionService = recoveryExecutionService;
    this.#retryPolicy = retryPolicy;
    this.#clock = clock;
  }

  /**
   * Claims and processes at most one due recovery attempt.
   *
   * @param {object} [options]
   * @returns {Promise<Readonly<object>>}
   */
  async runNext(options = {}) {
    const clinicId = this.#validateOptions(options);
    const now = this.#getCurrentTime(clinicId);
    const claimedAttempt = await this.#claimAttempt(clinicId, now);

    if (claimedAttempt === null) {
      return Object.freeze({
        outcome: 'no_work',
        attemptId: null,
        clinicId: clinicId ?? null,
        nextScheduledAt: null,
      });
    }

    const attempt = this.#validateClaimedAttempt(
      claimedAttempt,
      clinicId
    );
    const executionContext = await this.#getExecutionContext(
      claimedAttempt,
      attempt
    );

    try {
      await this.#recoveryExecutionService.execute(
        executionContext
      );
    } catch (error) {
      return this.#handleExecutionFailure(error, claimedAttempt, attempt, now);
    }

    await this.#persistSent(attempt);

    return Object.freeze({
      outcome: 'sent',
      attemptId: attempt.id,
      clinicId: attempt.clinicId,
      nextScheduledAt: null,
    });
  }

  #validateOptions(options) {
    this.#assertPlainObject(options, 'options');

    const ownKeys = Reflect.ownKeys(options);

    if (
      ownKeys.some(
        (key) =>
          typeof key !== 'string' ||
          !ALLOWED_OPTION_PROPERTIES.includes(key)
      )
    ) {
      throw new TypeError(
        'RecoveryWorkerService: options contains an unexpected property.'
      );
    }

    const descriptor = Object.getOwnPropertyDescriptor(options, 'clinicId');

    if (!descriptor) {
      return undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(
        'RecoveryWorkerService: options.clinicId must be a data property.'
      );
    }

    if (
      typeof descriptor.value !== 'string' ||
      descriptor.value.trim().length === 0
    ) {
      throw new TypeError(
        'RecoveryWorkerService: options.clinicId must be a non-empty string.'
      );
    }

    return descriptor.value;
  }

  #getCurrentTime(clinicId) {
    let now;

    try {
      now = this.#clock.now();
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery worker clock failed.',
        'clock',
        { clinicId: clinicId ?? null },
        cause
      );
    }

    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      this.#throwWorkerError(
        'Recovery worker clock returned an invalid Date.',
        'clock',
        { clinicId: clinicId ?? null }
      );
    }

    return now;
  }

  async #claimAttempt(clinicId, now) {
    const claimOptions =
      clinicId === undefined
        ? { dueAt: now }
        : { clinicId, dueAt: now };

    try {
      return await this.#recoveryAttemptRepository
        .claimNextScheduledAttempt(claimOptions);
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery worker failed to claim an attempt.',
        'claim',
        { clinicId: clinicId ?? null },
        cause
      );
    }
  }

  #validateClaimedAttempt(claimedAttempt, requestedClinicId) {
    if (!this.#isPlainObject(claimedAttempt)) {
      this.#throwWorkerError(
        'Recovery repository returned an invalid claimed attempt.',
        'validate_claim',
        { clinicId: requestedClinicId ?? null }
      );
    }

    const values = {};

    for (const propertyName of ['id', 'clinic_id', 'status']) {
      const descriptor = Object.getOwnPropertyDescriptor(
        claimedAttempt,
        propertyName
      );

      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        typeof descriptor.value !== 'string' ||
        descriptor.value.trim().length === 0
      ) {
        this.#throwWorkerError(
          'Recovery repository returned an invalid claimed attempt.',
          'validate_claim',
          { clinicId: requestedClinicId ?? null }
        );
      }

      values[propertyName] = descriptor.value;
    }

    if (values.status !== RECOVERY_ATTEMPT_STATUS.PROCESSING) {
      this.#throwWorkerError(
        'Recovery repository returned an attempt that is not processing.',
        'validate_claim',
        {
          attemptId: values.id,
          clinicId: values.clinic_id,
        }
      );
    }

    if (
      requestedClinicId !== undefined &&
      values.clinic_id !== requestedClinicId
    ) {
      this.#throwWorkerError(
        'Recovery repository returned an attempt for a different clinic.',
        'validate_claim',
        {
          attemptId: values.id,
          clinicId: requestedClinicId,
        }
      );
    }

    return {
      id: values.id,
      clinicId: values.clinic_id,
    };
  }

  async #getExecutionContext(claimedAttempt, attempt) {
    try {
      return await this.#recoveryExecutionContextProvider
        .getExecutionContext(claimedAttempt);
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery worker failed to obtain execution context.',
        'load_context',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        },
        cause
      );
    }
  }

  async #persistSent(attempt) {
    let persistedAttempt;

    try {
      persistedAttempt = await this.#recoveryAttemptRepository.markSent(
        attempt.clinicId,
        attempt.id,
        {
          metadata: {
            workerOutcome: 'execution_succeeded',
          },
        }
      );
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery worker failed to persist successful execution.',
        'mark_sent',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        },
        cause
      );
    }

    if (persistedAttempt === null) {
      this.#throwWorkerError(
        'Recovery worker could not persist successful execution.',
        'mark_sent',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        }
      );
    }
  }

  async #handleExecutionFailure(error, claimedAttempt, attempt, now) {
    const retryable = await this.#classifyRetry(
      error,
      claimedAttempt,
      attempt
    );
    const failureReason = this.#safeFailureReason(error);

    if (retryable) {
      return this.#rescheduleFailure(
        error,
        claimedAttempt,
        attempt,
        now,
        failureReason
      );
    }

    return this.#persistTerminalFailure(attempt, failureReason);
  }

  async #classifyRetry(error, claimedAttempt, attempt) {
    let retryable;

    try {
      retryable = await this.#retryPolicy.isRetryable({
        error,
        attempt: claimedAttempt,
      });
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery retry classification failed.',
        'classify_retry',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        },
        cause
      );
    }

    if (typeof retryable !== 'boolean') {
      this.#throwWorkerError(
        'Recovery retry policy returned a non-boolean classification.',
        'classify_retry',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        }
      );
    }

    return retryable;
  }

  async #rescheduleFailure(
    error,
    claimedAttempt,
    attempt,
    now,
    failureReason
  ) {
    const nextScheduledAt = await this.#calculateNextScheduledAt(
      error,
      claimedAttempt,
      attempt,
      now
    );

    let persistedAttempt;

    try {
      persistedAttempt = await this.#recoveryAttemptRepository
        .rescheduleAfterFailure({
          clinicId: attempt.clinicId,
          attemptId: attempt.id,
          nextScheduledAt,
          failureReason,
          metadata: {
            workerOutcome: 'retryable_execution_failure',
          },
        });
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery worker failed to persist retry scheduling.',
        'reschedule',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        },
        cause
      );
    }

    if (persistedAttempt === null) {
      this.#throwWorkerError(
        'Recovery worker could not persist retry scheduling.',
        'reschedule',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        }
      );
    }

    return Object.freeze({
      outcome: 'rescheduled',
      attemptId: attempt.id,
      clinicId: attempt.clinicId,
      nextScheduledAt,
    });
  }

  async #calculateNextScheduledAt(
    error,
    claimedAttempt,
    attempt,
    now
  ) {
    let nextScheduledAt;

    try {
      nextScheduledAt = await this.#retryPolicy.calculateNextScheduledAt({
        error,
        attempt: claimedAttempt,
        now,
      });
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery retry scheduling calculation failed.',
        'calculate_retry',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        },
        cause
      );
    }

    if (
      !(nextScheduledAt instanceof Date) ||
      Number.isNaN(nextScheduledAt.getTime()) ||
      nextScheduledAt.getTime() <= now.getTime()
    ) {
      this.#throwWorkerError(
        'Recovery retry policy returned an invalid next scheduled Date.',
        'calculate_retry',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        }
      );
    }

    return nextScheduledAt;
  }

  async #persistTerminalFailure(attempt, failureReason) {
    let persistedAttempt;

    try {
      persistedAttempt = await this.#recoveryAttemptRepository.markFailed(
        attempt.clinicId,
        attempt.id,
        {
          failureReason,
          metadata: {
            workerOutcome: 'terminal_execution_failure',
          },
        }
      );
    } catch (cause) {
      this.#throwWorkerError(
        'Recovery worker failed to persist terminal execution failure.',
        'mark_failed',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        },
        cause
      );
    }

    if (persistedAttempt === null) {
      this.#throwWorkerError(
        'Recovery worker could not persist terminal execution failure.',
        'mark_failed',
        {
          attemptId: attempt.id,
          clinicId: attempt.clinicId,
        }
      );
    }

    return Object.freeze({
      outcome: 'failed',
      attemptId: attempt.id,
      clinicId: attempt.clinicId,
      nextScheduledAt: null,
    });
  }

  #safeFailureReason(error) {
    if (
      error instanceof Error &&
      typeof error.message === 'string' &&
      error.message.trim().length > 0
    ) {
      const name =
        typeof error.name === 'string' && error.name.trim().length > 0
          ? error.name.trim()
          : 'ExecutionError';

      return name.slice(0, 200);
    }

    return 'Unknown execution failure';
  }

  #throwWorkerError(message, operation, details, cause) {
    const options = {
      details: {
        operation,
        ...details,
      },
    };

    if (arguments.length >= 4) {
      options.cause = cause;
    }

    throw new RecoveryWorkerError(message, options);
  }

  #assertCallableMethod(value, methodName, dependencyName) {
    if (
      value === null ||
      (typeof value !== 'object' && typeof value !== 'function') ||
      typeof value[methodName] !== 'function'
    ) {
      throw new TypeError(
        `RecoveryWorkerService: "${dependencyName}.${methodName}" must be callable.`
      );
    }
  }

  #assertPlainObject(value, fieldName) {
    if (!this.#isPlainObject(value)) {
      throw new TypeError(
        `RecoveryWorkerService: "${fieldName}" must be a plain object.`
      );
    }
  }

  #isPlainObject(value) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
  }
}

module.exports = RecoveryWorkerService;
