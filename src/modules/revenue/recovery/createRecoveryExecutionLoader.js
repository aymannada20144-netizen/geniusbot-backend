'use strict';

const {
  RECOVERY_CHANNEL,
} = require('../../../constants/recoveryChannel');

const DEFAULT_LANGUAGE = 'ar';
const SUPPORTED_LANGUAGES = Object.freeze(['ar', 'en']);
const WHATSAPP_TEMPLATE = Object.freeze({
  body: 'مرحبًا، لاحظنا أن طلبك لم يكتمل. هل نساعدك في إكماله؟',
});
const EMPTY_VARIABLES = Object.freeze({});

/**
 * Creates the concrete asynchronous loader used by
 * RecoveryExecutionContextProvider.
 */
function createRecoveryExecutionLoader({
  clinicRepository,
  opportunityRepository,
  patientRepository,
  conversationRepository,
  staffRepository,
  providers,
  whatsappTemplateName,
} = {}) {
  assertCallableMethod(clinicRepository, 'findById', 'clinicRepository');
  assertCallableMethod(
    opportunityRepository,
    'findByIdAndClinic',
    'opportunityRepository'
  );
  assertCallableMethod(
    patientRepository,
    'findByClinicAndId',
    'patientRepository'
  );
  assertCallableMethod(
    conversationRepository,
    'findByIdAndClinic',
    'conversationRepository'
  );
  assertCallableMethod(
    staffRepository,
    'findByIdForClinic',
    'staffRepository'
  );
  assertPlainObject(providers, 'providers');
  assertWhatsAppProvider(providers);
  assertNonEmptyString(
    whatsappTemplateName,
    'whatsappTemplateName'
  );

  return async function load(claimedAttempt) {
    assertPlainObject(claimedAttempt, 'claimedAttempt');

    const attemptId = requiredString(claimedAttempt, 'id', 'claimedAttempt');
    const clinicId = requiredString(
      claimedAttempt,
      'clinic_id',
      'claimedAttempt'
    );
    const opportunityId = requiredString(
      claimedAttempt,
      'opportunity_id',
      'claimedAttempt'
    );
    const channel = requiredString(
      claimedAttempt,
      'channel',
      'claimedAttempt'
    );
    const attemptType = requiredString(
      claimedAttempt,
      'attempt_type',
      'claimedAttempt'
    );
    const status = requiredString(
      claimedAttempt,
      'status',
      'claimedAttempt'
    );
    const claimedPatientId = optionalString(
      claimedAttempt,
      'patient_id',
      'claimedAttempt'
    );
    const claimedConversationId = optionalString(
      claimedAttempt,
      'conversation_id',
      'claimedAttempt'
    );
    const staffId = optionalString(
      claimedAttempt,
      'staff_id',
      'claimedAttempt'
    );

    validateOptionalMetadata(claimedAttempt);

    if (channel !== RECOVERY_CHANNEL.WHATSAPP) {
      throw new TypeError(
        'createRecoveryExecutionLoader: only WhatsApp recovery execution is supported.'
      );
    }

    const clinicRow = await clinicRepository.findById(clinicId);

    if (!clinicRow) {
      throw new TypeError(
        'createRecoveryExecutionLoader: recovery clinic was not found.'
      );
    }

    const opportunityRow = await opportunityRepository.findByIdAndClinic(
      clinicId,
      opportunityId
    );

    if (!opportunityRow) {
      throw new TypeError(
        'createRecoveryExecutionLoader: recovery opportunity was not found.'
      );
    }

    const opportunityPatientId = optionalString(
      opportunityRow,
      'patient_id',
      'opportunityRow'
    );
    const opportunityConversationId = optionalString(
      opportunityRow,
      'conversation_id',
      'opportunityRow'
    );
    const patientId = claimedPatientId ?? opportunityPatientId;
    const conversationId =
      claimedConversationId ?? opportunityConversationId;

    const patientRow = patientId
      ? await patientRepository.findByClinicAndId(clinicId, patientId)
      : null;
    const conversationRow = conversationId
      ? await conversationRepository.findByIdAndClinic(
          clinicId,
          conversationId
        )
      : null;
    const staffRow = staffId
      ? await staffRepository.findByIdForClinic(clinicId, staffId)
      : null;

    const attempt = freezeWithOptionalIdentifiers(
      {
        id: attemptId,
        clinicId,
        opportunityId,
        channel,
        attemptType,
        status,
      },
      {
        patientId: claimedPatientId,
        conversationId: claimedConversationId,
        staffId,
      }
    );
    const clinic = Object.freeze({
      id: requiredString(clinicRow, 'id', 'clinicRow'),
    });
    const opportunity = freezeWithOptionalIdentifiers(
      {
        id: requiredString(opportunityRow, 'id', 'opportunityRow'),
        clinicId: requiredString(
          opportunityRow,
          'clinic_id',
          'opportunityRow'
        ),
        stage: requiredString(opportunityRow, 'stage', 'opportunityRow'),
      },
      {
        patientId: opportunityPatientId,
        conversationId: opportunityConversationId,
      }
    );
    const patient = patientRow
      ? normalizePatient(patientRow)
      : null;
    const conversation = conversationRow
      ? normalizeConversation(conversationRow)
      : null;
    const staff = staffRow
      ? Object.freeze({
          id: requiredString(staffRow, 'id', 'staffRow'),
          clinicId: requiredString(staffRow, 'clinic_id', 'staffRow'),
        })
      : null;

    const policyContext = Object.freeze({
      attempt,
      clinic,
      opportunity,
      patient,
      conversation,
      staff,
      ...(staffId === null ? {} : { staffId }),
      channel,
      attemptType,
    });
    const language = resolveLanguage(clinicRow);
    const messageContext = Object.freeze({
      channel,
      language,
      template: WHATSAPP_TEMPLATE,
      variables: EMPTY_VARIABLES,
      metadata: Object.freeze({
        attemptId,
        opportunityId,
        whatsappTemplateName,
      }),
    });

    return Object.freeze({
      policyContext,
      messageContext,
      providers,
    });
  };
}

