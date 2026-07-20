'use strict';

const {
  ForbiddenError,
} = require('../errors');

const {
  hasAllPermissions,
  isValidPermission,
} = require('./permissions');

function createAuthorize(requiredPermissions) {
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions
    : [requiredPermissions];

  if (permissions.length === 0) {
    throw new TypeError(
      'At least one permission is required.'
    );
  }

  for (const permission of permissions) {
    if (!isValidPermission(permission)) {
      throw new TypeError(
        `Invalid permission: ${String(permission)}`
      );
    }
  }

  return async function authorize(request) {
    const actor = request.user;

    if (!actor || typeof actor !== 'object') {
      throw new ForbiddenError(
        'Authenticated staff identity is required.'
      );
    }

    if (
      typeof actor.role !== 'string' ||
      actor.role.trim().length === 0
    ) {
      throw new ForbiddenError(
        'Authenticated staff role is required.'
      );
    }

    const authorized = hasAllPermissions(
      actor.role,
      permissions
    );

    if (!authorized) {
      throw new ForbiddenError(
        'You do not have permission to perform this operation.'
      );
    }
  };
}

module.exports = createAuthorize;