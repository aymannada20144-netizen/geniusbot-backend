const PatientRepository = require(
  '../modules/patients/PatientRepository'
);

const ClinicRepository = require(
  './ClinicRepository'
);

const DoctorRepository = require(
  './DoctorRepository'
);

const RoomRepository = require(
  './RoomRepository'
);

const ServiceRepository = require(
  './ServiceRepository'
);

const AppointmentRepository = require(
  '../modules/appointments/AppointmentRepository'
);

const ServiceAssignmentRepository = require(
  './ServiceAssignmentRepository'
);

function createRepositories(db) {
  return {
    patients: new PatientRepository(db),
    clinics: new ClinicRepository(db),
    doctors: new DoctorRepository(db),
    rooms: new RoomRepository(db),
    services: new ServiceRepository(db),
    appointments: new AppointmentRepository(db),
    serviceAssignments:
      new ServiceAssignmentRepository(db),
  };
}

module.exports = createRepositories;