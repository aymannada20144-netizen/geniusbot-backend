'use strict';

require('dotenv').config();

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
  // Botox
  ['عندي خطوط لما أضحك', 'بوتوكس'],
  ['تجاعيد بين الحاجبين', 'بوتوكس'],
  ['خطوط تعبير حول العين', 'بوتوكس'],
  ['خطوط واضحة لما أرفع حواجبي', 'بوتوكس'],

  // Pigmentation
  ['عندي بقع غامقة في وجهي', 'ليزر التصبغات'],
  ['لون وجهي متفاوت', 'ليزر التصبغات'],
  ['في اسمرار بالخدين', 'ليزر التصبغات'],
  ['بقع بنية بعد الشمس', 'ليزر التصبغات'],

  // Acne scars / fractional
  ['عندي حفر بسيطة من الحبوب', 'ليزر الفراكشنال'],
  ['ندبات قديمة بوجهي', 'ليزر الفراكشنال'],
  ['ملمس وجهي مو ناعم بعد الحبوب', 'ليزر الفراكشنال'],
  ['آثار حب شباب محفرة', 'ليزر الفراكشنال'],

  // Active acne
  ['عندي حبوب طالعة حاليا', 'علاج حب الشباب'],
  ['حب شباب ملتهب', 'علاج حب الشباب'],
  ['تطلع لي حبوب كثيرة بوجهي', 'علاج حب الشباب'],
  ['عندي بثور في الوجه', 'علاج حب الشباب'],

  // Radiance
  ['وجهي باهت وأبغى نضارة', 'حقن نضارة'],
  ['بشرتي مرهقة وأبغى نضارة', 'حقن نضارة'],
  ['أبغى إشراقة للبشرة', 'حقن نضارة'],
  ['وجهي فاقد النضارة', 'حقن نضارة'],

  // Hair removal
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
          AND 'knowledge_role:DISCOVERY'
              = ANY(keywords)
        `,
        [CLINIC_ID]
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

    let correct = 0;

    const failures = [];

    const margins = [];

    for (const [surface, expected] of CASES) {
      const result =
        await grounder.ground({
          surface,

          services:
            servicesResult.rows,

          discoveryRows:
            discoveryResult.rows,
        });

      const first =
        result.candidates[0] || null;

      const second =
        result.candidates[1] || null;

      const actual =
        first?.serviceName || null;

      const margin =
        first && second
          ? first.score - second.score
          : null;

      const pass =
        actual === expected;

      if (pass) {
        correct += 1;
      } else {
        failures.push({
          surface,
          expected,
          actual,
        });
      }

      if (margin !== null) {
        margins.push({
          surface,
          expected,
          actual,
          margin,
        });
      }

      console.log(
        '\n================================'
      );

      console.log(
        'SURFACE:',
        surface
      );

      console.log(
        'MEANING:',
        result.semanticMeaning
      );

      console.log(
        'EXPECTED:',
        expected
      );

      console.log(
        'ACTUAL:',
        actual
      );

      console.log(
        'RESULT:',
        pass ? 'YES' : 'NO'
      );

      console.log(
        'MARGIN:',
        margin === null
          ? '-'
          : margin.toFixed(4)
      );

      result.candidates
        .slice(0, 3)
        .forEach(
          (candidate, index) => {
            console.log(
              `${index + 1}.`,
              candidate.serviceName,
              '|',
              candidate.score.toFixed(4),
              '|',
              candidate.knowledgeTitle || '-'
            );
          }
        );
    }

    margins.sort(
      (a, b) =>
        a.margin - b.margin
    );

    console.log(
      '\n=== UNSEEN SUMMARY ==='
    );

    console.log(
      JSON.stringify(
        {
          total:
            CASES.length,

          correct,

          failed:
            CASES.length - correct,

          accuracy:
            `${(
              correct /
              CASES.length *
              100
            ).toFixed(1)}%`,

          failures,

          smallestMargins:
            margins.slice(0, 10),
        },
        null,
        2
      )
    );

    console.log(
      '\nUNSEEN_GROUNDING_PROOF_COMPLETE'
    );
  } finally {
    await pool.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
