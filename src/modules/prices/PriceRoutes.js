'use strict';

const { PERMISSIONS } = require('../../core/auth');

function registerPriceRoutes(app, controller, protect) {
  const base = '/api/clinics/:clinicId/prices';
  app.get(base, { preHandler: protect(PERMISSIONS.FINANCIAL_VIEW) }, controller.list.bind(controller));
  app.get(`${base}/:priceId`, { preHandler: protect(PERMISSIONS.FINANCIAL_VIEW) }, controller.get.bind(controller));
  app.post(base, { preHandler: protect(PERMISSIONS.FINANCIAL_CREATE) }, controller.create.bind(controller));
  app.patch(`${base}/:priceId`, { preHandler: protect(PERMISSIONS.FINANCIAL_UPDATE) }, controller.update.bind(controller));
}

module.exports = registerPriceRoutes;
