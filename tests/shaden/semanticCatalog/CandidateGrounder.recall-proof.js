'use strict';

require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');

const GroundingSemanticNormalizer =
  require('../../../src/services/shaden/semanticCatalog/GroundingSemanticNormalizer');

const OpenRouterSemanticProvider =
  require('../../../src/services/shaden/semanticV1/OpenRouterSemanticProvider');

const OpenRouterEmbeddingProvider =
  require('../../../src/services/shaden/semanticCatalog/OpenRouterEmbeddingProvider');

const CLINIC_ID =
  '00000000-0000-0000-0000-000000000001';

const OUTPUT_FILE =
  './tests/shaden/semanticCatalog/CandidateGrounder-recall-run.json';

const CASES = [
  ['عندي خطوط لما أضحك', 'بوتوكس'],
  ['تجاعيد بين الحاجبين', 'بوتوكس'],
  ['خطوط تعبير حول العين', 'بوتوكس'],
  ['خطوط واضحة لما أرفع حواجبي', 'بوتوكس'],

  ['عندي بقع غامقة في وجهي', 'ليزر التصبغات'],
  ['لون وجهي متفاوت', 'ليزر التصبغات'],
  ['في اسمرار بالخدين', 'ليزر التصبغات'],
  ['بقع بنية بعد الشمس', 'ليزر التصبغات'],

  ['عندي حفر بسيطة من الحبوب', 'ليزر الفراكشنال'],
  ['ندبات قديمة بوجهي', 'ليزر الفراكشنال'],
  ['ملمس وجهي مو ناعم بعد الحبوب', 'ليزر الفراكشنال'],
  ['آثار حب شباب محفرة', 'ليزر الفراكشنال'],

  ['عندي حبوب طالعة حاليا', 'علاج حب الشباب'],
  ['حب شباب ملتهب', 'علاج حب الشباب'],
  ['تطلع لي حبوب كثيرة بوجهي', 'علاج حب الشباب'],
  ['عندي بثور في الوجه', 'علاج حب الشباب'],

  ['وجهي باهت وأبغى نضارة', 'حقن نضارة'],
  ['بشرتي مرهقة وأبغى نضارة', 'حقن نضارة'],
  ['أبغى إشراقة للبشرة', 'حقن نضارة'],
  ['وجهي فاقد النضارة', 'حقن نضارة'],

  ['أبغى أتخلص من شعر الجسم', 'إزالة الشعر بالليزر'],
  ['الشعر الزائد مضايقني', 'إزالة الشعر بالليزر'],
  ['أبغى إزالة شعر الإبط', 'إزالة الشعر بالليزر'],
  ['أبغى أقلل شعر الساقين', 'إزالة الشعر بالليزر'],
];

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },
});

function delay(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}

async function withRetry(
  operation,
  label,
  attempts = 4
) {
  let lastError;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === attempts) {
        break;
      }

      console.log(
        `RETRY ${label}: ${attempt}/${attempts}`
      );

      await delay(
        700 * attempt
      );
    }
  }

  throw lastError;
}

function semanticKeyword(value) {
  const separator =
    value.indexOf(':');

  const semantic =
    separator >= 0
      ? value.slice(
          separator + 1
        )
      : value;

  return semantic
    .replace(/_/g, ' ')
    .trim();
}

function discoveryDocument(row) {
  const keywords =
    Array.isArray(row.keywords)
      ? row.keywords
          .filter(
            (item) =>
              typeof item === 'string' &&
              item !==
                'knowledge_role:DISCOVERY'
          )
          .map(
            semanticKeyword
          )
          .filter(Boolean)
      : [];

  return [
    row.title || null,
    ...keywords,
  ]
    .filter(Boolean)
    .join('\n');
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;

  for (
    let i = 0;
    i < a.length;
    i += 1
  ) {
    dot +=
      a[i] * b[i];

    aa +=
      a[i] * a[i];

    bb +=
      b[i] * b[i];
  }

  const denominator =
    Math.sqrt(aa) *
    Math.sqrt(bb);

  return denominator
    ? dot / denominator
    : 0;
}

function rankServices({
  rows,
  rowVectors,
  queryVector,
}) {
  const bestByService =
    new Map();

  rows.forEach(
    (row, index) => {
      const score =
        cosine(
          queryVector,
          rowVectors[index]
        );

      const serviceId =
        String(
          row.service_id
        );

      const current =
        bestByService.get(
          serviceId
        );

      if (
        !current ||
        score > current.score
      ) {
        bestByService.set(
          serviceId,
          {
            serviceId,
            serviceName:
              row.service_name,
            knowledgeTitle:
              row.title,
            score,
          }
        );
      }
    }
  );

  return [
    ...bestByService.values(),
  ]
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(0, 5);
}

