'use strict';

const assert =
  require('assert');

const CandidateGrounder =
  require(
    '../../../src/services/shaden/semanticCatalog/CandidateGrounder'
  );

class FakeSemanticNormalizer {
  constructor() {
    this.calls = 0;
  }

  async normalize({ surface }) {
    this.calls += 1;

    assert.strictEqual(
      surface,
      'خطوط بالجبهة'
    );

    return {
      surface,
      meaning:
        'وجود خطوط في منطقة الجبهة',
      model:
        'fake-semantic-model',
      usage: {
        totalTokens: 10,
      },
    };
  }
}

class FakeEmbeddingProvider {
  constructor() {
    this.calls = 0;
  }

  async embed(inputs) {
    this.calls += 1;

    assert.strictEqual(
      inputs.length,
      3
    );

    assert.strictEqual(
      inputs[2],
      'خطوط بالجبهة\nوجود خطوط في منطقة الجبهة'
    );

    return {
      vectors: [
        [1, 0],
        [0, 1],
        [0.9, 0.1],
      ],

      model:
        'fake-embedding-model',

      usage: {
        totalTokens: 20,
      },
    };
  }
}

(async () => {
  const semanticNormalizer =
    new FakeSemanticNormalizer();

  const embeddingProvider =
    new FakeEmbeddingProvider();

  const grounder =
    new CandidateGrounder({
      semanticNormalizer,
      embeddingProvider,
    });

  const services = [
    {
      id: 'service-a',
      name: 'بوتوكس',
      aliases: ['بوتكس'],
    },
    {
      id: 'service-b',
      name: 'ليزر التصبغات',
      aliases: [],
    },
  ];

  const rows = [
    {
      id: 'kb-a',
      service_id: 'service-a',
      title: 'خطوط الحركة',
      content: 'خطوط تعبيرية',
      keywords: [
        'knowledge_role:DISCOVERY',
      ],
    },
    {
      id: 'kb-b',
      service_id: 'service-b',
      title: 'التصبغات',
      content: 'تفاوت لون البشرة',
      keywords: [
        'knowledge_role:DISCOVERY',
      ],
    },
  ];

  /*
   * EXACT:
   * no semantic call
   * no embedding call
   */
  const exact =
    await grounder.ground({
      surface: 'بوتكس',
      services,
      discoveryRows: rows,
    });

  assert.strictEqual(
    exact.method,
    'EXACT'
  );

  assert.strictEqual(
    exact.semanticMeaning,
    null
  );

  assert.strictEqual(
    exact.candidates[0].serviceId,
    'service-a'
  );

  assert.strictEqual(
    semanticNormalizer.calls,
    0
  );

  assert.strictEqual(
    embeddingProvider.calls,
    0
  );

  /*
   * SEMANTIC:
   * exactly one normalization call
   * exactly one embedding call
   */
  const semantic =
    await grounder.ground({
      surface:
        'خطوط بالجبهة',
      services,
      discoveryRows: rows,
    });

  assert.strictEqual(
    semantic.method,
    'SEMANTIC'
  );

  assert.strictEqual(
    semantic.semanticMeaning,
    'وجود خطوط في منطقة الجبهة'
  );

  assert.strictEqual(
    semantic.embeddingQuery,
    'خطوط بالجبهة\nوجود خطوط في منطقة الجبهة'
  );

  assert.strictEqual(
    semantic.candidates[0].serviceId,
    'service-a'
  );

  assert.strictEqual(
    semanticNormalizer.calls,
    1
  );

  assert.strictEqual(
    embeddingProvider.calls,
    1
  );

  console.log(
    'CANDIDATE_GROUNDER_SEMANTIC_NORMALIZATION_OK'
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
