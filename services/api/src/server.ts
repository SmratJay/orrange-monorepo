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
import * as winston from 'winston';
import * as dotenv from 'dotenv';

// Import routes
import authRoutes from './routes/auth';
// import adminRoutes from './routes/admin'; // Disabled temporarily
import p2pRoutes from './routes/p2p';
import marketDataRoutes from './routes/market-data';
import tradingEngineRoutes from './routes/trading-engine';
// Phase 3C Security Routes
import { securityRoutes } from './routes/security.js';

// Import middleware
import { createAuthMiddleware, createOptionalAuthMiddleware, AuthService } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { validationMiddleware } from './middleware/validation';

// Import services
import { NotificationService } from './services/NotificationService';
import { RateService } from './services/RateService';
// Disabled legacy services:
// import { SecureEscrowService } from './services/SecureEscrowService';
// import { EnhancedDisputeService } from './services/DisputeService';

// Phase 3C Enhanced Security Services
import { SecurityService } from './services/SecurityService.js';
import { FraudDetectionService } from './services/FraudDetectionService.js';
import { AuditService } from './services/AuditService.js';
import { SecurityDashboardService, createSecurityDashboard } from './services/SecurityDashboardService.js';
import { WebSocketSecurityService, createWebSocketSecurityService } from './websocket/SecurityWebSocket.js';
import { SecurityMiddleware, createSecurityMiddleware, registerSecurityMiddleware } from './middleware/security.js';

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
    // Stop Phase 3C Security Services first
    logger.info('Stopping Phase 3C Security Services...');
    const server = await buildServer(); // Get instance for cleanup
    const securityDashboard = (server as any).securityDashboard;
    const wsSecurityService = (server as any).wsSecurityService;
    
    if (securityDashboard) {
      securityDashboard.stopMonitoring();
    }
    if (wsSecurityService) {
      await wsSecurityService.stop();
    }
    
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
        verifyClient: (info: any) => {
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
      await fastify.register(serverAdapter.registerPlugin(), { 
        prefix: '/admin/queues',
        basePath: '/admin/queues'
      });
    }

    // Global middleware registered as proper plugins
    await fastify.register(async function (fastify) {
      fastify.addHook('onRequest', requestLogger);
    });
    
    await fastify.register(async function (fastify) {
      fastify.setErrorHandler(errorHandler);
    });

    // Make services available in request context
    fastify.decorate('prisma', prisma);
    fastify.decorate('redis', redis as any); // Cast to any to bypass type checking
    fastify.decorate('logger', logger);
    
    // Initialize services
    const notificationService = new NotificationService(prisma, redis);
    const rateService = new RateService(redis);
    
    // Phase 3C Enhanced Security Services
    console.log('🛡️  Initializing Phase 3C Enhanced Security Services...');
    const securityService = new SecurityService(prisma, redis);
    const fraudDetectionService = new FraudDetectionService(prisma, redis);
    const auditService = new AuditService(prisma);
    const securityDashboard = createSecurityDashboard(securityService, fraudDetectionService, auditService);
    const wsSecurityService = createWebSocketSecurityService(securityDashboard, auditService, securityService, 8080);
    const securityMiddleware = createSecurityMiddleware(securityService, fraudDetectionService, auditService);
    
    // TODO: Re-enable when services are properly implemented
    // const escrowService = new SecureEscrowService(prisma, {
    //   rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    //   contractAddress: process.env.ESCROW_CONTRACT || '0x0000000000000000000000000000000000000000'
    // });
    // const disputeService = new EnhancedDisputeService(prisma, notificationService);
    
    // Setup auth service and middleware
    const authService = new AuthService(prisma, redis);
    const authMiddleware = createAuthMiddleware(authService);
    
    // Initialize matching engine
    // TODO: Re-enable after fixing database model alignment
    // const matchingEngine = new MatchingEngine(redis, prisma);

    fastify.decorate('notificationService', notificationService);
    fastify.decorate('rateService', rateService);
    // fastify.decorate('escrowService', escrowService); // Disabled temporarily
    // fastify.decorate('disputeService', disputeService); // Disabled temporarily
    fastify.decorate('authService', authService);
    fastify.decorate('authMiddleware', authMiddleware);
    // fastify.decorate('matchingEngine', matchingEngine);
    
    // Phase 3C Security Services
    fastify.decorate('securityService', securityService);
    fastify.decorate('fraudDetectionService', fraudDetectionService);
    fastify.decorate('auditService', auditService);
    fastify.decorate('securityDashboard', securityDashboard);
    fastify.decorate('wsSecurityService', wsSecurityService);
    fastify.decorate('securityMiddleware', securityMiddleware);

    // Register Phase 3C Security Middleware
    registerSecurityMiddleware(fastify, securityMiddleware, {
      enableRateLimit: false, // Using existing Fastify rate limit
      enableIPControl: false,
      enableMFA: true,
      enableDeviceFingerprint: true,
      enableFraudDetection: true,
      enableSecurityHeaders: true,
      enableSessionSecurity: true
    });

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
    // await fastify.register(adminRoutes, { prefix: '/api/v1/admin' }); // Disabled temporarily
    await fastify.register(p2pRoutes, { prefix: '/api/v1/p2p' });
    await fastify.register(marketDataRoutes, { prefix: '/api/v1/market' });
    await fastify.register(tradingEngineRoutes, { prefix: '/api/v1/trading' });
    
    // Phase 3C Security Routes
    await fastify.register(async function (fastify) {
      await securityRoutes(fastify, securityService, fraudDetectionService, auditService);
    }, { prefix: '/api/v1/security' });
    
    // TODO: Fix and re-enable these routes after database model alignment
    // await fastify.register(orderRoutes, { prefix: '/api/v1/orders' });
    // await fastify.register(tradeRoutes, { prefix: '/api/v1/trades' });
    // await fastify.register(userRoutes, { prefix: '/api/v1/users' });
    // await fastify.register(disputeRoutes, { prefix: '/api/v1/disputes' });
    // await fastify.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
    // Note: Removed matching routes - P2P platform uses ad browsing instead

    // WebSocket handlers  
    fastify.register(async function (fastify) {
      // Legacy WebSocket handler
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        connection.on('message', (message: Buffer) => {
          // Handle WebSocket messages
          connection.send('Echo: ' + message.toString());
        });
      });
      
      // Phase 3C Security WebSocket endpoint
      fastify.get('/security-ws', { websocket: true }, (connection, req) => {
        // Security WebSocket connections are handled by SecurityWebSocket service
        connection.on('message', (message: Buffer) => {
          connection.send(JSON.stringify({
            type: 'info',
            message: 'Security WebSocket connected - use dedicated security server on port 8080'
          }));
        });
      });
    });

    // Start services
    await rateService.start();
    // TODO: Re-enable after fixing MatchingEngine
    // await matchingEngine.start();
    
    // Start Phase 3C Security Services
    console.log('🚀 Starting Phase 3C Security Services...');
    await securityDashboard.startMonitoring(10000); // 10 second intervals
    await wsSecurityService.start();
    console.log('✅ Phase 3C Enhanced Security System activated!');

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
