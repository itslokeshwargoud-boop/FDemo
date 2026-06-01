import { app } from './app';
import { config } from './config';
import { logger } from './config/logger';
import { prisma } from './config/database';

const server = app.listen(config.port, () => {
  logger.info(`🚀 Server running on port ${config.port} (${config.nodeEnv})`);
});

// --- Graceful Shutdown ---
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (err) {
      logger.error({ err }, 'Error disconnecting database');
    }

    process.exit(0);
  });

  // Force shutdown after 30s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// --- Uncaught error handlers ---
process.on('unhandledRejection', (reason: Error) => {
  logger.error({ err: reason }, 'Unhandled Rejection');
});

process.on('uncaughtException', (error: Error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  gracefulShutdown('uncaughtException');
});
