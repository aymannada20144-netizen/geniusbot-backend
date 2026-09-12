'use strict';

const {
  validateSemanticResult,
  SemanticContractViolationError,
} = require('./SemanticResultValidator');

const CRITICAL_FAMILIES = Object.freeze(new Set([
  'negation_exclusion',
  'topic_change',
  'context_followup',
  'context_pronoun',
]));

function scoreSemanticResult(testCase, actual) {
  const failures = [];

  try {
    validateSemanticResult(actual, {
      currentMessage: testCase.currentMessage,
      contextTurns: testCase.contextTurns,
    });
  } catch (error) {
    if (error instanceof SemanticContractViolationError) {
      return Object.freeze({
        id: testCase.id,
        family: testCase.family,
        status: 'CONTRACT_VIOLATION',
        autoPassed: false,
        critical: true,
        failures: Object.freeze([error.message]),
        requiresMeaningReview: false,
      });
    }

    throw error;
  }

  const expected = testCase.expected;

  compareStatus(expected, actual, failures);
  compareGoals(expected.goals, actual.goals, failures);

  compareItems(
    'subjects',
    expected.subjects,
    actual.subjects,
    failures
  );

  compareItems(
    'constraints',
    expected.constraints,
    actual.constraints,
    failures
  );

  compareContext(
    expected.context,
    actual.context,
    failures
  );

  const critical = isCriticalFailure(
    testCase.family,
    expected,
    actual,
    failures
  );

  return Object.freeze({
    id: testCase.id,
    family: testCase.family,
    status: failures.length === 0
      ? 'AUTO_PASS'
      : 'AUTO_FAIL',
    autoPassed: failures.length === 0,
    critical,
    failures: Object.freeze([...failures]),
    requiresMeaningReview: failures.length === 0,
  });
}

function compareStatus(expected, actual, failures) {
  if (expected.status !== actual.status) {
    failures.push(
      `STATUS_MISMATCH expected=${expected.status} actual=${actual.status}`
    );
  }
}

function compareGoals(expected, actual, failures) {
  if (expected.length !== actual.length) {
    failures.push(
      `GOAL_COUNT expected=${expected.length} actual=${actual.length}`
    );
    return;
  }

  const unmatched = [...actual];

  for (const wanted of expected) {
    const index = unmatched.findIndex((candidate) =>
      candidate.type === wanted.type &&
      compatibleSurface(
        wanted.surface,
        candidate.surface
      )
    );

    if (index === -1) {
      failures.push(
        `GOAL_MISSING type=${wanted.type} surface=${wanted.surface}`
      );
      continue;
    }

    unmatched.splice(index, 1);
  }

  for (const extra of unmatched) {
    failures.push(
      `GOAL_UNEXPECTED type=${extra.type} surface=${extra.surface}`
    );
  }
}

function compareItems(
  label,
  expected,
  actual,
  failures
) {
  if (expected.length !== actual.length) {
    failures.push(
      `${label.toUpperCase()}_COUNT expected=${expected.length} actual=${actual.length}`
    );
    return;
  }

  const unmatched = [...actual];

  for (const wanted of expected) {
    const index = unmatched.findIndex((candidate) =>
      candidate.kind === wanted.kind &&
      candidate.source === wanted.source &&
      compatibleSurface(
        wanted.surface,
        candidate.surface
      )
    );

    if (index === -1) {
      failures.push(
        `${label.toUpperCase()}_MISSING ` +
        `kind=${wanted.kind} ` +
        `source=${wanted.source} ` +
        `surface=${wanted.surface}`
      );
      continue;
    }

    unmatched.splice(index, 1);
  }

  for (const extra of unmatched) {
    failures.push(
      `${label.toUpperCase()}_UNEXPECTED ` +
      `kind=${extra.kind} ` +
      `source=${extra.source} ` +
      `surface=${extra.surface}`
    );
  }
}

function compareContext(
  expected,
  actual,
  failures
) {
  if (expected.used !== actual.used) {
    failures.push(
      `CONTEXT_USED expected=${expected.used} actual=${actual.used}`
    );
    return;
  }

  if (!expected.used) return;

  for (const wanted of expected.evidence) {
    const covered = actual.evidence.some(
      (candidate) =>
        candidate.turn === wanted.turn &&
        compatibleSurface(
          wanted.surface,
          candidate.surface
        )
    );

    if (!covered) {
      failures.push(
        `CONTEXT_EVIDENCE_MISSING turn=${wanted.turn} surface=${wanted.surface}`
      );
    }
  }

  for (const actualEvidence of actual.evidence) {
    const justified = expected.evidence.some(
      (wanted) =>
        wanted.turn === actualEvidence.turn &&
        compatibleSurface(
          wanted.surface,
          actualEvidence.surface
        )
    );

    if (!justified) {
      failures.push(
        `CONTEXT_EVIDENCE_UNEXPECTED turn=${actualEvidence.turn} surface=${actualEvidence.surface}`
      );
    }
  }
}

function compatibleSurface(expected, actual) {
  if (
    typeof expected !== 'string' ||
    typeof actual !== 'string'
  ) {
    return false;
  }

  return (
    expected === actual ||
    expected.includes(actual) ||
    actual.includes(expected)
  );
}

function isCriticalFailure(
  family,
  expected,
  actual,
  failures
) {
  if (failures.length === 0) {
    return false;
  }

  if (CRITICAL_FAMILIES.has(family)) {
    return true;
  }

  if (
    lostNegative(
      expected.constraints,
      actual.constraints
    )
  ) {
    return true;
  }

  if (
    expected.context.used === false &&
    actual.context.used === true
  ) {
    return true;
  }

  return false;
}

function lostNegative(
  expected,
  actual
) {
  const protectedKinds = new Set(['NEGATIVE']);

  const expectedProtected = expected.filter(
    (item) => protectedKinds.has(item.kind)
  );

  if (expectedProtected.length === 0) {
    return false;
  }

  return expectedProtected.some(
    (wanted) =>
      !actual.some(
        (candidate) =>
          candidate.kind === wanted.kind &&
          compatibleSurface(
            wanted.surface,
            candidate.surface
          )
      )
  );
}

function applyMeaningReview(
  autoScore,
  review
) {
  if (!autoScore.autoPassed) {
    return Object.freeze({
      ...autoScore,
      finalStatus: autoScore.critical
        ? 'CRITICAL_FAIL'
        : 'FAIL',
    });
  }

  if (
    !review ||
    typeof review !== 'object'
  ) {
    throw new TypeError(
      'Meaning review is required after AUTO_PASS.'
    );
  }

  if (
    typeof review.correct !== 'boolean'
  ) {
    throw new TypeError(
      'Meaning review.correct must be boolean.'
    );
  }

  const critical =
    review.critical === true;

  return Object.freeze({
    ...autoScore,
    meaningCorrect: review.correct,
    meaningCritical: critical,
    meaningReason: review.reason || null,
    finalStatus: review.correct
      ? 'PASS'
      : critical
        ? 'CRITICAL_FAIL'
        : 'FAIL',
  });
}

module.exports = Object.freeze({
  CRITICAL_FAMILIES,
  scoreSemanticResult,
  applyMeaningReview,
  compatibleSurface,
});
