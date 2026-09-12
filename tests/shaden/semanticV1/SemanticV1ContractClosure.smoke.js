'use strict';

const assert = require('assert');

const contract =
  require('../../../src/services/shaden/semanticV1/SemanticContractV1');

const {
  validateSemanticResult,
} =
  require('../../../src/services/shaden/semanticV1/SemanticResultValidator');

const {
  scoreSemanticResult,
} =
  require('../../../src/services/shaden/semanticV1/SemanticScoringRubricV1');

const gold =
  require('./GoldCorpusV1');

/* 1 ? Contract version */

assert.strictEqual(
  contract.CONTRACT_VERSION,
  '1.1.0-si01'
);

assert.ok(
  contract.CONSTRAINT_KINDS.includes('NEGATIVE')
);

assert.ok(
  !contract.CONSTRAINT_KINDS.includes('NEGATION')
);

assert.ok(
  !contract.CONSTRAINT_KINDS.includes('EXCLUSION')
);

console.log(
  'PASS: contract v1.1 negative semantics'
);


/* 2 ? Every Gold case satisfies the new contract */

for (const testCase of gold) {
  validateSemanticResult(
    testCase.expected,
    {
      currentMessage: testCase.currentMessage,
      contextTurns: testCase.contextTurns,
    }
  );
}

console.log(
  'PASS: all Gold cases satisfy v1.1'
);


/* 3 ? Losing NEGATIVE remains critical */

{
  const testCase =
    gold.find(x => x.id === 'G06');

  const actual =
    JSON.parse(
      JSON.stringify(testCase.expected)
    );

  actual.constraints = [];

  const score =
    scoreSemanticResult(
      testCase,
      actual
    );

  assert.strictEqual(
    score.autoPassed,
    false
  );

  assert.strictEqual(
    score.critical,
    true
  );

  console.log(
    'PASS: lost NEGATIVE is critical'
  );
}


/* 4 ? Location cannot occupy both roles */

{
  const currentMessage =
    'branch availability';

  const actual = {
    status: 'UNDERSTOOD',

    goals: [{
      type: 'ASK',
      surface: 'branch availability',
      meaning: 'asks about branch availability',
    }],

    subjects: [{
      kind: 'BRANCH_OR_LOCATION',
      surface: 'branch',
      meaning: 'branch',
      source: 'CURRENT',
    }],

    constraints: [{
      kind: 'LOCATION',
      surface: 'branch',
      meaning: 'branch',
      source: 'CURRENT',
    }],

    context: {
      used: false,
      evidence: [],
    },
  };

  assert.throws(
    () =>
      validateSemanticResult(
        actual,
        {
          currentMessage,
          contextTurns: [],
        }
      ),
    /must not be duplicated/
  );

  console.log(
    'PASS: duplicated location ownership rejected'
  );
}


/* 5 ? Attached Arabic letters must remain verbatim */

{
  const currentMessage =
    '\u0623\u0631\u0648\u062d \u0644\u0644\u0635\u0627\u0644\u062d\u064a\u0629';

  const actual = {
    status: 'UNDERSTOOD',

    goals: [{
      type: 'ACT',
      surface: currentMessage,
      meaning: 'wants to go to a location',
    }],

    subjects: [{
      kind: 'BRANCH_OR_LOCATION',

      surface:
        '\u0627\u0644\u0635\u0627\u0644\u062d\u064a\u0629',

      meaning: 'location',
      source: 'CURRENT',
    }],

    constraints: [],

    context: {
      used: false,
      evidence: [],
    },
  };

  assert.throws(
    () =>
      validateSemanticResult(
        actual,
        {
          currentMessage,
          contextTurns: [],
        }
      ),
    /verbatim evidence/
  );

  console.log(
    'PASS: Arabic clitic normalization rejected'
  );
}


/* 6 ? Larger context evidence may support smaller semantic span */

{
  const currentMessage =
    'and there?';

  const contextTurns = [
    'do you have filler at branch?',
  ];

  const actual = {
    status: 'UNDERSTOOD',

    goals: [{
      type: 'ASK',
      surface: 'and there?',
      meaning: 'follow-up question',
    }],

    subjects: [{
      kind: 'SERVICE_OR_TREATMENT',
      surface: 'filler',
      meaning: 'filler',
      source: 'CONTEXT',
    }],

    constraints: [],

    context: {
      used: true,

      evidence: [{
        turn: -1,
        surface:
          'do you have filler at branch?',
      }],
    },
  };

  assert.strictEqual(
    validateSemanticResult(
      actual,
      {
        currentMessage,
        contextTurns,
      }
    ),
    true
  );

  console.log(
    'PASS: context evidence containment preserved'
  );
}


/* 7 ? Stated medical circumstance is representable */

{
  const currentMessage =
    'pregnant asking about laser';

  const actual = {
    status: 'UNDERSTOOD',

    goals: [{
      type: 'ASK',
      surface:
        'pregnant asking about laser',
      meaning:
        'asks about laser while stating pregnancy',
    }],

    subjects: [{
      kind: 'SERVICE_OR_TREATMENT',
      surface: 'laser',
      meaning: 'laser',
      source: 'CURRENT',
    }],

    constraints: [{
      kind: 'OTHER',
      surface: 'pregnant',
      meaning: 'states pregnancy',
      source: 'CURRENT',
    }],

    context: {
      used: false,
      evidence: [],
    },
  };

  assert.strictEqual(
    validateSemanticResult(
      actual,
      {
        currentMessage,
        contextTurns: [],
      }
    ),
    true
  );

  console.log(
    'PASS: stated medical fact is representable'
  );
}

console.log(
  'SEMANTIC_V1_1_CONTRACT_CLOSURE_OK'
);
