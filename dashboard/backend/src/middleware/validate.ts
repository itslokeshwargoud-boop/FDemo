import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from '../shared/errors';

type ValidationTarget = 'body' | 'query' | 'params';

export const validate = (schema: ZodSchema, target: ValidationTarget = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const message = result.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new ValidationError(message);
    }

    // Replace with parsed (and potentially transformed) data
    (req as any)[target] = result.data;
    next();
  };
};
