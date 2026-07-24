'use strict';

const { PERMISSIONS } = require('../../core/auth');

function registerDoctorWorkingHoursRoutes(app, controller, protect) {
  const path = '/api/clinics/:clinicId/doctors/:doctorId/working-hours';

  app.get(
    path,
    { preHandler: protect(PERMISSIONS.DOCTOR_VIEW) },
    controller.getWeeklySchedule
  );

  app.put(
    path,
    { preHandler: protect(PERMISSIONS.DOCTOR_UPDATE) },
    controller.replaceWeeklySchedule
  );
}

module.exports = registerDoctorWorkingHoursRoutes;
