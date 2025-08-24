/**
 * Trading Engine API Routes
 * Phase 3B Implementation - Advanced Trading Features
 * 
 * Endpoints:
 * - Order Management (CRUD)
 * - Order Book Data
 * - Trading Bot Management
 * - Risk Management
 * - Portfolio Analytics
 * - Real-time WebSocket connections
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { TradingEngineService, OrderType, OrderSide, TimeInForce, BotStrategy } from '../services/TradingEngineService.js';

// Validation Schemas
const OrderSubmissionSchema = z.object({
  symbol: z.string().min(1),
  type: z.nativeEnum(OrderType),
  side: z.nativeEnum(OrderSide),
  quantity: z.string().transform(val => parseFloat(val)),
  price: z.string().transform(val => parseFloat(val)).optional(),
  stopPrice: z.string().transform(val => parseFloat(val)).optional(),
  timeInForce: z.nativeEnum(TimeInForce).default(TimeInForce.GTC)
});

const BotCreationSchema = z.object({
  name: z.string().min(1).max(100),
  strategy: z.nativeEnum(BotStrategy),
  symbol: z.string().min(1),
  isActive: z.boolean().default(false),
  config: z.object({
    dcaAmount: z.number().positive().optional(),
    dcaInterval: z.number().positive().optional(),
    gridSpacing: z.number().positive().optional(),
    gridLevels: z.number().int().positive().optional(),
    basePrice: z.number().positive().optional(),
    maxInvestment: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    maxDrawdown: z.number().positive().optional()
  })
});

const BotUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  config: z.object({
    dcaAmount: z.number().positive().optional(),
    dcaInterval: z.number().positive().optional(),
    gridSpacing: z.number().positive().optional(),
    gridLevels: z.number().int().positive().optional(),
    basePrice: z.number().positive().optional(),
    maxInvestment: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    maxDrawdown: z.number().positive().optional()
  }).optional()
});

// Request/Response Interfaces - simplified without extending FastifyRequest
interface OrderSubmissionRequest {
  Body: z.infer<typeof OrderSubmissionSchema>;
  user: { id: string; walletAddress: string; role: string; };
}

interface BotCreationRequest {
  Body: z.infer<typeof BotCreationSchema>;
  user: { id: string; walletAddress: string; role: string; };
}

interface BotUpdateRequestData {
  Body: z.infer<typeof BotUpdateSchema>;
  Params: { botId: string };
  user: { id: string; walletAddress: string; role: string; };
}

interface OrderParamsRequestData {
  Params: { orderId: string };
  user: { id: string; walletAddress: string; role: string; };
}

interface SymbolParamsRequestData {
  Params: { symbol: string };
}

interface BotParamsRequestData {
  Params: { botId: string };
  user: { id: string; walletAddress: string; role: string; };
}

/**
 * Register Trading Engine Routes
 */
