const db = require('../src/db/pool');
const AppointmentRepository = require('../src/repositories/AppointmentRepository');
const AppointmentService = require('../src/services/AppointmentService');

async function run() {
    try {
        const repository = new AppointmentRepository(db);
        const service = new AppointmentService(repository);

        const result = await service.cancelAppointment(
            '00000000-0000-0000-0000-000000000001', // clinicId
            '00000000-0000-0000-0000-000000002303', // appointmentId
            'Cancelled from Service Test'
        );

        console.log('✅ Appointment cancelled successfully');
        console.log(result);

    } catch (error) {
        console.error('❌ Test failed');
        console.error(error.message);
    } finally {
        process.exit();
    }
}

run();