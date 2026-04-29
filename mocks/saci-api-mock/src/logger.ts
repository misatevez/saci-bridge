import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
  },
  isProduction
    ? pino.destination()
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      }),
);
