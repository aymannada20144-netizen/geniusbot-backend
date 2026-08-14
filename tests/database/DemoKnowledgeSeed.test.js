'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const root = path.resolve(__dirname, '../..');
const seed = fs.readFileSync(
  path.join(root, 'database', 'seed', '005_demo_knowledge.sql'),
  'utf8'
);
const insertBlock = seed.match(
  /INSERT INTO geniusbot\.knowledge_base[\s\S]*?VALUES\s*([\s\S]*?)\nON CONFLICT \(id\) DO UPDATE/u
);
const rows = insertBlock
  ? insertBlock[1].split(/,\r?\n\s*(?=\('00000000-)/u).map((row) => row.trim())
  : [];

const IDS = Object.freeze({
  clinic: '00000000-0000-0000-0000-000000000001',
  laser: 'f2cb00db-489e-4590-b375-bdc6ab0050df',
  filler: '2a293364-12a6-4815-9991-94718251e7c9',
  botox: '67a31af8-fc7a-4e76-b1ca-0d76bbda8559',
});

describe('demo knowledge seed contract', () => {
  test('contains exactly 22 stable controlled UUID rows for the demo clinic', () => {
    assert.ok(insertBlock, 'knowledge_base insert block is missing');
    assert.equal(rows.length, 22);

    const ids = rows.map((row) => row.match(/^\('([^']+)'/u)?.[1]);
    assert.equal(new Set(ids).size, 22);
    assert.deepEqual(ids, Array.from({ length: 22 }, (_, index) =>
      `00000000-0000-0000-0000-000000003${String(index + 1).padStart(3, '0')}`
    ));
    for (const row of rows) {
      assert.match(row, new RegExp(`^\\('[^']+', '${IDS.clinic}',`, 'u'));
      assert.match(row, /, TRUE\)\s*;?$/u);
    }
  });

  test('contains the approved category totals', () => {
    assert.equal(countRowsWith("'clinic_policy'"), 13);
    assert.equal(countRowsWith("'service_faq'"), 3);
    assert.equal(countRowsWith("'medical_faq'"), 6);
  });

  test('contains the approved clinic-wide and service-specific totals', () => {
    assert.equal(countRowsWith(`'${IDS.clinic}', NULL,`), 14);
    assert.equal(rows.length - countRowsWith(`'${IDS.clinic}', NULL,`), 8);
    assert.equal(countRowsWith(`'${IDS.clinic}', '${IDS.laser}',`), 4);
    assert.equal(countRowsWith(`'${IDS.clinic}', '${IDS.filler}',`), 3);
    assert.equal(countRowsWith(`'${IDS.clinic}', '${IDS.botox}',`), 1);
  });

  test('uses an ownership-guarded idempotent ID-only upsert', () => {
    assert.match(seed, /ON CONFLICT \(id\) DO UPDATE/u);
    assert.match(
      seed,
      /WHERE knowledge_base\.clinic_id = EXCLUDED\.clinic_id/u
    );
    assert.match(seed, /Controlled demo knowledge UUIDs belong to another clinic/u);
    assert.doesNotMatch(seed, /ON CONFLICT\s*\((?:title|content)/iu);
    assert.doesNotMatch(seed, /\bDELETE\s+FROM\b/iu);
    assert.doesNotMatch(seed, /^\s*UPDATE\s+geniusbot\.knowledge_base\b/imu);
  });

  test('is registered after the existing four deterministic seed files', () => {
    const installer = fs.readFileSync(
      path.join(root, 'database', 'scripts', 'install_database.sql'),
      'utf8'
    );
    assert.match(installer, /\[Seed 5\/5\] Loading demo knowledge/u);
    assert.match(installer, /\\ir \.\.\/seed\/005_demo_knowledge\.sql/u);
    assert.ok(
      installer.indexOf('004_booking_scenarios.sql') <
      installer.indexOf('005_demo_knowledge.sql')
    );
  });
});

function countRowsWith(fragment) {
  return rows.filter((row) => row.includes(fragment)).length;
}
