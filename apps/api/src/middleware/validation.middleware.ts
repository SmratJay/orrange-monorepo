import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Middleware factory to validate request data against a Zod schema
 */
export const validateRequest = (schema: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      if (schema.body) {
        const bodyResult = schema.body.safeParse(req.body);
        if (!bodyResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Invalid request body',
            errors: bodyResult.error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          });
        }
        req.body = bodyResult.data;
      }

      // Validate query parameters
      if (schema.query) {
        const queryResult = schema.query.safeParse(req.query);
        if (!queryResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Invalid query parameters',
            errors: queryResult.error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          });
        }
        req.query = queryResult.data;
      }

      // Validate route parameters
      if (schema.params) {
        const paramsResult = schema.params.safeParse(req.params);
        if (!paramsResult.success) {
          return res.status(400).json({
            success: false,
            message: 'Invalid route parameters',
            errors: paramsResult.error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            })),
          });
        }
        req.params = paramsResult.data;
      }

      next();
    } catch (error) {
      console.error('Validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal validation error',
      });
    }
  };
};
