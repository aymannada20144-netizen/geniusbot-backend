'use strict';

const {
  STATUS,
  GOAL_TYPES,
  SUBJECT_KINDS,
  SERVICE_REFERENCE_TYPES,
  CONSTRAINT_KINDS,
  SOURCES,
} = require('./SemanticContractV1');

class SemanticContractViolationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SemanticContractViolationError';
  }
}

function validateSemanticResult(
  result,
  {
    currentMessage,
    contextTurns = [],
  } = {}
) {
  if (!isPlainObject(result)) {
    fail('result must be a plain object.');
  }

  if (typeof currentMessage !== 'string') {
    fail('currentMessage must be a string.');
  }

  if (!Array.isArray(contextTurns)) {
    fail('contextTurns must be an array.');
  }

  exactKeys(
    result,
    [
      'status',
      'goal',
      'subjects',
      'constraints',
    ],
    'result'
  );

  enumValue(
    result.status,
    STATUS,
    'status'
  );

  if (
    result.goal !== null &&
    !GOAL_TYPES.includes(result.goal)
  ) {
    fail(
      'goal must be ASK, ACT, SOCIAL, OTHER, or null.'
    );
  }

  if (!Array.isArray(result.subjects)) {
    fail('subjects must be an array.');
  }

  if (!Array.isArray(result.constraints)) {
    fail('constraints must be an array.');
  }

  const subjects = [];
  for (
    let i = 0;
    i < result.subjects.length;
    i += 1
  ) {
    subjects.push(validateSubject(
      result.subjects[i],
      `subjects[${i}]`,
      currentMessage,
      contextTurns
    ));
  }

  const constraints = [];
  for (
    let i = 0;
    i < result.constraints.length;
    i += 1
  ) {
    constraints.push(validateItem(
      result.constraints[i],
      CONSTRAINT_KINDS,
      `constraints[${i}]`,
      currentMessage,
      contextTurns
    ));
  }

  if (
    result.status === 'UNDERSTOOD' &&
    result.goal === null
  ) {
    fail(
      'UNDERSTOOD requires a goal.'
    );
  }

  if (result.status === 'UNKNOWN') {
    if (
      result.goal !== null ||
      result.subjects.length !== 0 ||
      result.constraints.length !== 0
    ) {
      fail(
        'UNKNOWN must contain no semantic commitments.'
      );
    }
  }

  return {
    status: result.status,
    goal: result.goal,
    subjects,
    constraints,
  };
}

function validateSubject(item, path, currentMessage, contextTurns) {
  const isServiceSubject = item?.kind === 'SERVICE_OR_NEED';
  const validated = validateItem(
    item,
    SUBJECT_KINDS,
    path,
    currentMessage,
    contextTurns,
    isServiceSubject ? ['referenceType'] : []
  );

  if (
    isServiceSubject &&
    SERVICE_REFERENCE_TYPES.includes(item.referenceType)
  ) {
    return {
      ...validated,
      referenceType: item.referenceType,
    };
  }

  return validated;
}

function validateItem(
  item,
  allowedKinds,
  path,
  currentMessage,
  contextTurns,
  optionalFields = []
) {
  if (!isPlainObject(item)) {
    fail(`${path} must be a plain object.`);
  }

  exactKeys(
    item,
    [
      'kind',
      'surface',
      'source',
    ],
    path,
    optionalFields
  );

  enumValue(
    item.kind,
    allowedKinds,
    `${path}.kind`
  );

  enumValue(
    item.source,
    SOURCES,
    `${path}.source`
  );

  if (
    typeof item.surface !== 'string' ||
    !item.surface
  ) {
    fail(
      `${path}.surface must be a non-empty string.`
    );
  }

  if (item.source === 'CURRENT') {
    if (!currentMessage.includes(item.surface)) {
      fail(
        `${path}.surface must be verbatim CURRENT text.`
      );
    }

    return {
      kind: item.kind,
      surface: item.surface,
      source: item.source,
    };
  }

  const found = contextTurns.some(
    (turn) => {
      const text = turnText(turn);

      return (
        typeof text === 'string' &&
        text.includes(item.surface)
      );
    }
  );

  if (!found) {
    fail(
      `${path}.surface must exist in CONTEXT.`
    );
  }

  return {
    kind: item.kind,
    surface: item.surface,
    source: item.source,
  };
}

function turnText(turn) {
  if (typeof turn === 'string') {
    return turn;
  }

  if (
    isPlainObject(turn) &&
    typeof turn.content === 'string'
  ) {
    return turn.content;
  }

  return null;
}

function enumValue(
  value,
  allowed,
  path
) {
  if (!allowed.includes(value)) {
    fail(
      `${path} contains an unsupported value.`
    );
  }
}

function exactKeys(
  value,
  expected,
  path,
  optional = []
) {
  const actual =
    Object.keys(value).sort();

  const wanted =
    [...expected].sort();

  const permitted =
    [...expected, ...optional].sort();

  if (
    wanted.some((key) => !actual.includes(key)) ||
    actual.some((key) => !permitted.includes(key))
  ) {
    fail(
      `${path} has unsupported or missing fields.`
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

  const prototype =
    Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function fail(message) {
  throw new SemanticContractViolationError(
    message
  );
}

module.exports = Object.freeze({
  SemanticContractViolationError,
  validateSemanticResult,
});
