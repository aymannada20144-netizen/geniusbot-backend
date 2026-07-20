'use strict';

function createProtect({
  authenticate,
  enforceClinicScope,
  createAuthorize,
}) {
  if (typeof authenticate !== 'function') {
    throw new TypeError(
      'authenticate middleware is required.'
    );
  }

  if (typeof enforceClinicScope !== 'function') {
    throw new TypeError(
      'enforceClinicScope middleware is required.'
    );
  }

  if (typeof createAuthorize !== 'function') {
    throw new TypeError(
      'createAuthorize is required.'
    );
  }

  return function protect(requiredPermissions) {
    const authorize =
      createAuthorize(requiredPermissions);

    return [
      authenticate,
      enforceClinicScope,
      authorize,
    ];
  };
}

module.exports = createProtect;