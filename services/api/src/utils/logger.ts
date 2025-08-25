/**
 * Week 3 Day 3: Production Logging System
 * Enterprise-grade Winston configuration for structured logging
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Log levels hierarchy
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Custom log format with structured JSON
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const logEntry: any = {
      timestamp,
      level: level.toUpperCase(),
      message,
      environment: process.env.NODE_ENV || 'development',
      service: 'orrange-api',
      version: process.env.npm_package_version || '1.0.0',
      processId: process.pid,
      hostname: os.hostname(),
      ...meta
    };

    if (stack) {
      logEntry.stack = stack;
    }

    return JSON.stringify(logEntry, null, 2);
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `[${timestamp}] ${level}: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
fs.mkdirSync(logsDir, { recursive: true });

// Daily rotate file transports
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, '%DATE%-combined.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
  zippedArchive: true
});

const errorRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, '%DATE%-error.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'error',
  format: logFormat,
  zippedArchive: true
});

// Security audit log transport
const securityRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, '%DATE%-security.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '90d',
  format: logFormat,
  zippedArchive: true
});

// Create logger instance
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'orrange-api',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // File transports
    fileRotateTransport,
    errorRotateTransport,
    
    // Console transport for development
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: consoleFormat
      })
    ] : []),

    // Production console transport (structured JSON)
    ...(process.env.NODE_ENV === 'production' ? [
      new winston.transports.Console({
        format: logFormat
      })
    ] : [])
  ],
  exitOnError: false
});

// Security logger for audit trails
const securityLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: { 
    service: 'orrange-api-security',
    auditType: 'security'
  },
  transports: [
    securityRotateTransport,
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: consoleFormat
      })
    ] : [])
  ]
});

// Performance logger for monitoring
const performanceLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'orrange-api-performance',
    category: 'metrics'
  },
  transports: [
    new DailyRotateFile({
      filename: path.join(logsDir, '%DATE%-performance.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '7d',
      zippedArchive: true
    })
  ]
});

// Structured logging functions
export const log = {
  // Standard logging
  error: (message: string, meta: object = {}) => logger.error(message, meta),
  warn: (message: string, meta: object = {}) => logger.warn(message, meta),
  info: (message: string, meta: object = {}) => logger.info(message, meta),
  http: (message: string, meta: object = {}) => logger.http(message, meta),
  debug: (message: string, meta: object = {}) => logger.debug(message, meta),

  // Security audit logging
  security: {
    login: (userId: string, ip: string, success: boolean, meta: object = {}) => {
      securityLogger.info('User login attempt', {
        userId,
        ip,
        success,
        action: 'login',
        ...meta
      });
    },
    
    apiAccess: (endpoint: string, method: string, ip: string, userId?: string, meta: object = {}) => {
      securityLogger.info('API access', {
        endpoint,
        method,
        ip,
        userId,
        action: 'api_access',
        ...meta
      });
    },
    
    tradeAction: (tradeId: string, action: string, userId: string, ip: string, meta: object = {}) => {
      securityLogger.info('Trade action', {
        tradeId,
        action,
        userId,
        ip,
        category: 'trade_security',
        ...meta
      });
    },

    blockchainEvent: (eventType: string, contractAddress: string, txHash: string, meta: object = {}) => {
      securityLogger.info('Blockchain event', {
        eventType,
        contractAddress,
        txHash,
        category: 'blockchain_security',
        ...meta
      });
    }
  },

  // Performance monitoring
  performance: {
    apiResponse: (endpoint: string, method: string, responseTime: number, statusCode: number, meta: object = {}) => {
      performanceLogger.info('API response metrics', {
        endpoint,
        method,
        responseTime,
        statusCode,
        category: 'api_performance',
        ...meta
      });
    },

    dbQuery: (query: string, duration: number, recordCount?: number, meta: object = {}) => {
      performanceLogger.info('Database query performance', {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        duration,
        recordCount,
        category: 'db_performance',
        ...meta
      });
    },

    wsConnection: (action: string, connectionCount: number, meta: object = {}) => {
      performanceLogger.info('WebSocket metrics', {
        action,
        connectionCount,
        category: 'ws_performance',
        ...meta
      });
    },

    memoryUsage: () => {
      const memUsage = process.memoryUsage();
      performanceLogger.info('Memory usage metrics', {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        category: 'memory_performance'
      });
    }
  }
};

// Error handling for logger
logger.on('error', (error) => {
  console.error('Logger error:', error);
});

fileRotateTransport.on('error', (error) => {
  console.error('File transport error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down logger gracefully');
  logger.end();
});

export default logger;

// Export setupRequestLogging function
export { setupRequestLogging } from '../middleware/logging.js';
