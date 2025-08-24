/**
 * Advanced P2P Real-time Trading API Routes
 * MIT-Level Engineering - Pure P2P Crypto Platform
 * 
 * Features:
 * - Real-time order management
 * - WebSocket streaming
 * - Market data analytics
 * - Performance metrics
 * - Advanced order types
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

// Validation schemas
const AdvancedOrderSchema = z.object({
  symbol: z.string().min(3),
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT']),
  quantity: z.string().refine(val => !isNaN(Number(val)) && Number(val) > 0),
  price: z.string().optional().refine(val => !val || (!isNaN(Number(val)) && Number(val) > 0)),
  timeInForce: z.enum(['IOC', 'FOK', 'GTC', 'GTD']).optional(),
  expireAt: z.string().datetime().optional(),
  stopPrice: z.string().optional(),
  triggerPrice: z.string().optional(),
  maxPortfolioPercentage: z.number().min(0).max(100).optional(),
  minFillQuantity: z.string().optional(),
  maxSlippage: z.string().optional(),
  preferredCounterparties: z.array(z.string()).optional(),
  excludedCounterparties: z.array(z.string()).optional(),
  requiredReputationScore: z.number().min(0).max(100).optional(),
  acceptedPaymentMethods: z.array(z.string()).optional(),
  escrowRequirement: z.enum(['FULL', 'PARTIAL', 'NONE']).optional(),
  clientOrderId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional()
});

const OrderModificationSchema = z.object({
  orderId: z.string(),
  newQuantity: z.string().optional(),
  newPrice: z.string().optional(),
  newTimeInForce: z.enum(['IOC', 'FOK', 'GTC', 'GTD']).optional(),
  newExpireAt: z.string().datetime().optional()
});

/**
 * Advanced P2P Real-time Trading Routes
 */