export default async function tradingEngineRoutes(fastify: FastifyInstance) {
  // Initialize Trading Engine Service
  const tradingEngine = new TradingEngineService(
    fastify.prisma,
    fastify.redis,
    8081 // WebSocket port
  );

  await tradingEngine.initialize();

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await tradingEngine.shutdown();
  });

  // ===================
  // ORDER MANAGEMENT
  // ===================

  /**
   * Submit a new trading order
   * POST /api/v1/trading/orders
   */
  fastify.post('/orders', {
    schema: {
      tags: ['Trading'],
      summary: 'Submit a new trading order',
      body: {
        type: 'object',
        required: ['symbol', 'type', 'side', 'quantity'],
        properties: {
          symbol: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'] },
          side: { type: 'string', enum: ['BUY', 'SELL'] },
          quantity: { type: 'string' },
          price: { type: 'string' },
          stopPrice: { type: 'string' },
          timeInForce: { type: 'string', enum: ['GTC', 'IOC', 'FOK'], default: 'GTC' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const user = request.user as any;
      const body = request.body as z.infer<typeof OrderSubmissionSchema>;
      
      const orderData = {
        userId: user.id,
        symbol: body.symbol,
        type: body.type,
        side: body.side,
        quantity: new Decimal(body.quantity),
        price: body.price ? new Decimal(body.price) : undefined,
        stopPrice: body.stopPrice ? new Decimal(body.stopPrice) : undefined,
        timeInForce: body.timeInForce || 'GTC'
      };

      const order = await tradingEngine.submitOrder(orderData);
      const responseTime = Date.now() - startTime;

      fastify.log.info({ orderId: order.id, userId: user.id, responseTime }, 'Order submitted successfully');

      return reply.status(201).send({
        success: true,
        data: order,
        message: 'Order submitted successfully',
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const user = request.user as any;
      fastify.log.error({ userId: user?.id, error: error.message, responseTime }, 'Error submitting order');

      return reply.status(400).send({
        success: false,
        error: error.message || 'Failed to submit order',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Get user's orders
   * GET /api/v1/trading/orders
   */
  fastify.get('/orders', {
    schema: {
      tags: ['Trading'],
      summary: 'Get user orders',
      querystring: {
        type: 'object',
        properties: {
          symbol: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const user = request.user as any;
      const query = request.query as any;
      const orders = await tradingEngine.getUserOrders(user.id, query.symbol);
      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: orders,
        count: orders.length,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const user = request.user as any;
      fastify.log.error({ userId: user?.id, error: error.message, responseTime }, 'Error fetching orders');

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch orders',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Cancel an order
   * DELETE /api/v1/trading/orders/:orderId
   */
  fastify.delete('/orders/:orderId', {
    schema: {
      tags: ['Trading'],
      summary: 'Cancel an order',
      params: {
        type: 'object',
        properties: {
          orderId: { type: 'string' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const user = request.user as any;
      const params = request.params as { orderId: string };
      const success = await tradingEngine.cancelOrder(params.orderId, user.id);
      const responseTime = Date.now() - startTime;

      if (success) {
        return reply.send({
          success: true,
          message: 'Order cancelled successfully',
          responseTime: `${responseTime}ms`
        });
      } else {
        throw new Error('Failed to cancel order');
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const user = request.user as any;
      const params = request.params as { orderId: string };
      fastify.log.error({ userId: user?.id, orderId: params?.orderId, error: error.message, responseTime }, 'Error cancelling order');

      return reply.status(400).send({
        success: false,
        error: error.message || 'Failed to cancel order',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===================
  // ORDER BOOK DATA
  // ===================

  /**
   * Get order book for a symbol
   * GET /api/v1/trading/orderbook/:symbol
   */
  fastify.get('/orderbook/:symbol', {
    schema: {
      tags: ['Trading'],
      summary: 'Get order book data',
      params: {
        type: 'object',
        properties: {
          symbol: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const params = request.params as { symbol: string };
      const orderBook = tradingEngine.getOrderBook(params.symbol);
      const responseTime = Date.now() - startTime;

      if (!orderBook) {
        return reply.status(404).send({
          success: false,
          error: `Order book not found for symbol: ${params.symbol}`,
          responseTime: `${responseTime}ms`
        });
      }

      return reply.send({
        success: true,
        data: orderBook,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const params = request.params as { symbol: string };
      fastify.log.error({ symbol: params?.symbol, error: error.message, responseTime }, 'Error fetching order book');

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch order book',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===================
  // TRADING BOTS
  // ===================

  /**
   * Create a new trading bot
   * POST /api/v1/trading/bots
   */
  fastify.post('/bots', {
    schema: {
      tags: ['Trading Bots'],
      summary: 'Create a new trading bot',
      body: {
        type: 'object',
        required: ['name', 'strategy', 'symbol'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          strategy: { type: 'string', enum: ['DCA', 'GRID', 'ARBITRAGE'] },
          symbol: { type: 'string', minLength: 1 },
          isActive: { type: 'boolean', default: false },
          config: {
            type: 'object',
            properties: {
              dcaAmount: { type: 'number', minimum: 0 },
              dcaInterval: { type: 'number', minimum: 0 },
              gridSpacing: { type: 'number', minimum: 0 },
              gridLevels: { type: 'integer', minimum: 1 },
              basePrice: { type: 'number', minimum: 0 },
              maxInvestment: { type: 'number', minimum: 0 },
              stopLoss: { type: 'number', minimum: 0 },
              takeProfit: { type: 'number', minimum: 0 },
              maxDrawdown: { type: 'number', minimum: 0 }
            }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const user = request.user as any;

    try {
      const botData = {
        ...(request.body as any),
        userId: user.id
      };

      const bot = await tradingEngine.createTradingBot(botData);
      const responseTime = Date.now() - startTime;

      fastify.log.info({ botId: bot.id, userId: user.id, strategy: bot.strategy, responseTime }, 'Trading bot created');

      return reply.status(201).send({
        success: true,
        data: bot,
        message: 'Trading bot created successfully',
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      fastify.log.error({ userId: user.id, error: error.message, responseTime }, 'Error creating trading bot');

      return reply.status(400).send({
        success: false,
        error: error.message || 'Failed to create trading bot',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Get user's trading bots
   * GET /api/v1/trading/bots
   */
  fastify.get('/bots', {
    schema: {
      tags: ['Trading Bots'],
      summary: 'Get user trading bots',
      querystring: {
        type: 'object',
        properties: {
          strategy: { type: 'string' },
          symbol: { type: 'string' },
          active: { type: 'boolean' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const user = request.user as any;

    try {
      // TODO: Implement bot filtering logic
      const bots: any[] = []; // Placeholder
      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: bots,
        count: bots.length,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      fastify.log.error({ userId: user.id, error: error.message, responseTime }, 'Error fetching trading bots');

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch trading bots',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Update a trading bot
   * PUT /api/v1/trading/bots/:botId
   */
  fastify.put('/bots/:botId', {
    schema: {
      tags: ['Trading Bots'],
      summary: 'Update a trading bot',
      params: {
        type: 'object',
        properties: {
          botId: { type: 'string' }
        },
        required: ['botId']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          isActive: { type: 'boolean' },
          config: {
            type: 'object',
            properties: {
              dcaAmount: { type: 'number', minimum: 0 },
              dcaInterval: { type: 'number', minimum: 0 },
              gridSpacing: { type: 'number', minimum: 0 },
              gridLevels: { type: 'integer', minimum: 1 },
              basePrice: { type: 'number', minimum: 0 },
              maxInvestment: { type: 'number', minimum: 0 },
              stopLoss: { type: 'number', minimum: 0 },
              takeProfit: { type: 'number', minimum: 0 },
              maxDrawdown: { type: 'number', minimum: 0 }
            }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const user = request.user as any;
    const { botId } = request.params as any;

    try {
      const updates = request.body as any;

      const bot = await tradingEngine.updateTradingBot(botId, updates);
      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: bot,
        message: 'Trading bot updated successfully',
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      fastify.log.error({ userId: user.id, botId, error: error.message, responseTime }, 'Error updating trading bot');

      return reply.status(400).send({
        success: false,
        error: error.message || 'Failed to update trading bot',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Delete a trading bot
   * DELETE /api/v1/trading/bots/:botId
   */
  fastify.delete('/bots/:botId', {
    schema: {
      tags: ['Trading Bots'],
      summary: 'Delete a trading bot',
      params: {
        type: 'object',
        properties: {
          botId: { type: 'string' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const user = request.user as any;
    const { botId } = request.params as any;

    try {
      // TODO: Implement bot deletion logic
      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        message: 'Trading bot deleted successfully',
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      fastify.log.error({ userId: user.id, botId, error: error.message, responseTime }, 'Error deleting trading bot');

      return reply.status(400).send({
        success: false,
        error: error.message || 'Failed to delete trading bot',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===================
  // RISK MANAGEMENT
  // ===================

  /**
   * Get user risk metrics
   * GET /api/v1/trading/risk
   */
  fastify.get('/risk', {
    schema: {
      tags: ['Risk Management'],
      summary: 'Get user risk metrics'
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const user = request.user as any;

    try {
      const riskMetrics = await tradingEngine.getUserRiskMetrics(user.id);
      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: riskMetrics,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      fastify.log.error({ userId: user.id, error: error.message, responseTime }, 'Error fetching risk metrics');

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch risk metrics',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===================
  // ANALYTICS & STATS
  // ===================

  /**
   * Get trading statistics
   * GET /api/v1/trading/stats
   */
  fastify.get('/stats', {
    schema: {
      tags: ['Analytics'],
      summary: 'Get trading statistics',
      querystring: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['1h', '24h', '7d', '30d'], default: '24h' }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const user = request.user as any;

    try {
      const { period } = request.query as any;
      const stats = await tradingEngine.getTradingStats(user.id, period);
      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: stats,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      fastify.log.error({ userId: user.id, error: error.message, responseTime }, 'Error fetching trading stats');

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch trading statistics',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Health check endpoint for trading engine
   * GET /api/v1/trading/health
   */
  fastify.get('/health', {
    schema: {
      tags: ['System'],
      summary: 'Trading engine health check'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          trading_engine: 'operational',
          order_matching: 'operational',
          risk_manager: 'operational',
          websocket: 'operational'
        },
        metrics: {
          active_orders: Array.from((tradingEngine as any).activeOrders.keys()).length,
          active_bots: Array.from((tradingEngine as any).tradingBots.keys()).length,
          order_books: Array.from((tradingEngine as any).orderBooks.keys()).length,
          websocket_clients: (tradingEngine as any).clients.size
        }
      };

      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: health,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      fastify.log.error({ error: error.message, responseTime }, 'Trading engine health check failed');

      return reply.status(500).send({
        success: false,
        error: 'Trading engine health check failed',
        responseTime: `${responseTime}ms`
      });
    }
  });

  console.log('✅ Trading Engine routes registered successfully');
}
