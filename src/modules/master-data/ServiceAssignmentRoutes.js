'use strict';

const { PERMISSIONS } = require('../../core/auth');

function registerServiceAssignmentRoutes(app, controller, protect) {
  const base = '/api/clinics/:clinicId/master-data/service-assignments';
  app.get(base, { preHandler: protect(PERMISSIONS.CLINIC_VIEW) }, controller.list);
  app.get(`${base}/options`, { preHandler: protect(PERMISSIONS.CLINIC_VIEW) }, controller.options);
  app.post(base, { preHandler: protect(PERMISSIONS.SERVICE_UPDATE) }, controller.create);
  app.patch(`${base}/:id`, { preHandler: protect(PERMISSIONS.SERVICE_UPDATE) }, controller.update);
  app.patch(`${base}/:id/status`, { preHandler: protect(PERMISSIONS.SERVICE_UPDATE) }, controller.setActive);
  app.delete(`${base}/:id`, { preHandler: protect(PERMISSIONS.SERVICE_UPDATE) }, controller.remove);
}

module.exports = registerServiceAssignmentRoutes;
