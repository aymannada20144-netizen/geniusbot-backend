const pool = require('./src/db/pool');
const RoomRepository = require(
  './src/repositories/RoomRepository'
);

async function run() {
  const roomRepository = new RoomRepository(pool);

  const roomId =
    'f49e49a1-bbd3-4eb3-930c-2c3a93e87d50';

  try {
    const room =
      await roomRepository.findActiveById(roomId);

    console.log('ROOM REPOSITORY RESULT:', room);
  } catch (error) {
    console.error('ROOM REPOSITORY ERROR:', error);
  } finally {
   
  }
}

run();