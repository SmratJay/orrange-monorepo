// Enhanced Orrange P2P API Server with Matching Engine
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import winston from 'winston';
import dotenv from 'dotenv';

// Import matching engine
import SimpleMatchingEngine from './matching/simple-engine.js';

// Load environment variables
dotenv.config();

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
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

// Create Fastify instance with simple logging
const fastify = Fastify({
  logger: process.env.NODE_ENV === 'development'
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  
  try {
    await fastify.close();
    await prisma.$disconnect();
    redis.disconnect();
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

async function start() {
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
    await fastify.register(websocket);

    // JWT authentication
    await fastify.register(jwt, {
      secret: process.env.JWT_SECRET || 'your-secret-key'
    });

    // Decorate fastify with services
    fastify.decorate('prisma', prisma);
    fastify.decorate('redis', redis);
    fastify.decorate('logger', logger);

    // Initialize matching engine
    const matchingEngine = new SimpleMatchingEngine(prisma, redis);
    fastify.decorate('matchingEngine', matchingEngine);

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      try {
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;
        
        // Test Redis connection
        await redis.ping();

        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
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

    // Connect wallet endpoint (keeping existing functionality)
    fastify.post('/api/v1/connect-wallet', async (request, reply) => {
      const { address, signature } = request.body as { address: string, signature: string };
      
      return {
        success: true,
        message: 'Wallet connected successfully',
        data: { address, token: 'mock-jwt-token' }
      };
    });

    // Simple orders endpoint (keeping existing functionality)
    fastify.get('/api/v1/orders', async () => {
      return {
        success: true,
        data: []
      };
    });

    // ===== MATCHING ENGINE ENDPOINTS =====
    
    // Matching engine health
    fastify.get('/api/v1/matching/health', async () => {
      const metrics = matchingEngine.getMetrics();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics
      };
    });

    // Get order book
    fastify.get('/api/v1/matching/orderbook/:pair', async (request, reply) => {
      try {
        const { pair } = request.params as { pair: string };
        const orderBook = await matchingEngine.getOrderBook(pair.toUpperCase());

        if (!orderBook) {
          return reply.code(404).send({
            success: false,
            error: `Order book not found for pair ${pair}`
          });
        }

        return {
          success: true,
          data: orderBook
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to get order book',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Get recent trades
    fastify.get('/api/v1/matching/trades/:pair', async (request, reply) => {
      try {
        const { pair } = request.params as { pair: string };
        const { limit = 50 } = request.query as { limit?: number };
        
        const trades = await matchingEngine.getRecentTrades(pair.toUpperCase(), limit);

        return {
          success: true,
          data: {
            pair: pair.toUpperCase(),
            trades,
            count: trades.length
          }
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to get recent trades',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Trigger matching (for testing)
    fastify.post('/api/v1/matching/trigger/:pair?', async (request, reply) => {
      try {
        const { pair } = request.params as { pair?: string };
        
        await matchingEngine.triggerMatching(pair?.toUpperCase());

        return {
          success: true,
          message: `Matching triggered for ${pair ? pair.toUpperCase() : 'all pairs'}`,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to trigger matching',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Get matching metrics
    fastify.get('/api/v1/matching/metrics', async (request, reply) => {
      try {
        const metrics = matchingEngine.getMetrics();
        
        return {
          success: true,
          data: {
            ...metrics,
            uptime: process.uptime()
          }
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to get metrics',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // WebSocket handler
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
          message: 'WebSocket connected to Orrange P2P Matching Engine',
          availableChannels: ['orderbook:BTC-USD', 'orderbook:ETH-USD', 'trades:BTC-USD', 'trades:ETH-USD'],
          timestamp: Date.now()
        }));
      });
    });

    // Start matching engine
    await matchingEngine.start();
    logger.info('🎯 Matching Engine started successfully');

    // Start server
    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    logger.info(`🚀 Enhanced Orrange P2P API Server running on http://${host}:${port}`);
    logger.info(`📊 Health check: http://${host}:${port}/health`);
    logger.info(`🎯 Matching engine health: http://${host}:${port}/api/v1/matching/health`);
    logger.info(`📈 Order book: http://${host}:${port}/api/v1/matching/orderbook/BTC-USD`);
    logger.info(`📊 Metrics: http://${host}:${port}/api/v1/matching/metrics`);
    logger.info(`🔌 WebSocket: ws://${host}:${port}/ws`);
    
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
}

// Start server
start();
