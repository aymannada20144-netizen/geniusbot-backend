require('dotenv').config();

const db = require('../src/db/pool');
const createRepositories = require('../src/repositories');

async function run() {
  const repositories = createRepositories(db);

  const clinicId = '00000000-0000-0000-0000-000000000001';
  const patientId = '00000000-0000-0000-0000-000000002003';

  try {
    const appointment =
      await repositories.appointments.findUpcomingByPatient(
        clinicId,
        patientId
      );

    console.log('Upcoming appointment result:');
    console.log(JSON.stringify(appointment, null, 2));
  } catch (error) {
    console.error('Test failed:');
    console.error(error);
  } finally {
    await db.pool.end();
  }
}

run();