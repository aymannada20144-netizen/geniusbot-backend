const env = require('./config/env');
const buildApp = require('./app');
async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      host: '0.0.0.0',
      port: env.port
    });

    console.log(`🚀 GeniusBot running on port ${env.port}`);
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
