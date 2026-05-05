import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { getToken, stopTokenRefresh } from './auth.js';
import { startPoller, stopPoller } from './poller/index.js';
import { startReturnPoller, stopReturnPoller } from './return-poller.js';
import { closeFirmasPool } from './db/firmas.js';
import { closeLocalPool } from './db/local.js';

const app = createApp();

const server = app.listen(config.port, config.host, () => {
  logger.info(
    { host: config.host, port: config.port, env: config.nodeEnv },
    'saci-bridge listening',
  );
  if (config.nodeEnv !== 'test') {
    getToken()
      .then(() => {
        startPoller();
        startReturnPoller();
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Failed to obtain initial SaciERP token — poller not started');
      });
  }
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  stopPoller();
  stopReturnPoller();
  stopTokenRefresh();
  server.close(async (err) => {
    await Promise.all([closeFirmasPool(), closeLocalPool()]);
    if (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException — exiting');
  setTimeout(() => process.exit(1), 100).unref();
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection — exiting');
  setTimeout(() => process.exit(1), 100).unref();
});
