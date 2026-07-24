'use strict';

const {
  PERMISSIONS,
} = require('../../core/auth');

function registerAppointmentRoutes(
  app,
  appointmentController,
  protect
) {
  if (!appointmentController) {
    throw new TypeError(
      'appointmentController is required.'
    );
  }

  if (typeof protect !== 'function') {
    throw new TypeError(
      'protect middleware is required.'
    );
  }

  app.get(
    '/api/clinics/:clinicId/appointments',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_VIEW
      ),
    },
    appointmentController.listAppointments.bind(
      appointmentController
    )
  );

  app.patch(
    '/api/clinics/:clinicId/appointments/:appointmentId/status',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_UPDATE
      ),
    },
    appointmentController.updateAppointmentStatus.bind(
      appointmentController
    )
  );

  app.get(
    '/api/clinics/:clinicId/patients/:patientId/upcoming-appointment',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_VIEW
      ),
    },
    appointmentController.getUpcomingAppointment.bind(
      appointmentController
    )
  );

  app.get(
    '/api/clinics/:clinicId/patients/:patientId/appointments',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_VIEW
      ),
    },
    appointmentController.getAppointmentHistory.bind(
      appointmentController
    )
  );

  app.post(
    '/api/clinics/:clinicId/appointments/:appointmentId/cancel',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_CANCEL
      ),
    },
    appointmentController.cancelAppointment.bind(
      appointmentController
    )
  );

  app.post(
    '/api/clinics/:clinicId/appointments/:appointmentId/complete',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_COMPLETE
      ),
    },
    appointmentController.completeAppointment.bind(
      appointmentController
    )
  );

  app.post(
    '/api/clinics/:clinicId/appointments/:appointmentId/no-show',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_NO_SHOW
      ),
    },
    appointmentController.markAppointmentAsNoShow.bind(
      appointmentController
    )
  );

  app.put(
    '/api/clinics/:clinicId/appointments/:appointmentId/reschedule',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_RESCHEDULE
      ),
    },
    appointmentController.rescheduleAppointment.bind(
      appointmentController
    )
  );
}

module.exports = registerAppointmentRoutes;
