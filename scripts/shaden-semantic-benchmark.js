'use strict';

const fs = require('fs');
const path = require('path');

const db = require('../src/db/pool');
const env = require('../src/config/env');
const createRepositories = require('../src/repositories');

const OpenRouterSemanticProvider =
  require('../src/services/shaden/semanticV1/OpenRouterSemanticProvider');

const SemanticInterpreterV1 =
  require('../src/services/shaden/semanticV1/SemanticInterpreterV1');

const GroundingSemanticNormalizer =
  require('../src/services/shaden/semanticCatalog/GroundingSemanticNormalizer');

const OpenRouterEmbeddingProvider =
  require('../src/services/shaden/semanticCatalog/OpenRouterEmbeddingProvider');

const CandidateGrounder =
  require('../src/services/shaden/semanticCatalog/CandidateGrounder');

const SemanticCandidateResolver =
  require('../src/services/shaden/semanticCatalog/SemanticCandidateResolver');


const CLINIC_ID =
  '00000000-0000-0000-0000-000000000001';


const CASES = [

  // ------------------------------------------------
  // A — Direct service names: 1..19
  // ------------------------------------------------

  c(1, 'A', 'إزالة الثآليل', r('إزالة الثآليل')),
  c(2, 'A', 'إزالة الشعر بالليزر', r('إزالة الشعر بالليزر')),
  c(3, 'A', 'استشارة جلدية', r('استشارة جلدية')),
  c(4, 'A', 'البلازما PRP', r('البلازما PRP')),
  c(5, 'A', 'بوتوكس', r('بوتوكس')),
  c(6, 'A', 'تقشير كيميائي', r('تقشير كيميائي')),
  c(7, 'A', 'تنظيف بشرة', r('تنظيف بشرة')),
  c(8, 'A', 'حقن نضارة', r('حقن نضارة')),
  c(9, 'A', 'شد الجلد', r('شد الجلد')),
  c(10, 'A', 'شد الوجه بالخيوط', r('شد الوجه بالخيوط')),
  c(11, 'A', 'علاج الإكزيما', r('علاج الإكزيما')),
  c(12, 'A', 'علاج الصدفية', r('علاج الصدفية')),
  c(13, 'A', 'علاج حب الشباب', r('علاج حب الشباب')),
  c(14, 'A', 'فيلر', r('فيلر')),
  c(15, 'A', 'كرايو', r('كرايو')),
  c(16, 'A', 'ليزر الأوعية الدموية', r('ليزر الأوعية الدموية')),
  c(17, 'A', 'ليزر التصبغات', r('ليزر التصبغات')),
  c(18, 'A', 'ليزر الفراكشنال', r('ليزر الفراكشنال')),
  c(19, 'A', 'نحت وتحديد', r('نحت وتحديد')),

  // ------------------------------------------------
  // B — Natural need language: 20..54
  // ------------------------------------------------

  c(20, 'B', 'عندي خطوط لما أبتسم', r('بوتوكس')),
  c(21, 'B', 'خطوط تعبير حول العين', r('بوتوكس')),
  c(22, 'B', 'جبهتي فيها خطوط لما أرفع حواجبي', r('بوتوكس')),

  c(23, 'B', 'لون وجهي مو موحد', r('ليزر التصبغات')),
  c(24, 'B', 'عندي تصبغات في الخد', r('ليزر التصبغات')),
  c(25, 'B', 'غمقان حول الفم', r('ليزر التصبغات')),

  c(26, 'B', 'عندي آثار حبوب قديمة', r('ليزر الفراكشنال')),
  c(27, 'B', 'عندي حفر بسيطة من الحبوب', r('ليزر الفراكشنال')),
  c(28, 'B', 'ندبات حبوب سطحية', r('ليزر الفراكشنال')),

  c(29, 'B', 'عندي حبوب طالعة حاليا', r('علاج حب الشباب')),
  c(30, 'B', 'الحبوب ترجع لي باستمرار', r('علاج حب الشباب')),
  c(31, 'B', 'عندي حب شباب نشط', r('علاج حب الشباب')),

  c(32, 'B', 'أبغى أشيل الشعر الزائد', r('إزالة الشعر بالليزر')),
  c(33, 'B', 'شعر الإبط مزعجني', r('إزالة الشعر بالليزر')),
  c(34, 'B', 'أبغى أشيل شعر الرجلين', r('إزالة الشعر بالليزر')),

  c(35, 'B', 'عندي احمرار في الوجه', r('ليزر الأوعية الدموية')),
  c(36, 'B', 'شعيرات دموية واضحة في وجهي', r('ليزر الأوعية الدموية')),

  c(37, 'B', 'عندي اكزيما', r('علاج الإكزيما')),
  c(38, 'B', 'عندي صدفية', r('علاج الصدفية')),

  c(39, 'B', 'عندي ثآليل في يدي', r('إزالة الثآليل')),
  c(40, 'B', 'أبغى أشيل ثؤلول', r('إزالة الثآليل')),

  c(41, 'B', 'وجهي باهت وأبغى نضارة', r('حقن نضارة')),
  c(42, 'B', 'أبغى وجهي يصير أنضر', r('حقن نضارة')),

  c(43, 'B', 'أبغى تنظيف عميق للبشرة', r('تنظيف بشرة')),
  c(44, 'B', 'بشرتي تحتاج تنظيف', r('تنظيف بشرة')),

  c(45, 'B', 'خدي فاقد حجم', r('فيلر')),
  c(46, 'B', 'أبغى أرجع حجم الوجه', r('فيلر')),

  c(47, 'B', 'أبغى أشد وجهي بالخيوط', r('شد الوجه بالخيوط')),
  c(48, 'B', 'أبغى أحدد ملامح وجهي بالخيوط', r('شد الوجه بالخيوط')),

  c(49, 'B', 'جلد بطني مترهل وأبغى أشده', r('شد الجلد')),

  c(
    50,
    'B',
    'عندي مشكلة جلدية وأبغى دكتورة تشوفها',
    r('استشارة جلدية')
  ),

  c(51, 'B', 'أبغى بلازما للوجه', r('البلازما PRP')),
  c(52, 'B', 'أبغى تقشير كيميائي', r('تقشير كيميائي')),
  c(53, 'B', 'أبغى كرايو لنحت الجسم', r('كرايو')),
  c(54, 'B', 'أبغى نحت وتحديد للجسم', r('نحت وتحديد')),

  // ------------------------------------------------
  // C — Ambiguity: 55..66
  // ------------------------------------------------

  c(55, 'C', 'أبغى أحسن بشرتي', a()),
  c(56, 'C', 'أبغى ليزر', a()),
  c(57, 'C', 'أبغى حقن للوجه', a()),
  c(58, 'C', 'أبغى شد للوجه', a()),
  c(59, 'C', 'أبغى أحدد ملامح وجهي', a()),
  c(60, 'C', 'أبغى أعدل شكل جسمي', a()),
  c(61, 'C', 'ملمس بشرتي خشن', a()),
  c(62, 'C', 'أبغى نضارة أو تنظيف', a()),
  c(63, 'C', 'عندي بقع وحفر', a()),
  c(64, 'C', 'عندي احمرار وبقع غامقة', a()),
  c(65, 'C', 'وش الأفضل لوجهي؟', a()),
  c(66, 'C', 'أبغى علاج للبشرة', a()),

  // ------------------------------------------------
  // D — Negation / multi-service: 67..76
  // ------------------------------------------------

  c(
    67,
    'D',
    'ما أبي فيلر أبغى نضارة',
    neg(['حقن نضارة'], ['فيلر'])
  ),

  c(
    68,
    'D',
    'أبغى تنظيف مو تقشير',
    neg(['تنظيف بشرة'], ['تقشير كيميائي'])
  ),

  c(
    69,
    'D',
    'ما عندي حبوب نشطة بس عندي آثار',
    neg(['ليزر الفراكشنال'], ['علاج حب الشباب'])
  ),

  c(
    70,
    'D',
    'عندي حبوب مو آثار',
    neg(['علاج حب الشباب'], ['ليزر الفراكشنال'])
  ),

  c(
    71,
    'D',
    'أبغى فيلر بس بدون بوتكس',
    neg(['فيلر'], ['بوتوكس'])
  ),

  c(
    72,
    'D',
    'أبغى بوتكس وفيلر بدون نضارة',
    neg(
      ['بوتوكس', 'فيلر'],
      ['حقن نضارة']
    )
  ),

  c(
    73,
    'D',
    'ما أبي شد ولا فيلر بس تنظيف',
    neg(
      ['تنظيف بشرة'],
      ['شد الجلد', 'شد الوجه بالخيوط', 'فيلر']
    )
  ),

  c(
    74,
    'D',
    'مو إزالة شعر أبغى ليزر للتصبغات',
    neg(
      ['ليزر التصبغات'],
      ['إزالة الشعر بالليزر']
    )
  ),

  c(
    75,
    'D',
    'مو تصبغات عندي احمرار',
    neg(
      ['ليزر الأوعية الدموية'],
      ['ليزر التصبغات']
    )
  ),

  c(
    76,
    'D',
    'ما أبي أي إجراء بس أبي استشارة',
    neg(['استشارة جلدية'], [])
  ),

  // ------------------------------------------------
  // E — Medical context: 77..84
  // ------------------------------------------------

  c(
    77,
    'E',
    'أنا حامل وأفكر في بوتكس',
    medical('بوتوكس')
  ),

  c(
    78,
    'E',
    'أنا مرضع وأبغى إزالة الشعر بالليزر',
    medical('إزالة الشعر بالليزر')
  ),

  c(
    79,
    'E',
    'عندي حساسية شديدة وأفكر في فيلر',
    medical('فيلر')
  ),

  c(
    80,
    'E',
    'أستخدم الروكتان وأبغى فراكشنال',
    medical('ليزر الفراكشنال')
  ),

  c(
    81,
    'E',
    'عندي سكري وأبغى تقشير كيميائي',
    medical('تقشير كيميائي')
  ),

  c(
    82,
    'E',
    'هل البوتكس آمن وأنا حامل؟',
    medical('بوتوكس')
  ),

  c(
    83,
    'E',
    'عندي آثار حبوب وأنا حامل وش الأفضل؟',
    medical('ليزر الفراكشنال')
  ),

  c(
    84,
    'E',
    'عمري 16 وأبغى فيلر',
    medical('فيلر')
  ),

  // ------------------------------------------------
  // F — Social / operational / outside: 85..92
  // ------------------------------------------------

  c(85, 'F', 'السلام عليكم', noService()),
  c(86, 'F', 'شكرا', noService()),

  c(
    87,
    'F',
    'كم سعر البوتكس؟',
    r('بوتوكس')
  ),

  c(88, 'F', 'وش أوقات الدوام؟', noService()),
  c(89, 'F', 'تقبلون التأمين؟', noService()),
  c(90, 'F', 'وين فرعكم؟', noService()),

  c(
    91,
    'F',
    'عندكم تبييض أسنان؟',
    notFound()
  ),

  c(
    92,
    'F',
    'عندي ألم شديد في الصدر',
    noServiceOrNotFound()
  ),
];


