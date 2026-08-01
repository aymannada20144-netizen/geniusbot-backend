'use strict';

const AssistantIdentityError = require('./AssistantIdentityError');
const { latestRevision } = require('./AssistantIdentityRepository');

const DEFAULT_IDENTITY = Object.freeze({ assistantName: 'شادن', assistantGender: 'female' });
const ALLOWED_FIELDS = new Set(['assistantName', 'assistantGender', 'expectedUpdatedAt']);
const NAME_PATTERN = /^[\p{Script=Arabic}\p{M}A-Za-z]+(?:[ -][\p{Script=Arabic}\p{M}A-Za-z]+)*$/u;
const UNSAFE_NAME_PATTERN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/u;
const INSTRUCTION_PATTERN = /(?:تجاهل|تعليمات|instructions?|ignore|prompt|system)/iu;

class AssistantIdentityService {
  constructor(repository) {
    this.repository = repository;
  }

  async get(clinicId) {
    const rows = await this.repository.findByClinicId(clinicId);
    if (!rows.length && !await this.repository.clinicExists(clinicId)) {
      throw new AssistantIdentityError('ASSISTANT_IDENTITY_CLINIC_NOT_FOUND', 'Clinic not found.', 404);
    }
    return fromRows(rows);
  }

  async update(clinicId, body) {
    const input = validate(body);
    const result = await this.repository.update(clinicId, input, input.expectedUpdatedAt);
    if (!result) {
      throw new AssistantIdentityError('ASSISTANT_IDENTITY_CLINIC_NOT_FOUND', 'Clinic not found.', 404);
    }
    if (result.conflict) {
      throw new AssistantIdentityError(
        'ASSISTANT_IDENTITY_VERSION_CONFLICT',
        'Assistant identity was changed by another user. Reload the latest settings and try again.',
        409
      );
    }
    return fromRows(result.rows);
  }
}

function fromRows(rows) {
  const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  return {
    assistantName: settings.assistant_name || DEFAULT_IDENTITY.assistantName,
    assistantGender: settings.assistant_gender || DEFAULT_IDENTITY.assistantGender,
    updatedAt: latestRevision(rows),
  };
}

function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AssistantIdentityError('ASSISTANT_IDENTITY_BODY_INVALID', 'Request body must be an object.');
  }
  const unknown = Object.keys(body).find((field) => !ALLOWED_FIELDS.has(field));
  if (unknown) {
    throw new AssistantIdentityError('ASSISTANT_IDENTITY_UNKNOWN_FIELD', `Unsupported field: ${unknown}.`);
  }
  if (typeof body.assistantName !== 'string') {
    throw new AssistantIdentityError('ASSISTANT_IDENTITY_NAME_INVALID', 'Assistant name is required.');
  }
  const assistantName = body.assistantName.normalize('NFC').trim();
  if (assistantName.length < 2 || [...assistantName].length > 40 || UNSAFE_NAME_PATTERN.test(assistantName) || !NAME_PATTERN.test(assistantName) || INSTRUCTION_PATTERN.test(assistantName)) {
    throw new AssistantIdentityError('ASSISTANT_IDENTITY_NAME_INVALID', 'Use a 2–40 character Arabic or English name with spaces or hyphens only.');
  }
  if (!['female', 'male'].includes(body.assistantGender)) {
    throw new AssistantIdentityError('ASSISTANT_IDENTITY_GENDER_INVALID', 'Assistant gender must be female or male.');
  }
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== null && (typeof body.expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(body.expectedUpdatedAt)))) {
    throw new AssistantIdentityError('ASSISTANT_IDENTITY_VERSION_INVALID', 'The settings version is invalid.');
  }
  return { assistantName, assistantGender: body.assistantGender, expectedUpdatedAt: body.expectedUpdatedAt || null };
}

module.exports = AssistantIdentityService;
module.exports.DEFAULT_IDENTITY = DEFAULT_IDENTITY;
module.exports.validate = validate;
