/**
 * Week 3 Day 3: Production Server with Monitoring Integration
 * Enhanced server setup with comprehensive monitoring and logging
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { log, setupRequestLogging } from './utils/logger.js';
import { metricsMiddleware } from './utils/metrics.js';
import { 
  healthCheck, 
  detailedHealthCheck, 
  readinessCheck, 
  livenessCheck 
} from './routes/health-enhanced.js';
import { metricsEndpoint, metricsSummary } from './routes/metrics.js';
import { dashboardRoutes } from './routes/dashboard.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.ALLOWED_ORIGINS?.split(',') || []
    : true,
  credentials: true
}));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000, // requests per window
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    log.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path
    });
    
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: 15 * 60 * 1000,
      timestamp: new Date().toISOString()
    });
  }
});

app.use('/api/', limiter);

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Monitoring middleware setup
app.use(metricsMiddleware);
setupRequestLogging(app);

// Health check endpoints (no rate limiting for monitoring)
app.get('/health', healthCheck);
app.get('/health/detailed', detailedHealthCheck);
app.get('/ready', readinessCheck);
app.get('/live', livenessCheck);

// Metrics endpoints (no rate limiting for Prometheus)
app.get('/metrics', metricsEndpoint);
app.get('/metrics/summary', metricsSummary);

// Production dashboard endpoints
app.use('/api', dashboardRoutes);

// API routes
app.get('/api/status', (req, res) => {
  res.json({
    service: 'Orrange API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API placeholder routes (to be implemented)
app.get('/api/trades', (req, res) => {
  res.json({
    message: 'Trades endpoint - implementation pending',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/users', (req, res) => {
  res.json({
    message: 'Users endpoint - implementation pending',
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const correlationId = (req as any).correlationId || 'unknown';
  
  log.error('Unhandled API error', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    request: {
      method: req.method,
      path: req.path,
      correlationId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }
  });

  // Don't leak error details in production
  const errorResponse = {
    error: 'Internal server error',
    correlationId,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { 
      details: error.message,
      stack: error.stack 
    })
  };

  res.status(error.status || 500).json(errorResponse);
});

// 404 handler
app.use((req, res) => {
  log.warn('Route not found', {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
const gracefulShutdown = (signal: string) => {
  log.info(`${signal} received, starting graceful shutdown`);
  
  server.close((err) => {
    if (err) {
      log.error('Error during shutdown', { error: err.message });
      process.exit(1);
    }
    
    log.info('Server closed successfully');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Start server
const server = app.listen(PORT, () => {
  log.info('🚀 Week 3 Day 3: Production Server Started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    pid: process.pid,
    endpoints: {
      health: '/health',
      detailedHealth: '/health/detailed',
      readiness: '/ready',
      liveness: '/live',
      metrics: '/metrics',
      api: '/api/*'
    },
    features: [
      'Winston logging',
      'Prometheus metrics',
      'Rate limiting',
      'Security headers',
      'CORS protection',
      'Request compression',
      'Error tracking'
    ]
  });
  
  log.info('Monitoring infrastructure operational', {
    logging: 'Winston with daily rotation',
    metrics: 'Prometheus with custom application metrics',
    healthChecks: 'Kubernetes-compatible probes',
    security: 'Helmet security headers + rate limiting'
  });
});

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', { 
    error: error.message,
    stack: error.stack 
  });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled promise rejection', { 
    reason: String(reason),
    promise: String(promise)
  });
  gracefulShutdown('UNHANDLED_REJECTION');
});

export default app;
