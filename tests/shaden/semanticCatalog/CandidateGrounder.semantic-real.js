'use strict';

require('dotenv').config();

const fs = require('fs');
const { Pool } = require('pg');

const CandidateGrounder =
  require('../../../src/services/shaden/semanticCatalog/CandidateGrounder');

const GroundingSemanticNormalizer =
  require('../../../src/services/shaden/semanticCatalog/GroundingSemanticNormalizer');

const OpenRouterEmbeddingProvider =
  require('../../../src/services/shaden/semanticCatalog/OpenRouterEmbeddingProvider');

const OpenRouterSemanticProvider =
  require('../../../src/services/shaden/semanticV1/OpenRouterSemanticProvider');

const CLINIC_ID =
  '00000000-0000-0000-0000-000000000001';

const CASES = [
  {
    surface: 'بوتكس',
    expected: 'بوتوكس',
  },
  {
    surface: 'فيلر',
    expected: 'فيلر',
  },
  {
    surface: 'تصبغات',
    expected: 'ليزر التصبغات',
  },
  {
    surface: 'اسمرار حول الفم',
    expected: 'ليزر التصبغات',
  },
  {
    surface: 'آثار حبوب قديمة',
    expected: 'ليزر الفراكشنال',
  },
  {
    surface: 'خطوط بالجبهة',
    expected: 'بوتوكس',
  },
  {
    surface: 'شيء للنضارة',
    expected: 'حقن نضارة',
  },
  {
    surface: 'إزالة الشعر',
    expected: 'إزالة الشعر بالليزر',
  },
  {
    surface: 'لون بشرتي مو موحد',
    expected: 'ليزر التصبغات',
  },
  {
    surface: 'ندبات خفيفة بعد الحبوب',
    expected: 'ليزر الفراكشنال',
  },
];

const OLD_RUN_FILE =
  './tests/shaden/semanticCatalog/CandidateGrounder-real-run.json';

const OUTPUT_FILE =
  './tests/shaden/semanticCatalog/CandidateGrounder-semantic-run.json';

const pool =
  new Pool({
    connectionString:
      process.env.DATABASE_URL,

    ssl: {
      rejectUnauthorized: false,
    },
  });

function oldTopMap() {
  if (!fs.existsSync(OLD_RUN_FILE)) {
    return new Map();
  }

  try {
    const parsed =
      JSON.parse(
        fs.readFileSync(
          OLD_RUN_FILE,
          'utf8'
        )
      );

    return new Map(
      (parsed.results || []).map(
        (item) => [
          item.surface,
          item.candidates?.[0]
            ?.serviceName || null,
        ]
      )
    );
  } catch {
    return new Map();
  }
}

(async () => {
  try {
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

    console.log(
      'SEMANTIC_MODEL:',
      process.env.SHADEN_LLM_MODEL
    );

    const semanticProvider =
      new OpenRouterSemanticProvider({
        apiKey:
          process.env.OPENROUTER_API_KEY,

        baseUrl:
          process.env.OPENROUTER_BASE_URL,

        model:
          process.env.SHADEN_LLM_MODEL,
      });

    const semanticNormalizer =
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

    const grounder =
      new CandidateGrounder({
        semanticNormalizer,
        embeddingProvider,
        topK: 5,
      });

    const previous =
      oldTopMap();

    const results = [];

    let expectedTop1 = 0;

    for (const testCase of CASES) {
      const {
        surface,
        expected,
      } = testCase;

      console.log(
        '\n================================'
      );

      console.log(
        'SURFACE:',
        surface
      );

      console.log(
        'EXPECTED:',
        expected
      );

      const before =
        previous.get(surface) ||
        null;

      console.log(
        'OLD_TOP1:',
        before || '-'
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

      console.log(
        'MEANING:',
        result.semanticMeaning || '-'
      );

      const top1 =
        result.candidates?.[0]
          ?.serviceName || null;

      const correct =
        top1 === expected;

      if (correct) {
        expectedTop1 += 1;
      }

      console.log(
        'NEW_TOP1:',
        top1 || '-'
      );

      console.log(
        'EXPECTED_TOP1:',
        correct ? 'YES' : 'NO'
      );

      console.log(
        '\nCANDIDATES:'
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
            candidate.knowledgeTitle ||
              '-'
          );
        }
      );

      results.push({
        surface,
        expected,
        oldTop1: before,
        method:
          result.method,
        semanticMeaning:
          result.semanticMeaning,
        newTop1: top1,
        expectedTop1:
          correct,
        candidates:
          result.candidates,
        normalization:
          result.normalization,
        embeddingUsage:
          result.usage,
      });
    }

    const summary = {
      total:
        CASES.length,

      expectedTop1,

      failedTop1:
        CASES.length -
        expectedTop1,

      failures:
        results
          .filter(
            (item) =>
              !item.expectedTop1
          )
          .map(
            (item) => ({
              surface:
                item.surface,
              expected:
                item.expected,
              actual:
                item.newTop1,
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
      '\n=== FINAL SUMMARY ==='
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
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
