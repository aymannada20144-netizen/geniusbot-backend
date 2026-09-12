'use strict';

require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');

const CLINIC_ID =
  '00000000-0000-0000-0000-000000000001';

const RESULT_FILE =
  './tests/shaden/semanticCatalog/CandidateGrounder-semantic-run.json';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },
});

function tokens(value) {
  return new Set(
    String(value || '')
      .toLocaleLowerCase('ar')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(
        (token) =>
          token.length > 1
      )
  );
}

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

function documentText(row) {
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
    .join(' ');
}

function lexicalEvidence(
  queryText,
  document
) {
  const queryTokens =
    tokens(queryText);

  const documentTokens =
    tokens(document);

  const shared =
    [...queryTokens]
      .filter(
        (token) =>
          documentTokens.has(token)
      );

  return {
    sharedTokens: shared,

    sharedCount:
      shared.length,

    queryCoverage:
      queryTokens.size
        ? shared.length /
          queryTokens.size
        : 0,
  };
}

(async () => {
  try {
    const previous =
      JSON.parse(
        fs.readFileSync(
          RESULT_FILE,
          'utf8'
        )
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
        `,
        [CLINIC_ID]
      );

    const byService =
      new Map();

    for (const row of db.rows) {
      const id =
        String(row.service_id);

      if (!byService.has(id)) {
        byService.set(id, []);
      }

      byService.get(id).push(row);
    }

    for (
      const result of
        previous.results || []
    ) {
      const queryText =
        [
          result.surface,
          result.semanticMeaning,
        ]
          .filter(Boolean)
          .join(' ');

      console.log(
        '\n================================'
      );

      console.log(
        'SURFACE:',
        result.surface
      );

      console.log(
        'MEANING:',
        result.semanticMeaning
      );

      console.log(
        '\nEVIDENCE:'
      );

      for (
        const candidate of
          result.candidates || []
      ) {
        const rows =
          byService.get(
            String(candidate.serviceId)
          ) || [];

        let best = {
          sharedTokens: [],
          sharedCount: 0,
          queryCoverage: 0,
          title: null,
        };

        for (const row of rows) {
          const evidence =
            lexicalEvidence(
              queryText,
              documentText(row)
            );

          if (
            evidence.queryCoverage >
              best.queryCoverage ||
            (
              evidence.queryCoverage ===
                best.queryCoverage &&
              evidence.sharedCount >
                best.sharedCount
            )
          ) {
            best = {
              ...evidence,
              title:
                row.title || null,
            };
          }
        }

        console.log(
          candidate.serviceName,
          '| semantic:',
          Number(
            candidate.score
          ).toFixed(4),
          '| lexical:',
          best.queryCoverage
            .toFixed(4),
          '| shared:',
          JSON.stringify(
            best.sharedTokens
          ),
          '| row:',
          best.title || '-'
        );
      }
    }

    console.log(
      '\nHYBRID_EVIDENCE_PROOF_COMPLETE'
    );
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
