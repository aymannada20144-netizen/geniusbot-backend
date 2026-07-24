'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const StaffService = require('../../src/modules/staff/StaffService');
const StaffRepository = require('../../src/modules/staff/StaffRepository');
const { ConflictError, ForbiddenError, ValidationError } = require('../../src/core/errors');
const fs = require('node:fs');
const path = require('node:path');

const clinicId = '00000000-0000-0000-0000-000000000001';
const ownerId = '00000000-0000-0000-0000-000000000010';
const staffId = '00000000-0000-0000-0000-000000000020';
const owner = { id: ownerId, clinicId, branchId: null, role: 'owner' };

function makeService(overrides = {}) {
  const repository = {
    findAuthByIdentifier: async () => null,
    findAuthById: async () => ({ id: ownerId, password_hash: 'current-hash' }),
    updateLastLogin: async () => ({ last_login_at: new Date().toISOString() }),
    updatePassword: async (id) => ({ id }),
    identifierConflict: async () => false,
    activeBranchBelongsToClinic: async () => true,
    createStaff: async (input) => ({ id: staffId, ...input }),
    findByIdForClinic: async () => ({
      id: staffId,
      clinic_id: clinicId,
      username: 'staff.user',
      email: 'staff@example.com',
      role: 'receptionist',
      branch_id: '00000000-0000-0000-0000-000000000101',
      is_active: true,
    }),
    updateStaff: async (_clinicId, id, input) => ({ id, ...input }),
    ...overrides.repository,
  };
  return new StaffService({
    db: {},
    staffRepository: repository,
    passwordHasher: {
      hash: async () => 'new-hash',
      verify: async (plain) => plain === 'Current1',
      ...overrides.passwordHasher,
    },
    tokenService: { createAccessToken: () => 'token' },
  });
}

