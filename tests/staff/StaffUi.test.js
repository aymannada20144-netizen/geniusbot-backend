'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');

const staffPage = fs.readFileSync(
  path.join(__dirname, '../../geniusbot-dashboard/src/pages/dashboard/StaffPage.tsx'),
  'utf8'
);

describe('Staff branch selection UI', () => {
  test('loads active clinic branches from the existing Master Data endpoint', () => {
    assert.match(staffPage, /listMasterData\(clinicId, 'branches'\)/);
    assert.match(staffPage, /branch\.is_active === true/);
    assert.match(staffPage, /queryKey: \['master-data', clinicId, 'branches'\]/);
  });

  test('uses the backend branch-scoped role set', () => {
    assert.match(
      staffPage,
      /new Set\(\['branch_manager', 'receptionist', 'doctor'\]\)/
    );
    assert.match(staffPage, /requiresBranch && <label>Branch \*/);
    assert.match(staffPage, /required\s+disabled=\{branchesQuery\.isLoading/);
  });

  test('submits the selected branch for create and update', () => {
    const occurrences = staffPage.match(/branchId: payload\.branchId \|\| null/g) || [];
    assert.equal(occurrences.length, 2);
    assert.match(staffPage, /value=\{form\.branchId\}/);
    assert.match(staffPage, /value=\{branch\.id\}/);
  });

  test('loads edit assignment and clears clinic-wide branch values', () => {
    assert.match(staffPage, /branchId: staff\.branch_id \?\? ''/);
    assert.match(
      staffPage,
      /branchId: branchScopedRoles\.has\(role\) \? form\.branchId : ''/
    );
  });

  test('edit displays role and calls the existing role endpoint', () => {
    assert.match(staffPage, /<label>Role \*<select disabled=\{Boolean\(editing\)/);
    assert.match(staffPage, /payload\.role !== editing\.role/);
    assert.match(staffPage, /changeStaffRole\(/);
  });

  test('status and delete actions expose errors and safe labels', () => {
    assert.match(staffPage, /'Deactivate' : 'Reactivate'/);
    assert.match(staffPage, /window\.confirm\(`Delete \$\{staff\.full_name\}\?/);
    assert.match(staffPage, /remove\.mutate\(staff\)/);
    assert.match(staffPage, /status\.isError/);
    assert.match(staffPage, /remove\.isError/);
  });

  test('handles loading, failure, empty branches, and invalid submission', () => {
    assert.match(staffPage, /Loading branches\.\.\./);
    assert.match(staffPage, /Unable to load branches\. Try again before saving\./);
    assert.match(staffPage, /No active branches are available\./);
    assert.match(staffPage, /if \(requiresBranch && !form\.branchId\)/);
    assert.match(staffPage, /setBranchError/);
    assert.match(staffPage, /save\.mutate\(normalizedForm\)/);
  });
});
