'use strict';

const PatientRepository = require('./PatientRepository');
const PatientService = require('./PatientService');
const PatientController = require('./PatientController');
const registerPatientRoutes = require('./PatientRoutes');

const {
  protect,
} = require('../../core/auth');

function register({ app, db }) {
  const patientRepository =
    new PatientRepository(db);

  const patientService =
    new PatientService(patientRepository);

  const patientController =
    new PatientController(patientService);

  registerPatientRoutes(
    app,
    patientController,
    protect
  );
}

module.exports = {
  register,
};