function c(id, category, text, expected) {
  return Object.freeze({
    id,
    category,
    text,
    expected,
  });
}


function r(...services) {
  return {
    type: 'RESOLVED',
    services,
  };
}


function a() {
  return {
    type: 'AMBIGUOUS',
  };
}


function neg(services, forbidden) {
  return {
    type: 'RESOLVED',
    services,
    forbidden,
    requireNegative: true,
  };
}


function medical(service) {
  return {
    type: 'RESOLVED',
    services: [service],
    requireMedical: true,
  };
}


function noService() {
  return {
    type: 'NO_SERVICE',
  };
}


function notFound() {
  return {
    type: 'NOT_FOUND',
  };
}


function noServiceOrNotFound() {
  return {
    type: 'NO_SERVICE_OR_NOT_FOUND',
  };
}


function cleanAliases(value) {
  if (Array.isArray(value)) {
    return value.filter(
      (item) =>
        typeof item === 'string' &&
        item.trim()
    );
  }

  if (
    typeof value === 'string' &&
    value.trim()
  ) {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}


function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}


async function loadServices() {
  const tableResult = await db.query(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_name = 'services'
        AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY CASE WHEN table_schema = 'public' THEN 0 ELSE 1 END,
               table_schema
      LIMIT 1`
  );

  if (!tableResult.rows.length) {
    throw new Error(
      'Could not locate services table.'
    );
  }

  const {
    table_schema: schema,
    table_name: table,
  } = tableResult.rows[0];

  const fullName =
    `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;

  const result = await db.query(
    `SELECT *
       FROM ${fullName}
      WHERE clinic_id = $1
        AND is_active IS TRUE
      ORDER BY name`,
    [CLINIC_ID]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name:
      row.name ??
      row.service_name ??
      null,
    aliases:
      cleanAliases(row.aliases),
    description:
      row.description ?? null,
    specialtyId:
      row.specialty_id ?? null,
    isBookingEnabled:
      row.is_booking_enabled ?? true,
    requiresDoctor:
      row.requires_doctor ?? null,
    requiresRoom:
      row.requires_room ?? null,
  }));
}


