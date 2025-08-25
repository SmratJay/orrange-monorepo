/**
 * Week 3 Day 3: Prometheus Metrics Collection
 * Enterprise monitoring with Prometheus metrics for production oversight
 */

import client from 'prom-client';
import { log } from '../utils/logger.js';

// Create a Registry to register metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register });

// Custom application metrics
export const metrics = {
  // HTTP request metrics
  httpRequestDuration: new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
  }),

  httpRequestsTotal: new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
  }),

  httpActiveConnections: new client.Gauge({
    name: 'http_active_connections',
    help: 'Number of active HTTP connections'
  }),

  // API-specific metrics
  tradesTotal: new client.Counter({
    name: 'trades_total',
    help: 'Total number of trades processed',
    labelNames: ['status', 'type']
  }),

  tradesValue: new client.Counter({
    name: 'trades_value_total',
    help: 'Total value of trades processed in ETH',
    labelNames: ['token', 'status']
  }),

  tradeProcessingDuration: new client.Histogram({
    name: 'trade_processing_duration_seconds',
    help: 'Duration of trade processing in seconds',
    labelNames: ['type', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
  }),

  // WebSocket metrics
  wsConnections: new client.Gauge({
    name: 'websocket_connections_active',
    help: 'Number of active WebSocket connections'
  }),

  wsMessagesTotal: new client.Counter({
    name: 'websocket_messages_total',
    help: 'Total number of WebSocket messages',
    labelNames: ['type', 'direction']
  }),

  // Database metrics
  dbConnections: new client.Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections'
  }),

  dbQueryDuration: new client.Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries in seconds',
    labelNames: ['query_type', 'table'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5]
  }),

  dbQueryTotal: new client.Counter({
    name: 'database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['query_type', 'table', 'status']
  }),

  // Blockchain metrics
  blockchainRequests: new client.Counter({
    name: 'blockchain_requests_total',
    help: 'Total number of blockchain RPC requests',
    labelNames: ['method', 'network', 'status']
  }),

  blockchainRequestDuration: new client.Histogram({
    name: 'blockchain_request_duration_seconds',
    help: 'Duration of blockchain RPC requests in seconds',
    labelNames: ['method', 'network'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
  }),

  contractEvents: new client.Counter({
    name: 'contract_events_total',
    help: 'Total number of smart contract events processed',
    labelNames: ['event_type', 'contract']
  }),

  // Security metrics
  authAttempts: new client.Counter({
    name: 'auth_attempts_total',
    help: 'Total number of authentication attempts',
    labelNames: ['method', 'status']
  }),

  rateLimitHits: new client.Counter({
    name: 'rate_limit_hits_total',
    help: 'Total number of rate limit violations',
    labelNames: ['endpoint', 'ip']
  }),

  securityEvents: new client.Counter({
    name: 'security_events_total',
    help: 'Total number of security events',
    labelNames: ['event_type', 'severity']
  }),

  // Application metrics
  applicationErrors: new client.Counter({
    name: 'application_errors_total',
    help: 'Total number of application errors',
    labelNames: ['error_type', 'severity']
  }),

  cacheHits: new client.Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_type', 'status']
  }),

  queueJobs: new client.Gauge({
    name: 'queue_jobs_active',
    help: 'Number of active queue jobs',
    labelNames: ['queue_name', 'status']
  })
};

// Register all custom metrics
Object.values(metrics).forEach(metric => {
  register.registerMetric(metric);
});

// Middleware to track HTTP metrics
export const metricsMiddleware = (req: any, res: any, next: any) => {
  const startTime = Date.now();
  
  // Track active connections
  metrics.httpActiveConnections.inc();
  
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    
    // Record metrics
    metrics.httpRequestDuration
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration);
      
    metrics.httpRequestsTotal
      .labels(req.method, route, res.statusCode.toString())
      .inc();
      
    metrics.httpActiveConnections.dec();
    
    // Log performance metrics
    log.performance.apiResponse(route, req.method, duration * 1000, res.statusCode, {
      correlationId: req.correlationId
    });
  });
  
  next();
};

