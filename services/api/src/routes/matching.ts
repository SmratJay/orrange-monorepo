/**
 * Matching Engine Routes for Orrange P2P API
 */
import { FastifyInstance } from 'fastify';
import SimpleMatchingEngine from '../matching/simple-engine';

declare module 'fastify' {
  interface FastifyInstance {
    matchingEngine: SimpleMatchingEngine;
  }
}

export default async function matchingRoutes(fastify: FastifyInstance) {
  // Get order book for a trading pair
  fastify.get('/orderbook/:pair', {
    schema: {
      description: 'Get current order book for a trading pair',
      tags: ['Matching'],
      params: {
        type: 'object',
        properties: {
          pair: { type: 'string', pattern: '^[A-Z]+-[A-Z]+$' }
        },
        required: ['pair']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                pair: { type: 'string' },
                bids: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      price: { type: 'number' },
                      amount: { type: 'number' },
                      orderCount: { type: 'number' }
                    }
                  }
                },
                asks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      price: { type: 'number' },
                      amount: { type: 'number' },
                      orderCount: { type: 'number' }
                    }
                  }
                },
                lastUpdated: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { pair } = request.params as { pair: string };
      const orderBook = await fastify.matchingEngine.getOrderBook(pair.toUpperCase());

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

  // Get recent trades for a trading pair
  fastify.get('/trades/:pair', {
    schema: {
      description: 'Get recent trades for a trading pair',
      tags: ['Matching'],
      params: {
        type: 'object',
        properties: {
          pair: { type: 'string', pattern: '^[A-Z]+-[A-Z]+$' }
        },
        required: ['pair']
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { pair } = request.params as { pair: string };
      const { limit = 50 } = request.query as { limit?: number };
      
      const trades = await fastify.matchingEngine.getRecentTrades(pair.toUpperCase(), limit);

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

  // Get matching engine metrics
  fastify.get('/metrics', {
    schema: {
      description: 'Get matching engine performance metrics',
      tags: ['Matching'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                totalMatches: { type: 'number' },
                totalTrades: { type: 'number' },
                averageMatchTime: { type: 'number' },
                lastMatchTime: { type: 'number' },
                uptime: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const metrics = fastify.matchingEngine.getMetrics();
      
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

  // Trigger manual matching (development/admin only)
  fastify.post('/trigger/:pair?', {
    schema: {
      description: 'Manually trigger matching for a specific pair or all pairs',
      tags: ['Matching'],
      params: {
        type: 'object',
        properties: {
          pair: { type: 'string', pattern: '^[A-Z]+-[A-Z]+$' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { pair } = request.params as { pair?: string };
      
      await fastify.matchingEngine.triggerMatching(pair?.toUpperCase());

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

  // Health check for matching engine
  fastify.get('/health', {
    schema: {
      description: 'Check matching engine health status',
      tags: ['Matching'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            metrics: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const metrics = fastify.matchingEngine.getMetrics();
      
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics
      };
    } catch (error) {
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
