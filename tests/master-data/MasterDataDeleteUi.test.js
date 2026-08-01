'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const page = fs.readFileSync(
  path.join(__dirname, '../../geniusbot-dashboard/src/pages/master-data/MasterDataPage.tsx'),
  'utf8'
);

describe('Master Data delete UI', () => {
  test('confirms and sends the selected record id', () => {
    assert.match(page, /window\.confirm\(resource === 'rooms'/);
    assert.match(page, /remove\.mutate\(record\.id\)/);
  });

  test('invalidates the shared list so deleted rows disappear', () => {
    assert.match(
      page,
      /invalidateQueries\(\{ queryKey: \['master-data', clinicId\] \}\)/
    );
  });

  test('shows conflict and other delete errors instead of failing silently', () => {
    assert.match(page, /remove\.isError/);
    assert.match(page, /remove\.error \?\? statusMutation\.error/);
    assert.match(page, /role="alert"/);
  });

  test('prevents duplicate delete submissions while pending', () => {
    assert.match(page, /className="master-data__danger" disabled=\{remove\.isPending\}/);
  });
});
