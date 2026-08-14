'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const KnowledgeService = require('../../src/services/KnowledgeService');

const IDS = Object.freeze({
  clinic: '00000000-0000-4000-8000-000000000001',
  service: '00000000-0000-4000-8000-000000000002',
});

describe('KnowledgeService validation and routing', () => {
  test('rejects malformed requests before repository access', async () => {
    let calls = 0;
    const service = makeService([], () => { calls += 1; });

    for (const request of [null, [], 'request']) {
      await assert.rejects(service.retrieve(request), /must be an object/u);
    }
    assert.equal(calls, 0);
  });

  test('rejects missing/invalid clinic and invalid service UUIDs', async () => {
    const service = makeService([]);
    await assert.rejects(
      service.retrieve(request({ clinicId: null })),
      /clinicId is required/u
    );
    await assert.rejects(
      service.retrieve(request({ clinicId: 'clinic' })),
      /clinicId must be a valid UUID/u
    );
    await assert.rejects(
      service.retrieve(request({ serviceId: 'service' })),
      /serviceId must be a valid UUID/u
    );
  });

  test('rejects invalid source, type, and empty query material', async () => {
    const service = makeService([]);
    await assert.rejects(
      service.retrieve(request({ source: 'clinic_database' })),
      /source must be knowledge_base/u
    );
    await assert.rejects(
      service.retrieve(request({ type: 'prices' })),
      /type is unsupported/u
    );
    await assert.rejects(
      service.retrieve(request({ query: ' ', keywords: [] })),
      /requires a query or at least one keyword/u
    );
  });

  test('rejects malformed query and keyword fields before repository access', async () => {
    let calls = 0;
    const service = makeService([], () => { calls += 1; });
    await assert.rejects(
      service.retrieve(request({ query: 42 })),
      /query must be a string/u
    );
    await assert.rejects(
      service.retrieve(request({ keywords: 'ليزر' })),
      /keywords must be an Array/u
    );
    await assert.rejects(
      service.retrieve(request({ keywords: ['ليزر', null] })),
      /keywords must contain only strings/u
    );
    assert.equal(calls, 0);
  });

  test('maps each MVP request type to the exact repository category', async () => {
    const categories = [];
    const service = new KnowledgeService({
      async findEligibleCandidates(input) {
        categories.push(input.category);
        return [];
      },
    });

    for (const type of ['medical_faq', 'service_faq', 'clinic_policy']) {
      await service.retrieve(request({ type }));
    }
    assert.deepEqual(categories, [
      'medical_faq',
      'service_faq',
      'clinic_policy',
    ]);
  });
});

