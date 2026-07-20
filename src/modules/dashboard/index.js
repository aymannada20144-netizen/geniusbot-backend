'use strict';

const DashboardRepository = require('./DashboardRepository');
const DashboardService = require('./DashboardService');
const DashboardController = require('./DashboardController');
const registerDashboardRoutes = require('./DashboardRoutes');

const ServicesDashboardRepository = require(
  './services-dashboard/ServicesDashboardRepository'
);
const ServicesDashboardService = require(
  './services-dashboard/ServicesDashboardService'
);
const ServicesDashboardController = require(
  './services-dashboard/ServicesDashboardController'
);
const registerServicesDashboardRoutes = require(
  './services-dashboard/ServicesDashboardRoutes'
);

const {
  protect,
} = require('../../core/auth');

function register({ app, db }) {
  const dashboardRepository =
    new DashboardRepository(db);

  const dashboardService =
    new DashboardService(dashboardRepository);

  const dashboardController =
    new DashboardController(dashboardService);

  registerDashboardRoutes(
    app,
    dashboardController,
    protect
  );

  const servicesDashboardRepository =
    new ServicesDashboardRepository(db);

  const servicesDashboardService =
    new ServicesDashboardService(
      servicesDashboardRepository
    );

  const servicesDashboardController =
    new ServicesDashboardController(
      servicesDashboardService
    );

  registerServicesDashboardRoutes(
  app,
  servicesDashboardController,
  protect
);
}

module.exports = {
  register,
};