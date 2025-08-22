// Production-Grade Observability Service for Orrange P2P
import { PrometheusMetrics } from './metrics';
// TODO: Add pino and @sentry/node to dependencies for production
// import pino from 'pino';
// import * as Sentry from '@sentry/node';

export interface LogContext {
  userId?: string;
  tradeId?: string;
  walletAddress?: string;
  action?: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'suspicious_activity' | 'data_breach' | 'rate_limit';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  context?: LogContext;
}

export class ObservabilityService {
  private metrics: PrometheusMetrics;
  private isProduction: boolean;

  constructor() {
    this.isProduction = process.env.NODE_ENV === 'production';
    this.metrics = new PrometheusMetrics();
    
    // TODO: Initialize production logging and error tracking
    // this.initializeProductionObservability();
  }

  // Security event logging with enhanced context
  logSecurityEvent(event: SecurityEvent) {
    const logData = {
      ...event.context,
      securityEventType: event.type,
      severity: event.severity,
      description: event.description,
      timestamp: new Date().toISOString()
    };

    if (event.severity === 'critical' || event.severity === 'high') {
      console.error(`🚨 [SECURITY-${event.severity.toUpperCase()}] ${event.description}`, logData);
    } else {
      console.warn(`⚠️ [SECURITY-${event.severity.toUpperCase()}] ${event.description}`, logData);
    }
    
    this.metrics.incrementSecurityEvent(event.type);
  }

  // Trade activity logging
  logTradeActivity(action: string, tradeId: string, context: LogContext) {
    console.info(`[TRADE] ${action} - ${tradeId}`, { 
      ...context, 
      tradeId,
      action,
      timestamp: new Date().toISOString() 
    });
    this.metrics.incrementTradeEvent(action);
  }

  // API performance logging
  logApiCall(method: string, path: string, statusCode: number, responseTime: number, context: LogContext) {
    const logLevel = statusCode >= 400 ? 'warn' : 'info';
    console[logLevel](`[API] ${method} ${path} - ${statusCode} (${responseTime}ms)`, { 
      ...context,
      method,
      path,
      statusCode,
      responseTime
    });
    this.metrics.recordApiCall(method, path, statusCode, responseTime);
  }

  // Error logging with context
  logError(error: Error, context: LogContext, extra?: any) {
    console.error(`[ERROR] ${error.name}: ${error.message}`, { 
      ...context, 
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack, 
      extra 
    });
    this.metrics.incrementError(error.name);
  }

  // Critical business logic logging
  logBusinessEvent(event: string, context: LogContext, data?: any) {
    console.info(`[BUSINESS] ${event}`, { 
      ...context, 
      businessEvent: event,
      data, 
      timestamp: new Date().toISOString() 
    });
    this.metrics.incrementBusinessEvent(event);
  }

  // Get metrics endpoint data
  getMetrics(): string {
    return this.metrics.getMetricsString();
  }

  // Health check logging
  logHealthCheck(component: string, status: 'healthy' | 'unhealthy', responseTime?: number, error?: Error) {
    const logLevel = status === 'healthy' ? 'debug' : 'error';
    console[logLevel](`[HEALTH] ${component}: ${status}`, { responseTime, error: error?.message });
    this.metrics.recordHealthCheck(component, status, responseTime);
  }
}
