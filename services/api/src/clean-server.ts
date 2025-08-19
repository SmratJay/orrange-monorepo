// Minimal Working Orrange P2P API Server - No Auth Middleware Issues
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import dotenv from 'dotenv';

// Import matching engine
import SimpleMatchingEngine from './matching/simple-engine.js';

// Load environment variables
dotenv.config();

// Create Fastify instance
const fastify = Fastify({
  logger: process.env.NODE_ENV === 'development'
});

async function start() {
  try {
    // Register plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false
    });

    await fastify.register(cors, {
      origin: ['http://localhost:3000', 'http://localhost:3002'],
      credentials: true
    });

    await fastify.register(websocket);

    // Initialize services
    const prisma = new PrismaClient();
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    const matchingEngine = new SimpleMatchingEngine(prisma, redis);

    // Decorate fastify
    fastify.decorate('prisma', prisma);
    fastify.decorate('redis', redis);
    fastify.decorate('matchingEngine', matchingEngine);

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        await redis.ping();
        
        return {
          status: 'ok',
          timestamp: new Date().toISOString(),
          services: {
            database: 'connected',
            redis: 'connected',
            matchingEngine: 'running'
          }
        };
      } catch (error) {
        return reply.code(503).send({
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Basic auth endpoints
    fastify.post('/api/v1/auth/connect', async (request, reply) => {
      const { address, signature } = request.body as any;
      
      return {
        success: true,
        message: 'Wallet connected successfully',
        data: {
          address,
          token: 'mock-jwt-token',
          user: {
            id: 'mock-user-id',
            walletAddress: address,
            createdAt: new Date().toISOString()
          }
        }
      };
    });

    // Basic orders endpoint
    fastify.get('/api/v1/orders', async (request, reply) => {
      return {
        success: true,
        data: [],
        message: 'Orders endpoint working'
      };
    });

    // Matching engine endpoints
    fastify.get('/api/v1/matching/health', async () => {
      const metrics = matchingEngine.getMetrics();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics
      };
    });

    fastify.get('/api/v1/matching/orderbook/:pair', async (request, reply) => {
      try {
        const { pair } = request.params as { pair: string };
        const orderBook = await matchingEngine.getOrderBook(pair.toUpperCase());

        return {
          success: true,
          data: orderBook || {
            pair: pair.toUpperCase(),
            bids: [],
            asks: [],
            lastUpdated: new Date().toISOString()
          }
        };
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    });

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
          error: error instanceof Error ? error.message : String(error)
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

        connection.socket.send(JSON.stringify({
          type: 'connected',
          message: 'WebSocket connected to Orrange P2P',
          timestamp: Date.now()
        }));
      });
    });

    // Start matching engine
    await matchingEngine.start();
    
    // Start server
    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    console.log(`🚀 Orrange P2P API Server running on http://${host}:${port}`);
    console.log(`📊 Health: http://${host}:${port}/health`);
    console.log(`🔐 Connect Wallet: POST http://${host}:${port}/api/v1/auth/connect`);
    console.log(`📋 Orders: http://${host}:${port}/api/v1/orders`);
    console.log(`🎯 Matching: http://${host}:${port}/api/v1/matching/health`);
    console.log(`📈 Order Book: http://${host}:${port}/api/v1/matching/orderbook/BTC-USD`);
    console.log(`🔌 WebSocket: ws://${host}:${port}/ws`);
    
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

start();
