// Advanced Trading API Routes - Powered by Unified Smart Engine
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import SimpleMatchingEngine from '../matching/simple-engine';

interface OrderRequest {
  Body: {
    pair: string;
    type: 'BUY' | 'SELL';
    orderType: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'STOP_LIMIT';
    amount: number;
    price?: number;
    stopPrice?: number;
    limitPrice?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
    clientOrderId?: string;
  };
}

interface CancelOrderRequest {
  Params: {
    orderId: string;
  }
}

interface OrderBookRequest {
  Params: {
    pair: string;
  }
  Querystring: {
    depth?: number;
  }
}

interface TradesRequest {
  Params: {
    pair: string;
  }
  Querystring: {
    limit?: number;
    since?: string;
  }
}

interface PortfolioRequest {
  Querystring: {
    userId?: string;
  }
}

export async function advancedTradingRoutes(fastify: FastifyInstance) {
  // Get the matching engine from fastify decorator
  const engine = fastify.matchingEngine as SimpleMatchingEngine;

  // ===== ORDER MANAGEMENT =====

  // Place a new order with advanced order types
  fastify.post('/api/v1/trading/orders', {
    schema: {
      body: {
        type: 'object',
        required: ['pair', 'type', 'orderType', 'amount'],
        properties: {
          pair: { type: 'string', pattern: '^[A-Z]+-[A-Z]+$' },
          type: { type: 'string', enum: ['BUY', 'SELL'] },
          orderType: { type: 'string', enum: ['MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT', 'STOP_LIMIT'] },
          amount: { type: 'number', minimum: 0.000001 },
          price: { type: 'number', minimum: 0 },
          stopPrice: { type: 'number', minimum: 0 },
          limitPrice: { type: 'number', minimum: 0 },
          timeInForce: { type: 'string', enum: ['GTC', 'IOC', 'FOK'] },
          clientOrderId: { type: 'string', maxLength: 64 }
        }
      }
    }
  }, async (request: FastifyRequest<OrderRequest>, reply: FastifyReply) => {
    try {
      // In production, extract userId from JWT token
      const userId = 'user_123'; // Mock user ID
      
      const orderData = {
        ...request.body,
        userId,
        pair: request.body.pair.toUpperCase()
      };

      // Validate order type requirements
      if (orderData.orderType === 'LIMIT' && !orderData.price) {
        return reply.code(400).send({
          success: false,
          error: 'Price is required for LIMIT orders'
        });
      }

      if (orderData.orderType === 'STOP_LOSS' && !orderData.stopPrice) {
        return reply.code(400).send({
          success: false,
          error: 'Stop price is required for STOP_LOSS orders'
        });
      }

      if (orderData.orderType === 'STOP_LIMIT' && (!orderData.stopPrice || !orderData.limitPrice)) {
        return reply.code(400).send({
          success: false,
          error: 'Both stop price and limit price are required for STOP_LIMIT orders'
        });
      }

      const order = await engine.placeOrder(orderData);

      return {
        success: true,
        data: {
          orderId: order.id,
          clientOrderId: order.id, // Use orderId as clientOrderId
          pair: order.pair,
          type: order.side, // Use side as type
          orderType: order.orderType,
          amount: order.amount,
          price: order.price,
          stopPrice: '0', // Default value
          limitPrice: order.price, // Use price as limitPrice
          status: order.status,
          timeInForce: 'GTC', // Default value
          createdAt: new Date(order.timestamp).toISOString(),
          estimatedFee: parseFloat(order.amount) * 0.001 // 0.1% fee
        },
        message: 'Order placed successfully'
      };

    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to place order'
      });
    }
  });

  // Cancel an order
  fastify.delete('/api/v1/trading/orders/:orderId', async (
    request: FastifyRequest<CancelOrderRequest>, 
    reply: FastifyReply
  ) => {
    try {
      const { orderId } = request.params;
      const userId = 'user_123'; // Extract from JWT in production

      const success = await engine.cancelOrder(orderId, userId);

      if (!success) {
        return reply.code(404).send({
          success: false,
          error: 'Order not found or cannot be cancelled'
        });
      }

      return {
        success: true,
        message: 'Order cancelled successfully',
        data: { orderId }
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to cancel order'
      });
    }
  });

  // Get user's active orders
  fastify.get('/api/v1/trading/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = 'user_123'; // Extract from JWT in production

      // This would fetch from database in production
      const mockOrders = [
        {
          orderId: 'order_123',
          pair: 'BTC-USD',
          type: 'BUY',
          orderType: 'LIMIT',
          amount: 0.5,
          price: 45000,
          filledAmount: 0.2,
          status: 'PARTIAL',
          createdAt: new Date().toISOString()
        }
      ];

      return {
        success: true,
        data: {
          orders: mockOrders,
          count: mockOrders.length
        }
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get orders'
      });
    }
  });

  // ===== MARKET DATA =====

  // Get enhanced order book with depth
  fastify.get('/api/v1/trading/orderbook/:pair', async (
    request: FastifyRequest<OrderBookRequest>, 
    reply: FastifyReply
  ) => {
    try {
      const { pair } = request.params;
      const { depth = 20 } = request.query;

      const orderBook = await engine.getOrderBook(pair.toUpperCase(), Number(depth));

      if (!orderBook) {
        return reply.code(404).send({
          success: false,
          error: `Order book not found for pair ${pair}`
        });
      }

      return {
        success: true,
        data: {
          pair: orderBook.pair,
          bids: orderBook.bids.map((level: any) => ({
            price: level.price,
            amount: level.amount,
            total: parseFloat(level.price) * parseFloat(level.amount),
            orderCount: 1
          })),
          asks: orderBook.asks.map((level: any) => ({
            price: level.price,
            amount: level.amount,
            total: parseFloat(level.price) * parseFloat(level.amount),
            orderCount: 1
          })),
          spread: orderBook.spread,
          lastPrice: orderBook.lastPrice,
          lastUpdated: orderBook.timestamp
        }
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get order book'
      });
    }
  });

  // Get recent trades with advanced filtering
  fastify.get('/api/v1/trading/trades/:pair', async (
    request: FastifyRequest<TradesRequest>, 
    reply: FastifyReply
  ) => {
    try {
      const { pair } = request.params;
      const { limit = 50, since } = request.query;

      const trades = await engine.getRecentTrades(pair.toUpperCase(), Number(limit));

      // Filter by timestamp if 'since' is provided
      let filteredTrades = trades;
      if (since) {
        const sinceTimestamp = new Date(since);
        filteredTrades = trades.filter((trade: any) =>
          new Date(trade.executedAt) > sinceTimestamp
        );
      }

      return {
        success: true,
        data: {
          pair: pair.toUpperCase(),
          trades: filteredTrades.map((trade: any) => ({
            id: trade.id,
            price: trade.price,
            amount: trade.amount,
            timestamp: trade.executedAt,
            side: trade.tradeType === 'MAKER' ? 'maker' : 'taker'
          })),
          count: filteredTrades.length
        }
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get trades'
      });
    }
  });

  // Get advanced trading metrics and analytics
  fastify.get('/api/v1/trading/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = engine.getAdvancedMetrics();

      return {
        success: true,
        data: {
          performance: {
            totalOrders: metrics.totalOrders,
            totalTrades: metrics.totalTrades,
            totalVolume: metrics.totalVolume,
            averageSpread: metrics.averageSpread,
            matchingLatency: metrics.matchingLatency,
            ordersPerSecond: metrics.ordersPerSecond,
            tradesPerSecond: metrics.tradesPerSecond
          },
          orderBooks: metrics.orderBookDepth,
          priceMovements: metrics.priceMovements,
          systemStatus: {
            activeOrders: metrics.activeOrders,
            lastMatchTime: metrics.lastMatchTime,
            uptime: process.uptime()
          }
        }
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get metrics'
      });
    }
  });

  // Get ticker data for all pairs
  fastify.get('/api/v1/trading/ticker', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = engine.getAdvancedMetrics();
      
      const tickers = Object.entries(metrics.priceMovements || {}).map(([pair, data]: [string, any]) => ({
        pair,
        price: data?.current || 0,
        change24h: data?.change24h || 0,
        volume24h: metrics.totalVolume || 0,
        high24h: (data?.current || 0) * 1.05,
        low24h: (data?.current || 0) * 0.95,
        timestamp: new Date().toISOString()
      }));

      return {
        success: true,
        data: tickers
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get ticker data'
      });
    }
  });

  // ===== PORTFOLIO MANAGEMENT =====

  // Get user portfolio with P&L calculations
  fastify.get('/api/v1/trading/portfolio', async (
    request: FastifyRequest<PortfolioRequest>, 
    reply: FastifyReply
  ) => {
    try {
      const userId = 'user_123'; // Extract from JWT in production

      // Mock portfolio data (would come from database)
      const portfolio = {
        userId,
        totalBalance: 10000,
        availableBalance: 8500,
        lockedBalance: 1500,
        totalPnL: 250.75,
        totalPnLPercentage: 2.56,
        positions: [
          {
            asset: 'BTC',
            amount: 0.25,
            averagePrice: 42000,
            currentPrice: 45000,
            value: 11250,
            pnl: 750,
            pnlPercentage: 7.14
          },
          {
            asset: 'ETH',
            amount: 2.5,
            averagePrice: 2800,
            currentPrice: 2850,
            value: 7125,
            pnl: 125,
            pnlPercentage: 1.79
          }
        ],
        openOrders: [
          {
            orderId: 'order_123',
            pair: 'BTC-USD',
            type: 'BUY',
            amount: 0.1,
            price: 44000,
            lockedAmount: 4400
          }
        ]
      };

      return {
        success: true,
        data: portfolio
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get portfolio'
      });
    }
  });

  // Get trading history with detailed analytics
  fastify.get('/api/v1/trading/history', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = 'user_123'; // Extract from JWT in production

      // Mock trading history (would come from database)
      const history = {
        trades: [
          {
            id: 'trade_123',
            pair: 'BTC-USD',
            side: 'BUY',
            amount: 0.15,
            price: 43000,
            fee: 0.64,
            timestamp: new Date().toISOString()
          }
        ],
        summary: {
          totalTrades: 15,
          totalVolume: 50000,
          totalFees: 50.25,
          winRate: 66.7,
          bestTrade: 125.50,
          worstTrade: -45.25
        }
      };

      return {
        success: true,
        data: history
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get trading history'
      });
    }
  });

  // ===== ADVANCED FEATURES =====

  // Set price alerts
  fastify.post('/api/v1/trading/alerts', {
    schema: {
      body: {
        type: 'object',
        required: ['pair', 'price', 'condition'],
        properties: {
          pair: { type: 'string' },
          price: { type: 'number' },
          condition: { type: 'string', enum: ['above', 'below'] },
          message: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = 'user_123'; // Extract from JWT in production
      const alertData = request.body as any;

      const alert = {
        id: `alert_${Date.now()}`,
        userId,
        ...alertData,
        active: true,
        createdAt: new Date().toISOString()
      };

      // In production, save to database and set up monitoring

      return {
        success: true,
        data: alert,
        message: 'Price alert created successfully'
      };

    } catch (error) {
      return reply.code(400).send({
        success: false,
        error: 'Failed to create price alert'
      });
    }
  });

  // Get market analysis and recommendations
  fastify.get('/api/v1/trading/analysis/:pair', async (
    request: FastifyRequest<{ Params: { pair: string } }>, 
    reply: FastifyReply
  ) => {
    try {
      const { pair } = request.params;
      const metrics = engine.getAdvancedMetrics();
      
      const priceData = (metrics.priceMovements as any)?.[pair.toUpperCase()];
      if (!priceData) {
        return reply.code(404).send({
          success: false,
          error: `Analysis not available for ${pair}`
        });
      }

      // Mock technical analysis (in production, this would use real TA algorithms)
      const analysis = {
        pair: pair.toUpperCase(),
        currentPrice: priceData.current,
        priceChange24h: priceData.change24h,
        technicalIndicators: {
          rsi: 65.5, // Relative Strength Index
          macd: 0.25, // MACD
          sma20: priceData.current * 0.98, // 20-day Simple Moving Average
          sma50: priceData.current * 0.95, // 50-day Simple Moving Average
          bollinger: {
            upper: priceData.current * 1.02,
            lower: priceData.current * 0.98,
            middle: priceData.current
          }
        },
        sentiment: {
          score: 0.7, // 0-1 scale
          label: 'Bullish',
          confidence: 75
        },
        recommendation: {
          action: 'HOLD',
          confidence: 80,
          targetPrice: priceData.current * 1.05,
          stopLoss: priceData.current * 0.95
        }
      };

      return {
        success: true,
        data: analysis
      };

    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get market analysis'
      });
    }
  });
}
