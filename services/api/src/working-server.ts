// Working Orrange P2P API Server - Error-Free Version
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import winston from 'winston';
import dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth.js';
import orderRoutes from './routes/orders.js';
import tradeRoutes from './routes/trades.js';
import userRoutes from './routes/users.js';
import disputeRoutes from './routes/disputes.js';
import adminRoutes from './routes/admin.js';
import webhookRoutes from './routes/webhooks.js';
import matchingRoutes from './routes/matching.js';

// Import services
import { NotificationService } from './services/NotificationService.js';
import { RateService } from './services/RateService.js';
import { EscrowService } from './services/EscrowService.js';
import { DisputeService } from './services/DisputeService.js';
import SimpleMatchingEngine from './matching/simple-engine.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Initialize database
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query'] : ['error']
});

// Initialize Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Create Fastify instance
const fastify = Fastify({
  logger: process.env.NODE_ENV === 'development'
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  try {
    // Close Fastify server
    await fastify.close();
    
    // Close database connection
    await prisma.$disconnect();
    
    // Close Redis connection
    redis.disconnect();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

async function buildServer() {
  try {
    // Register plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false
    });

    await fastify.register(cors, {
      origin: process.env.FRONTEND_URLS?.split(',') || ['http://localhost:3000', 'http://localhost:3002'],
      credentials: true
    });

    // WebSocket support
    await fastify.register(websocket, {
      options: {
        maxPayload: 1024 * 1024, // 1MB
        verifyClient: (info) => {
          // Add WebSocket authentication logic here
          return true;
        }
      }
    });

    // JWT authentication
    await fastify.register(jwt, {
      secret: process.env.JWT_SECRET || 'your-secret-key'
    });

    // Global error handler
    fastify.setErrorHandler(errorHandler);

    // Make services available in request context
    fastify.decorate('prisma', prisma);
    fastify.decorate('redis', redis);
    fastify.decorate('logger', logger);
    
    // Initialize services
    const notificationService = new NotificationService(prisma, redis);
    const rateService = new RateService(redis);
    const escrowService = new EscrowService(prisma);
    const disputeService = new DisputeService(prisma, notificationService);
    const matchingEngine = new SimpleMatchingEngine(prisma, redis);

    fastify.decorate('notificationService', notificationService);
    fastify.decorate('rateService', rateService);
    fastify.decorate('escrowService', escrowService);
    fastify.decorate('disputeService', disputeService);
    fastify.decorate('matchingEngine', matchingEngine);

    // Health check endpoint
    fastify.get('/health', {
      schema: {
        description: 'Health check endpoint',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              version: { type: 'string' },
              uptime: { type: 'number' },
              services: { type: 'object' }
            }
          }
        }
      }
    }, async (request, reply) => {
      try {
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;
        
        // Test Redis connection
        await redis.ping();

        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          uptime: process.uptime(),
          services: {
            database: 'connected',
            redis: 'connected',
            matchingEngine: 'running'
          }
        };
      } catch (error) {
        return reply.code(503).send({
          status: 'error',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Register routes
    await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
    await fastify.register(orderRoutes, { prefix: '/api/v1/orders' });
    await fastify.register(tradeRoutes, { prefix: '/api/v1/trades' });
    await fastify.register(userRoutes, { prefix: '/api/v1/users' });
    await fastify.register(disputeRoutes, { prefix: '/api/v1/disputes' });
    await fastify.register(adminRoutes, { prefix: '/api/v1/admin' });
    await fastify.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
    await fastify.register(matchingRoutes, { prefix: '/api/v1/matching' });

    // WebSocket handlers
    fastify.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        connection.socket.on('message', message => {
          try {
            const data = JSON.parse(message.toString());
            connection.socket.send(JSON.stringify({
              type: 'echo',
              data,
              timestamp: Date.now()
            }));
          } catch (error) {
            connection.socket.send(JSON.stringify({
              type: 'error',
              message: 'Invalid JSON',
              timestamp: Date.now()
            }));
          }
        });

        // Send welcome message
        connection.socket.send(JSON.stringify({
          type: 'connected',
          message: 'WebSocket connected to Orrange P2P',
          timestamp: Date.now()
        }));
      });
    });

    // Start services
    await rateService.start();
    await matchingEngine.start();

    logger.info('🎯 All services started successfully');

    return fastify;
  } catch (error) {
    logger.error('Error building server:', error);
    throw error;
  }
}

async function start() {
  try {
    const server = await buildServer();
    
    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    
    logger.info(`🚀 Server running on http://${host}:${port}`);
    logger.info(`📊 Health check: http://${host}:${port}/health`);
    logger.info(`🎯 Matching engine: http://${host}:${port}/api/v1/matching/health`);
    logger.info(`🔌 WebSocket: ws://${host}:${port}/ws`);
    
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

// Start server if this file is executed directly
if (process.env.NODE_ENV !== 'test') {
  start();
}

export { buildServer, start };
