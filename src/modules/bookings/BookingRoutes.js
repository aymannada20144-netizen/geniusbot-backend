'use strict';

const {
  PERMISSIONS,
} = require('../../core/auth');

function bookingRoutes(
  app,
  bookingController,
  protect
) {
  if (!bookingController) {
    throw new Error(
      'bookingRoutes requires bookingController'
    );
  }

  if (typeof protect !== 'function') {
    throw new TypeError(
      'protect middleware is required.'
    );
  }

  app.post(
    '/api/bookings',
    {
      preHandler: protect(
        PERMISSIONS.APPOINTMENT_CREATE
      ),
    },
    bookingController.bookAppointment.bind(
      bookingController
    )
  );
}

module.exports = bookingRoutes;