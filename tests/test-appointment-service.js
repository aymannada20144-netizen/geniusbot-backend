const db = require('../src/db/pool');
const AppointmentRepository = require('../src/repositories/AppointmentRepository');
const AppointmentService = require('../src/services/AppointmentService');

(async () => {
    try {
        const patientId = '00000000-0000-0000-0000-000000002004';
const clinicId = '00000000-0000-0000-0000-000000000001';

const repository = new AppointmentRepository(db);
const service = new AppointmentService(repository);

const appointment = await service.getUpcomingAppointment(clinicId, patientId);

        console.log('==============================');

        if (!appointment) {
            console.log('No upcoming appointment.');
        } else {
            console.log(appointment);
        }

        console.log('==============================');
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
})();