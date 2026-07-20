'use strict';

const {
  PERMISSIONS,
} = require('../../../core/auth');

function servicesDashboardRoutes(
  app,
  servicesDashboardController,
  protect
) {
  if (!servicesDashboardController) {
    throw new Error(
      'servicesDashboardRoutes requires servicesDashboardController'
    );
  }

  if (typeof protect !== 'function') {
    throw new TypeError(
      'protect middleware is required.'
    );
  }

  app.get(
    '/api/clinics/:clinicId/dashboard/services',
    {
      preHandler: protect(
        PERMISSIONS.DASHBOARD_VIEW
      ),
    },
    servicesDashboardController.getServices.bind(
      servicesDashboardController
    )
  );

  app.get(
    '/api/clinics/:clinicId/dashboard/services/:serviceId',
    {
      preHandler: protect(
        PERMISSIONS.DASHBOARD_VIEW
      ),
    },
    servicesDashboardController.getServiceById.bind(
      servicesDashboardController
    )
  );
}

module.exports = servicesDashboardRoutes;