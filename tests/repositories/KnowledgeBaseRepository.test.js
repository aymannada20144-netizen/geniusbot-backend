'use strict';

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const KnowledgeBaseRepository = require(
  '../../src/repositories/KnowledgeBaseRepository'
);

const IDS = Object.freeze({
  clinic: '00000000-0000-4000-8000-000000000001',
  service: '00000000-0000-4000-8000-000000000002',
  otherService: '00000000-0000-4000-8000-000000000003',
});

describe('KnowledgeBaseRepository', () => {
  test('enforces parameterized clinic, active, category and service eligibility', async () => {
    let captured;
    const repository = new KnowledgeBaseRepository({
      async query(sql, parameters) {
        captured = { sql, parameters };
        return { rows: [] };
      },
    });

    await repository.findEligibleCandidates({
      clinicId: IDS.clinic,
      serviceId: IDS.service,
      category: 'medical_faq',
    });

    assert.match(captured.sql, /WHERE clinic_id = \$1/u);
    assert.match(captured.sql, /is_active IS TRUE/u);
    assert.match(captured.sql, /category = \$2/u);
    assert.match(
      captured.sql,
      /\(service_id = \$3 OR service_id IS NULL\)/u
    );
    assert.deepEqual(captured.parameters, [
      IDS.clinic,
      'medical_faq',
      IDS.service,
    ]);
  });

  test('requested service admits only that service and clinic-wide rows', async () => {
    const rows = [
      row('requested', IDS.clinic, IDS.service),
      row('clinic-wide', IDS.clinic, null),
      row('other-service', IDS.clinic, IDS.otherService),
      row('other-clinic', '00000000-0000-4000-8000-000000000099', null),
      row('inactive', IDS.clinic, null, { is_active: false }),
      row('wrong-category', IDS.clinic, null, { category: 'clinic_policy' }),
    ];
    const repository = new KnowledgeBaseRepository(filteringDatabase(rows));

    const result = await repository.findEligibleCandidates({
      clinicId: IDS.clinic,
      serviceId: IDS.service,
      category: 'medical_faq',
    });

    assert.deepEqual(result.map(({ id }) => id), ['requested', 'clinic-wide']);
  });

  test('absent service admits clinic-wide rows only', async () => {
    let captured;
    const repository = new KnowledgeBaseRepository({
      async query(sql, parameters) {
        captured = { sql, parameters };
        return { rows: [row('clinic-wide', IDS.clinic, null)] };
      },
    });

    await repository.findEligibleCandidates({
      clinicId: IDS.clinic,
      category: 'service_faq',
    });

    assert.match(captured.sql, /AND service_id IS NULL/u);
    assert.doesNotMatch(captured.sql, /service_id = \$3/u);
    assert.deepEqual(captured.parameters, [
      IDS.clinic,
      'service_faq',
    ]);
  });

  test('uses SELECT only without pre-ranking or limiting eligible candidates', async () => {
    let captured;
    const repository = new KnowledgeBaseRepository({
      async query(sql, parameters) {
        captured = { sql, parameters };
        return { rows: [] };
      },
    });

    await repository.findEligibleCandidates({
      clinicId: IDS.clinic,
      category: 'clinic_policy',
    });

    assert.match(captured.sql, /^\s*SELECT\b/u);
    assert.doesNotMatch(captured.sql, /\bORDER BY\b/iu);
    assert.doesNotMatch(captured.sql, /\bLIMIT\b/iu);
    assert.doesNotMatch(captured.sql, /\b(?:INSERT|UPDATE|DELETE)\b/iu);
    assert.deepEqual(captured.parameters, [IDS.clinic, 'clinic_policy']);
  });

  test('returns every eligible row when more than 50 candidates exist', async () => {
    const rows = Array.from({ length: 60 }, (_, index) =>
      row(`row-${index}`, IDS.clinic, null, { priority: 100 - index })
    );
    const repository = new KnowledgeBaseRepository(filteringDatabase(rows));

    const result = await repository.findEligibleCandidates({
      clinicId: IDS.clinic,
      category: 'medical_faq',
    });

    assert.equal(result.length, 60);
    assert.equal(result.some(({ id }) => id === 'row-59'), true);
  });
});

function row(id, clinicId, serviceId, overrides = {}) {
  return {
    id,
    clinic_id: clinicId,
    service_id: serviceId,
    category: 'medical_faq',
    is_active: true,
    priority: 0,
    ...overrides,
  };
}

function filteringDatabase(rows) {
  return {
    async query(sql, parameters) {
      const [clinicId, category, serviceId] = parameters;
      const hasService = /service_id = \$3/u.test(sql);
      return {
        rows: rows.filter((item) =>
          item.clinic_id === clinicId &&
          item.is_active === true &&
          item.category === category &&
          (hasService
            ? item.service_id === serviceId || item.service_id === null
            : item.service_id === null)
        ),
      };
    },
  };
}
