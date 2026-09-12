'use strict';

require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');

const OpenRouterEmbeddingProvider =
  require('../../../src/services/shaden/semanticCatalog/OpenRouterEmbeddingProvider');

const CLINIC_ID =
  '00000000-0000-0000-0000-000000000001';

const RESULT_FILE =
  './tests/shaden/semanticCatalog/CandidateGrounder-semantic-run.json';

const EXPECTED = new Map([
  ['بوتكس', 'بوتوكس'],
  ['فيلر', 'فيلر'],
  ['تصبغات', 'ليزر التصبغات'],
  ['اسمرار حول الفم', 'ليزر التصبغات'],
  ['آثار حبوب قديمة', 'ليزر الفراكشنال'],
  ['خطوط بالجبهة', 'بوتوكس'],
  ['شيء للنضارة', 'حقن نضارة'],
  ['إزالة الشعر', 'إزالة الشعر بالليزر'],
  ['لون بشرتي مو موحد', 'ليزر التصبغات'],
  ['ندبات خفيفة بعد الحبوب', 'ليزر الفراكشنال'],
]);

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },
});

function semanticKeyword(value) {
  const index =
    value.indexOf(':');

  return (
    index >= 0
      ? value.slice(index + 1)
      : value
  )
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
          .map(semanticKeyword)
      : [];

  return [
    row.title,
    ...keywords,
    row.content,
  ]
    .filter(Boolean)
    .join('\n');
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }

  const denominator =
    Math.sqrt(aa) *
    Math.sqrt(bb);

  return denominator
    ? dot / denominator
    : 0;
}

function rank({
  rows,
  rowVectors,
  queryVector,
}) {
  const bestByService =
    new Map();

  rows.forEach((row, index) => {
    const score =
      cosine(
        queryVector,
        rowVectors[index]
      );

    const serviceId =
      String(row.service_id);

    const current =
      bestByService.get(serviceId);

    if (
      !current ||
      score > current.score
    ) {
      bestByService.set(
        serviceId,
        {
          serviceName:
            row.service_name,
          title:
            row.title,
          score,
        }
      );
    }
  });

  return [...bestByService.values()]
    .sort(
      (a, b) =>
        b.score - a.score
    )
    .slice(0, 3);
}

(async () => {
  try {
    const saved =
      JSON.parse(
        fs.readFileSync(
          RESULT_FILE,
          'utf8'
        )
      );

    /*
     * Exact cases do not need semantic comparison.
     */
    const cases =
      (saved.results || [])
        .filter(
          (item) =>
            item.method !== 'EXACT'
        );

    const db =
      await pool.query(
        `
        SELECT
          kb.id,
          kb.service_id,
          s.name AS service_name,
          kb.title,
          kb.keywords,
          kb.content
        FROM geniusbot.knowledge_base kb
        JOIN geniusbot.services s
          ON s.id = kb.service_id
         AND s.clinic_id = kb.clinic_id
        WHERE kb.clinic_id = $1
          AND kb.is_active IS TRUE
          AND s.is_active IS TRUE
          AND 'knowledge_role:DISCOVERY'
              = ANY(kb.keywords)
        ORDER BY s.name, kb.title
        `,
        [CLINIC_ID]
      );

    const rows =
      db.rows;

    const documents =
      rows.map(
        discoveryDocument
      );

    const surfaceQueries =
      cases.map(
        (item) =>
          item.surface
      );

    const meaningQueries =
      cases.map(
        (item) =>
          item.semanticMeaning
      );

    const combinedQueries =
      cases.map(
        (item) =>
          `${item.surface}\n${item.semanticMeaning}`
      );

    const provider =
      new OpenRouterEmbeddingProvider({
        apiKey:
          process.env.OPENROUTER_API_KEY,

        baseUrl:
          process.env.OPENROUTER_BASE_URL,

        model:
          'openai/text-embedding-3-small',
      });

    const response =
      await provider.embed([
        ...documents,
        ...surfaceQueries,
        ...meaningQueries,
        ...combinedQueries,
      ]);

    const vectors =
      response.vectors;

    const rowCount =
      documents.length;

    const caseCount =
      cases.length;

    const rowVectors =
      vectors.slice(
        0,
        rowCount
      );

    const surfaceVectors =
      vectors.slice(
        rowCount,
        rowCount + caseCount
      );

    const meaningVectors =
      vectors.slice(
        rowCount + caseCount,
        rowCount + caseCount * 2
      );

    const combinedVectors =
      vectors.slice(
        rowCount + caseCount * 2
      );

    const scores = {
      surface: 0,
      meaning: 0,
      combined: 0,
    };

    for (
      let i = 0;
      i < cases.length;
      i += 1
    ) {
      const item =
        cases[i];

      const expected =
        EXPECTED.get(
          item.surface
        );

      const surfaceRank =
        rank({
          rows,
          rowVectors,
          queryVector:
            surfaceVectors[i],
        });

      const meaningRank =
        rank({
          rows,
          rowVectors,
          queryVector:
            meaningVectors[i],
        });

      const combinedRank =
        rank({
          rows,
          rowVectors,
          queryVector:
            combinedVectors[i],
        });

      if (
        surfaceRank[0]?.serviceName ===
        expected
      ) {
        scores.surface += 1;
      }

      if (
        meaningRank[0]?.serviceName ===
        expected
      ) {
        scores.meaning += 1;
      }

      if (
        combinedRank[0]?.serviceName ===
        expected
      ) {
        scores.combined += 1;
      }

      console.log(
        '\n================================'
      );

      console.log(
        'SURFACE:',
        item.surface
      );

      console.log(
        'MEANING:',
        item.semanticMeaning
      );

      console.log(
        'EXPECTED:',
        expected
      );

      console.log(
        '\nSURFACE_ONLY:'
      );

      surfaceRank.forEach(
        (x, index) =>
          console.log(
            `${index + 1}.`,
            x.serviceName,
            '|',
            x.score.toFixed(4),
            '|',
            x.title
          )
      );

      console.log(
        '\nMEANING_ONLY:'
      );

      meaningRank.forEach(
        (x, index) =>
          console.log(
            `${index + 1}.`,
            x.serviceName,
            '|',
            x.score.toFixed(4),
            '|',
            x.title
          )
      );

      console.log(
        '\nSURFACE_PLUS_MEANING:'
      );

      combinedRank.forEach(
        (x, index) =>
          console.log(
            `${index + 1}.`,
            x.serviceName,
            '|',
            x.score.toFixed(4),
            '|',
            x.title
          )
      );
    }

    console.log(
      '\n=== COMPARISON SUMMARY ==='
    );

    console.log(
      JSON.stringify(
        {
          semanticCases:
            cases.length,

          surfaceOnlyCorrect:
            scores.surface,

          meaningOnlyCorrect:
            scores.meaning,

          combinedCorrect:
            scores.combined,
        },
        null,
        2
      )
    );

    console.log(
      '\nQUERY_VARIANT_PROOF_COMPLETE'
    );
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
