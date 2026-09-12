'use strict';

const assert =
  require('assert');

const GroundingSemanticNormalizer =
  require(
    '../../../src/services/shaden/semanticCatalog/GroundingSemanticNormalizer'
  );

class FakeProvider {
  constructor() {
    this.calls = 0;
  }

  async completeJson(messages) {
    this.calls += 1;

    assert.strictEqual(
      messages.length,
      2
    );

    return {
      result: {
        meaning:
          'وجود تصبغات جلدية في المنطقة المحيطة بالفم',
      },

      model:
        'fake-model',

      usage: {
        totalTokens: 10,
      },
    };
  }
}

(async () => {
  const provider =
    new FakeProvider();

  const normalizer =
    new GroundingSemanticNormalizer({
      provider,
    });

  const result =
    await normalizer.normalize({
      surface:
        'اسمرار حول الفم',
    });

  assert.strictEqual(
    provider.calls,
    1
  );

  assert.strictEqual(
    result.surface,
    'اسمرار حول الفم'
  );

  assert.strictEqual(
    result.meaning,
    'وجود تصبغات جلدية في المنطقة المحيطة بالفم'
  );

  console.log(
    'GROUNDING_SEMANTIC_NORMALIZER_SMOKE_OK'
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