describe('KnowledgeService normalization and qualification', () => {
  test('normalizes Arabic alef, diacritics, tatweel and alef maqsura', async () => {
    const result = await retrieve([
      candidate({ title: 'مَتَـى أَلَم اللِّيزر' }),
    ], {
      query: 'متي الم الليزر',
    });
    assert.equal(result.status, 'found');
  });

  test('uses Unicode NFKC, Latin lowercase and punctuation spacing', async () => {
    const result = await retrieve([
      candidate({ title: 'FAQ ليزر' }),
    ], {
      query: 'ｆａｑ، ليزر!',
    });
    assert.equal(result.status, 'found');
  });

  test('does not normalize taa marbuta to haa', async () => {
    const result = await retrieve([
      candidate({ title: 'جلسة ليزر' }),
    ], {
      query: 'جلسه ليزر',
    });
    assert.equal(result.status, 'not_found');
  });

  test('qualifies an exact title and returns one result', async () => {
    const result = await retrieve([
      candidate({ id: 'b', title: 'هل الليزر مؤلم؟' }),
      candidate({ id: 'a', title: 'هل الليزر مؤلم؟' }),
    ], {
      query: 'هل الليزر مؤلم',
    });
    assert.equal(result.status, 'found');
    assert.equal(result.references.length, 1);
    assert.equal(result.references[0].id, 'a');
  });

  test('qualifies multiple exact request/stored medical keyword matches', async () => {
    const result = await retrieve([
      candidate({ title: 'معلومات', keywords: ['بوتكس', 'حقن'] }),
    ], {
      query: 'سؤال',
      keywords: ['بوتكس', 'حقن'],
    });
    assert.equal(result.status, 'found');
  });

  test('qualifies a non-medical stored keyword as a complete query phrase', async () => {
    const result = await retrieve([
      candidate({ category: 'service_faq', keywords: ['إزالة الشعر'] }),
    ], {
      type: 'service_faq',
      query: 'هل إزالة الشعر مؤلمة؟',
    });
    assert.equal(result.status, 'found');
  });

  test('does not match a keyword inside another word', async () => {
    const result = await retrieve([
      candidate({ title: 'عنوان', keywords: ['ألم'] }),
    ], {
      query: 'تعلمت اليوم',
    });
    assert.equal(result.status, 'not_found');
  });

  test('requires two distinct title-token overlaps', async () => {
    const found = await retrieve([
      candidate({ title: 'مدة جلسة الليزر' }),
    ], {
      query: 'كم مدة الليزر',
    });
    const notFound = await retrieve([
      candidate({ title: 'معلومات الليزر' }),
    ], {
      query: 'هل الليزر',
    });
    assert.equal(found.status, 'found');
    assert.equal(notFound.status, 'not_found');
  });

  test('content overlap alone never qualifies', async () => {
    const result = await retrieve([
      candidate({ title: 'عنوان مختلف', content: 'مدة الليزر عشرون دقيقة' }),
    ], {
      query: 'مدة الليزر',
    });
    assert.equal(result.status, 'not_found');
  });

  test('medical exact-title matching remains authoritative', async () => {
    const content = 'تعليمات التحضير المعتمدة كما هي.';
    const result = await retrieve([
      candidate({
        title: 'تحضير الليزر',
        keywords: ['تحضير', 'حلاقة'],
        content,
      }),
    ], { query: 'تحضير الليزر' });

    assert.equal(result.status, 'found');
    assert.deepEqual(result.facts, [content]);
  });

  test('one multi-word generic medical keyword does not qualify', async () => {
    const result = await retrieve([
      candidate({
        title: 'تعليمات معتمدة',
        keywords: ['بعد الجلسة'],
      }),
    ], { query: 'ماذا أفعل بعد الجلسة' });

    assert.equal(result.status, 'not_found');
  });

  test('one apparently-specific multi-word medical keyword does not qualify', async () => {
    const result = await retrieve([
      candidate({
        title: 'تعليمات معتمدة',
        keywords: ['إزالة الشعر'],
      }),
    ], { query: 'هل إزالة الشعر مؤلمة' });

    assert.equal(result.status, 'not_found');
  });

  test('a single specific-looking medical word is not enough on its own', async () => {
    const result = await retrieve([
      candidate({
        title: 'عناية ما بعد الليزر',
        keywords: ['بعد', 'احمرار', 'حروق'],
      }),
    ], { query: 'حروق' });

    assert.equal(result.status, 'not_found');
  });

  test('the demo generic preparation keyword cannot qualify medical content alone', async () => {
    const result = await retrieve([
      candidate({
        id: 'laser-preparation',
        title: 'تحضير الليزر',
        keywords: ['تحضير', 'حلاقة', 'شمع', 'نتف'],
      }),
    ], { query: 'تحضير' });

    assert.equal(result.status, 'not_found');
  });

  test('a weak generic query cannot choose between competing medical rows', async () => {
    const result = await retrieve([
      candidate({
        id: 'laser-preparation',
        title: 'تحضير الليزر',
        keywords: ['تحضير', 'حلاقة'],
        priority: 100,
      }),
      candidate({
        id: 'filler-preparation',
        title: 'تحضير الفيلر',
        keywords: ['تحضير', 'اسبرين'],
        priority: 1,
      }),
    ], { query: 'تحضير' });

    assert.equal(result.status, 'not_found');
  });

  test('two medical keyword matches provide deterministic qualification', async () => {
    const result = await retrieve([
      candidate({
        id: 'comparison',
        title: 'الفرق بوتكس فيلر',
        keywords: ['فرق', 'ايهم', 'انسب'],
      }),
    ], { query: 'ايهم انسب' });

    assert.equal(result.status, 'found');
    assert.equal(result.references[0].id, 'comparison');
  });

  test('non-medical categories retain single-keyword qualification', async () => {
    for (const type of ['service_faq', 'clinic_policy']) {
      const result = await retrieve([
        candidate({
          title: type === 'service_faq' ? 'مدة جلسة الليزر' : 'سياسة الإلغاء',
          category: type,
          keywords: [type === 'service_faq' ? 'كم' : 'رسوم'],
        }),
      ], {
        type,
        query: type === 'service_faq' ? 'كم' : 'هل توجد رسوم',
      });

      assert.equal(result.status, 'found');
    }
  });
});

