'use strict';

const {
  isRecoveryAttemptType,
  isAutomatedRecoveryAttemptType,
  isManualRecoveryAttemptType,
} = require('../../../constants/recoveryAttemptType');

const {
  RECOVERY_CHANNEL,
  isRecoveryChannel,
  requiresRecoveryPhoneNumber,
} = require('../../../constants/recoveryChannel');

const {
  RECOVERY_ATTEMPT_STATUS,
} = require('../../../constants/recoveryAttemptStatus');

const {
  RecoveryPolicyError,
} = require('./errors/RecoveryPolicyError');

const TERMINAL_OPPORTUNITY_STAGES = Object.freeze([
  'booked',
  'attended',
  'lost',
  'closed',
]);

/**
 * Pure domain policy for recovery scheduling and execution eligibility.
 *
 * All records and configuration facts must be loaded by the caller. This class
 * performs no I/O and does not authorize recovery-attempt state transitions.
 */
class RecoveryPolicy {
  /**
   * Asserts that an already-normalized recovery command may be scheduled.
   *
   * @param {object} context
   * @returns {void}
   * @throws {TypeError|RecoveryPolicyError}
   */
  assertSchedulingAllowed(context = {}) {
    this.#assertPlainObject(context, 'context');

    const common = this.#assertCommonContext(context);

    this.#assertValidDate(context.now, 'now');
    this.#assertValidDate(context.scheduledAt, 'scheduledAt');

    if (context.scheduledAt.getTime() < context.now.getTime()) {
      this.#deny(
        'Recovery attempts cannot be scheduled in the past.',
        'SCHEDULED_AT_IN_PAST',
        'RECOVERY_SCHEDULE_NOT_IN_PAST',
        common
      );
    }
  }

  /**
   * Asserts that an already-claimed recovery attempt remains executable.
   *
   * This method does not validate worker due time or authorize a lifecycle
   * transition. The attempt must already have been claimed as processing.
   *
   * @param {object} context
   * @returns {void}
   * @throws {TypeError|RecoveryPolicyError}
   */
  assertExecutionAllowed(context = {}) {
    this.#assertPlainObject(context, 'context');

    const attempt = this.#requireEntity(
      context.attempt,
      'attempt',
      ['id', 'clinicId', 'opportunityId'],
      ['channel', 'attemptType', 'status'],
      ['patientId', 'conversationId', 'staffId']
    );

    const common = this.#assertCommonContext(context, attempt);
    const details = this.#details(common, attempt);

    if (attempt.clinicId !== common.clinic.id) {
      this.#deny(
        'Recovery attempt belongs to a different clinic.',
        'ATTEMPT_TENANT_MISMATCH',
        'RECOVERY_TENANT_OWNERSHIP',
        details
      );
    }

    if (attempt.opportunityId !== common.opportunity.id) {
      this.#deny(
        'Recovery attempt does not belong to the supplied opportunity.',
        'ATTEMPT_OPPORTUNITY_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }

    this.#assertExecutionConsistency(context, common, attempt);

    if (attempt.status !== RECOVERY_ATTEMPT_STATUS.PROCESSING) {
      this.#deny(
        'Recovery attempt must be processing before execution.',
        'ATTEMPT_NOT_PROCESSING',
        'RECOVERY_EXECUTION_PHASE',
        details
      );
    }
  }

  #assertCommonContext(context, attempt = null) {
    const clinic = this.#requireEntity(context.clinic, 'clinic', ['id']);
    const opportunity = this.#requireEntity(
      context.opportunity,
      'opportunity',
      ['id', 'clinicId'],
      ['stage'],
      ['patientId', 'conversationId']
    );

    const channel = this.#assertSupportedChannel(context.channel, {
      clinic,
      opportunity,
      attempt,
    });

    const attemptType = this.#assertSupportedAttemptType(
      context.attemptType,
      {
        clinic,
        opportunity,
        attempt,
        channel,
      }
    );

    const patient = this.#optionalEntity(context.patient, 'patient', [
      'id',
      'clinicId',
    ]);
    const conversation = this.#optionalEntity(
      context.conversation,
      'conversation',
      ['id', 'clinicId'],
      ['patientId']
    );
    const staff = this.#optionalEntity(context.staff, 'staff', [
      'id',
      'clinicId',
    ]);
    const staffId = this.#optionalIdentifier(context.staffId, 'staffId');

    const common = {
      clinic,
      opportunity,
      patient,
      conversation,
      staff,
      staffId,
      channel,
      attemptType,
    };

    this.#assertTenantOwnership(common);
    this.#assertAttribution(common, attempt);
    this.#assertOpportunityRecoverable(common, attempt);
    // TODO: Add conversation recoverability checks when the project exposes
    // authoritative conversation status constants. Current schema and service
    // contract status vocabularies do not agree.
    this.#assertPatientConsistency(common, attempt);
    this.#assertConversationPatientConsistency(common, attempt);
    this.#assertContactability(common, attempt);

    return common;
  }

  #assertTenantOwnership(common) {
    const { clinic, opportunity, patient, conversation, staff } = common;

    this.#assertEntityClinic(
      opportunity,
      clinic.id,
      'OPPORTUNITY_TENANT_MISMATCH',
      common
    );
    this.#assertEntityClinic(
      patient,
      clinic.id,
      'PATIENT_TENANT_MISMATCH',
      common
    );
    this.#assertEntityClinic(
      conversation,
      clinic.id,
      'CONVERSATION_TENANT_MISMATCH',
      common
    );
    this.#assertEntityClinic(
      staff,
      clinic.id,
      'STAFF_TENANT_MISMATCH',
      common
    );
  }

  #assertEntityClinic(entity, clinicId, reason, common) {
    if (entity && entity.clinicId !== clinicId) {
      this.#deny(
        'Recovery context contains an entity from a different clinic.',
        reason,
        'RECOVERY_TENANT_OWNERSHIP',
        common
      );
    }
  }

  #assertAttribution(common, attempt) {
    const { attemptType, staff, staffId } = common;
    const details = this.#details(common, attempt);

    if (isManualRecoveryAttemptType(attemptType)) {
      if (!staff) {
        this.#deny(
          'Manual recovery attempts require a staff record.',
          'STAFF_ID_REQUIRED',
          'MANUAL_RECOVERY_REQUIRES_STAFF',
          details
        );
      }

      if (attempt) {
        if (attempt.staffId == null) {
          this.#deny(
            'Manual recovery execution requires an attempt staff identifier.',
            'STAFF_ID_REQUIRED',
            'MANUAL_RECOVERY_REQUIRES_STAFF',
            details
          );
        }

        if (attempt.staffId !== staff.id) {
          this.#deny(
            'Recovery attempt staff member does not match the loaded staff record.',
            'ATTEMPT_STAFF_MISMATCH',
            'RECOVERY_CONTEXT_CONSISTENCY',
            details
          );
        }

        return;
      }

      if (staffId == null) {
        this.#deny(
          'Manual recovery scheduling requires a staff identifier.',
          'STAFF_ID_REQUIRED',
          'MANUAL_RECOVERY_REQUIRES_STAFF',
          details
        );
      }

      if (staffId !== staff.id) {
        this.#deny(
          'Scheduling staff identifier does not match the loaded staff record.',
          'STAFF_ID_MISMATCH',
          'RECOVERY_CONTEXT_CONSISTENCY',
          details
        );
      }

      return;
    }

    if (isAutomatedRecoveryAttemptType(attemptType)) {
      if (
        staff ||
        staffId != null ||
        (attempt && attempt.staffId != null)
      ) {
        this.#deny(
          'Automated recovery attempts must not carry staff attribution.',
          'STAFF_NOT_ALLOWED_FOR_AUTOMATED_ATTEMPT',
          'AUTOMATED_RECOVERY_ATTRIBUTION',
          details
        );
      }

      return;
    }

    this.#deny(
      `Recovery attempt type "${attemptType}" has no initiator classification.`,
      'UNCLASSIFIED_ATTEMPT_TYPE',
      'ATTEMPT_TYPE_INITIATOR_CLASSIFICATION',
      details
    );
  }

  #assertOpportunityRecoverable(common, attempt) {
    if (TERMINAL_OPPORTUNITY_STAGES.includes(common.opportunity.stage)) {
      this.#deny(
        `Revenue opportunity is terminal in stage "${common.opportunity.stage}".`,
        'OPPORTUNITY_TERMINAL',
        'RECOVERABLE_OPPORTUNITY_STATE',
        this.#details(common, attempt)
      );
    }
  }

  #assertPatientConsistency(common, attempt) {
    const { opportunity, patient } = common;
    const details = this.#details(common, attempt);

    if (
      opportunity.patientId != null &&
      patient &&
      opportunity.patientId !== patient.id
    ) {
      this.#deny(
        'Opportunity patient does not match the loaded patient.',
        'OPPORTUNITY_PATIENT_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }

    if (!attempt) {
      return;
    }

    if (
      attempt.patientId != null &&
      patient &&
      attempt.patientId !== patient.id
    ) {
      this.#deny(
        'Recovery attempt patient does not match the loaded patient.',
        'ATTEMPT_PATIENT_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }

    if (
      attempt.patientId != null &&
      opportunity.patientId != null &&
      attempt.patientId !== opportunity.patientId
    ) {
      this.#deny(
        'Recovery attempt and opportunity refer to different patients.',
        'ATTEMPT_OPPORTUNITY_PATIENT_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }
  }

  #assertConversationPatientConsistency(common, attempt) {
    const { opportunity, patient, conversation } = common;

    if (!conversation || conversation.patientId == null) {
      return;
    }

    const recoveryPatientId =
      attempt?.patientId ??
      opportunity.patientId ??
      patient?.id ??
      null;

    if (
      recoveryPatientId != null &&
      conversation.patientId !== recoveryPatientId
    ) {
      this.#deny(
        'Conversation patient does not match the recovery patient.',
        'CONVERSATION_PATIENT_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        this.#details(common, attempt)
      );
    }
  }

  #assertContactability(common, attempt) {
    const { channel, patient } = common;
    const details = this.#details(common, attempt);

    if (channel === RECOVERY_CHANNEL.DASHBOARD) {
      return;
    }

    if (!patient) {
      this.#deny(
        `Recovery channel "${channel}" requires a patient.`,
        'PATIENT_REQUIRED',
        'CHANNEL_CONTACTABILITY',
        details
      );
    }

    if (requiresRecoveryPhoneNumber(channel) && !this.#hasValue(patient.phoneNumber)) {
      this.#deny(
        `Recovery channel "${channel}" requires a patient phone number.`,
        'PHONE_NUMBER_REQUIRED',
        'CHANNEL_CONTACTABILITY',
        details
      );
    }

    if (
      channel === RECOVERY_CHANNEL.EMAIL &&
      !this.#hasValue(patient.email)
    ) {
      this.#deny(
        'Email recovery requires a patient email address.',
        'EMAIL_REQUIRED',
        'CHANNEL_CONTACTABILITY',
        details
      );
    }
  }

  #assertExecutionConsistency(context, common, attempt) {
    const { conversation, staff } = common;
    const details = this.#details(common, attempt);

    if (context.channel !== attempt.channel) {
      this.#deny(
        'Execution channel does not match the recovery attempt.',
        'ATTEMPT_CHANNEL_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }

    if (context.attemptType !== attempt.attemptType) {
      this.#deny(
        'Execution attempt type does not match the recovery attempt.',
        'ATTEMPT_TYPE_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }

    if (
      attempt.conversationId != null &&
      conversation &&
      attempt.conversationId !== conversation.id
    ) {
      this.#deny(
        'Recovery attempt conversation does not match the loaded conversation.',
        'ATTEMPT_CONVERSATION_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }

    if (
      attempt.staffId != null &&
      staff &&
      attempt.staffId !== staff.id
    ) {
      this.#deny(
        'Recovery attempt staff member does not match the loaded staff record.',
        'ATTEMPT_STAFF_MISMATCH',
        'RECOVERY_CONTEXT_CONSISTENCY',
        details
      );
    }
  }

  #assertSupportedChannel(channel, context) {
    this.#assertRequiredString(channel, 'channel');

    if (!isRecoveryChannel(channel)) {
      this.#deny(
        `Unsupported recovery channel "${String(channel)}".`,
        'UNSUPPORTED_CHANNEL',
        'SUPPORTED_RECOVERY_CHANNEL',
        context
      );
    }

    return channel;
  }

  #assertSupportedAttemptType(attemptType, context) {
    this.#assertRequiredString(attemptType, 'attemptType');

    if (!isRecoveryAttemptType(attemptType)) {
      this.#deny(
        `Unsupported recovery attempt type "${String(attemptType)}".`,
        'UNSUPPORTED_ATTEMPT_TYPE',
        'SUPPORTED_RECOVERY_ATTEMPT_TYPE',
        context
      );
    }

    if (
      !isAutomatedRecoveryAttemptType(attemptType) &&
      !isManualRecoveryAttemptType(attemptType)
    ) {
      this.#deny(
        `Recovery attempt type "${attemptType}" has no initiator classification.`,
        'UNCLASSIFIED_ATTEMPT_TYPE',
        'ATTEMPT_TYPE_INITIATOR_CLASSIFICATION',
        context
      );
    }

    return attemptType;
  }

  #requireEntity(
    value,
    fieldName,
    requiredIdentifierFields,
    requiredStringFields = [],
    optionalIdentifierFields = []
  ) {
    this.#assertPlainObject(value, fieldName);

    for (const requiredField of requiredIdentifierFields) {
      this.#assertIdentifier(
        value[requiredField],
        `${fieldName}.${requiredField}`
      );
    }

    for (const requiredField of requiredStringFields) {
      this.#assertRequiredString(
        value[requiredField],
        `${fieldName}.${requiredField}`
      );
    }

    for (const optionalField of optionalIdentifierFields) {
      if (value[optionalField] != null) {
        this.#assertIdentifier(
          value[optionalField],
          `${fieldName}.${optionalField}`
        );
      }
    }

    return value;
  }

  #optionalEntity(
    value,
    fieldName,
    requiredIdentifierFields,
    optionalIdentifierFields = []
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    return this.#requireEntity(
      value,
      fieldName,
      requiredIdentifierFields,
      [],
      optionalIdentifierFields
    );
  }

  #assertPlainObject(value, fieldName) {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      throw new TypeError(
        `RecoveryPolicy: "${fieldName}" must be an object.`
      );
    }
  }

  #assertIdentifier(value, fieldName) {
    const isNonEmptyString =
      typeof value === 'string' && value.trim().length > 0;
    const isFiniteNumber =
      typeof value === 'number' && Number.isFinite(value);

    if (!isNonEmptyString && !isFiniteNumber) {
      throw new TypeError(
        `RecoveryPolicy: "${fieldName}" must be a non-empty string or finite number.`
      );
    }
  }

  #assertRequiredString(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new TypeError(
        `RecoveryPolicy: "${fieldName}" must be a non-empty string.`
      );
    }
  }

  #assertValidDate(value, fieldName) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new TypeError(
        `RecoveryPolicy: "${fieldName}" must be a valid Date instance.`
      );
    }
  }

  #optionalIdentifier(value, fieldName) {
    if (value === null || value === undefined) {
      return null;
    }

    this.#assertIdentifier(value, fieldName);

    return typeof value === 'string' ? value.trim() : value;
  }

  #hasValue(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  #details(common, attempt = null) {
    if (!common || !common.clinic || !common.opportunity) {
      return {};
    }

    return {
      clinicId: common.clinic.id,
      opportunityId: common.opportunity.id,
      patientId: common.patient ? common.patient.id : null,
      attemptId: attempt ? attempt.id : null,
      channel: common.channel,
      attemptType: common.attemptType,
    };
  }

  #deny(message, reason, policy, context = {}) {
    const details =
      context && context.clinic && context.opportunity
        ? this.#details(context, context.attempt || null)
        : { ...context };

    throw new RecoveryPolicyError(message, {
      ...details,
      reason,
      policy,
    });
  }
}

module.exports = RecoveryPolicy;
