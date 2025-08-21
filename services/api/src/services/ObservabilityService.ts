// Production-Grade Observability Service for Orrange P2P
import { PrometheusMetrics } from './metrics';

export interface LogContext {
  userId?: string;
  tradeId?: string;
  walletAddress?: string;
  action?: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
}

export class ObservabilityService {
  private metrics: PrometheusMetrics;

  constructor() {
    // TODO: Initialize Sentry when added to dependencies
    // TODO: Initialize Pino when added to dependencies
    this.metrics = new PrometheusMetrics();
  }

  // Security event logging
  logSecurityEvent(event: 'AUTH_FAILURE' | 'SUSPICIOUS_ACTIVITY' | 'RATE_LIMIT_HIT' | 'ADMIN_ACTION', context: LogContext, details?: any) {
    console.warn(`[SECURITY] ${event}`, { ...context, details, timestamp: new Date().toISOString() });
    this.metrics.incrementSecurityEvent(event);
  }

  // Trade activity logging
  logTradeActivity(action: 'CREATE' | 'ACCEPT' | 'COMPLETE' | 'DISPUTE' | 'CANCEL', tradeId: string, context: LogContext) {
    console.info(`[TRADE] ${action} - ${tradeId}`, { ...context, timestamp: new Date().toISOString() });
    this.metrics.incrementTradeEvent(action);
  }

  // API performance logging
  logApiCall(method: string, path: string, statusCode: number, responseTime: number, context: LogContext) {
    const logLevel = statusCode >= 400 ? 'warn' : 'info';
    console[logLevel](`[API] ${method} ${path} - ${statusCode} (${responseTime}ms)`, { ...context });
    this.metrics.recordApiCall(method, path, statusCode, responseTime);
  }

  // Error logging with context
  logError(error: Error, context: LogContext, extra?: any) {
    console.error(`[ERROR] ${error.name}: ${error.message}`, { ...context, stack: error.stack, extra });
    this.metrics.incrementError(error.name);
  }

  // Critical business logic logging
  logBusinessEvent(event: 'USER_SIGNUP' | 'KYC_COMPLETE' | 'LARGE_TRADE' | 'DISPUTE_RESOLVED', context: LogContext, data?: any) {
    console.info(`[BUSINESS] ${event}`, { ...context, data, timestamp: new Date().toISOString() });
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
