// Health Check and Monitoring Routes
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import os from 'os';

const prisma = new PrismaClient();

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    database: {
      status: 'connected' | 'disconnected';
      responseTime?: number;
    };
    redis: {
      status: 'connected' | 'disconnected';
      responseTime?: number;
    };
    blockchain: {
      status: 'connected' | 'disconnected';
      responseTime?: number;
      chainId?: number;
      blockNumber?: number;
    };
  };
  system: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
}

export default async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/health', {
    schema: {
      description: 'Basic health check endpoint',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString()
    };
  });

  // Detailed health check with service status
  fastify.get('/health/detailed', {
    schema: {
      description: 'Detailed health check with service status',
      tags: ['Health'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            uptime: { type: 'number' },
            environment: { type: 'string' },
            services: { type: 'object' },
            system: { type: 'object' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply): Promise<HealthStatus> => {
    const startTime = Date.now();
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    // Database health check
    const databaseHealth = await checkDatabaseHealth();
    
    // Redis health check (if configured)
    const redisHealth = await checkRedisHealth();
    
    // Blockchain health check
    const blockchainHealth = await checkBlockchainHealth();

    // System metrics
    const memoryUsage = process.memoryUsage();
    const totalMemory = os.totalmem();
    const memoryPercentage = (memoryUsage.rss / totalMemory) * 100;

    // Determine overall status
    if (databaseHealth.status === 'disconnected' || 
        blockchainHealth.status === 'disconnected') {
      overallStatus = 'unhealthy';
    } else if (memoryPercentage > 90) {
      overallStatus = 'degraded';
    }

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: databaseHealth,
        redis: redisHealth,
        blockchain: blockchainHealth
      },
      system: {
        memory: {
          used: memoryUsage.rss,
          total: totalMemory,
          percentage: Math.round(memoryPercentage * 100) / 100
        },
        cpu: {
          usage: os.loadavg()[0] // 1-minute load average
        }
      }
    };

    // Set appropriate HTTP status code
    if (overallStatus === 'unhealthy') {
      reply.status(503);
    } else if (overallStatus === 'degraded') {
      reply.status(200); // Still operational
    }

    return healthStatus;
  });

  // Readiness probe (for Kubernetes)
  fastify.get('/ready', {
    schema: {
      description: 'Readiness probe for container orchestration',
      tags: ['Health']
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check critical dependencies
      await checkDatabaseHealth();
      
      return { status: 'ready', timestamp: new Date().toISOString() };
    } catch (error) {
      reply.status(503);
      return { 
        status: 'not-ready', 
        timestamp: new Date().toISOString(),
        error: 'Database connection failed'
      };
    }
  });

  // Liveness probe (for Kubernetes)
  fastify.get('/live', {
    schema: {
      description: 'Liveness probe for container orchestration',
      tags: ['Health']
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    return { 
      status: 'alive', 
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime()
    };
  });

  // Metrics endpoint (Prometheus format)
  fastify.get('/metrics', {
    schema: {
      description: 'Prometheus metrics endpoint',
      tags: ['Monitoring'],
      response: {
        200: {
          type: 'string',
          description: 'Prometheus metrics in text format'
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await generatePrometheusMetrics();
    reply.type('text/plain; version=0.0.4; charset=utf-8');
    return metrics;
  });
}

// Helper function to check database health
async function checkDatabaseHealth() {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: 'connected' as const,
      responseTime: Date.now() - startTime
    };
  } catch (error) {
    return {
      status: 'disconnected' as const,
      responseTime: Date.now() - startTime
    };
  }
}

// Helper function to check Redis health
async function checkRedisHealth() {
  const startTime = Date.now();
  // TODO: Implement Redis health check when Redis client is available
  return {
    status: 'connected' as const,
    responseTime: Date.now() - startTime
  };
}

// Helper function to check blockchain health
async function checkBlockchainHealth() {
  const startTime = Date.now();
  try {
    // TODO: Implement blockchain health check using ethers provider
    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
    if (!rpcUrl) {
      return { status: 'disconnected' as const };
    }
    
    // Simulate blockchain check for now
    return {
      status: 'connected' as const,
      responseTime: Date.now() - startTime,
      chainId: parseInt(process.env.CHAIN_ID || '1337'),
      blockNumber: 12345 // TODO: Get actual block number
    };
  } catch (error) {
    return {
      status: 'disconnected' as const,
      responseTime: Date.now() - startTime
    };
  }
}

// Helper function to generate Prometheus metrics
async function generatePrometheusMetrics(): Promise<string> {
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  const metrics = [
    '# HELP nodejs_memory_usage_bytes Node.js memory usage in bytes',
    '# TYPE nodejs_memory_usage_bytes gauge',
    `nodejs_memory_usage_bytes{type="rss"} ${memoryUsage.rss}`,
    `nodejs_memory_usage_bytes{type="heapTotal"} ${memoryUsage.heapTotal}`,
    `nodejs_memory_usage_bytes{type="heapUsed"} ${memoryUsage.heapUsed}`,
    `nodejs_memory_usage_bytes{type="external"} ${memoryUsage.external}`,
    '',
    '# HELP nodejs_uptime_seconds Node.js uptime in seconds',
    '# TYPE nodejs_uptime_seconds gauge',
    `nodejs_uptime_seconds ${uptime}`,
    '',
    '# HELP orrange_api_info API information',
    '# TYPE orrange_api_info gauge',
    `orrange_api_info{version="${process.env.npm_package_version || '1.0.0'}",environment="${process.env.NODE_ENV || 'development'}"} 1`,
    ''
  ];

  return metrics.join('\n');
}