function normalizePatient(row) {
  const phoneNumber = optionalString(row, 'phone_number', 'patientRow');
  const email = optionalString(row, 'email', 'patientRow');

  return Object.freeze({
    id: requiredString(row, 'id', 'patientRow'),
    clinicId: requiredString(row, 'clinic_id', 'patientRow'),
    ...(phoneNumber === null ? {} : { phoneNumber }),
    ...(email === null ? {} : { email }),
  });
}

function normalizeConversation(row) {
  const patientId = optionalString(row, 'patient_id', 'conversationRow');

  return Object.freeze({
    id: requiredString(row, 'id', 'conversationRow'),
    clinicId: requiredString(row, 'clinic_id', 'conversationRow'),
    ...(patientId === null ? {} : { patientId }),
  });
}

function resolveLanguage(clinicRow) {
  const language = optionalString(
    clinicRow,
    'default_language',
    'clinicRow'
  );

  return SUPPORTED_LANGUAGES.includes(language)
    ? language
    : DEFAULT_LANGUAGE;
}

function freezeWithOptionalIdentifiers(requiredValues, optionalValues) {
  const normalized = { ...requiredValues };

  for (const [key, value] of Object.entries(optionalValues)) {
    if (value !== null) {
      normalized[key] = value;
    }
  }

  return Object.freeze(normalized);
}

function validateOptionalMetadata(claimedAttempt) {
  const descriptor = Object.getOwnPropertyDescriptor(
    claimedAttempt,
    'metadata'
  );

  if (!descriptor) {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new TypeError(
      'createRecoveryExecutionLoader: claimedAttempt.metadata must be an own data property.'
    );
  }

  if (
    descriptor.value !== null &&
    !isPlainObject(descriptor.value)
  ) {
    throw new TypeError(
      'createRecoveryExecutionLoader: claimedAttempt.metadata must be a plain object or null.'
    );
  }
}

function requiredString(object, propertyName, objectName) {
  const value = dataProperty(object, propertyName, objectName, true);

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(
      `createRecoveryExecutionLoader: ${objectName}.${propertyName} must be a non-empty string.`
    );
  }

  return value;
}

function optionalString(object, propertyName, objectName) {
  const value = dataProperty(object, propertyName, objectName, false);

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(
      `createRecoveryExecutionLoader: ${objectName}.${propertyName} must be a non-empty string or null.`
    );
  }

  return value;
}

function dataProperty(object, propertyName, objectName, required) {
  if (!isPlainObject(object)) {
    throw new TypeError(
      `createRecoveryExecutionLoader: ${objectName} must be a plain object.`
    );
  }

  const descriptor = Object.getOwnPropertyDescriptor(object, propertyName);

  if (!descriptor) {
    if (!required) {
      return undefined;
    }

    throw new TypeError(
      `createRecoveryExecutionLoader: ${objectName}.${propertyName} must be an own data property.`
    );
  }

  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new TypeError(
      `createRecoveryExecutionLoader: ${objectName}.${propertyName} must be an own data property.`
    );
  }

  return descriptor.value;
}

function assertWhatsAppProvider(providers) {
  const descriptor = Object.getOwnPropertyDescriptor(
    providers,
    RECOVERY_CHANNEL.WHATSAPP
  );

  if (
    !descriptor ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  ) {
    throw new TypeError(
      'createRecoveryExecutionLoader: providers.whatsapp must be an own data property.'
    );
  }

  const provider = descriptor.value;

  if (
    provider === null ||
    (typeof provider !== 'object' && typeof provider !== 'function') ||
    !hasCallableMethod(provider, 'send')
  ) {
    throw new TypeError(
      'createRecoveryExecutionLoader: providers.whatsapp.send must be callable.'
    );
  }
}

function assertCallableMethod(value, methodName, dependencyName) {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    !hasCallableMethod(value, methodName)
  ) {
    throw new TypeError(
      `createRecoveryExecutionLoader: ${dependencyName}.${methodName} must be callable.`
    );
  }
}

function hasCallableMethod(value, methodName) {
  let current = value;

  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, methodName);

    if (descriptor) {
      return (
        Object.prototype.hasOwnProperty.call(descriptor, 'value') &&
        typeof descriptor.value === 'function'
      );
    }

    current = Object.getPrototypeOf(current);
  }

  return false;
}

function assertPlainObject(value, fieldName) {
  if (!isPlainObject(value)) {
    throw new TypeError(
      `createRecoveryExecutionLoader: ${fieldName} must be a plain object.`
    );
  }
}

function assertNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(
      `createRecoveryExecutionLoader: ${fieldName} must be a non-empty string.`
    );
  }
}

function isPlainObject(value) {
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

module.exports = createRecoveryExecutionLoader;
