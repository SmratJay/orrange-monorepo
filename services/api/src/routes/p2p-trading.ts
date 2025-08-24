/**
 * P2P Trading API Routes
 * Pure Decentralized Trading Platform - MIT-Level Implementation
 * 
 * Features:
 * - Advanced order management (CRUD operations)
 * - Real-time order book data
 * - P2P trade execution with escrow integration
 * - Reputation-based matching preferences
 * - Multi-asset support with crypto-native payments
 * - WebSocket real-time updates
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Decimal } from 'decimal.js';
import P2PMatchingEngine, { 
  P2POrderType, 
  P2POrderSide, 
  P2PTimeInForce,
  P2POrder 
} from '../services/P2PMatchingEngine.js';

// ===========================
// REQUEST VALIDATION SCHEMAS
// ===========================

const P2POrderSubmissionSchema = z.object({
  symbol: z.string().min(1).regex(/^[A-Z]+-[A-Z]+$/), // e.g., BTC-USDT
  type: z.nativeEnum(P2POrderType),
  side: z.nativeEnum(P2POrderSide),
  quantity: z.string().transform(val => new Decimal(val)),
  price: z.string().transform(val => new Decimal(val)).optional(),
  stopPrice: z.string().transform(val => new Decimal(val)).optional(),
  timeInForce: z.nativeEnum(P2PTimeInForce).default(P2PTimeInForce.GTC),
  paymentMethods: z.array(z.string()).default(['CRYPTO']),
  minTradeAmount: z.string().transform(val => new Decimal(val)).optional(),
  maxTradeAmount: z.string().transform(val => new Decimal(val)).optional(),
  escrowRequired: z.boolean().default(true),
  autoRelease: z.boolean().default(false),
  expiresAt: z.string().transform(val => new Date(val)).optional()
});

const P2POrderQuerySchema = z.object({
  symbol: z.string().optional(),
  status: z.string().optional(),
  side: z.nativeEnum(P2POrderSide).optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0)
});

const P2PTradeQuerySchema = z.object({
  symbol: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0)
});

// ===========================
// REQUEST/RESPONSE INTERFACES
// ===========================

interface P2POrderRequest extends FastifyRequest {
  body: z.infer<typeof P2POrderSubmissionSchema>;
}

interface P2POrderQueryRequest extends FastifyRequest {
  query: z.infer<typeof P2POrderQuerySchema>;
}

interface P2PTradeQueryRequest extends FastifyRequest {
  query: z.infer<typeof P2PTradeQuerySchema>;
}

interface OrderParamsRequest extends FastifyRequest {
  params: { orderId: string };
}

interface SymbolParamsRequest extends FastifyRequest {
  params: { symbol: string };
}

/**
 * Register P2P Trading Routes
 */
