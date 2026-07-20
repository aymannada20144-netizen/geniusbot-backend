'use strict';

const jwt = require('jsonwebtoken');

const DEFAULT_ACCESS_EXPIRES_IN = '30m';

class TokenService {
  constructor(options = {}) {
    this.accessSecret =
      options.accessSecret ||
      process.env.JWT_ACCESS_SECRET;

    this.accessExpiresIn =
      options.accessExpiresIn ||
      process.env.JWT_ACCESS_EXPIRES_IN ||
      DEFAULT_ACCESS_EXPIRES_IN;

    if (
      typeof this.accessSecret !== 'string' ||
      this.accessSecret.trim().length < 32
    ) {
      throw new Error(
        'JWT_ACCESS_SECRET is required and must contain at least 32 characters.'
      );
    }
  }

  createAccessToken(staff) {
    this.#validateStaff(staff);

    return jwt.sign(
      {
        clinicId: staff.clinic_id ?? null,
        branchId: staff.branch_id ?? null,
        role: staff.role,
        type: 'access',
      },
      this.accessSecret,
      {
        algorithm: 'HS256',
        expiresIn: this.accessExpiresIn,
        subject: staff.id,
      }
    );
  }

  verifyAccessToken(token) {
    this.#validateToken(token);

    const payload = jwt.verify(
      token,
      this.accessSecret,
      {
        algorithms: ['HS256'],
      }
    );

    if (
      !payload ||
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.role !== 'string'
    ) {
      throw new jwt.JsonWebTokenError(
        'Invalid access token payload.'
      );
    }

    return payload;
  }

  decode(token) {
    this.#validateToken(token);

    return jwt.decode(token);
  }

  #validateStaff(staff) {
    if (!staff || typeof staff !== 'object') {
      throw new TypeError('Staff object is required.');
    }

    if (
      typeof staff.id !== 'string' ||
      staff.id.trim().length === 0
    ) {
      throw new TypeError('Staff id is required.');
    }

    if (
      typeof staff.role !== 'string' ||
      staff.role.trim().length === 0
    ) {
      throw new TypeError('Staff role is required.');
    }

    if (
      staff.role !== 'platform_admin' &&
      !staff.clinic_id
    ) {
      throw new TypeError(
        'Clinic id is required for clinic-scoped staff.'
      );
    }

    if (
      staff.clinic_id !== null &&
      staff.clinic_id !== undefined &&
      typeof staff.clinic_id !== 'string'
    ) {
      throw new TypeError(
        'Clinic id must be a string or null.'
      );
    }

    if (
      staff.branch_id !== null &&
      staff.branch_id !== undefined &&
      typeof staff.branch_id !== 'string'
    ) {
      throw new TypeError(
        'Branch id must be a string or null.'
      );
    }

      }

  #validateToken(token) {
    if (
      typeof token !== 'string' ||
      token.trim().length === 0
    ) {
      throw new TypeError(
        'Access token must be a non-empty string.'
      );
    }
  }
}

module.exports = TokenService;