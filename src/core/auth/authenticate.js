'use strict';

const {
  AuthenticationError,
} = require('../errors');

function createAuthenticate({ tokenService }) {
  if (!tokenService) {
    throw new TypeError('tokenService is required.');
  }

  return async function authenticate(request) {
    const authorizationHeader =
      request.headers.authorization;

    if (
      typeof authorizationHeader !== 'string' ||
      authorizationHeader.trim().length === 0
    ) {
      throw new AuthenticationError(
        'Authorization header is required.'
      );
    }

    const match = authorizationHeader.match(
      /^Bearer\s+(.+)$/i
    );

    if (!match) {
      throw new AuthenticationError(
        'Authorization header must use the Bearer scheme.'
      );
    }

    const token = match[1].trim();

    if (!token) {
      throw new AuthenticationError(
        'Access token is required.'
      );
    }

    try {
      const payload =
        tokenService.verifyAccessToken(token);

      request.user = {
        id: payload.sub,
        clinicId: payload.clinicId ?? null,
        branchId: payload.branchId ?? null,
        role: payload.role,
      };
    } catch (error) {
      throw new AuthenticationError(
        'Invalid or expired access token.'
      );
    }
  };
}

module.exports = createAuthenticate;