describe('KnowledgeService deterministic ranking and results', () => {
  test('ranks service-specific content above clinic-wide content', async () => {
    const result = await retrieve([
      candidate({ id: 'clinic', service_id: null, priority: 99 }),
      candidate({ id: 'service', service_id: IDS.service, priority: 0 }),
    ], { serviceId: IDS.service });
    assert.equal(result.references[0].id, 'service');
  });

  test('uses priority after earlier relevance dimensions', async () => {
    const result = await retrieve([
      candidate({ id: 'low', priority: 1 }),
      candidate({ id: 'high', priority: 10 }),
    ]);
    assert.equal(result.references[0].id, 'high');
  });

  test('uses id ascending as the deterministic final tie-break', async () => {
    const result = await retrieve([
      candidate({ id: 'z-row' }),
      candidate({ id: 'a-row' }),
    ]);
    assert.equal(result.references[0].id, 'a-row');
  });

  test('exact title wins below more than 50 higher-priority candidates', async () => {
    const candidates = Array.from({ length: 60 }, (_, index) =>
      candidate({
        id: `priority-${String(index).padStart(2, '0')}`,
        title: 'معلومات عامة مختلفة',
        keywords: ['سؤال'],
        priority: 1000 - index,
      })
    );
    candidates.push(candidate({
      id: 'exact-low-priority',
      title: 'هل الليزر مؤلم',
      priority: -100,
    }));

    const result = await retrieve(candidates, {
      query: 'هل الليزر مؤلم',
      keywords: ['سؤال'],
    });

    assert.equal(result.references[0].id, 'exact-low-priority');
  });

  test('returns verbatim content and immutable result/reference', async () => {
    const content = '  النص المعتمد\nكما هو.  ';
    const result = await retrieve([candidate({ content })]);
    assert.deepEqual(result.facts, [content]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.facts), true);
    assert.equal(Object.isFrozen(result.references[0]), true);
    assert.deepEqual(result.options, []);
    assert.deepEqual(result.warnings, []);
  });

  test('returns the fail-closed not_found contract', async () => {
    const result = await retrieve([], { type: 'medical_faq' });
    assert.equal(result.type, 'medical_faq');
    assert.equal(result.status, 'not_found');
    assert.deepEqual(result.facts, []);
    assert.deepEqual(result.references, []);
    assert.deepEqual(result.warnings, ['knowledge_not_found']);
  });

  test('returns unavailable without exposing repository error details', async () => {
    const service = new KnowledgeService({
      async findEligibleCandidates() {
        throw new Error('password and database details');
      },
    });
    const result = await service.retrieve(request());
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.facts, []);
    assert.deepEqual(result.warnings, ['knowledge_retrieval_failed']);
    assert.doesNotMatch(JSON.stringify(result), /password|database details/u);
  });

  test('returns unavailable for invalid repository result shapes', async () => {
    for (const repositoryResult of [null, undefined, { rows: [] }]) {
      const service = new KnowledgeService({
        async findEligibleCandidates() {
          return repositoryResult;
        },
      });

      const result = await service.retrieve(request());
      assert.equal(result.status, 'unavailable');
      assert.deepEqual(result.facts, []);
      assert.deepEqual(result.options, []);
      assert.deepEqual(result.references, []);
      assert.deepEqual(result.warnings, ['knowledge_retrieval_failed']);
    }
  });

  test('calls the repository once and never invokes a mutation path', async () => {
    let reads = 0;
    let mutations = 0;
    const service = new KnowledgeService({
      async findEligibleCandidates() {
        reads += 1;
        return [candidate()];
      },
      async create() { mutations += 1; },
      async updateById() { mutations += 1; },
      async deleteById() { mutations += 1; },
    });
    const result = await service.retrieve(request());
    assert.equal(result.status, 'found');
    assert.equal(reads, 1);
    assert.equal(mutations, 0);
  });
});

function request(overrides = {}) {
  return {
    type: 'medical_faq',
    source: 'knowledge_base',
    clinicId: IDS.clinic,
    serviceId: null,
    query: 'هل الليزر مؤلم',
    keywords: [],
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    id: 'row-1',
    service_id: null,
    title: 'هل الليزر مؤلم',
    content: 'المحتوى المعتمد',
    category: 'medical_faq',
    keywords: [],
    priority: 0,
    ...overrides,
  };
}

function makeService(rows, onRead = () => {}) {
  return new KnowledgeService({
    async findEligibleCandidates() {
      onRead();
      return rows;
    },
  });
}

async function retrieve(rows, overrides = {}) {
  return makeService(rows).retrieve(request(overrides));
}
