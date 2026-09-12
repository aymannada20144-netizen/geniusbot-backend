'use strict';

const assert = require('assert');
const {
  validateSemanticResult,
  SemanticContractViolationError,
} = require('../../../src/services/shaden/semanticV1/SemanticResultValidator');

function expectPass(name, result, input) {
  assert.strictEqual(validateSemanticResult(result, input), true);
  console.log(`PASS: ${name}`);
}

function expectViolation(name, result, input) {
  assert.throws(
    () => validateSemanticResult(result, input),
    SemanticContractViolationError
  );
  console.log(`PASS: ${name} rejected`);
}

/* 1 — valid direct understanding */
expectPass(
  'direct service inquiry',
  {
    status: 'UNDERSTOOD',
    goals: [{
      type: 'ASK',
      surface: 'عندكم ليزر',
      meaning: 'تسأل عن وجود خدمة ليزر',
    }],
    subjects: [{
      kind: 'SERVICE_OR_TREATMENT',
      surface: 'ليزر',
      meaning: 'خدمة أو علاج بالليزر',
      source: 'CURRENT',
    }],
    constraints: [],
    context: {
      used: false,
      evidence: [],
    },
  },
  {
    currentMessage: 'عندكم ليزر؟',
    contextTurns: [],
  }
);

/* 2 — valid social message without subjects */
expectPass(
  'social without subject',
  {
    status: 'UNDERSTOOD',
    goals: [{
      type: 'SOCIAL',
      surface: 'شكرا',
      meaning: 'تعبير عن الشكر',
    }],
    subjects: [],
    constraints: [],
    context: {
      used: false,
      evidence: [],
    },
  },
  {
    currentMessage: 'شكرا',
    contextTurns: [],
  }
);

/* 3 — valid contextual follow-up */
expectPass(
  'context follow-up',
  {
    status: 'UNDERSTOOD',
    goals: [{
      type: 'ASK',
      surface: 'طيب والحمدانية؟',
      meaning: 'تسأل عن نفس الموضوع بالنسبة للحمدانية',
    }],
    subjects: [
      {
        kind: 'SERVICE_OR_TREATMENT',
        surface: 'فيلر',
        meaning: 'خدمة الفيلر المذكورة سابقا',
        source: 'CONTEXT',
      },
      {
        kind: 'BRANCH_OR_LOCATION',
        surface: 'الحمدانية',
        meaning: 'موقع أو فرع مذكور في الرسالة الحالية',
        source: 'CURRENT',
      },
    ],
    constraints: [],
    context: {
      used: true,
      evidence: [{
        turn: -1,
        surface: 'فيلر',
      }],
    },
  },
  {
    currentMessage: 'طيب والحمدانية؟',
    contextTurns: [
      'عندكم فيلر في الصالحية؟',
    ],
  }
);

/* 4 — fabricated surface must fail */
expectViolation(
  'fabricated surface',
  {
    status: 'UNDERSTOOD',
    goals: [{
      type: 'ASK',
      surface: 'عندكم حاجة',
      meaning: 'تسأل عن خيار مناسب',
    }],
    subjects: [{
      kind: 'NEED_OR_CONCERN',
      surface: 'تصبغات',
      meaning: 'تغير لون في الجلد',
      source: 'CURRENT',
    }],
    constraints: [],
    context: {
      used: false,
      evidence: [],
    },
  },
  {
    currentMessage: 'عندي بقع غامقة من الشمس، عندكم حاجة؟',
    contextTurns: [],
  }
);

/* 5 — UNKNOWN must not invent commitments */
expectViolation(
  'unknown with semantic commitment',
  {
    status: 'UNKNOWN',
    goals: [{
      type: 'OTHER',
      surface: 'مش فاهم',
      meaning: 'غير واضح',
    }],
    subjects: [],
    constraints: [],
    context: {
      used: false,
      evidence: [],
    },
  },
  {
    currentMessage: 'مش فاهم',
    contextTurns: [],
  }
);

/* 6 — context cannot be claimed without evidence */
expectViolation(
  'context without evidence',
  {
    status: 'AMBIGUOUS',
    goals: [],
    subjects: [],
    constraints: [],
    context: {
      used: true,
      evidence: [],
    },
  },
  {
    currentMessage: 'طيب هناك؟',
    contextTurns: [
      'عندكم ليزر في الصالحية؟',
    ],
  }
);

console.log('SEMANTIC_V1_VALIDATOR_SMOKE_OK');
