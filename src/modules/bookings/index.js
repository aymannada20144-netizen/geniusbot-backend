'use strict';

const createRepositories = require('../../repositories');

const BookingService = require('../../services/BookingService');
const AvailabilityService = require(
  '../../services/availability/AvailabilityService'
);

const BookingController = require('./BookingController');
const registerBookingRoutes = require('./BookingRoutes');

const {
  protect,
} = require('../../core/auth');

function register({ app, db }) {
  const repositories = createRepositories(db);

  const availabilityService =
    new AvailabilityService(repositories);

  const bookingService =
    new BookingService(
      repositories,
      availabilityService
    );

  const bookingController =
    new BookingController(
      bookingService
    );

  registerBookingRoutes(
    app,
    bookingController,
    protect
  );
}

module.exports = {
  register,
};