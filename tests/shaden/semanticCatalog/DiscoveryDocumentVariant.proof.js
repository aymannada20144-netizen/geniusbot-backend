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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function semanticKeyword(value) {
  const index = value.indexOf(':');

  return (
    index >= 0
      ? value.slice(index + 1)
      : value
  )
    .replace(/_/g, ' ')
    .trim();
}

function keywordText(row) {
  return Array.isArray(row.keywords)
    ? row.keywords
        .filter(
          (item) =>
            typeof item === 'string' &&
            item !== 'knowledge_role:DISCOVERY'
        )
        .map(semanticKeyword)
        .filter(Boolean)
    : [];
}

const VARIANTS = {
  FULL(row) {
    return [
      row.title,
      ...keywordText(row),
      row.content,
    ]
      .filter(Boolean)
      .join('\n');
  },

  TITLE(row) {
    return String(row.title || '').trim();
  },

  TITLE_KEYWORDS(row) {
    return [
      row.title,
      ...keywordText(row),
    ]
      .filter(Boolean)
      .join('\n');
  },

  TITLE_CONTENT(row) {
    return [
      row.title,
      row.content,
    ]
      .filter(Boolean)
      .join('\n');
  },
};

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
    Math.sqrt(aa) * Math.sqrt(bb);

  return denominator
    ? dot / denominator
    : 0;
}

function rank({
  rows,
  rowVectors,
  queryVector,
}) {
  const best = new Map();

  rows.forEach((row, index) => {
    const score =
      cosine(
        queryVector,
        rowVectors[index]
      );

    const serviceId =
      String(row.service_id);

    const current =
      best.get(serviceId);

    if (
      !current ||
      score > current.score
    ) {
      best.set(serviceId, {
        serviceName:
          row.service_name,

        title:
          row.title,

        score,
      });
    }
  });

  return [...best.values()]
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

    const rows = db.rows;

    const queries =
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

    const summary = {};

    for (
      const [variantName, buildDocument]
      of Object.entries(VARIANTS)
    ) {
      const documents =
        rows.map(buildDocument);

      const response =
        await provider.embed([
          ...documents,
          ...queries,
        ]);

      const rowVectors =
        response.vectors.slice(
          0,
          rows.length
        );

      const queryVectors =
        response.vectors.slice(
          rows.length
        );

      let correct = 0;

      console.log(
        `\n\n######## ${variantName} ########`
      );

      for (
        let i = 0;
        i < cases.length;
        i += 1
      ) {
        const item = cases[i];

        const ranked =
          rank({
            rows,
            rowVectors,
            queryVector:
              queryVectors[i],
          });

        const expected =
          item.expected;

        const pass =
          ranked[0]?.serviceName ===
          expected;

        if (pass) {
          correct += 1;
        }

        console.log(
          '\nSURFACE:',
          item.surface
        );

        console.log(
          'EXPECTED:',
          expected
        );

        ranked.forEach(
          (candidate, index) => {
            console.log(
              `${index + 1}.`,
              candidate.serviceName,
              '|',
              candidate.score.toFixed(4),
              '|',
              candidate.title
            );
          }
        );

        console.log(
          'TOP1:',
          pass ? 'YES' : 'NO'
        );
      }

      summary[variantName] = {
        total:
          cases.length,

        correct,

        failed:
          cases.length - correct,
      };
    }

    console.log(
      '\n=== DOCUMENT VARIANT SUMMARY ==='
    );

    console.log(
      JSON.stringify(
        summary,
        null,
        2
      )
    );

    console.log(
      '\nDOCUMENT_VARIANT_PROOF_COMPLETE'
    );
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
