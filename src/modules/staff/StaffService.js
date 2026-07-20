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

  async login(email, password) {
    const normalizedEmail =
      this.#normalizeEmail(email);

    this.#validatePassword(password);

    const staff =
      await this.staffRepository.findAuthByEmail(
        normalizedEmail
      );

    if (!staff) {
      throw new ForbiddenError(
        'Invalid email or password.'
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
        'Invalid email or password.'
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

    const exists =
      await this.staffRepository.emailExists(
        normalizedEmail
      );

    if (exists) {
      throw new ConflictError(
        'A staff account with this email already exists.'
      );
    }

    const branchId = this.#resolveBranchId(
      actor,
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
      email: normalizedEmail,
      phone: this.#normalizeOptionalString(
        input.phone
      ),
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

    if (input.email !== undefined) {
      const normalizedEmail =
        this.#normalizeEmail(input.email);

      const exists =
        await this.staffRepository.emailExists(
          normalizedEmail,
          staffId
        );

      if (exists) {
        throw new ConflictError(
          'A staff account with this email already exists.'
        );
      }

      updateData.email = normalizedEmail;
    }

    if (input.phone !== undefined) {
      updateData.phone =
        this.#normalizeOptionalString(input.phone);
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
        this.#resolveBranchId(
          actor,
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
    newRole
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

    if (
      isBranchScopedRole(newRole) &&
      !currentStaff.branch_id
    ) {
      throw new ConflictError(
        'A branch-scoped role requires a branch assignment.'
      );
    }

    const updated =
      await this.staffRepository.updateRole(
        clinicId,
        staffId,
        newRole
      );

    if (!updated) {
      throw new NotFoundError(
        'Staff member not found.'
      );
    }

    return updated;
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

  async changePassword(
    actor,
    clinicId,
    staffId,
    newPassword
  ) {
    this.#validateActor(actor);
    this.#validateId(clinicId, 'clinicId');
    this.#validateId(staffId, 'staffId');
    this.#validatePassword(newPassword);

    this.#assertClinicAccess(actor, clinicId);

    const targetStaff =
      await this.#getManageableStaff(
        actor,
        clinicId,
        staffId
      );

    const changingOwnPassword =
      actor.id === targetStaff.id;

    if (
      !changingOwnPassword &&
      !isPlatformAdmin(actor.role) &&
      !hasPermission(
        actor.role,
        PERMISSIONS.STAFF_UPDATE
      )
    ) {
      throw new ForbiddenError(
        'You cannot change this staff member password.'
      );
    }

    const passwordHash =
      await this.passwordHasher.hash(newPassword);

    const updated =
      await this.staffRepository.updatePassword(
        staffId,
        passwordHash
      );

    if (!updated) {
      throw new NotFoundError(
        'Staff member not found.'
      );
    }

    return {
      id: staffId,
      passwordChanged: true,
    };
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
        client
      );

      await this.staffRepository.updateRole(
        clinicId,
        actor.id,
        ROLES.CLINIC_ADMIN,
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

  #resolveBranchId(
    actor,
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

    this.#validateId(
      requestedBranchId,
      'branchId'
    );

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

    if (!isValidRole(input.role)) {
      throw new ValidationError(
        'Invalid staff role.'
      );
    }

    this.#validatePassword(input.password);

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

  #validatePassword(password) {
    if (
      typeof password !== 'string' ||
      password.length < 8
    ) {
      throw new ValidationError(
        'Password must contain at least 8 characters.'
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