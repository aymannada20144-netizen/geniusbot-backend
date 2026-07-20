'use strict';

const ROLES = Object.freeze({
  PLATFORM_ADMIN: 'platform_admin',
  OWNER: 'owner',
  CLINIC_ADMIN: 'clinic_admin',
  BRANCH_MANAGER: 'branch_manager',
  RECEPTIONIST: 'receptionist',
  DOCTOR: 'doctor',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

function isValidRole(role) {
  return typeof role === 'string' && ROLE_VALUES.includes(role);
}

function assertValidRole(role) {
  if (!isValidRole(role)) {
    throw new TypeError(`Invalid staff role: ${String(role)}`);
  }

  return role;
}

function isPlatformAdmin(role) {
  return role === ROLES.PLATFORM_ADMIN;
}

function isOwner(role) {
  return role === ROLES.OWNER;
}

function isClinicAdmin(role) {
  return role === ROLES.CLINIC_ADMIN;
}

function isBranchManager(role) {
  return role === ROLES.BRANCH_MANAGER;
}

function isReceptionist(role) {
  return role === ROLES.RECEPTIONIST;
}

function isDoctor(role) {
  return role === ROLES.DOCTOR;
}

function isClinicScopedRole(role) {
  return [
    ROLES.OWNER,
    ROLES.CLINIC_ADMIN,
    ROLES.BRANCH_MANAGER,
    ROLES.RECEPTIONIST,
    ROLES.DOCTOR,
  ].includes(role);
}

function isBranchScopedRole(role) {
  return [
    ROLES.BRANCH_MANAGER,
    ROLES.RECEPTIONIST,
    ROLES.DOCTOR,
  ].includes(role);
}

module.exports = {
  ROLES,
  ROLE_VALUES,
  isValidRole,
  assertValidRole,
  isPlatformAdmin,
  isOwner,
  isClinicAdmin,
  isBranchManager,
  isReceptionist,
  isDoctor,
  isClinicScopedRole,
  isBranchScopedRole,
};