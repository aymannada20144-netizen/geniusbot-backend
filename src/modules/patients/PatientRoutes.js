'use strict';

const {
  PERMISSIONS,
} = require('../../core/auth');

function patientRoutes(
  app,
  patientController,
  protect
) {
  if (!patientController) {
    throw new Error(
      'patientRoutes requires patientController'
    );
  }

  if (typeof protect !== 'function') {
    throw new TypeError(
      'protect middleware is required.'
    );
  }

  app.get(
    '/api/clinics/:clinicId/patients',
    {
      preHandler: protect(
        PERMISSIONS.PATIENT_VIEW
      ),
    },
    patientController.searchPatients.bind(
      patientController
    )
  );

  app.get(
    '/api/clinics/:clinicId/patients/:patientId',
    {
      preHandler: protect(
        PERMISSIONS.PATIENT_VIEW
      ),
    },
    patientController.getPatient.bind(
      patientController
    )
  );

  app.post(
    '/api/clinics/:clinicId/patients',
    {
      preHandler: protect(
        PERMISSIONS.PATIENT_CREATE
      ),
    },
    patientController.createPatient.bind(
      patientController
    )
  );

  app.patch(
    '/api/clinics/:clinicId/patients/:patientId/deactivate',
    {
      preHandler: protect(
        PERMISSIONS.PATIENT_UPDATE
      ),
    },
    patientController.deactivatePatient.bind(
      patientController
    )
  );

  app.patch(
    '/api/clinics/:clinicId/patients/:patientId/reactivate',
    {
      preHandler: protect(
        PERMISSIONS.PATIENT_UPDATE
      ),
    },
    patientController.reactivatePatient.bind(
      patientController
    )
  );

  app.patch(
    '/api/clinics/:clinicId/patients/:patientId/last-seen',
    {
      preHandler: protect(
        PERMISSIONS.PATIENT_UPDATE
      ),
    },
    patientController.updateLastSeen.bind(
      patientController
    )
  );
}

module.exports = patientRoutes;