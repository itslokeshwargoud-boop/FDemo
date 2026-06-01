import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps async route handlers to forward errors to Express error handler.
 * Eliminates repetitive try/catch in every controller method.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
