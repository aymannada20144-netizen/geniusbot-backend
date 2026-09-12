'use strict';

const assert = require('assert');
const cases = require('./GoldCorpusV1');

const {
  scoreSemanticResult,
  applyMeaningReview,
} = require('../../../src/services/shaden/semanticV1/SemanticScoringRubricV1');

function gold(id) {
  return cases.find((item) => item.id === id);
}

/* 1 — Exact gold must auto-pass */
{
  const testCase = gold('G02');

  const score = scoreSemanticResult(
    testCase,
    testCase.expected
  );

  assert.strictEqual(score.status, 'AUTO_PASS');
  assert.strictEqual(score.autoPassed, true);

  const final = applyMeaningReview(score, {
    correct: true,
  });

  assert.strictEqual(final.finalStatus, 'PASS');

  console.log('PASS: exact gold');
}

/* 2 — Meaning wording is not compared literally */
{
  const testCase = gold('G02');

  const actual = JSON.parse(
    JSON.stringify(testCase.expected)
  );

  actual.subjects[0].meaning =
    'مناطق داكنة أو تغيرات في لون الجلد بسبب الشمس';

  const score = scoreSemanticResult(
    testCase,
    actual
  );

  assert.strictEqual(score.status, 'AUTO_PASS');

  const final = applyMeaningReview(score, {
    correct: true,
  });

  assert.strictEqual(final.finalStatus, 'PASS');

  console.log(
    'PASS: meaning wording is not compared literally'
  );
}

/* 3 — Wrong subject kind must fail */
{
  const testCase = gold('G02');

  const actual = JSON.parse(
    JSON.stringify(testCase.expected)
  );

  actual.subjects[0].kind =
    'SERVICE_OR_TREATMENT';

  const score = scoreSemanticResult(
    testCase,
    actual
  );

  assert.strictEqual(score.status, 'AUTO_FAIL');

  console.log(
    'PASS: wrong subject kind rejected'
  );
}

/* 4 — Losing exclusion is critical */
{
  const testCase = gold('G06');

  const actual = JSON.parse(
    JSON.stringify(testCase.expected)
  );

  actual.constraints = [];

  const score = scoreSemanticResult(
    testCase,
    actual
  );

  assert.strictEqual(score.autoPassed, false);
  assert.strictEqual(score.critical, true);

  console.log(
    'PASS: lost exclusion is critical'
  );
}

/* 5 — Stale context is critical */
{
  const testCase = gold('G12');

  const actual = JSON.parse(
    JSON.stringify(testCase.expected)
  );

  actual.context = {
    used: true,
    evidence: [{
      turn: -1,
      surface: 'فيلر',
    }],
  };

  actual.subjects.push({
    kind: 'SERVICE_OR_TREATMENT',
    surface: 'فيلر',
    meaning: 'خدمة الفيلر السابقة',
    source: 'CONTEXT',
  });

  const score = scoreSemanticResult(
    testCase,
    actual
  );

  assert.strictEqual(score.autoPassed, false);
  assert.strictEqual(score.critical, true);

  console.log(
    'PASS: stale context is critical'
  );
}

/* 6 — Human meaning review can reject auto-pass */
{
  const testCase = gold('G02');

  const actual = JSON.parse(
    JSON.stringify(testCase.expected)
  );

  actual.subjects[0].meaning =
    'العميلة تريد خدمة ليزر للتصبغات';

  const score = scoreSemanticResult(
    testCase,
    actual
  );

  assert.strictEqual(score.status, 'AUTO_PASS');

  const final = applyMeaningReview(score, {
    correct: false,
    critical: true,
    reason:
      'Meaning invented an authoritative treatment mapping.',
  });

  assert.strictEqual(
    final.finalStatus,
    'CRITICAL_FAIL'
  );

  console.log(
    'PASS: semantic/domain hallucination caught by meaning review'
  );
}

console.log(
  'SEMANTIC_V1_SCORING_RUBRIC_OK'
);