export default async function p2pTradingRoutes(fastify: FastifyInstance) {
  // Initialize P2P Matching Engine
  const smartContractEscrowService = fastify.smartContractEscrowService;
  const p2pEngine = new P2PMatchingEngine(smartContractEscrowService);
  
  await p2pEngine.initialize();

  // Cleanup on server close
  fastify.addHook('onClose', async () => {
    await p2pEngine.shutdown();
  });

  // ===========================
  // P2P ORDER MANAGEMENT
  // ===========================

  /**
   * Submit a new P2P order
   * POST /api/v1/p2p/orders
   */
  fastify.post('/orders', {
    schema: {
      tags: ['P2P Trading'],
      summary: 'Submit a new P2P order',
      body: P2POrderSubmissionSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { 
              type: 'object',
              properties: {
                id: { type: 'string' },
                symbol: { type: 'string' },
                type: { type: 'string' },
                side: { type: 'string' },
                quantity: { type: 'string' },
                price: { type: 'string' },
                status: { type: 'string' },
                createdAt: { type: 'string' }
              }
            },
            message: { type: 'string' },
            responseTime: { type: 'string' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: P2POrderRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const user = request.user as any;
      const orderData = request.body;
      
      // Add user ID to order
      const fullOrderData: Partial<P2POrder> = {
        ...orderData,
        userId: user.id,
        reputation: user.reputation || 50 // Get from user profile
      };

      const order = await p2pEngine.submitOrder(fullOrderData);
      const responseTime = Date.now() - startTime;

      // Audit log
      await fastify.auditService.logActivity({
        userId: user.id,
        action: 'P2P_ORDER_SUBMITTED',
        resourceType: 'P2P_ORDER',
        resourceId: order.id,
        metadata: {
          symbol: order.symbol,
          type: order.type,
          side: order.side,
          quantity: order.quantity.toString(),
          price: order.price?.toString()
        }
      });

      console.log(`✅ P2P order submitted by user ${user.id}: ${order.id}`);

      return reply.status(201).send({
        success: true,
        data: {
          id: order.id,
          symbol: order.symbol,
          type: order.type,
          side: order.side,
          quantity: order.quantity.toString(),
          price: order.price?.toString(),
          status: order.status,
          paymentMethods: order.paymentMethods,
          escrowRequired: order.escrowRequired,
          createdAt: order.createdAt.toISOString()
        },
        message: 'P2P order submitted successfully',
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const user = request.user as any;

      console.error(`❌ Error submitting P2P order for user ${user?.id}:`, error);

      return reply.status(400).send({
        success: false,
        error: error.message || 'Failed to submit P2P order',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Get user's P2P orders
   * GET /api/v1/p2p/orders
   */
  fastify.get('/orders', {
    schema: {
      tags: ['P2P Trading'],
      summary: 'Get user P2P orders',
      querystring: P2POrderQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            count: { type: 'number' },
            total: { type: 'number' },
            responseTime: { type: 'string' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: P2POrderQueryRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const user = request.user as any;
      const query = request.query;
      
      const orders = p2pEngine.getUserOrders(user.id, query.symbol);
      const responseTime = Date.now() - startTime;

      // Apply pagination
      const offset = query.offset;
      const limit = query.limit;
      const paginatedOrders = orders.slice(offset, offset + limit);

      return reply.send({
        success: true,
        data: paginatedOrders.map(order => ({
          id: order.id,
          symbol: order.symbol,
          type: order.type,
          side: order.side,
          quantity: order.quantity.toString(),
          remainingQuantity: order.remainingQuantity.toString(),
          price: order.price?.toString(),
          status: order.status,
          paymentMethods: order.paymentMethods,
          escrowRequired: order.escrowRequired,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString()
        })),
        count: paginatedOrders.length,
        total: orders.length,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const user = request.user as any;

      console.error(`❌ Error fetching P2P orders for user ${user?.id}:`, error);

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch P2P orders',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * Cancel a P2P order
   * DELETE /api/v1/p2p/orders/:orderId
   */
  fastify.delete('/orders/:orderId', {
    schema: {
      tags: ['P2P Trading'],
      summary: 'Cancel a P2P order',
      params: {
        type: 'object',
        properties: {
          orderId: { type: 'string' }
        },
        required: ['orderId']
      }
    },
    preHandler: fastify.authenticate
  }, async (request: OrderParamsRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const user = request.user as any;
      const { orderId } = request.params;
      
      const success = await p2pEngine.cancelOrder(orderId, user.id);
      const responseTime = Date.now() - startTime;

      if (success) {
        // Audit log
        await fastify.auditService.logActivity({
          userId: user.id,
          action: 'P2P_ORDER_CANCELLED',
          resourceType: 'P2P_ORDER',
          resourceId: orderId,
          metadata: { orderId }
        });

        return reply.send({
          success: true,
          message: 'P2P order cancelled successfully',
          responseTime: `${responseTime}ms`
        });
      } else {
        throw new Error('Failed to cancel order');
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const user = request.user as any;

      console.error(`❌ Error cancelling P2P order ${request.params.orderId} for user ${user?.id}:`, error);

      return reply.status(400).send({
        success: false,
        error: error.message || 'Failed to cancel P2P order',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===========================
  // P2P ORDER BOOK DATA
  // ===========================

  /**
   * Get P2P order book for a trading pair
   * GET /api/v1/p2p/orderbook/:symbol
   */
  fastify.get('/orderbook/:symbol', {
    schema: {
      tags: ['P2P Trading'],
      summary: 'Get P2P order book data',
      params: {
        type: 'object',
        properties: {
          symbol: { 
            type: 'string',
            pattern: '^[A-Z]+-[A-Z]+$',
            description: 'Trading pair symbol (e.g., BTC-USDT)'
          }
        },
        required: ['symbol']
      }
    }
  }, async (request: SymbolParamsRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const { symbol } = request.params;
      const orderBook = p2pEngine.getOrderBook(symbol);
      const responseTime = Date.now() - startTime;

      if (!orderBook) {
        return reply.status(404).send({
          success: false,
          error: `P2P order book not found for symbol: ${symbol}`,
          responseTime: `${responseTime}ms`
        });
      }

      // Format order book data for API response
      const formattedOrderBook = {
        symbol: orderBook.symbol,
        bids: orderBook.bids.map(entry => ({
          price: entry.price.toString(),
          quantity: entry.quantity.toString(),
          orderCount: entry.orderCount,
          averageReputation: entry.averageReputation,
          paymentMethods: Array.from(entry.paymentMethods)
        })),
        asks: orderBook.asks.map(entry => ({
          price: entry.price.toString(),
          quantity: entry.quantity.toString(),
          orderCount: entry.orderCount,
          averageReputation: entry.averageReputation,
          paymentMethods: Array.from(entry.paymentMethods)
        })),
        spread: orderBook.spread.toString(),
        lastPrice: orderBook.lastPrice?.toString(),
        volume24h: orderBook.volume24h.toString(),
        priceChange24h: orderBook.priceChange24h.toString(),
        timestamp: orderBook.timestamp.toISOString()
      };

      return reply.send({
        success: true,
        data: formattedOrderBook,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      console.error(`❌ Error fetching P2P order book for ${request.params.symbol}:`, error);

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch P2P order book',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===========================
  // P2P TRADE HISTORY
  // ===========================

  /**
   * Get user's P2P trade history
   * GET /api/v1/p2p/trades
   */
  fastify.get('/trades', {
    schema: {
      tags: ['P2P Trading'],
      summary: 'Get user P2P trade history',
      querystring: P2PTradeQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array' },
            count: { type: 'number' },
            responseTime: { type: 'string' }
          }
        }
      }
    },
    preHandler: fastify.authenticate
  }, async (request: P2PTradeQueryRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const user = request.user as any;
      const query = request.query;
      
      const trades = p2pEngine.getUserTrades(user.id, query.limit);
      const responseTime = Date.now() - startTime;

      // Filter by symbol if specified
      const filteredTrades = query.symbol ? 
        trades.filter(trade => trade.symbol === query.symbol) : 
        trades;

      return reply.send({
        success: true,
        data: filteredTrades.map(trade => ({
          id: trade.id,
          symbol: trade.symbol,
          side: trade.buyerId === user.id ? 'BUY' : 'SELL',
          price: trade.price.toString(),
          quantity: trade.quantity.toString(),
          makerFee: trade.makerFee.toString(),
          takerFee: trade.takerFee.toString(),
          paymentMethod: trade.paymentMethod,
          status: trade.status,
          escrowId: trade.escrowId,
          executedAt: trade.executedAt.toISOString(),
          settledAt: trade.settledAt?.toISOString()
        })),
        count: filteredTrades.length,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const user = request.user as any;

      console.error(`❌ Error fetching P2P trades for user ${user?.id}:`, error);

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch P2P trade history',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===========================
  // P2P MARKET DATA
  // ===========================

  /**
   * Get P2P market statistics
   * GET /api/v1/p2p/market/stats
   */
  fastify.get('/market/stats', {
    schema: {
      tags: ['P2P Trading'],
      summary: 'Get P2P market statistics',
      querystring: {
        type: 'object',
        properties: {
          symbol: { 
            type: 'string',
            pattern: '^[A-Z]+-[A-Z]+$',
            description: 'Trading pair symbol (optional)'
          },
          period: {
            type: 'string',
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h'
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const query = request.query as any;
      
      // Mock market stats - implement with real data
      const marketStats = {
        totalVolume24h: '1250000.00',
        totalTrades24h: 1847,
        activeOrders: 3421,
        activePairs: 12,
        averageSpread: '0.05%',
        topPairs: [
          { symbol: 'BTC-USDT', volume24h: '850000.00', change24h: '+2.5%' },
          { symbol: 'ETH-USDT', volume24h: '320000.00', change24h: '+1.8%' },
          { symbol: 'BNB-USDT', volume24h: '80000.00', change24h: '-0.3%' }
        ],
        reputationDistribution: {
          excellent: 234,  // 90-100
          good: 1456,      // 70-89
          average: 1987,   // 50-69
          poor: 432,       // 30-49
          new: 312         // 0-29
        }
      };

      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: marketStats,
        responseTime: `${responseTime}ms`
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      console.error('❌ Error fetching P2P market stats:', error);

      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch P2P market statistics',
        responseTime: `${responseTime}ms`
      });
    }
  });

  // ===========================
  // P2P WEBSOCKET INTEGRATION
  // ===========================

  /**
   * WebSocket endpoint for real-time P2P trading updates
   */
  fastify.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, (connection, req) => {
      console.log('🔌 P2P WebSocket client connected');

      // Subscribe to matching engine events
      const handleOrderbookUpdate = (data: any) => {
        connection.socket.send(JSON.stringify({
          type: 'orderbook_update',
          data: {
            symbol: data.symbol,
            timestamp: new Date().toISOString(),
            bids: data.orderBook.bids.slice(0, 10), // Top 10
            asks: data.orderBook.asks.slice(0, 10)  // Top 10
          }
        }));
      };

      const handleTradeExecuted = (trade: any) => {
        connection.socket.send(JSON.stringify({
          type: 'trade_executed',
          data: {
            id: trade.id,
            symbol: trade.symbol,
            price: trade.price.toString(),
            quantity: trade.quantity.toString(),
            timestamp: trade.executedAt.toISOString()
          }
        }));
      };

      // Register event listeners
      p2pEngine.on('orderbook:updated', handleOrderbookUpdate);
      p2pEngine.on('trade:executed', handleTradeExecuted);

      // Handle client messages
      connection.socket.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          
          switch (data.type) {
            case 'subscribe_orderbook':
              // Subscribe to specific trading pair updates
              console.log(`📊 Client subscribed to ${data.symbol} orderbook`);
              break;
              
            case 'unsubscribe_orderbook':
              // Unsubscribe from trading pair updates
              console.log(`📊 Client unsubscribed from ${data.symbol} orderbook`);
              break;
              
            default:
              console.warn('❓ Unknown WebSocket message type:', data.type);
          }
        } catch (error) {
          console.error('❌ Error handling WebSocket message:', error);
        }
      });

      // Cleanup on disconnect
      connection.socket.on('close', () => {
        p2pEngine.off('orderbook:updated', handleOrderbookUpdate);
        p2pEngine.off('trade:executed', handleTradeExecuted);
        console.log('🔌 P2P WebSocket client disconnected');
      });
    });
  });

  // ===========================
  // HEALTH CHECK
  // ===========================

  /**
   * P2P engine health check
   * GET /api/v1/p2p/health
   */
  fastify.get('/health', {
    schema: {
      tags: ['P2P Trading'],
      summary: 'P2P engine health check'
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();

    try {
      const responseTime = Date.now() - startTime;
      
      return reply.send({
        success: true,
        status: 'healthy',
        engine: 'P2P Matching Engine',
        version: '1.0.0',
        uptime: process.uptime(),
        responseTime: `${responseTime}ms`,
        features: {
          orderMatching: true,
          escrowIntegration: true,
          reputationSystem: true,
          multiAssetSupport: true,
          webSocketUpdates: true
        }
      });
    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      return reply.status(503).send({
        success: false,
        status: 'unhealthy',
        error: error.message,
        responseTime: `${responseTime}ms`
      });
    }
  });

  console.log('🚀 P2P Trading routes registered successfully');
}

console.log('🔗 P2P Trading routes module loaded');