(async () => {
  try {
    const db =
      await pool.query(
        `
        SELECT
          kb.id,
          kb.service_id,
          s.name AS service_name,
          kb.title,
          kb.keywords
        FROM geniusbot.knowledge_base kb
        JOIN geniusbot.services s
          ON s.id = kb.service_id
         AND s.clinic_id = kb.clinic_id
        WHERE kb.clinic_id = $1
          AND kb.is_active IS TRUE
          AND s.is_active IS TRUE
          AND 'knowledge_role:DISCOVERY'
              = ANY(kb.keywords)
        ORDER BY
          s.name,
          kb.title
        `,
        [CLINIC_ID]
      );

    const rows =
      db.rows;

    const semanticProvider =
      new OpenRouterSemanticProvider({
        apiKey:
          process.env.OPENROUTER_API_KEY,

        baseUrl:
          process.env.OPENROUTER_BASE_URL,

        model:
          process.env.SHADEN_LLM_MODEL,
      });

    const normalizer =
      new GroundingSemanticNormalizer({
        provider:
          semanticProvider,
      });

    const embeddingProvider =
      new OpenRouterEmbeddingProvider({
        apiKey:
          process.env.OPENROUTER_API_KEY,

        baseUrl:
          process.env.OPENROUTER_BASE_URL,

        model:
          'openai/text-embedding-3-small',
      });

    const normalizedCases = [];

    for (
      let i = 0;
      i < CASES.length;
      i += 1
    ) {
      const [
        surface,
        expected,
      ] = CASES[i];

      const normalized =
        await withRetry(
          () =>
            normalizer.normalize({
              surface,
            }),
          `NORMALIZE ${i + 1}`
        );

      normalizedCases.push({
        surface,
        expected,
        meaning:
          normalized.meaning,
      });

      console.log(
        `NORMALIZED ${i + 1}/${CASES.length}`
      );
    }

    const documents =
      rows.map(
        discoveryDocument
      );

    const queries =
      normalizedCases.map(
        (item) =>
          `${item.surface}\n${item.meaning}`
      );

    const embeddingResponse =
      await withRetry(
        () =>
          embeddingProvider.embed([
            ...documents,
            ...queries,
          ]),
        'EMBEDDING'
      );

    const rowVectors =
      embeddingResponse.vectors.slice(
        0,
        rows.length
      );

    const queryVectors =
      embeddingResponse.vectors.slice(
        rows.length
      );

    let top1Correct = 0;
    let recallAt3 = 0;
    let recallAt5 = 0;

    const results = [];

    for (
      let i = 0;
      i < normalizedCases.length;
      i += 1
    ) {
      const test =
        normalizedCases[i];

      const candidates =
        rankServices({
          rows,
          rowVectors,
          queryVector:
            queryVectors[i],
        });

      const expectedIndex =
        candidates.findIndex(
          (candidate) =>
            candidate.serviceName ===
            test.expected
        );

      const expectedRank =
        expectedIndex >= 0
          ? expectedIndex + 1
          : null;

      if (expectedRank === 1) {
        top1Correct += 1;
      }

      if (
        expectedRank !== null &&
        expectedRank <= 3
      ) {
        recallAt3 += 1;
      }

      if (
        expectedRank !== null &&
        expectedRank <= 5
      ) {
        recallAt5 += 1;
      }

      const margin =
        candidates.length >= 2
          ? candidates[0].score -
            candidates[1].score
          : null;

      results.push({
        ...test,
        actualTop1:
          candidates[0]
            ?.serviceName || null,
        expectedRank,
        margin,
        candidates,
      });
    }

    const failures =
      results.filter(
        (item) =>
          item.expectedRank !== 1
      );

    const missingFromTop5 =
      results.filter(
        (item) =>
          item.expectedRank === null
      );

    const summary = {
      total:
        results.length,

      top1Correct,

      top1Accuracy:
        `${(
          top1Correct /
          results.length *
          100
        ).toFixed(1)}%`,

      recallAt3,

      recallAt3Percent:
        `${(
          recallAt3 /
          results.length *
          100
        ).toFixed(1)}%`,

      recallAt5,

      recallAt5Percent:
        `${(
          recallAt5 /
          results.length *
          100
        ).toFixed(1)}%`,

      missingFromTop5:
        missingFromTop5.map(
          (item) => ({
            surface:
              item.surface,
            expected:
              item.expected,
            actualTop1:
              item.actualTop1,
          })
        ),

      top1Failures:
        failures.map(
          (item) => ({
            surface:
              item.surface,
            expected:
              item.expected,
            actualTop1:
              item.actualTop1,
            expectedRank:
              item.expectedRank,
            margin:
              item.margin,
          })
        ),
    };

    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(
        {
          summary,
          results,
        },
        null,
        2
      ),
      'utf8'
    );

    console.log(
      '\n=== CANDIDATE RECALL SUMMARY ==='
    );

    console.log(
      JSON.stringify(
        summary,
        null,
        2
      )
    );

    console.log(
      '\nSaved:',
      OUTPUT_FILE
    );

    console.log(
      '\nCANDIDATE_RECALL_PROOF_COMPLETE'
    );
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
