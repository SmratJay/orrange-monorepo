/**
 * Week 3 Day 3: Enhanced Health Check System
 * Comprehensive health monitoring with detailed service status
 */

import { Request, Response } from 'express';
import { log } from '../utils/logger.js';
import { updateHealthMetrics } from '../utils/metrics.js';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    blockchain: ServiceHealth;
    websocket: ServiceHealth;
  };
  metrics: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    activeConnections: number;
    totalRequests: number;
    errorRate: number;
  };
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: string;
  error?: string;
}

// Database health check
async function checkDatabaseHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    // This should be replaced with actual database connection test
    // For now, simulate a database check
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate DB query
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString()
    };
  } catch (error: any) {
    log.error('Database health check failed', { error: error.message });
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

// Redis health check
async function checkRedisHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    // This should be replaced with actual Redis connection test
    // For now, simulate a Redis check
    await new Promise(resolve => setTimeout(resolve, 5)); // Simulate Redis ping
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString()
    };
  } catch (error: any) {
    log.error('Redis health check failed', { error: error.message });
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

// Blockchain health check
async function checkBlockchainHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    // This should be replaced with actual blockchain RPC call
    // For now, simulate a blockchain check
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate RPC call
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString()
    };
  } catch (error: any) {
    log.error('Blockchain health check failed', { error: error.message });
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

// WebSocket health check
async function checkWebSocketHealth(): Promise<ServiceHealth> {
  const startTime = Date.now();
  
  try {
    // Check WebSocket server status
    // For now, simulate WebSocket check
    await new Promise(resolve => setTimeout(resolve, 5));
    
    return {
      status: 'healthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString()
    };
  } catch (error: any) {
    log.error('WebSocket health check failed', { error: error.message });
    
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      lastCheck: new Date().toISOString(),
      error: error.message
    };
  }
}

// Get system metrics
function getSystemMetrics() {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    memoryUsage,
    cpuUsage,
    activeConnections: 0, // This should be tracked from middleware
    totalRequests: 0, // This should be tracked from metrics
    errorRate: 0.0 // This should be calculated from metrics
  };
}

// Determine overall health status
function determineOverallStatus(services: HealthStatus['services']): 'healthy' | 'degraded' | 'unhealthy' {
  const statuses = Object.values(services).map(service => service.status);
  
  if (statuses.every(status => status === 'healthy')) {
    return 'healthy';
  } else if (statuses.some(status => status === 'unhealthy')) {
    return 'unhealthy';
  } else {
    return 'degraded';
  }
}

// Basic health endpoint
export const healthCheck = async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    
    const basicHealth = {
      status: 'healthy',
      timestamp,
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    };
    
    res.status(200).json(basicHealth);
    
    log.info('Health check performed', {
      status: 'healthy',
      uptime,
      endpoint: '/health'
    });
  } catch (error: any) {
    log.error('Health check failed', { error: error.message });
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Detailed health endpoint
export const detailedHealthCheck = async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    
    // Run all health checks in parallel
    const [database, redis, blockchain, websocket] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      checkBlockchainHealth(),
      checkWebSocketHealth()
    ]);
    
    const services = { database, redis, blockchain, websocket };
    const overallStatus = determineOverallStatus(services);
    const metrics = getSystemMetrics();
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp,
      uptime,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services,
      metrics
    };
    
    // Update Prometheus metrics
    const serviceHealthMap = {
      database: services.database.status === 'healthy',
      redis: services.redis.status === 'healthy',
      blockchain: services.blockchain.status === 'healthy',
      websocket: services.websocket.status === 'healthy'
    };
    
    updateHealthMetrics(serviceHealthMap);
    
    // Determine HTTP status code
    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
    
    log.info('Detailed health check performed', {
      overallStatus,
      services: Object.entries(services).reduce((acc, [name, service]) => {
        acc[name] = service.status;
        return acc;
      }, {} as Record<string, string>),
      endpoint: '/health/detailed'
    });
  } catch (error: any) {
    log.error('Detailed health check failed', { error: error.message });
    res.status(503).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Kubernetes readiness probe
export const readinessCheck = async (req: Request, res: Response) => {
  try {
    // Check critical services for readiness
    const [database, blockchain] = await Promise.all([
      checkDatabaseHealth(),
      checkBlockchainHealth()
    ]);
    
    const isReady = database.status === 'healthy' && blockchain.status === 'healthy';
    
    if (isReady) {
      res.status(200).json({ 
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({ 
        status: 'not ready',
        services: {
          database: database.status,
          blockchain: blockchain.status
        },
        timestamp: new Date().toISOString()
      });
    }
    
    log.info('Readiness check performed', {
      ready: isReady,
      database: database.status,
      blockchain: blockchain.status,
      endpoint: '/ready'
    });
  } catch (error: any) {
    log.error('Readiness check failed', { error: error.message });
    res.status(503).json({ 
      status: 'not ready', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Kubernetes liveness probe
export const livenessCheck = async (req: Request, res: Response) => {
  try {
    // Simple liveness check - just verify the process is responsive
    const timestamp = new Date().toISOString();
    const uptime = process.uptime();
    
    res.status(200).json({ 
      status: 'alive',
      timestamp,
      uptime
    });
    
    log.debug('Liveness check performed', {
      uptime,
      endpoint: '/live'
    });
  } catch (error: any) {
    log.error('Liveness check failed', { error: error.message });
    res.status(503).json({ 
      status: 'dead', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

log.info('Enhanced health check system initialized', {
  endpoints: ['/health', '/health/detailed', '/ready', '/live'],
  services: ['database', 'redis', 'blockchain', 'websocket']
});
