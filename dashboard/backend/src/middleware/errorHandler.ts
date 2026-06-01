import { Request, Response, NextFunction } from 'express';
import { AppError } from '../shared/errors';
import { sendError } from '../shared/utils/response';
import { logger } from '../config/logger';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    logger.warn({ err, code: err.code, statusCode: err.statusCode }, err.message);
    sendError(res, err.message, err.code, err.statusCode);
    return;
  }

  // Prisma known errors
  if (err.constructor?.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      sendError(res, 'A record with this value already exists', 'CONFLICT', 409);
      return;
    }
    if (prismaErr.code === 'P2025') {
      sendError(res, 'Record not found', 'NOT_FOUND', 404);
      return;
    }
  }

  // Zod validation errors
  if (err.constructor?.name === 'ZodError') {
    const zodErr = err as any;
    const message = zodErr.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
    sendError(res, message || 'Validation failed', 'VALIDATION_ERROR', 400);
    return;
  }

  // Unexpected errors
  logger.error({ err }, 'Unhandled error');
  sendError(
    res,
    process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    'INTERNAL_ERROR',
    500
  );
};
