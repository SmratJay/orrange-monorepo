// Minimal Test Server for Matching Engine
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Import matching engine
import SimpleMatchingEngine from './matching/simple-engine.js';

async function start() {
  const fastify = Fastify({ logger: true });

  try {
    // Initialize services
    const prisma = new PrismaClient();
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    // Initialize matching engine
    const matchingEngine = new SimpleMatchingEngine(prisma, redis);

    // Start matching engine
    await matchingEngine.start();
    console.log('🎯 Matching Engine started');

    // Health endpoint
    fastify.get('/health', async () => {
      try {
        // Test connections
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
        return {
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    });

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

    // Trigger matching
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

    // Start server
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    
    console.log('🚀 Minimal Matching Engine Server running on http://localhost:8080');
    console.log('📊 Health: http://localhost:8080/health');
    console.log('🎯 Matching Health: http://localhost:8080/api/v1/matching/health');
    console.log('📈 Order Book: http://localhost:8080/api/v1/matching/orderbook/BTC-USD');
    console.log('⚡ Trigger Matching: POST http://localhost:8080/api/v1/matching/trigger');

  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

start();
