'use strict';

const assert = require('assert');

const contract =
  require('../../../src/services/shaden/semanticV1/SemanticContractV1');

const {
  validateSemanticResult,
} = require(
  '../../../src/services/shaden/semanticV1/SemanticResultValidator'
);

assert.deepStrictEqual(
  contract.SUBJECT_KINDS,
  [
    'SERVICE_OR_NEED',
    'BRANCH',
    'PROVIDER',
    'APPOINTMENT',
    'PAYMENT',
  ]
);

/* 1. named service */
assert.strictEqual(
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'SERVICE_OR_NEED',
        surface: 'ليزر',
        meaning: 'خدمة الليزر',
        source: 'CURRENT',
      }],
      constraints: [],
    },
    {
      currentMessage: 'عندكم ليزر؟',
      contextTurns: [],
    }
  ),
  true
);

/* 2. described need */
assert.strictEqual(
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'SERVICE_OR_NEED',
        surface: 'بقع غامقة من الشمس',
        meaning:
          'وجود بقع أو تصبغات داكنة ناتجة عن الشمس',
        source: 'CURRENT',
      }],
      constraints: [],
    },
    {
      currentMessage:
        'عندي بقع غامقة من الشمس، عندكم شيء يساعد؟',
      contextTurns: [],
    }
  ),
  true
);

/* 3. contextual SERVICE_OR_NEED */
assert.strictEqual(
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'SERVICE_OR_NEED',
        surface: 'بوتكس',
        meaning: 'البوتكس',
        source: 'CONTEXT',
      }],
      constraints: [{
        kind: 'LOCATION',
        surface: 'الحمدانية',
        source: 'CURRENT',
      }],
    },
    {
      currentMessage: 'وفي الحمدانية؟',
      contextTurns: [
        'عندكم بوتكس في الصالحية؟',
      ],
    }
  ),
  true
);

/* 4. stated circumstance remains constraint */
assert.strictEqual(
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'SERVICE_OR_NEED',
        surface: 'البوتكس',
        meaning: 'البوتكس',
        source: 'CURRENT',
      }],
      constraints: [{
        kind: 'OTHER',
        surface: 'حامل',
        source: 'CURRENT',
      }],
    },
    {
      currentMessage:
        'أنا حامل وأفكر في البوتكس، وش تنصحون؟',
      contextTurns: [],
    }
  ),
  true
);

/* 5. SERVICE_OR_NEED without meaning must fail */
assert.throws(() =>
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'SERVICE_OR_NEED',
        surface: 'ليزر',
        source: 'CURRENT',
      }],
      constraints: [],
    },
    {
      currentMessage: 'عندكم ليزر؟',
      contextTurns: [],
    }
  )
);

/* 6. empty meaning must fail */
assert.throws(() =>
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'SERVICE_OR_NEED',
        surface: 'ليزر',
        meaning: '',
        source: 'CURRENT',
      }],
      constraints: [],
    },
    {
      currentMessage: 'عندكم ليزر؟',
      contextTurns: [],
    }
  )
);

/* 7. other subject kinds must not carry meaning */
assert.throws(() =>
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'BRANCH',
        surface: 'الروضة',
        meaning: 'فرع الروضة',
        source: 'CURRENT',
      }],
      constraints: [],
    },
    {
      currentMessage: 'عندكم فرع في الروضة؟',
      contextTurns: [],
    }
  )
);

/* 8. constraints must not carry meaning */
assert.throws(() =>
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [],
      constraints: [{
        kind: 'LOCATION',
        surface: 'الروضة',
        meaning: 'منطقة الروضة',
        source: 'CURRENT',
      }],
    },
    {
      currentMessage: 'في الروضة؟',
      contextTurns: [],
    }
  )
);

/* 9. old taxonomy remains rejected */
assert.throws(() =>
  validateSemanticResult(
    {
      status: 'UNDERSTOOD',
      goal: 'ASK',
      subjects: [{
        kind: 'SERVICE',
        surface: 'ليزر',
        source: 'CURRENT',
      }],
      constraints: [],
    },
    {
      currentMessage: 'عندكم ليزر؟',
      contextTurns: [],
    }
  )
);

/* 10. UNKNOWN remains empty */
assert.strictEqual(
  validateSemanticResult(
    {
      status: 'UNKNOWN',
      goal: null,
      subjects: [],
      constraints: [],
    },
    {
      currentMessage: '؟؟؟',
      contextTurns: [],
    }
  ),
  true
);

console.log(
  'MINIMAL_SEMANTIC_MEANING_CONTRACT_OK'
);
