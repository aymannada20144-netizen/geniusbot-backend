'use strict';

const ReportsRepository = require('./ReportsRepository');
const ReportsService = require('./ReportsService');
const ReportsController = require('./ReportsController');
const registerReportsRoutes = require('./ReportsRoutes');
const { protect } = require('../../core/auth');

function register({ app, db }) {
  const repository = new ReportsRepository(db);
  const service = new ReportsService(repository);
  const controller = new ReportsController(service);
  registerReportsRoutes(app, controller, protect);
}

module.exports = { register };
