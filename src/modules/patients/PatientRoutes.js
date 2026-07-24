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
    '/api/clinics/:clinicId/patients/:patientId',
    {
      preHandler: protect(
        PERMISSIONS.PATIENT_UPDATE
      ),
    },
    patientController.updatePatient.bind(
      patientController
    )
  );

  app.get('/api/clinics/:clinicId/patients/:patientId/conversation',
    { preHandler: protect(PERMISSIONS.CONVERSATION_VIEW) },
    patientController.getConversation.bind(patientController));
  app.patch('/api/clinics/:clinicId/conversations/:conversationId/takeover',
    { preHandler: protect(PERMISSIONS.CONVERSATION_REPLY) },
    patientController.takeOver.bind(patientController));
  app.patch('/api/clinics/:clinicId/patients/:patientId/takeover',
    { preHandler: protect(PERMISSIONS.CONVERSATION_REPLY) },
    patientController.startHumanConversation.bind(patientController));
  app.patch('/api/clinics/:clinicId/conversations/:conversationId/return-to-shaden',
    { preHandler: protect(PERMISSIONS.CONVERSATION_REPLY) },
    patientController.returnToShaden.bind(patientController));
  app.post('/api/clinics/:clinicId/conversations/:conversationId/messages',
    { preHandler: protect(PERMISSIONS.CONVERSATION_REPLY) },
    patientController.sendHumanMessage.bind(patientController));

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
