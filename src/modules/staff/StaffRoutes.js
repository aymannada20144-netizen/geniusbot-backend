'use strict';

const {
  PERMISSIONS,
} = require('../../core/auth');

function registerStaffRoutes(
  app,
  staffController,
  protect,
  authenticate
) {
  if (!app) {
    throw new TypeError('app is required.');
  }

  if (!staffController) {
    throw new TypeError(
      'staffController is required.'
    );
  }

  if (typeof protect !== 'function') {
    throw new TypeError(
      'protect middleware is required.'
    );
  }

  if (typeof authenticate !== 'function') {
    throw new TypeError('authenticate middleware is required.');
  }

  app.post(
    '/api/auth/staff/login',
    staffController.login
  );

  app.post(
    '/api/auth/change-password',
    { preHandler: authenticate },
    staffController.changeOwnPassword
  );

  app.get(
    '/api/clinics/:clinicId/staff',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_VIEW
      ),
    },
    staffController.list
  );

  app.post(
    '/api/clinics/:clinicId/staff',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_CREATE
      ),
    },
    staffController.create
  );

  app.post(
    '/api/clinics/:clinicId/staff/ownership-transfer',
    {
      preHandler: protect(
        PERMISSIONS.CLINIC_TRANSFER_OWNERSHIP
      ),
    },
    staffController.transferOwnership
  );

  app.get(
    '/api/clinics/:clinicId/staff/:staffId',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_VIEW
      ),
    },
    staffController.getById
  );

  app.patch(
    '/api/clinics/:clinicId/staff/:staffId',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_UPDATE
      ),
    },
    staffController.update
  );

  app.patch(
    '/api/clinics/:clinicId/staff/:staffId/role',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_CHANGE_ROLE
      ),
    },
    staffController.changeRole
  );

  app.patch(
    '/api/clinics/:clinicId/staff/:staffId/status',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_DISABLE
      ),
    },
    staffController.setActiveStatus
  );

  app.delete(
    '/api/clinics/:clinicId/staff/:staffId',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_DISABLE
      ),
    },
    staffController.remove
  );

  app.post(
    '/api/clinics/:clinicId/staff/:staffId/reset-password',
    {
      preHandler: protect(
        PERMISSIONS.STAFF_UPDATE
      ),
    },
    staffController.resetPassword
  );
}

module.exports = registerStaffRoutes;
