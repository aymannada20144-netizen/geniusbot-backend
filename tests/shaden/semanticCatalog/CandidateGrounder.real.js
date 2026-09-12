'use strict';

require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');

const CandidateGrounder =
  require('../../../src/services/shaden/semanticCatalog/CandidateGrounder');

const OpenRouterEmbeddingProvider =
  require('../../../src/services/shaden/semanticCatalog/OpenRouterEmbeddingProvider');

const CLINIC_ID =
  '00000000-0000-0000-0000-000000000001';

const QUERIES = [
  'بوتكس',
  'فيلر',
  'تصبغات',
  'اسمرار حول الفم',
  'آثار حبوب قديمة',
  'خطوط بالجبهة',
  'شيء للنضارة',
  'إزالة الشعر',
  'لون بشرتي مو موحد',
  'ندبات خفيفة بعد الحبوب',
];

for (const query of QUERIES) {
  if (!/[\u0600-\u06FF]/.test(query)) {
    throw new Error(
      `ARABIC_ENCODING_CORRUPTED: ${JSON.stringify(query)}`
    );
  }
}

const pool =
  new Pool({
    connectionString:
      process.env.DATABASE_URL,

    ssl: {
      rejectUnauthorized: false,
    },
  });

(async () => {
  try {
    console.log(
      'QUERIES:',
      JSON.stringify(QUERIES)
    );

    const servicesResult =
      await pool.query(
        `
        SELECT
          id,
          name,
          aliases,
          description
        FROM geniusbot.services
        WHERE clinic_id = $1
          AND is_active IS TRUE
        ORDER BY display_order, name
        `,
        [CLINIC_ID]
      );

    const discoveryResult =
      await pool.query(
        `
        SELECT
          id,
          service_id,
          title,
          content,
          category,
          keywords,
          priority
        FROM geniusbot.knowledge_base
        WHERE clinic_id = $1
          AND is_active IS TRUE
          AND service_id IS NOT NULL
          AND 'knowledge_role:DISCOVERY' = ANY(keywords)
        ORDER BY priority DESC, title
        `,
        [CLINIC_ID]
      );

    console.log(
      'SERVICES:',
      servicesResult.rows.length
    );

    console.log(
      'DISCOVERY_ROWS:',
      discoveryResult.rows.length
    );

    const embeddingProvider =
      new OpenRouterEmbeddingProvider({
        apiKey:
          process.env.OPENROUTER_API_KEY,

        baseUrl:
          process.env.OPENROUTER_BASE_URL,

        model:
          'openai/text-embedding-3-small',
      });

    const grounder =
      new CandidateGrounder({
        embeddingProvider,
        topK: 5,
      });

    const results = [];

    for (const surface of QUERIES) {
      console.log(
        `\n=== ${surface} ===`
      );

      const result =
        await grounder.ground({
          surface,

          services:
            servicesResult.rows,

          discoveryRows:
            discoveryResult.rows,
        });

      console.log(
        'METHOD:',
        result.method
      );

      result.candidates.forEach(
        (candidate, index) => {
          console.log(
            `${index + 1}.`,
            candidate.serviceName,
            '|',
            Number(
              candidate.score
            ).toFixed(4),
            '|',
            candidate.knowledgeTitle || '-'
          );
        }
      );

      results.push({
        surface,
        method:
          result.method,
        candidates:
          result.candidates,
        usage:
          result.usage,
      });
    }

    fs.writeFileSync(
      './tests/shaden/semanticCatalog/CandidateGrounder-real-run.json',
      JSON.stringify(
        {
          services:
            servicesResult.rows.length,

          discoveryRows:
            discoveryResult.rows.length,

          results,
        },
        null,
        2
      ),
      'utf8'
    );

    console.log(
      '\nGROUNDING_REAL_RUN_COMPLETE'
    );
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
