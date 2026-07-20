'use strict';

const {
  ForbiddenError,
} = require('../errors');

const {
  isPlatformAdmin,
} = require('./roles');

async function enforceClinicScope(request) {
  const actor = request.user;
  const clinicId = request.params?.clinicId;

  if (!actor || typeof actor !== 'object') {
    throw new ForbiddenError(
      'Authenticated staff identity is required.'
    );
  }

  /*
   * بعض المسارات المحمية ليست مرتبطة بمعامل clinicId،
   * مثل POST /api/bookings.
   * في هذه الحالة لا يطبق هذا الـmiddleware فحص النطاق.
   */
  if (
    typeof clinicId !== 'string' ||
    clinicId.trim().length === 0
  ) {
    return;
  }

  if (isPlatformAdmin(actor.role)) {
    return;
  }

  if (
    typeof actor.clinicId !== 'string' ||
    actor.clinicId.trim().length === 0
  ) {
    throw new ForbiddenError(
      'Authenticated staff clinic is required.'
    );
  }

  if (actor.clinicId !== clinicId) {
    throw new ForbiddenError(
      'You cannot access another clinic.'
    );
  }
}

module.exports = enforceClinicScope;