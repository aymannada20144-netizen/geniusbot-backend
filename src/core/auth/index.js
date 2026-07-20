'use strict';

const roles = require('./roles');
const permissions = require('./permissions');

const PasswordHasher = require('./PasswordHasher');
const TokenService = require('./TokenService');

const createAuthenticate = require('./authenticate');
const createAuthorize = require('./authorize');
const createProtect = require('./protect');
const enforceClinicScope = require(
  './enforceClinicScope'
);

const tokenService = new TokenService();

const authenticate = createAuthenticate({
  tokenService,
});

const protect = createProtect({
  authenticate,
  enforceClinicScope,
  createAuthorize,
});

module.exports = {
  ...roles,
  ...permissions,

  PasswordHasher,
  TokenService,

  tokenService,

  authenticate,
  enforceClinicScope,
  protect,

  createAuthenticate,
  createAuthorize,
  createProtect,
};