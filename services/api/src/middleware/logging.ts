/**
 * Week 3 Day 3: Express Logging Middleware
 * Integrates Winston logger with Express for request/response monitoring
 */

import { Request, Response, NextFunction } from 'express';
import { log } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

// Extend Express Request to include correlation ID
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      startTime: number;
    }
  }
}

// Request correlation middleware
export const correlationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  req.correlationId = req.headers['x-correlation-id'] as string || uuidv4();
  req.startTime = Date.now();
  
  // Add correlation ID to response headers
  res.setHeader('x-correlation-id', req.correlationId);
  
  next();
};

// Security logging middleware
export const securityLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';
  const userId = (req as any).user?.id || null;

  // Log API access for security audit
  log.security.apiAccess(req.path, req.method, clientIP, userId, {
    correlationId: req.correlationId,
    userAgent,
    query: req.query,
    headers: {
      authorization: req.headers.authorization ? '[REDACTED]' : undefined,
      'content-type': req.headers['content-type']
    }
  });

  next();
};

// Performance logging middleware
export const performanceLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const originalSend = res.send;
  
  res.send = function(body: any) {
    const responseTime = Date.now() - req.startTime;
    const statusCode = res.statusCode;
    
    // Log performance metrics
    log.performance.apiResponse(req.path, req.method, responseTime, statusCode, {
      correlationId: req.correlationId,
      contentLength: res.get('Content-Length'),
      userId: (req as any).user?.id || null
    });

    // Log slow requests (> 1000ms) as warnings
    if (responseTime > 1000) {
      log.warn('Slow API response detected', {
        endpoint: req.path,
        method: req.method,
        responseTime,
        statusCode,
        correlationId: req.correlationId
      });
    }

    // Log errors
    if (statusCode >= 400) {
      const logLevel = statusCode >= 500 ? 'error' : 'warn';
      log[logLevel]('API error response', {
        endpoint: req.path,
        method: req.method,
        statusCode,
        responseTime,
        correlationId: req.correlationId,
        body: statusCode >= 500 ? body : '[REDACTED]'
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

// Error logging middleware
export const errorLoggingMiddleware = (error: any, req: Request, res: Response, next: NextFunction) => {
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  const userId = (req as any).user?.id || null;

  log.error('Unhandled API error', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      clientIP,
      userId,
      correlationId: req.correlationId,
      userAgent: req.get('User-Agent')
    }
  });

  next(error);
};

// Combined logging middleware setup
export const setupRequestLogging = (app: any) => {
  // Add correlation ID to all requests
  app.use(correlationMiddleware);
  
  // Security audit logging
  app.use(securityLoggingMiddleware);
  
  // Performance monitoring
  app.use(performanceLoggingMiddleware);
  
  // Error logging (should be added after routes)
  // app.use(errorLoggingMiddleware);
  
  log.info('Request logging middleware configured', {
    middleware: [
      'correlationMiddleware',
      'securityLoggingMiddleware', 
      'performanceLoggingMiddleware'
    ]
  });
};