describe('username login and secure password management', () => {
  test('login accepts a case-insensitive username identifier and preserves response shape', async () => {
    let identifier;
    const service = makeService({
      repository: {
        findAuthByIdentifier: async (value) => {
          identifier = value;
          return {
            id: staffId,
            clinic_id: clinicId,
            branch_id: null,
            username: 'staff.user',
            email: 'staff@example.com',
            full_name: 'Staff User',
            role: 'clinic_admin',
            is_active: true,
            password_hash: 'hash',
          };
        },
      },
      passwordHasher: { verify: async () => true },
    });

    const result = await service.login('Staff.User', 'Current1');
    assert.equal(identifier, 'staff.user');
    assert.equal(result.accessToken, 'token');
    assert.equal(result.staff.username, 'staff.user');
    assert.equal(result.staff.password_hash, undefined);
  });

  test('unknown identifier and wrong password use the same generic error', async () => {
    await assert.rejects(
      makeService().login('unknown', 'Current1'),
      (error) => error instanceof ForbiddenError && error.message === 'Invalid identifier or password.'
    );
    await assert.rejects(
      makeService({
        repository: {
          findAuthByIdentifier: async () => ({
            id: staffId, is_active: true, password_hash: 'hash',
          }),
        },
        passwordHasher: { verify: async () => false },
      }).login('known', 'Current1'),
      (error) => error instanceof ForbiddenError && error.message === 'Invalid identifier or password.'
    );
  });

  test('inactive account is rejected before a token is issued', async () => {
    await assert.rejects(
      makeService({
        repository: {
          findAuthByIdentifier: async () => ({
            id: staffId, is_active: false, password_hash: 'hash',
          }),
        },
      }).login('inactive', 'Current1'),
      /disabled/
    );
  });

  test('create normalizes username and blocks username/email cross-field ambiguity', async () => {
    const conflictService = makeService({
      repository: { identifierConflict: async () => true },
    });
    await assert.rejects(
      conflictService.create(owner, clinicId, {
        fullName: 'New Staff',
        username: 'New.User',
        email: 'new@example.com',
        password: 'Strong123',
        role: 'clinic_admin',
      }),
      ConflictError
    );

    let created;
    const service = makeService({
      repository: { createStaff: async (input) => (created = input) },
    });
    await service.create(owner, clinicId, {
      fullName: 'New Staff',
      username: 'New.User',
      email: 'NEW@example.com',
      password: 'Strong123',
      role: 'clinic_admin',
    });
    assert.equal(created.username, 'new.user');
    assert.equal(created.email, 'new@example.com');
  });

  test('username format and shared password policy reject invalid input', async () => {
    await assert.rejects(
      makeService().create(owner, clinicId, {
        fullName: 'New Staff',
        username: '-bad',
        email: 'new@example.com',
        password: 'Strong123',
        role: 'clinic_admin',
      }),
      ValidationError
    );
    await assert.rejects(
      makeService().create(owner, clinicId, {
        fullName: 'New Staff',
        username: 'valid.user',
        email: 'new@example.com',
        password: '        ',
        role: 'clinic_admin',
      }),
      ValidationError
    );
  });

  test('own password change verifies current password and confirmation', async () => {
    await assert.rejects(
      makeService({ passwordHasher: { verify: async () => false } })
        .changeOwnPassword(owner, 'Wrong123', 'NewStrong1', 'NewStrong1'),
      ForbiddenError
    );
    await assert.rejects(
      makeService().changeOwnPassword(owner, 'Current1', 'NewStrong1', 'Different1'),
      ValidationError
    );
    const result = await makeService()
      .changeOwnPassword(owner, 'Current1', 'NewStrong1', 'NewStrong1');
    assert.deepEqual(result, { passwordChanged: true });
  });

  test('admin reset is scoped and cannot reset self, owner, or platform accounts', async () => {
    const result = await makeService()
      .resetPassword(owner, clinicId, staffId, 'NewStrong1', 'NewStrong1');
    assert.equal(result.passwordReset, true);

    await assert.rejects(
      makeService({
        repository: {
          findByIdForClinic: async () => ({
            id: ownerId, clinic_id: clinicId, role: 'owner', is_active: true,
          }),
        },
      }).resetPassword(owner, clinicId, ownerId, 'NewStrong1', 'NewStrong1'),
      ForbiddenError
    );
  });

  test('repository identifier lookup is parameterized across username and email', async () => {
    let query;
    const repository = new StaffRepository({
      query: async (sql, values) => {
        query = { sql, values };
        return { rows: [] };
      },
    });
    await repository.findAuthByIdentifier('staff.user');
    assert.match(query.sql, /LOWER\(username\) = LOWER\(\$1\)/);
    assert.match(query.sql, /LOWER\(email\) = LOWER\(\$1\)/);
    assert.deepEqual(query.values, ['staff.user']);
  });

  test('frontend contracts expose username and isolated password dialogs', () => {
    const root = path.join(__dirname, '..', '..', 'geniusbot-dashboard', 'src');
    const login = fs.readFileSync(path.join(root, 'pages', 'LoginPage.tsx'), 'utf8');
    const staff = fs.readFileSync(path.join(root, 'pages', 'dashboard', 'StaffPage.tsx'), 'utf8');
    const header = fs.readFileSync(path.join(root, 'components', 'layout', 'AppHeader.tsx'), 'utf8');
    assert.match(login, /Username or email/);
    assert.match(login, /type="text"/);
    assert.match(staff, /<th>Username<\/th>/);
    assert.match(staff, /Reset password for \{resetting\.full_name\}/);
    assert.match(staff, /username: payload\.username/);
    assert.doesNotMatch(staff, /updateStaff[\s\S]{0,250}password:/);
    assert.match(header, /Current password/);
    assert.match(header, /closePasswordDialog/);
    assert.doesNotMatch(staff, /password_hash/);
  });

  test('migration follows deterministic backfill and database constraints', () => {
    const migration = fs.readFileSync(
      path.join(__dirname, '..', '..', 'database', 'migrations', '006_staff_username.sql'),
      'utf8'
    );
    assert.match(migration, /split_part\(email, '@', 1\)/);
    assert.match(migration, /replace\(ranked\.id::text, '-', ''\)/);
    assert.match(migration, /staff_username_lower_uidx/);
    assert.match(migration, /ALTER COLUMN username SET NOT NULL/);
    assert.match(migration, /\^\[a-z0-9\]/);
  });
});
