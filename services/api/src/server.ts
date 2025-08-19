import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
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

// Import middleware
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { validationMiddleware } from './middleware/validation.js';

// Import services
import { NotificationService } from './services/NotificationService.js';
import { RateService } from './services/RateService.js';
import { EscrowService } from './services/EscrowService.js';
import { DisputeService } from './services/DisputeService.js';
import SimpleMatchingEngine from './matching/simple-engine.js';

// Import queues
import { emailQueue, smsQueue, blockchainQueue, matchingQueue } from './queues/index.js';

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
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
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
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    } : undefined
  }
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
    
    // Close queues
    await emailQueue.close();
    await smsQueue.close();
    await blockchainQueue.close();
    await matchingQueue.close();
    
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
      origin: process.env.FRONTEND_URLS?.split(',') || ['http://localhost:3000'],
      credentials: true
    });

    // Rate limiting
    await fastify.register(rateLimit, {
      max: 100,
      timeWindow: '1 minute',
      redis: redis,
      errorResponseBuilder: (req, context) => ({
        code: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
        expiresIn: Math.round(context.ttl / 1000)
      })
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

    // File upload support
    await fastify.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5
      }
    });

    // JWT authentication
    await fastify.register(jwt, {
      secret: process.env.JWT_SECRET || 'your-secret-key'
    });

    // Swagger documentation
    if (process.env.NODE_ENV !== 'production') {
      await fastify.register(swagger, {
        openapi: {
          info: {
            title: 'Orrange P2P API',
            description: 'API documentation for Orrange P2P trading platform',
            version: '1.0.0'
          },
          servers: [
            { url: 'http://localhost:3001', description: 'Development server' }
          ],
          components: {
            securitySchemes: {
              bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
              }
            }
          }
        }
      });

      await fastify.register(swaggerUi, {
        routePrefix: '/documentation',
        uiConfig: {
          docExpansion: 'full',
          deepLinking: false
        }
      });
    }

    // Bull Board (Queue monitoring)
    if (process.env.NODE_ENV !== 'production') {
      const serverAdapter = new FastifyAdapter();
      const bullBoard = createBullBoard({
        queues: [
          new BullAdapter(emailQueue),
          new BullAdapter(smsQueue),
          new BullAdapter(blockchainQueue),
          new BullAdapter(matchingQueue)
        ],
        serverAdapter
      });

      serverAdapter.setBasePath('/admin/queues');
      await fastify.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' });
    }

    // Global middleware
    await fastify.register(requestLogger);
    await fastify.register(errorHandler);

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
              uptime: { type: 'number' }
            }
          }
        }
      }
    }, async (request, reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: process.uptime()
      };
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
          // Handle WebSocket messages
          connection.socket.send('Echo: ' + message.toString());
        });
      });
    });

    // Start services
    await rateService.start();
    await matchingEngine.start();

    return fastify;
  } catch (error) {
    logger.error('Error building server:', error);
    throw error;
  }
}

async function start() {
  try {
    const server = await buildServer();
    
    const port = parseInt(process.env.PORT || '3001', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await server.listen({ port, host });
    
    logger.info(`🚀 Server running on http://${host}:${port}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`📚 API Documentation available at http://${host}:${port}/documentation`);
      logger.info(`🔧 Queue Dashboard available at http://${host}:${port}/admin/queues`);
    }
    
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
