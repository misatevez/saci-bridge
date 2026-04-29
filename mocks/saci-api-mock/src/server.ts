import 'dotenv/config';
import { createApp } from './app.js';
import { logger } from './logger.js';

const PORT = process.env.PORT || 9100;

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'SaciERP Mock API started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
