'use strict';

const StaffRepository = require('./StaffRepository');
const StaffService = require('./StaffService');
const StaffController = require('./StaffController');
const registerStaffRoutes = require('./StaffRoutes');

const {
  PasswordHasher,
  tokenService,
  protect,
  authenticate,
} = require('../../core/auth');

function register({ app, db }) {
  if (!app) {
    throw new TypeError('app is required.');
  }

  if (!db) {
    throw new TypeError('db is required.');
  }

  const staffRepository = new StaffRepository(db);
  const passwordHasher = new PasswordHasher();

  const staffService = new StaffService({
    db,
    staffRepository,
    passwordHasher,
    tokenService,
  });

  const staffController =
    new StaffController(staffService);

  registerStaffRoutes(
    app,
    staffController,
    protect,
    authenticate
  );
}

module.exports = {
  register,
};
