'use strict';

const { PERMISSIONS } = require('../../core/auth');

function registerReportsRoutes(app, controller, protect) {
  const permission = protect(PERMISSIONS.REPORT_VIEW_OPERATIONAL);
  const base = '/api/clinics/:clinicId/reports';
  app.get(`${base}/appointments/summary`, { preHandler: permission }, controller.summary.bind(controller));
  app.get(`${base}/appointments/trend`, { preHandler: permission }, controller.trend.bind(controller));
  app.get(`${base}/appointments/breakdown`, { preHandler: permission }, controller.breakdown.bind(controller));
  app.get(`${base}/patients/summary`, { preHandler: permission }, controller.patients.bind(controller));
  app.get(`${base}/conversations/summary`, { preHandler: permission }, controller.conversations.bind(controller));
}

module.exports = registerReportsRoutes;
