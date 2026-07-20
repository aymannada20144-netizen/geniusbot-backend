'use strict';

const {
  PERMISSIONS,
} = require('../../core/auth');

function dashboardRoutes(
  app,
  dashboardController,
  protect
) {
  if (!dashboardController) {
    throw new Error(
      'dashboardRoutes requires dashboardController'
    );
  }

  if (typeof protect !== 'function') {
    throw new TypeError(
      'protect middleware is required.'
    );
  }

  app.get(
    '/api/clinics/:clinicId/dashboard/appointment-stats',
    {
      preHandler: protect(
        PERMISSIONS.DASHBOARD_VIEW
      ),
    },
    dashboardController.getAppointmentStats.bind(
      dashboardController
    )
  );

  app.get(
    '/api/clinics/:clinicId/dashboard/appointments',
    {
      preHandler: protect(
        PERMISSIONS.DASHBOARD_VIEW
      ),
    },
    dashboardController.getAppointmentsList.bind(
      dashboardController
    )
  );

  app.get(
    '/api/clinics/:clinicId/dashboard/patients',
    {
      preHandler: protect(
        PERMISSIONS.DASHBOARD_VIEW
      ),
    },
    dashboardController.getPatientsList.bind(
      dashboardController
    )
  );

  app.get(
    '/api/clinics/:clinicId/dashboard/today-schedule',
    {
      preHandler: protect(
        PERMISSIONS.DASHBOARD_VIEW
      ),
    },
    dashboardController.getTodaySchedule.bind(
      dashboardController
    )
  );

  app.patch(
    '/api/clinics/:clinicId/dashboard/appointments/:appointmentId/action',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_UPDATE
      ),
    },
    dashboardController.updateAppointmentAction.bind(
      dashboardController
    )
  );
}

module.exports = dashboardRoutes;