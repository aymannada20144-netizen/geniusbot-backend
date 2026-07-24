'use strict';

const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../../core/errors');

const {
  ROLES,
  PERMISSIONS,
  isValidRole,
  isPlatformAdmin,
  isOwner,
  isBranchScopedRole,
  hasPermission,
} = require('../../core/auth');
const { normalizeSaudiMobile } = require('../../core/validators/saudiMobile');
const {
  validatePassword,
  validatePasswordConfirmation,
} = require('../../core/validators/password');

class StaffService {
  constructor({
    db,
    staffRepository,
    passwordHasher,
    tokenService,
  }) {
    if (!db) {
      throw new TypeError('db is required.');
    }

    if (!staffRepository) {
      throw new TypeError(
        'staffRepository is required.'
      );
    }

    if (!passwordHasher) {
      throw new TypeError(
        'passwordHasher is required.'
      );
    }

    if (!tokenService) {
      throw new TypeError(
        'tokenService is required.'
      );
    }

    this.db = db;
    this.staffRepository = staffRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
  }

  async login(identifier, password) {
    const normalizedIdentifier =
      this.#normalizeRequiredString(identifier, 'identifier').toLowerCase();

    if (typeof password !== 'string' || password.length === 0) {
      throw new ForbiddenError('Invalid identifier or password.');
    }

    const staff =
      await this.staffRepository.findAuthByIdentifier(
        normalizedIdentifier
      );

    if (!staff) {
      throw new ForbiddenError(
        'Invalid identifier or password.'
      );
    }

    if (!staff.is_active) {
      throw new ForbiddenError(
        'This staff account is disabled.'
      );
    }

    const passwordMatches =
      await this.passwordHasher.verify(
        password,
        staff.password_hash
      );

    if (!passwordMatches) {
      throw new ForbiddenError(
        'Invalid identifier or password.'
      );
    }

    const loginUpdate =
  await this.staffRepository.updateLastLogin(
    staff.id
  );

const safeStaff = this.#sanitizeStaff({
  ...staff,
  last_login_at:
    loginUpdate?.last_login_at ??
    staff.last_login_at,
});

    return {
      staff: safeStaff,
      accessToken:
        this.tokenService.createAccessToken(staff),
    };
  }

  async getById(actor, clinicId, staffId) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(staffId, 'staffId');

    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(
      actor,
      PERMISSIONS.STAFF_VIEW
    );

    const staff =
      await this.staffRepository.findByIdForClinic(
        clinicId,
        staffId
      );

    if (!staff) {
      throw new NotFoundError(
        'Staff member not found.'
      );
    }

    this.#assertBranchAccess(actor, staff.branch_id);

    return staff;
  }

  async listByClinic(
    actor,
    clinicId,
    options = {}
  ) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');

    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(
      actor,
      PERMISSIONS.STAFF_VIEW
    );

    const normalizedOptions = {
      branchId:
        options.branchId || options.branch_id || null,
      role: options.role || null,
      isActive: this.#normalizeBooleanQuery(
        options.isActive ?? options.is_active
      ),
      limit: this.#normalizeLimit(options.limit),
      offset: this.#normalizeOffset(options.offset),
    };

    if (
      normalizedOptions.role &&
      !isValidRole(normalizedOptions.role)
    ) {
      throw new ValidationError(
        'Invalid staff role.'
      );
    }

    if (isBranchScopedRole(actor.role)) {
      normalizedOptions.branchId = actor.branchId;
    }

    return this.staffRepository.listByClinic(
      clinicId,
      normalizedOptions
    );
  }

  async create(actor, clinicId, input) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateCreateInput(input);

    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(
      actor,
      PERMISSIONS.STAFF_CREATE
    );

    if (input.role === ROLES.PLATFORM_ADMIN) {
      throw new ConflictError(
        'Platform administrators cannot be created through a clinic staff endpoint.'
      );
    }

    if (input.role === ROLES.OWNER) {
      throw new ConflictError(
        'The owner role can only be assigned through ownership transfer.'
      );
    }

    this.#assertCanManageRole(actor, input.role);

    const normalizedEmail =
      this.#normalizeEmail(input.email);
    const normalizedUsername =
      this.#normalizeUsername(input.username);

    const exists =
      await this.staffRepository.identifierConflict(
        normalizedUsername,
        normalizedEmail
      );

    if (exists) {
      throw new ConflictError(
        'The username or email conflicts with an existing staff login identifier.'
      );
    }

    const branchId = await this.#resolveBranchId(
      actor,
      clinicId,
      input.role,
      input.branchId ?? input.branch_id
    );

    const passwordHash =
      await this.passwordHasher.hash(input.password);

    return this.staffRepository.createStaff({
      clinicId,
      branchId,
      fullName: this.#normalizeRequiredString(
        input.fullName ?? input.full_name,
        'fullName'
      ),
      username: normalizedUsername,
      email: normalizedEmail,
      phone: normalizeSaudiMobile(input.phone, 'phone', true),
      passwordHash,
      role: input.role,
      isActive:
        input.isActive ??
        input.is_active ??
        true,
    });
  }

  async update(
    actor,
    clinicId,
    staffId,
    input
  ) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(staffId, 'staffId');

    if (!input || typeof input !== 'object') {
      throw new ValidationError(
        'Staff update data is required.'
      );
    }

    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(
      actor,
      PERMISSIONS.STAFF_UPDATE
    );

    const currentStaff =
      await this.#getManageableStaff(
        actor,
        clinicId,
        staffId
      );

    const updateData = {};

    const fullName =
      input.fullName ?? input.full_name;

    if (fullName !== undefined) {
      updateData.fullName =
        this.#normalizeRequiredString(
          fullName,
          'fullName'
        );
    }

    const username =
      input.username === undefined
        ? currentStaff.username
        : this.#normalizeUsername(input.username);
    const email =
      input.email === undefined
        ? currentStaff.email
        : this.#normalizeEmail(input.email);

    if (input.username !== undefined || input.email !== undefined) {
      const exists =
        await this.staffRepository.identifierConflict(
          username,
          email,
          staffId
        );

      if (exists) {
        throw new ConflictError(
          'The username or email conflicts with an existing staff login identifier.'
        );
      }

      if (input.username !== undefined) {
        updateData.username = username;
      }

      if (input.email !== undefined) {
        updateData.email = email;
      }
    }

    if (input.phone !== undefined) {
      updateData.phone = normalizeSaudiMobile(input.phone, 'phone', true);
    }

    const branchProvided =
      Object.prototype.hasOwnProperty.call(
        input,
        'branchId'
      ) ||
      Object.prototype.hasOwnProperty.call(
        input,
        'branch_id'
      );

    if (branchProvided) {
      updateData.branchId =
        await this.#resolveBranchId(
          actor,
          clinicId,
          currentStaff.role,
          input.branchId ?? input.branch_id
        );
    }

    const updated =
      await this.staffRepository.updateStaff(
        clinicId,
        staffId,
        updateData
      );

    if (!updated) {
      throw new NotFoundError(
        'Staff member not found.'
      );
    }

    return updated;
  }

  async changeRole(
    actor,
    clinicId,
    staffId,
    newRole,
    requestedBranchId
  ) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(staffId, 'staffId');

    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(
      actor,
      PERMISSIONS.STAFF_CHANGE_ROLE
    );

    if (!isValidRole(newRole)) {
      throw new ValidationError(
        'Invalid staff role.'
      );
    }

    if (newRole === ROLES.PLATFORM_ADMIN) {
      throw new ConflictError(
        'A clinic staff member cannot be assigned the platform administrator role.'
      );
    }

    if (newRole === ROLES.OWNER) {
      throw new ConflictError(
        'Ownership must be assigned through ownership transfer.'
      );
    }

    const currentStaff =
      await this.#getManageableStaff(
        actor,
        clinicId,
        staffId
      );

    if (currentStaff.id === actor.id) {
      throw new ConflictError(
        'A staff member cannot change their own role.'
      );
    }

    if (isOwner(currentStaff.role)) {
      throw new ConflictError(
        'The owner role can only be changed through ownership transfer.'
      );
    }

    this.#assertCanManageRole(actor, newRole);

    const branchId = await this.#resolveBranchId(
      actor,
      clinicId,
      newRole,
      requestedBranchId
    );

    const updated =
      await this.staffRepository.updateRole(
        clinicId,
        staffId,
        newRole,
        branchId
      );

    if (!updated) {
      throw new NotFoundError(
        'Staff member not found.'
      );
    }

    return updated;
  }

  async remove(actor, clinicId, staffId) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(staffId, 'staffId');
    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(actor, PERMISSIONS.STAFF_DISABLE);

    const targetStaff = await this.#getManageableStaff(
      actor,
      clinicId,
      staffId
    );

    if (targetStaff.id === actor.id) {
      throw new ConflictError('A staff member cannot delete their own account.');
    }
    if (isOwner(targetStaff.role)) {
      throw new ConflictError(
        'The clinic owner cannot be deleted before ownership is transferred.'
      );
    }
    if (targetStaff.role === ROLES.PLATFORM_ADMIN) {
      throw new ForbiddenError('Platform administrators cannot be deleted here.');
    }

    const deleted = await this.staffRepository.deleteStaff(clinicId, staffId);
    if (!deleted) throw new NotFoundError('Staff member not found.');
    return deleted;
  }

  async setActiveStatus(
    actor,
    clinicId,
    staffId,
    isActive
  ) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(staffId, 'staffId');

    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(
      actor,
      PERMISSIONS.STAFF_DISABLE
    );

    if (typeof isActive !== 'boolean') {
      throw new ValidationError(
        'isActive must be a boolean.'
      );
    }

    const targetStaff =
      await this.#getManageableStaff(
        actor,
        clinicId,
        staffId
      );

    if (
      targetStaff.id === actor.id &&
      !isActive
    ) {
      throw new ConflictError(
        'A staff member cannot disable their own account.'
      );
    }

    if (
      isOwner(targetStaff.role) &&
      !isActive
    ) {
      throw new ConflictError(
        'The clinic owner cannot be disabled before ownership is transferred.'
      );
    }

    const updated =
      await this.staffRepository.setActiveStatus(
        clinicId,
        staffId,
        isActive
      );

    if (!updated) {
      throw new NotFoundError(
        'Staff member not found.'
      );
    }

    return updated;
  }

  async changeOwnPassword(
    actor,
    currentPassword,
    newPassword,
    confirmPassword
  ) {
    this.#validateActor(actor);
    validatePassword(currentPassword, 'currentPassword');
    validatePasswordConfirmation(newPassword, confirmPassword);

    const staff = await this.staffRepository.findAuthById(actor.id);
    const matches = staff && await this.passwordHasher.verify(
      currentPassword,
      staff.password_hash
    );

    if (!matches) {
      throw new ForbiddenError(
        'Current password is incorrect.'
      );
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    await this.staffRepository.updatePassword(actor.id, passwordHash);

    return { passwordChanged: true };
  }

  async resetPassword(
    actor,
    clinicId,
    staffId,
    newPassword,
    confirmPassword
  ) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(staffId, 'staffId');
    validatePasswordConfirmation(newPassword, confirmPassword);
    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(actor, PERMISSIONS.STAFF_UPDATE);

    const targetStaff = await this.#getManageableStaff(
      actor,
      clinicId,
      staffId
    );

    if (
      targetStaff.id === actor.id ||
      targetStaff.role === ROLES.OWNER ||
      targetStaff.role === ROLES.PLATFORM_ADMIN
    ) {
      throw new ForbiddenError(
        'This password must be changed through the protected account flow.'
      );
    }

    const passwordHash = await this.passwordHasher.hash(newPassword);
    const updated = await this.staffRepository.updatePassword(staffId, passwordHash);

    if (!updated) {
      throw new NotFoundError('Staff member not found.');
    }

    return { id: staffId, passwordReset: true };
  }

  async transferOwnership(
    actor,
    clinicId,
    newOwnerStaffId
  ) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(
      newOwnerStaffId,
      'newOwnerStaffId'
    );

    this.#assertClinicAccess(actor, clinicId);
    this.#assertPermission(
      actor,
      PERMISSIONS.CLINIC_TRANSFER_OWNERSHIP
    );

    if (!isOwner(actor.role)) {
      throw new ForbiddenError(
        'Only the current clinic owner can transfer ownership.'
      );
    }

    if (actor.id === newOwnerStaffId) {
      throw new ConflictError(
        'The selected staff member is already the clinic owner.'
      );
    }

    const client = await this.db.connect();

    try {
      await client.query('BEGIN');

      const currentOwner =
        await this.staffRepository.findByIdForClinic(
          clinicId,
          actor.id,
          client
        );

      if (
        !currentOwner ||
        currentOwner.role !== ROLES.OWNER ||
        !currentOwner.is_active
      ) {
        throw new ForbiddenError(
          'The current owner account is invalid or inactive.'
        );
      }

      const newOwner =
        await this.staffRepository.findByIdForClinic(
          clinicId,
          newOwnerStaffId,
          client
        );

      if (!newOwner) {
        throw new NotFoundError(
          'The new owner staff member was not found.'
        );
      }

      if (!newOwner.is_active) {
        throw new ConflictError(
          'Ownership cannot be transferred to an inactive staff member.'
        );
      }

      await this.staffRepository.updateRole(
        clinicId,
        newOwnerStaffId,
        ROLES.OWNER,
        null,
        client
      );

      await this.staffRepository.updateRole(
        clinicId,
        actor.id,
        ROLES.CLINIC_ADMIN,
        null,
        client
      );

      const ownerCount =
        await this.staffRepository.countActiveOwnersByClinic(
          clinicId,
          client
        );

      if (ownerCount !== 1) {
        throw new ConflictError(
          'Ownership transfer must result in exactly one active owner.'
        );
      }

      await client.query('COMMIT');

      return {
        clinicId,
        previousOwnerId: actor.id,
        newOwnerId: newOwnerStaffId,
        previousOwnerRole: ROLES.CLINIC_ADMIN,
        newOwnerRole: ROLES.OWNER,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async #getManageableStaff(
    actor,
    clinicId,
    staffId
  ) {
    const staff =
      await this.staffRepository.findByIdForClinic(
        clinicId,
        staffId
      );

    if (!staff) {
      throw new NotFoundError(
        'Staff member not found.'
      );
    }

    this.#assertBranchAccess(actor, staff.branch_id);

    if (
      actor.role === ROLES.CLINIC_ADMIN &&
      isOwner(staff.role)
    ) {
      throw new ForbiddenError(
        'Clinic administrators cannot manage the clinic owner.'
      );
    }

    return staff;
  }

  #assertCanManageRole(actor, targetRole) {
    if (isPlatformAdmin(actor.role)) {
      return;
    }

    if (
      actor.role === ROLES.OWNER ||
      actor.role === ROLES.CLINIC_ADMIN
    ) {
      if (
        targetRole === ROLES.PLATFORM_ADMIN ||
        targetRole === ROLES.OWNER
      ) {
        throw new ForbiddenError(
          'You cannot assign the selected staff role.'
        );
      }

      return;
    }

    throw new ForbiddenError(
      'You cannot manage the selected staff role.'
    );
  }

  async #resolveBranchId(
    actor,
    clinicId,
    targetRole,
    requestedBranchId
  ) {
    if (
      targetRole === ROLES.OWNER ||
      targetRole === ROLES.CLINIC_ADMIN ||
      targetRole === ROLES.PLATFORM_ADMIN
    ) {
      return null;
    }

    if (isBranchScopedRole(actor.role)) {
      if (
        requestedBranchId &&
        requestedBranchId !== actor.branchId
      ) {
        throw new ForbiddenError(
          'You cannot assign staff to another branch.'
        );
      }

      return actor.branchId;
    }

    this.#validateId(requestedBranchId, 'branchId');
    if (!await this.staffRepository.activeBranchBelongsToClinic(
      clinicId,
      requestedBranchId
    )) {
      throw new ValidationError(
        'branchId must identify an active branch in the current clinic.'
      );
    }

    return requestedBranchId;
  }

  #assertClinicAccess(actor, clinicId) {
    if (isPlatformAdmin(actor.role)) {
      return;
    }

    if (actor.clinicId !== clinicId) {
      throw new ForbiddenError(
        'You cannot access another clinic.'
      );
    }
  }

  #assertBranchAccess(actor, branchId) {
    if (
      isBranchScopedRole(actor.role) &&
      actor.branchId !== branchId
    ) {
      throw new ForbiddenError(
        'You cannot access staff outside your branch.'
      );
    }
  }

  #assertPermission(actor, permission) {
    if (!hasPermission(actor.role, permission)) {
      throw new ForbiddenError(
        'You do not have permission to perform this operation.'
      );
    }
  }

  #validateActor(actor) {
    if (!actor || typeof actor !== 'object') {
      throw new ForbiddenError(
        'Authenticated staff identity is required.'
      );
    }

    this.#validateId(actor.id, 'actor.id');

    if (!isValidRole(actor.role)) {
      throw new ForbiddenError(
        'Authenticated staff role is invalid.'
      );
    }

    if (
      !isPlatformAdmin(actor.role) &&
      !actor.clinicId
    ) {
      throw new ForbiddenError(
        'Authenticated staff clinic is required.'
      );
    }

    if (
      isBranchScopedRole(actor.role) &&
      !actor.branchId
    ) {
      throw new ForbiddenError(
        'Authenticated staff branch is required.'
      );
    }
  }

  #validateCreateInput(input) {
    if (!input || typeof input !== 'object') {
      throw new ValidationError(
        'Staff data is required.'
      );
    }

    this.#normalizeRequiredString(
      input.fullName ?? input.full_name,
      'fullName'
    );

    this.#normalizeEmail(input.email);
    this.#normalizeUsername(input.username);

    if (!isValidRole(input.role)) {
      throw new ValidationError(
        'Invalid staff role.'
      );
    }

    validatePassword(input.password);

    const isActive =
      input.isActive ?? input.is_active;

    if (
      isActive !== undefined &&
      typeof isActive !== 'boolean'
    ) {
      throw new ValidationError(
        'isActive must be a boolean.'
      );
    }
  }

  #normalizeEmail(email) {
    const normalized =
      this.#normalizeRequiredString(
        email,
        'email'
      ).toLowerCase();

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalized)) {
      throw new ValidationError(
        'A valid email address is required.'
      );
    }

    return normalized;
  }

  #normalizeUsername(username) {
    const normalized = this.#normalizeRequiredString(
      username,
      'username'
    ).toLowerCase();

    if (
      normalized.length < 3 ||
      normalized.length > 50 ||
      !/^[a-z0-9][a-z0-9._-]{1,48}[a-z0-9]$/.test(normalized)
    ) {
      throw new ValidationError(
        'username must be 3-50 lowercase letters, numbers, dots, underscores, or hyphens, and start and end with a letter or number.'
      );
    }

    return normalized;
  }

  #normalizeRequiredString(value, fieldName) {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0
    ) {
      throw new ValidationError(
        `${fieldName} is required.`
      );
    }

    return value.trim();
  }

  #normalizeOptionalString(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new ValidationError(
        'Optional text values must be strings.'
      );
    }

    const normalized = value.trim();

    return normalized.length > 0
      ? normalized
      : null;
  }

  #validateId(value, fieldName) {
    if (
      typeof value !== 'string' ||
      value.trim().length === 0
    ) {
      throw new ValidationError(
        `${fieldName} is required.`
      );
    }
  }

  #normalizeLimit(value) {
    const limit = Number(value ?? 50);

    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new ValidationError(
        'limit must be an integer between 1 and 100.'
      );
    }

    return limit;
  }

  #normalizeOffset(value) {
    const offset = Number(value ?? 0);

    if (
      !Number.isInteger(offset) ||
      offset < 0
    ) {
      throw new ValidationError(
        'offset must be a non-negative integer.'
      );
    }

    return offset;
  }

  #normalizeBooleanQuery(value) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return null;
    }

    if (value === true || value === 'true') {
      return true;
    }

    if (value === false || value === 'false') {
      return false;
    }

    throw new ValidationError(
      'isActive must be true or false.'
    );
  }

  #sanitizeStaff(staff) {
    const {
      password_hash: passwordHash,
      ...safeStaff
    } = staff;

    return safeStaff;
  }
}

module.exports = StaffService;
