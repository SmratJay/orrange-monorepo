// Production-Ready Orrange P2P API Server with Full Database Integration
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRedis from '@fastify/redis';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import { dbManager } from './database/manager.js';
import dotenv from 'dotenv';

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
    dbManager: typeof dbManager;
  }
}

// Load environment variables
dotenv.config();

// Create Fastify instance with enhanced configuration
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
  trustProxy: true,
  disableRequestLogging: process.env.NODE_ENV === 'production',
  bodyLimit: 1024 * 1024, // 1MB
});

// Global error handler
fastify.setErrorHandler(async (error: any, request: FastifyRequest, reply: FastifyReply) => {
  const statusCode = error.statusCode || 500;
  
  // Log error details
  fastify.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      statusCode,
    },
    request: {
      method: request.method,
      url: request.url,
      headers: request.headers,
    },
  }, 'Request error');

  // Return error response
  return reply.code(statusCode).send({
    error: {
      message: statusCode === 500 ? 'Internal Server Error' : error.message,
      code: error.code || 'UNKNOWN_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
    timestamp: new Date().toISOString(),
  });
});

async function buildServer(): Promise<FastifyInstance> {
  try {
    // Security plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    });

    // CORS configuration
    await fastify.register(cors, {
      origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });

    // Rate limiting
    await fastify.register(rateLimit, {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
      redis: dbManager.cache,
      keyGenerator: (request) => {
        return request.headers['x-forwarded-for'] as string || 
               request.headers['x-real-ip'] as string ||
               request.ip;
      },
    });

    // JWT authentication
    await fastify.register(fastifyJwt, {
      secret: process.env.JWT_SECRET!,
      sign: {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
      },
    });

    // Redis integration
    await fastify.register(fastifyRedis, {
      client: dbManager.cache,
    });

    // File upload support
    await fastify.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    });

    // WebSocket support
    await fastify.register(websocket, {
      options: {
        maxPayload: 1024 * 1024, // 1MB
        verifyClient: (info) => {
          // Add WebSocket authentication here
          return true;
        },
      },
    });

    // API Documentation
    await fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Orrange P2P Trading API',
          description: 'Peer-to-peer cryptocurrency trading platform API',
          version: '1.0.0',
        },
        host: `localhost:${process.env.PORT || 8080}`,
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'Authentication', description: 'User authentication endpoints' },
          { name: 'Orders', description: 'Trading order management' },
          { name: 'Trades', description: 'Trade execution and tracking' },
          { name: 'Users', description: 'User profile management' },
          { name: 'Disputes', description: 'Dispute resolution system' },
          { name: 'Admin', description: 'Administrative endpoints' },
        ],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
          },
        },
      },
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
      staticCSP: true,
      transformSpecificationClone: true,
    });

    // Decorate fastify with database managers
    fastify.decorate('db', dbManager.db);
    fastify.decorate('dbManager', dbManager);

    // Health check endpoint
    fastify.get('/health', {
      schema: {
        tags: ['System'],
        description: 'System health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  redis: { type: 'string' },
                  version: { type: 'string' },
                },
              },
              uptime: { type: 'number' },
            },
          },
        },
      },
    }, async (request, reply) => {
      try {
        // Test database connectivity
        await fastify.db.$queryRaw`SELECT 1 as health_check`;
        
        // Test Redis connectivity
        await fastify.redis.ping();

        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          services: {
            database: 'connected',
            redis: 'connected',
            version: process.env.npm_package_version || '1.0.0',
          },
          uptime: process.uptime(),
        };
      } catch (error) {
        fastify.log.error('Health check failed:', error);
        return reply.code(503).send({
          status: 'error',
          timestamp: new Date().toISOString(),
          services: {
            database: error.message.includes('database') ? 'disconnected' : 'connected',
            redis: error.message.includes('redis') ? 'disconnected' : 'connected',
          },
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // System metrics endpoint
    fastify.get('/metrics', {
      schema: {
        tags: ['System'],
        description: 'System performance metrics',
      },
    }, async () => {
      const memUsage = process.memoryUsage();
      
      return {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024),
        },
        cpu: process.cpuUsage(),
        environment: process.env.NODE_ENV,
        nodeVersion: process.version,
      };
    });

    // Register route plugins
    await fastify.register(import('./routes/auth.js'), { prefix: '/api/v1/auth' });
    await fastify.register(import('./routes/orders.js'), { prefix: '/api/v1/orders' });
    await fastify.register(import('./routes/trades.js'), { prefix: '/api/v1/trades' });
    await fastify.register(import('./routes/users.js'), { prefix: '/api/v1/users' });
    await fastify.register(import('./routes/disputes.js'), { prefix: '/api/v1/disputes' });
    await fastify.register(import('./routes/admin.js'), { prefix: '/api/v1/admin' });
    await fastify.register(import('./routes/matching.js'), { prefix: '/api/v1/matching' });
    await fastify.register(import('./routes/webhooks.js'), { prefix: '/api/v1/webhooks' });

    // WebSocket handlers
    fastify.register(async function (fastify) {
      // Real-time order book updates
      fastify.get('/ws/orderbook', { websocket: true }, (connection, request) => {
        connection.on('message', async (message) => {
          try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'subscribe' && data.pair) {
              // Subscribe to order book updates for specific pair
              const orderBook = await dbManager.getOrderBook(data.pair);
              connection.send(JSON.stringify({
                type: 'orderbook',
                pair: data.pair,
                data: orderBook,
                timestamp: Date.now(),
              }));
            }
          } catch (error) {
            connection.send(JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
              timestamp: Date.now(),
            }));
          }
        });

        connection.send(JSON.stringify({
          type: 'connected',
          message: 'Connected to Orrange P2P WebSocket',
          timestamp: Date.now(),
        }));
      });

      // Real-time trade notifications
      fastify.get('/ws/trades', { websocket: true }, (connection, request) => {
        // Implementation for real-time trade updates
        connection.send(JSON.stringify({
          type: 'connected',
          message: 'Connected to trade notifications',
          timestamp: Date.now(),
        }));
      });
    });

    // Graceful shutdown handler
    const gracefulShutdown = async () => {
      fastify.log.info('Starting graceful shutdown...');
      
      try {
        await dbManager.disconnect();
        await fastify.close();
        fastify.log.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        fastify.log.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    return fastify;

  } catch (error) {
    fastify.log.error('Failed to build server:', error);
    throw error;
  }
}

// Start server
async function start() {
  try {
    const server = await buildServer();
    
    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    
    console.log('🚀 Orrange P2P Trading API Server Started!');
    console.log('═══════════════════════════════════════════');
    console.log(`📡 Server: http://${host}:${port}`);
    console.log(`📊 Health: http://${host}:${port}/health`);
    console.log(`📈 Metrics: http://${host}:${port}/metrics`);
    console.log(`📚 API Docs: http://${host}:${port}/docs`);
    console.log(`🔌 WebSocket: ws://${host}:${port}/ws/orderbook`);
    console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Server failed to start:', error);
    process.exit(1);
  }
}

// Export for testing
export { buildServer, start };

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
