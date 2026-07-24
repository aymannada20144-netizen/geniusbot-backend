'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');

const StaffService = require('../../src/modules/staff/StaffService');
const { ConflictError, ForbiddenError, ValidationError } = require('../../src/core/errors');

const clinicId = '00000000-0000-0000-0000-000000000001';
const otherClinicId = '00000000-0000-0000-0000-000000000002';
const ownerId = '00000000-0000-0000-0000-000000000010';
const staffId = '00000000-0000-0000-0000-000000000020';
const branchId = '00000000-0000-0000-0000-000000000101';

const owner = {
  id: ownerId,
  clinicId,
  branchId: null,
  role: 'owner',
};

function repository(overrides = {}) {
  return {
    findByIdForClinic: async () => ({
      id: staffId,
      clinic_id: clinicId,
      branch_id: branchId,
      role: 'receptionist',
      is_active: true,
    }),
    activeBranchBelongsToClinic: async () => true,
    emailExists: async () => false,
    updateStaff: async (_clinic, id, data) => ({ id, ...data }),
    updateRole: async (_clinic, id, role, assignedBranchId) => ({
      id,
      role,
      branch_id: assignedBranchId,
    }),
    setActiveStatus: async (_clinic, id, isActive) => ({
      id,
      is_active: isActive,
    }),
    deleteStaff: async (_clinic, id) => ({ id }),
    ...overrides,
  };
}

function service(repo = repository()) {
  return new StaffService({
    db: {},
    staffRepository: repo,
    passwordHasher: { hash: async () => 'hash', verify: async () => true },
    tokenService: { createAccessToken: () => 'token' },
  });
}

describe('Staff management contract', () => {
  test('permitted role change persists the selected active branch', async () => {
    let call;
    const result = await service(repository({
      updateRole: async (...args) => {
        call = args;
        return { id: staffId, role: args[2], branch_id: args[3] };
      },
    })).changeRole(owner, clinicId, staffId, 'doctor', branchId);

    assert.deepEqual(call, [clinicId, staffId, 'doctor', branchId]);
    assert.equal(result.branch_id, branchId);
  });

  test('branch-scoped role requires a branch', async () => {
    await assert.rejects(
      service().changeRole(owner, clinicId, staffId, 'doctor', null),
      /branchId is required/
    );
  });

  test('branch must be active and belong to the current clinic', async () => {
    await assert.rejects(
      service(repository({
        activeBranchBelongsToClinic: async () => false,
      })).changeRole(owner, clinicId, staffId, 'doctor', branchId),
      ValidationError
    );
  });

  test('changing to clinic_admin clears branchId', async () => {
    let assignedBranch;
    await service(repository({
      updateRole: async (_clinic, _id, _role, value) => {
        assignedBranch = value;
        return { id: staffId, role: 'clinic_admin', branch_id: value };
      },
    })).changeRole(owner, clinicId, staffId, 'clinic_admin', branchId);
    assert.equal(assignedBranch, null);
  });

  test('unauthorized role change and cross-clinic update are rejected', async () => {
    const clinicAdmin = { ...owner, role: 'clinic_admin' };
    await assert.rejects(
      service().changeRole(clinicAdmin, clinicId, staffId, 'doctor', branchId),
      ForbiddenError
    );
    await assert.rejects(
      service().update(owner, otherClinicId, staffId, { fullName: 'Other clinic' }),
      ForbiddenError
    );
  });

  test('deactivate and reactivate both persist', async () => {
    const instance = service();
    assert.equal(
      (await instance.setActiveStatus(owner, clinicId, staffId, false)).is_active,
      false
    );
    assert.equal(
      (await instance.setActiveStatus(owner, clinicId, staffId, true)).is_active,
      true
    );
  });

  test('supported deletion succeeds while self and owner deletion are blocked', async () => {
    assert.equal((await service().remove(owner, clinicId, staffId)).id, staffId);

    await assert.rejects(
      service(repository({
        findByIdForClinic: async () => ({
          id: ownerId,
          clinic_id: clinicId,
          branch_id: null,
          role: 'owner',
        }),
      })).remove(owner, clinicId, ownerId),
      ConflictError
    );

    await assert.rejects(
      service(repository({
        findByIdForClinic: async () => ({
          id: staffId,
          clinic_id: clinicId,
          branch_id: null,
          role: 'owner',
        }),
      })).remove(owner, clinicId, staffId),
      ConflictError
    );
  });
});