function sameSet(actual, expected) {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();

  return (
    a.length === b.length &&
    a.every(
      (value, index) =>
        value === b[index]
    )
  );
}


function addUsage(total, usage) {
  if (!usage) return;

  total.promptTokens +=
    Number(
      usage.promptTokens ??
      usage.prompt_tokens ??
      0
    );

  total.completionTokens +=
    Number(
      usage.completionTokens ??
      usage.completion_tokens ??
      0
    );

  total.totalTokens +=
    Number(
      usage.totalTokens ??
      usage.total_tokens ??
      0
    );
}


function selectedNames(subjectResults) {
  return subjectResults
    .map((item) =>
      item.selectedCandidate?.serviceName
    )
    .filter(Boolean);
}


function hasExpectedInTop3(
  subjectResults,
  expectedServices
) {
  return expectedServices.every(
    (serviceName) =>
      subjectResults.some((item) =>
        item.grounding.candidates
          .slice(0, 3)
          .some(
            (candidate) =>
              candidate.serviceName ===
              serviceName
          )
      )
  );
}


function evaluateCase({
  testCase,
  semanticResult,
  subjectResults,
  validServiceNames,
}) {
  const expected =
    testCase.expected;

  const contractValid =
    semanticResult.contractValid === true;

  const result =
    semanticResult.result || {};

  const serviceSubjects =
    Array.isArray(result.subjects)
      ? result.subjects.filter(
          (subject) =>
            subject?.kind ===
            'SERVICE_OR_NEED'
        )
      : [];

  const constraints =
    Array.isArray(result.constraints)
      ? result.constraints
      : [];

  const medicalPresent =
    constraints.some(
      (item) =>
        item?.kind ===
        'MEDICAL_CONTEXT'
    );

  const negativePresent =
    constraints.some(
      (item) =>
        item?.kind === 'NEGATIVE'
    );

  const selected =
    selectedNames(subjectResults);

  const invalidSelected =
    selected.filter(
      (serviceName) =>
        !validServiceNames.has(
          serviceName
        )
    );

  let understandingPass =
    contractValid;

  if (
    expected.type === 'RESOLVED' ||
    expected.type === 'AMBIGUOUS' ||
    expected.type === 'NOT_FOUND'
  ) {
    understandingPass =
      understandingPass &&
      serviceSubjects.length > 0;
  }

  if (
    expected.type === 'NO_SERVICE'
  ) {
    understandingPass =
      understandingPass &&
      serviceSubjects.length === 0;
  }

  if (
    expected.requireMedical
  ) {
    understandingPass =
      understandingPass &&
      medicalPresent;
  }

  if (
    expected.requireNegative
  ) {
    understandingPass =
      understandingPass &&
      negativePresent;
  }


  let outcomePass = false;

  if (
    expected.type === 'RESOLVED'
  ) {
    outcomePass =
      sameSet(
        selected,
        expected.services
      );
  }

  if (
    expected.type === 'AMBIGUOUS'
  ) {
    outcomePass =
      subjectResults.length > 0 &&
      subjectResults.every(
        (item) =>
          item.resolution.decision ===
          'AMBIGUOUS'
      );
  }

  if (
    expected.type === 'NO_SERVICE'
  ) {
    outcomePass =
      serviceSubjects.length === 0;
  }

  if (
    expected.type === 'NOT_FOUND'
  ) {
    outcomePass =
      subjectResults.length > 0 &&
      subjectResults.every(
        (item) =>
          item.resolution.decision ===
          'NOT_FOUND'
      );
  }

  if (
    expected.type ===
    'NO_SERVICE_OR_NOT_FOUND'
  ) {
    outcomePass =
      serviceSubjects.length === 0 ||
      (
        subjectResults.length > 0 &&
        subjectResults.every(
          (item) =>
            item.resolution.decision ===
            'NOT_FOUND'
        )
      );
  }


  const forbidden =
    Array.isArray(expected.forbidden)
      ? expected.forbidden
      : [];

  const selectedForbidden =
    selected.filter(
      (name) =>
        forbidden.includes(name)
    );

  const hardFailures = [];

  if (selectedForbidden.length) {
    hardFailures.push(
      `NEGATED_SERVICE_SELECTED: ${selectedForbidden.join(', ')}`
    );
  }

  if (invalidSelected.length) {
    hardFailures.push(
      `NON_CATALOG_SERVICE_SELECTED: ${invalidSelected.join(', ')}`
    );
  }

  const casePass =
    understandingPass &&
    outcomePass &&
    hardFailures.length === 0;


  const retrievalApplicable =
    (
      expected.type === 'RESOLVED' &&
      Array.isArray(expected.services) &&
      expected.services.length > 0
    );

  const retrievalTop3Pass =
    retrievalApplicable
      ? hasExpectedInTop3(
          subjectResults,
          expected.services
        )
      : null;


  return {
    casePass,
    understandingPass,
    outcomePass,
    retrievalApplicable,
    retrievalTop3Pass,
    medicalPresent,
    negativePresent,
    selected,
    hardFailures,
  };
}


