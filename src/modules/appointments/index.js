'use strict';

const AppointmentRepository = require('./AppointmentRepository');
const AppointmentService = require('./AppointmentService');
const AppointmentController = require('./AppointmentController');
const registerAppointmentRoutes = require('./AppointmentRoutes');

const {
  protect,
} = require('../../core/auth');

function register({ app, db, appointmentService = null }) {
  const service = appointmentService ||
    new AppointmentService(
      new AppointmentRepository(db)
    );

  const controller =
    new AppointmentController(service);

  registerAppointmentRoutes(
    app,
    controller,
    protect
  );
}

module.exports = {
  register,
};