const advancedP2PRoutes: FastifyPluginAsync = async (fastify) => {

  // ===========================
  // ADVANCED ORDER MANAGEMENT
  // ===========================

  /**
   * Submit advanced P2P order
   */
  fastify.post('/orders/advanced', {
    schema: {
      description: 'Submit advanced P2P order with comprehensive features',
      tags: ['P2P Advanced Trading'],
      security: [{ bearerAuth: [] }],
      body: AdvancedOrderSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            orderId: { type: 'string' },
            analytics: {
              type: 'object',
              properties: {
                estimatedFillTime: { type: 'number' },
                priceImpact: { type: 'string' },
                riskAssessment: { type: 'string' },
                portfolioImpact: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = (request.user as any)?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const orderData = request.body as z.infer<typeof AdvancedOrderSchema>;
      
      // Submit order through advanced order management service
      const result = await fastify.orderManagementService.submitAdvancedOrder({
        userId,
        ...orderData
      });

      if (result.success) {
        // Audit log
        await fastify.auditService.logActivity({
          userId,
          action: 'ADVANCED_ORDER_SUBMITTED',
          resourceType: 'P2P_ADVANCED_ORDER',
          resourceId: result.orderId!,
          metadata: orderData
        });

        return reply.send(result);
      } else {
        return reply.code(400).send({ error: result.error });
      }

    } catch (error) {
      fastify.log.error('Error submitting advanced order:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Modify existing order
   */
  fastify.put('/orders/modify', {
    schema: {
      description: 'Modify existing P2P order',
      tags: ['P2P Advanced Trading'],
      security: [{ bearerAuth: [] }],
      body: OrderModificationSchema
    }
  }, async (request, reply) => {
    try {
      const userId = (request.user as any)?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const modification = request.body as z.infer<typeof OrderModificationSchema>;
      
      const result = await fastify.orderManagementService.modifyOrder(modification);

      if (result.success) {
        return reply.send({ success: true });
      } else {
        return reply.code(400).send({ error: result.error });
      }

    } catch (error) {
      fastify.log.error('Error modifying order:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get user's active orders with analytics
   */
  fastify.get('/orders/active', {
    schema: {
      description: 'Get user active orders with analytics',
      tags: ['P2P Advanced Trading'],
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            orders: { type: 'array' },
            analytics: { type: 'object' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = (request.user as any)?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const orders = await fastify.orderManagementService.getUserActiveOrders(userId);
      
      // Get analytics for each order
      const ordersWithAnalytics = orders.map(order => ({
        ...order,
        analytics: fastify.orderManagementService.getOrderAnalytics(order.id)
      }));

      return reply.send({
        orders: ordersWithAnalytics,
        analytics: {
          totalActiveOrders: orders.length,
          totalValue: orders.reduce((sum, order) => sum + Number(order.quantity) * Number(order.price || 0), 0),
          averageFillRate: ordersWithAnalytics.reduce((sum, order) => 
            sum + (order.analytics?.fillRate || 0), 0) / ordersWithAnalytics.length
        }
      });

    } catch (error) {
      fastify.log.error('Error fetching user orders:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Cancel order
   */
  fastify.delete('/orders/:orderId', {
    schema: {
      description: 'Cancel P2P order',
      tags: ['P2P Advanced Trading'],
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          orderId: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = (request.user as any)?.id;
      if (!userId) {
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { orderId } = request.params as { orderId: string };
      
      const result = await fastify.orderManagementService.cancelOrder(orderId, userId);

      if (result.success) {
        return reply.send({ success: true });
      } else {
        return reply.code(400).send({ error: result.error });
      }

    } catch (error) {
      fastify.log.error('Error cancelling order:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // ===========================
  // MARKET DATA & ANALYTICS
  // ===========================

  /**
   * Get comprehensive market snapshot
   */
  fastify.get('/market/:symbol/snapshot', {
    schema: {
      description: 'Get comprehensive market snapshot',
      tags: ['P2P Market Data'],
      params: {
        type: 'object',
        properties: {
          symbol: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { symbol } = request.params as { symbol: string };
      
      const snapshot = await fastify.marketDataService.getMarketSnapshot(symbol);
      
      if (snapshot) {
        return reply.send(snapshot);
      } else {
        return reply.code(404).send({ error: 'Market data not available for symbol' });
      }

    } catch (error) {
      fastify.log.error('Error fetching market snapshot:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get all market snapshots
   */
  fastify.get('/market/snapshots', {
    schema: {
      description: 'Get all market snapshots',
      tags: ['P2P Market Data']
    }
  }, async (request, reply) => {
    try {
      const snapshots = await fastify.marketDataService.getAllMarketSnapshots();
      return reply.send({ snapshots });
    } catch (error) {
      fastify.log.error('Error fetching all market snapshots:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get liquidity analysis
   */
  fastify.get('/market/:symbol/liquidity', {
    schema: {
      description: 'Get detailed liquidity analysis',
      tags: ['P2P Market Data'],
      params: {
        type: 'object',
        properties: {
          symbol: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { symbol } = request.params as { symbol: string };
      
      const analysis = await fastify.marketDataService.getLiquidityAnalysis(symbol);
      
      if (analysis) {
        return reply.send(analysis);
      } else {
        return reply.code(404).send({ error: 'Liquidity analysis not available' });
      }

    } catch (error) {
      fastify.log.error('Error fetching liquidity analysis:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get market trends
   */
  fastify.get('/market/:symbol/trends', {
    schema: {
      description: 'Get market trends analysis',
      tags: ['P2P Market Data'],
      params: {
        type: 'object',
        properties: {
          symbol: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { symbol } = request.params as { symbol: string };
      
      const trends = fastify.marketDataService.getMarketTrends(symbol);
      return reply.send({ trends });

    } catch (error) {
      fastify.log.error('Error fetching market trends:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get recent trades
   */
  fastify.get('/market/:symbol/trades', {
    schema: {
      description: 'Get recent trades',
      tags: ['P2P Market Data'],
      params: {
        type: 'object',
        properties: {
          symbol: { type: 'string' }
        }
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
      const { symbol } = request.params as { symbol: string };
      const { limit = 50 } = request.query as { limit?: number };
      
      const trades = fastify.marketDataService.getRecentTrades(symbol, limit);
      return reply.send({ trades });

    } catch (error) {
      fastify.log.error('Error fetching recent trades:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get trading pairs
   */
  fastify.get('/market/pairs', {
    schema: {
      description: 'Get all trading pairs',
      tags: ['P2P Market Data']
    }
  }, async (request, reply) => {
    try {
      const pairs = fastify.marketDataService.getAllTradingPairs();
      return reply.send({ pairs });
    } catch (error) {
      fastify.log.error('Error fetching trading pairs:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // ===========================
  // REAL-TIME WEBSOCKET API
  // ===========================

  /**
   * WebSocket endpoint for real-time updates
   */
  fastify.get('/ws', { websocket: true }, (connection, request) => {
    fastify.log.info('P2P Advanced WebSocket connection established');

    // Proxy to the dedicated real-time service
    // This is a simplified implementation - in production, you'd have more sophisticated routing
    connection.socket.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        // Forward to real-time service for processing
        // The P2PRealtimeService handles the actual WebSocket logic
      } catch (error) {
        connection.socket.send(JSON.stringify({
          type: 'error',
          data: { message: 'Invalid message format' }
        }));
      }
    });

    connection.socket.on('close', () => {
      fastify.log.info('P2P Advanced WebSocket connection closed');
    });
  });

  // ===========================
  // PERFORMANCE & ANALYTICS
  // ===========================

  /**
   * Get order management performance metrics
   */
  fastify.get('/analytics/order-management', {
    schema: {
      description: 'Get order management performance metrics',
      tags: ['P2P Analytics'],
      security: [{ bearerAuth: [] }]
    }
  }, async (request, reply) => {
    try {
      const metrics = fastify.orderManagementService.getPerformanceMetrics();
      return reply.send(metrics);
    } catch (error) {
      fastify.log.error('Error fetching order management metrics:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get market data performance metrics
   */
  fastify.get('/analytics/market-data', {
    schema: {
      description: 'Get market data performance metrics',
      tags: ['P2P Analytics']
    }
  }, async (request, reply) => {
    try {
      const metrics = fastify.marketDataService.getPerformanceMetrics();
      return reply.send(metrics);
    } catch (error) {
      fastify.log.error('Error fetching market data metrics:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get real-time service statistics
   */
  fastify.get('/analytics/realtime', {
    schema: {
      description: 'Get real-time service statistics',
      tags: ['P2P Analytics']
    }
  }, async (request, reply) => {
    try {
      const stats = fastify.realtimeService.getStats();
      return reply.send(stats);
    } catch (error) {
      fastify.log.error('Error fetching real-time stats:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  /**
   * Get P2P engine statistics
   */
  fastify.get('/analytics/engine', {
    schema: {
      description: 'Get P2P matching engine statistics',
      tags: ['P2P Analytics']
    }
  }, async (request, reply) => {
    try {
      const stats = fastify.p2pEngine.getEngineStats();
      return reply.send(stats);
    } catch (error) {
      fastify.log.error('Error fetching engine stats:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  fastify.log.info('🚀 Advanced P2P Real-time Trading routes registered');
};

export default advancedP2PRoutes;
