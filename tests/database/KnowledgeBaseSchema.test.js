const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const readSchema = (name) => fs.readFileSync(
  path.join(root, 'database', 'schema', name),
  'utf8',
);

test('fresh installation defines the canonical knowledge_base columns', () => {
  const schema = readSchema('002_schema.sql');
  const table = schema.match(
    /CREATE TABLE IF NOT EXISTS geniusbot\.knowledge_base\s*\(([\s\S]*?)\n\);/,
  );

  assert.ok(table, 'knowledge_base CREATE TABLE is missing');
  const definition = table[1];
  const columns = [
    'id',
    'clinic_id',
    'service_id',
    'title',
    'content',
    'category',
    'keywords',
    'priority',
    'is_active',
    'created_at',
    'updated_at',
  ];

  for (const column of columns) {
    assert.match(definition, new RegExp(`^\\s*${column}\\s`, 'm'));
  }
  assert.match(definition, /^\s*id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\),$/m);
  assert.doesNotMatch(definition, /^\s*(question|answer)\s/m);
  assert.match(definition, /keywords text\[\] DEFAULT ARRAY\[\]::text\[\]/);
  assert.match(definition, /priority integer DEFAULT 0 NOT NULL/);
  assert.match(definition, /is_active boolean DEFAULT true NOT NULL/);
});

test('knowledge_base constraints use canonical fields and verified FK actions', () => {
  const constraints = readSchema('004_constraints.sql');

  assert.match(
    constraints,
    /FOREIGN KEY \(clinic_id\)[\s\S]*?REFERENCES geniusbot\.clinics\(id\)[\s\S]*?ON DELETE CASCADE/,
  );
  assert.match(
    constraints,
    /FOREIGN KEY \(service_id\)[\s\S]*?REFERENCES geniusbot\.services\(id\)[\s\S]*?ON DELETE SET NULL/,
  );
  assert.match(constraints, /chk_knowledge_base_title_not_blank[\s\S]*?btrim\(title\) <>/);
  assert.match(constraints, /chk_knowledge_base_content_not_blank[\s\S]*?btrim\(content\) <>/);
  assert.doesNotMatch(constraints, /btrim\((question|answer)\)/);
});

test('knowledge_base has only the retrieval-backed canonical indexes', () => {
  const indexes = readSchema('003_indexes.sql');

  assert.match(
    indexes,
    /idx_knowledge_base_clinic_active[\s\S]*?\(\s*clinic_id,\s*is_active,\s*priority DESC\s*\)/,
  );
  assert.match(
    indexes,
    /idx_knowledge_base_service_active[\s\S]*?\(\s*clinic_id,\s*service_id,\s*is_active,\s*priority DESC\s*\)[\s\S]*?WHERE service_id IS NOT NULL/,
  );
  assert.match(
    indexes,
    /idx_knowledge_base_keywords[\s\S]*?USING gin \(keywords\)/,
  );
});

test('knowledge_base uses the standard single updated_at trigger declaration', () => {
  const triggers = readSchema('006_triggers.sql');
  const declarations = triggers.match(
    /SELECT geniusbot\.create_trigger_if_table_exists\(\s*'knowledge_base',[\s\S]*?\);/g,
  ) || [];

  assert.equal(declarations.length, 1);
  assert.match(declarations[0], /'set_knowledge_base_updated_at'/);
  assert.match(declarations[0], /'BEFORE',\s*'UPDATE',\s*'set_updated_at'/);
});

test('database smoke test continues to require knowledge_base', () => {
  const smoke = fs.readFileSync(
    path.join(root, 'database', 'tests', 'smoke_tests.sql'),
    'utf8',
  );

  assert.match(smoke, /\('knowledge_base'\)/);
});