async function main() {
  if (
    !env?.conversation
      ?.openRouterApiKey
  ) {
    throw new Error(
      'OpenRouter API key is missing.'
    );
  }

  const repositories =
    createRepositories(db);

  const knowledgeBaseRepository =
    repositories.knowledgeBase;

  if (
    !knowledgeBaseRepository ||
    typeof knowledgeBaseRepository
      .findDiscoveryRows !== 'function'
  ) {
    throw new Error(
      'knowledgeBase.findDiscoveryRows() is unavailable.'
    );
  }


  const services =
    await loadServices();

  if (services.length !== 19) {
    throw new Error(
      `Expected 19 active services, found ${services.length}.`
    );
  }

  const validServiceNames =
    new Set(
      services.map(
        (service) =>
          service.name
      )
    );

  const discoveryRows =
    await knowledgeBaseRepository
      .findDiscoveryRows({
        clinicId: CLINIC_ID,
      });

  console.log('');
  console.log(
    `ACTIVE_SERVICES: ${services.length}`
  );
  console.log(
    `DISCOVERY_ROWS: ${discoveryRows.length}`
  );

  if (discoveryRows.length !== 29) {
    console.warn(
      `WARNING: expected 29 Discovery rows, found ${discoveryRows.length}.`
    );
  }


  const semanticProvider =
    new OpenRouterSemanticProvider({
      apiKey:
        env.conversation
          .openRouterApiKey,
      baseUrl:
        env.conversation
          .openRouterBaseUrl,
      model:
        env.conversation.model,
    });

  const semanticInterpreter =
    new SemanticInterpreterV1({
      provider: semanticProvider,
    });

  const semanticNormalizer =
    new GroundingSemanticNormalizer({
      provider: semanticProvider,
    });

  const embeddingProvider =
    new OpenRouterEmbeddingProvider({
      apiKey:
        env.conversation
          .openRouterApiKey,
      baseUrl:
        env.conversation
          .openRouterBaseUrl,
    });

  const candidateGrounder =
    new CandidateGrounder({
      embeddingProvider,
      semanticNormalizer,
    });

  const semanticCandidateResolver =
    new SemanticCandidateResolver({
      provider: semanticProvider,
    });


  const usage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  const caseResults = [];


  for (
    let index = 0;
    index < CASES.length;
    index++
  ) {
    const testCase =
      CASES[index];

    process.stdout.write(
      `[${String(index + 1).padStart(2, '0')}/${CASES.length}] #${testCase.id} ${testCase.text} ... `
    );

    try {
      const semanticResult =
        await semanticInterpreter.interpret({
          currentMessage:
            testCase.text,
          contextTurns: [],
        });

      addUsage(
        usage,
        semanticResult.usage
      );

      const serviceSubjects =
        semanticResult.contractValid &&
        Array.isArray(
          semanticResult.result
            ?.subjects
        )
          ? semanticResult.result.subjects.filter(
              (subject) =>
                subject?.kind ===
                'SERVICE_OR_NEED'
            )
          : [];


      const subjectResults = [];

      for (
        const subject of serviceSubjects
      ) {
        const grounding =
          await candidateGrounder.ground({
            surface: subject.surface,
            sourceText: testCase.text,
            services,
            discoveryRows,
          });

        addUsage(
          usage,
          grounding
            ?.normalization
            ?.usage
        );

        let resolution;

        if (
          grounding.method === 'EXACT'
        ) {
          resolution = {
            decision: 'RESOLVED',
            candidateIndex: 0,
            model: null,
            usage: null,
          };
        } else {
          resolution =
            await semanticCandidateResolver.resolve({
              surface:
                subject.surface,
              semanticMeaning:
                grounding.semanticMeaning,
              candidates:
                grounding.candidates,
              discoveryRows,
            });

          addUsage(
            usage,
            resolution.usage
          );
        }

        const selectedCandidate =
          (
            resolution.decision ===
              'RESOLVED' &&
            Number.isInteger(
              resolution.candidateIndex
            )
          )
            ? (
              grounding.candidates[
                resolution.candidateIndex
              ] || null
            )
            : null;

        subjectResults.push({
          subject,
          grounding,
          resolution,
          selectedCandidate,
        });
      }


      const evaluation =
        evaluateCase({
          testCase,
          semanticResult,
          subjectResults,
          validServiceNames,
        });


      const row = {
        id: testCase.id,
        category:
          testCase.category,
        text: testCase.text,
        expected:
          testCase.expected,

        semantic: {
          contractValid:
            semanticResult.contractValid,
          contractError:
            semanticResult.contractError,
          result:
            semanticResult.result,
        },

        subjectResults:
          subjectResults.map(
            (item) => ({
              subject:
                item.subject,

              grounding: {
                method:
                  item.grounding.method,

                semanticMeaning:
                  item.grounding
                    .semanticMeaning,

                candidates:
                  item.grounding
                    .candidates
                    .map(
                      (candidate) => ({
                        serviceName:
                          candidate
                            .serviceName,
                        score:
                          candidate.score,
                      })
                    ),
              },

              resolution: {
                decision:
                  item.resolution
                    .decision,

                candidateIndex:
                  item.resolution
                    .candidateIndex,

                selectedCandidate:
                  item.selectedCandidate
                    ?.serviceName ||
                  null,
              },
            })
          ),

        evaluation,
      };

      caseResults.push(row);

      console.log(
        evaluation.casePass
          ? 'PASS'
          : 'FAIL'
      );

    } catch (error) {
      console.log('ERROR');

      caseResults.push({
        id: testCase.id,
        category:
          testCase.category,
        text: testCase.text,
        expected:
          testCase.expected,
        error:
          error?.stack ||
          error?.message ||
          String(error),
        evaluation: {
          casePass: false,
          understandingPass: false,
          outcomePass: false,
          retrievalApplicable: false,
          retrievalTop3Pass: null,
          hardFailures: [
            `RUNTIME_ERROR: ${
              error?.message ||
              String(error)
            }`,
          ],
        },
      });
    }
  }


  const total =
    caseResults.length;

  const passed =
    caseResults.filter(
      (row) =>
        row.evaluation?.casePass
    ).length;

  const understandingPass =
    caseResults.filter(
      (row) =>
        row.evaluation
          ?.understandingPass
    ).length;

  const contractFailures =
    caseResults.filter(
      (row) =>
        row.semantic &&
        row.semantic.contractValid ===
          false
    ).length;

  const retrievalCases =
    caseResults.filter(
      (row) =>
        row.evaluation
          ?.retrievalApplicable
    );

  const retrievalPass =
    retrievalCases.filter(
      (row) =>
        row.evaluation
          ?.retrievalTop3Pass === true
    ).length;

  const resolvedCases =
    CASES.filter(
      (item) =>
        item.expected.type ===
        'RESOLVED'
    ).length;

  const resolvedCorrect =
    caseResults.filter(
      (row) =>
        row.expected?.type ===
          'RESOLVED' &&
        row.evaluation
          ?.outcomePass
    ).length;

  const ambiguityCases =
    CASES.filter(
      (item) =>
        item.expected.type ===
        'AMBIGUOUS'
    ).length;

  const ambiguityCorrect =
    caseResults.filter(
      (row) =>
        row.expected?.type ===
          'AMBIGUOUS' &&
        row.evaluation
          ?.outcomePass
    ).length;

  const medicalCases =
    CASES.filter(
      (item) =>
        item.expected
          .requireMedical
    );

  const medicalCorrect =
    caseResults.filter(
      (row) =>
        row.expected
          ?.requireMedical &&
        row.evaluation
          ?.medicalPresent
    ).length;

  const negativeCases =
    CASES.filter(
      (item) =>
        item.expected
          .requireNegative
    );

  const negativeCorrect =
    caseResults.filter(
      (row) =>
        row.expected
          ?.requireNegative &&
        row.evaluation
          ?.negativePresent
    ).length;

  const hardFailures =
    caseResults.flatMap(
      (row) =>
        (
          row.evaluation
            ?.hardFailures || []
        ).map(
          (failure) => ({
            id: row.id,
            text: row.text,
            failure,
          })
        )
    );

  const failedCases =
    caseResults.filter(
      (row) =>
        !row.evaluation
          ?.casePass
    );


  const report = {
    generatedAt:
      new Date().toISOString(),

    clinicId:
      CLINIC_ID,

    model:
      env.conversation.model,

    phase:
      'A_INDEPENDENT_CASES',

    totals: {
      cases: total,
      passed,
      failed:
        total - passed,
      passPercent:
        Number(
          (
            (passed / total) *
            100
          ).toFixed(1)
        ),
    },

    understanding: {
      passed:
        understandingPass,
      total,
      contractFailures,
    },

    retrievalTop3: {
      passed:
        retrievalPass,
      total:
        retrievalCases.length,
      percent:
        retrievalCases.length
          ? Number(
              (
                (
                  retrievalPass /
                  retrievalCases.length
                ) *
                100
              ).toFixed(1)
            )
          : null,
    },

    resolver: {
      resolvedCorrect,
      resolvedTotal:
        resolvedCases,

      ambiguityCorrect,
      ambiguityTotal:
        ambiguityCases,
    },

    medicalContext: {
      passed:
        medicalCorrect,
      total:
        medicalCases.length,
    },

    negativeConstraints: {
      passed:
        negativeCorrect,
      total:
        negativeCases.length,
    },

    hardFailures,

    usage,

    failedCases,
    caseResults,
  };


  console.log('');
  console.log(
    '============================================'
  );
  console.log(
    ' SHADEN SEMANTIC BENCHMARK — PHASE A'
  );
  console.log(
    '============================================'
  );

  console.log(
    `Cases:                  ${total}`
  );

  console.log(
    `Passed:                 ${passed}/${total} (${report.totals.passPercent}%)`
  );

  console.log(
    `Understanding:          ${understandingPass}/${total}`
  );

  console.log(
    `Contract failures:      ${contractFailures}`
  );

  console.log(
    `Retrieval Recall@3:     ${retrievalPass}/${retrievalCases.length} (${report.retrievalTop3.percent}%)`
  );

  console.log(
    `Resolved correct:       ${resolvedCorrect}/${resolvedCases}`
  );

  console.log(
    `Ambiguity correct:      ${ambiguityCorrect}/${ambiguityCases}`
  );

  console.log(
    `MEDICAL_CONTEXT:        ${medicalCorrect}/${medicalCases.length}`
  );

  console.log(
    `NEGATIVE constraints:   ${negativeCorrect}/${negativeCases.length}`
  );

  console.log(
    `Hard failures:          ${hardFailures.length}`
  );

  console.log(
    `LLM tokens observed:    ${usage.totalTokens}`
  );


  if (hardFailures.length) {
    console.log('');
    console.log('HARD FAILURES');

    for (
      const failure of hardFailures
    ) {
      console.log(
        `#${failure.id}: ${failure.failure}`
      );
    }
  }


  if (failedCases.length) {
    console.log('');
    console.log('FAILED CASES');

    for (
      const row of failedCases
    ) {
      console.log('');
      console.log(
        `#${row.id} [${row.category}] ${row.text}`
      );

      console.log(
        ' expected:',
        JSON.stringify(
          row.expected
        )
      );

      if (row.error) {
        console.log(
          ' error:',
          row.error
        );
        continue;
      }

      console.log(
        ' semantic:',
        JSON.stringify(
          row.semantic?.result
        )
      );

      console.log(
        ' selected:',
        JSON.stringify(
          row.evaluation
            ?.selected || []
        )
      );

      console.log(
        ' decisions:',
        JSON.stringify(
          (
            row.subjectResults ||
            []
          ).map(
            (item) => ({
              subject:
                item.subject
                  ?.surface,
              decision:
                item.resolution
                  ?.decision,
              selected:
                item.resolution
                  ?.selectedCandidate,
              top3:
                (
                  item.grounding
                    ?.candidates ||
                  []
                )
                  .slice(0, 3)
                  .map(
                    (candidate) =>
                      candidate
                        .serviceName
                  ),
            })
          )
        )
      );
    }
  }


  const logsDir =
    path.join(
      process.cwd(),
      'runtime-logs'
    );

  fs.mkdirSync(
    logsDir,
    {
      recursive: true,
    }
  );

  const stamp =
    new Date()
      .toISOString()
      .replace(
        /[:.]/g,
        '-'
      );

  const outputPath =
    path.join(
      logsDir,
      `shaden-semantic-benchmark-${stamp}.json`
    );

  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      report,
      null,
      2
    ),
    'utf8'
  );

  console.log('');
  console.log(
    `REPORT: ${outputPath}`
  );
}


main()
  .catch((error) => {
    console.error('');
    console.error(
      'BENCHMARK_FATAL_ERROR'
    );

    console.error(
      error?.stack ||
      error?.message ||
      String(error)
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    if (
      db &&
      typeof db.end === 'function'
    ) {
      await db.end();
    }
  });