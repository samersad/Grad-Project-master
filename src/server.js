const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { connectDatabase } = require('./config/database');

let server;

async function bootstrap() {
  await connectDatabase();
  server = app.listen(env.port, () => logger.info(`SOKON API running on port ${env.port}`));
}

bootstrap().catch((error) => {
  logger.error({ error }, 'Failed to start server');
  process.exit(1);
});

function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully.`);
  if (server) server.close(() => process.exit(0));
  else process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});