// Database query tracking
export const trackDbQuery = (queryType: string, table: string, duration: number, success: boolean = true) => {
  metrics.dbQueryDuration
    .labels(queryType, table)
    .observe(duration / 1000);
    
  metrics.dbQueryTotal
    .labels(queryType, table, success ? 'success' : 'error')
    .inc();
};

// Blockchain request tracking
export const trackBlockchainRequest = (method: string, network: string, duration: number, success: boolean = true) => {
  metrics.blockchainRequestDuration
    .labels(method, network)
    .observe(duration / 1000);
    
  metrics.blockchainRequests
    .labels(method, network, success ? 'success' : 'error')
    .inc();
};

// Trade processing tracking
export const trackTrade = (type: string, status: string, value?: number, token?: string, duration?: number) => {
  metrics.tradesTotal
    .labels(status, type)
    .inc();
    
  if (value && token) {
    metrics.tradesValue
      .labels(token, status)
      .inc(value);
  }
  
  if (duration) {
    metrics.tradeProcessingDuration
      .labels(type, status)
      .observe(duration / 1000);
  }
};

// WebSocket tracking
export const trackWebSocket = (action: 'connect' | 'disconnect' | 'message', messageType?: string, direction?: 'inbound' | 'outbound') => {
  switch (action) {
    case 'connect':
      metrics.wsConnections.inc();
      break;
    case 'disconnect':
      metrics.wsConnections.dec();
      break;
    case 'message':
      if (messageType && direction) {
        metrics.wsMessagesTotal
          .labels(messageType, direction)
          .inc();
      }
      break;
  }
};

// Security event tracking
export const trackSecurityEvent = (eventType: string, severity: 'low' | 'medium' | 'high' | 'critical') => {
  metrics.securityEvents
    .labels(eventType, severity)
    .inc();
    
  log.security.apiAccess('security_event', 'SYSTEM', 'internal', 'system', {
    eventType,
    severity,
    timestamp: new Date().toISOString()
  });
};

// Application error tracking
export const trackError = (errorType: string, severity: 'low' | 'medium' | 'high' | 'critical') => {
  metrics.applicationErrors
    .labels(errorType, severity)
    .inc();
};

// Custom memory metrics - Create once to avoid duplicate registration
const memoryUsageGauge = new client.Gauge({
  name: 'process_memory_usage_bytes',
  help: 'Process memory usage in bytes',
  labelNames: ['type'],
  registers: [register]
});

// Memory usage tracking (called periodically)
export const trackMemoryUsage = () => {
  const memUsage = process.memoryUsage();
  
  memoryUsageGauge.labels('rss').set(memUsage.rss);
  memoryUsageGauge.labels('heap_total').set(memUsage.heapTotal);
  memoryUsageGauge.labels('heap_used').set(memUsage.heapUsed);
  memoryUsageGauge.labels('external').set(memUsage.external);
  
  log.performance.memoryUsage();
};

// Start periodic memory tracking
setInterval(trackMemoryUsage, 30000); // Every 30 seconds

// Export metrics endpoint handler
export const getMetrics = async (): Promise<string> => {
  return register.metrics();
};

// Health check metrics
export const healthMetrics = {
  lastCheck: new client.Gauge({
    name: 'health_check_timestamp',
    help: 'Timestamp of last health check',
    registers: [register]
  }),
  
  serviceStatus: new client.Gauge({
    name: 'service_health_status',
    help: 'Service health status (1 = healthy, 0 = unhealthy)',
    labelNames: ['service'],
    registers: [register]
  })
};

export const updateHealthMetrics = (services: { [key: string]: boolean }) => {
  healthMetrics.lastCheck.set(Date.now() / 1000);
  
  Object.entries(services).forEach(([service, healthy]) => {
    healthMetrics.serviceStatus.labels(service).set(healthy ? 1 : 0);
  });
};

log.info('Prometheus metrics system initialized', {
  registeredMetrics: Object.keys(metrics).length,
  defaultMetrics: true,
  memoryTracking: true
});

export { register };
