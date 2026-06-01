import pino from 'pino';
import { config } from './index';

export const logger = pino({
  level: config.logLevel,
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  ...(config.isProd && {
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
});
