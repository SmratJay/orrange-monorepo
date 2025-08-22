// Market Data API Routes - Real-time price feeds and analytics
// MIT-level engineering with enterprise performance optimization

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { MarketDataService } from '../services/MarketDataService';

// Request validation schemas
const GetPriceRequestSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase()
});

const GetMultiplePricesRequestSchema = z.object({
  symbols: z.array(z.string().min(1).max(10)).max(20) // Limit to 20 symbols
});

const CreatePriceAlertRequestSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  condition: z.enum(['ABOVE', 'BELOW', 'CHANGE']),
  targetPrice: z.number().positive(),
  isActive: z.boolean().optional().default(true)
});

const GetAnalyticsRequestSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  period: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h')
});

const GetVolumeRequestSchema = z.object({
  symbol: z.string().min(1).max(10).toUpperCase(),
  period: z.enum(['1h', '24h', '7d', '30d']).optional().default('24h')
});

// Request interfaces
interface GetPriceRequest {
  Params: {
    symbol: string;
  };
}

interface GetMultiplePricesRequest {
  Body: {
    symbols: string[];
  };
}

interface CreatePriceAlertRequest {
  Body: {
    symbol: string;
    condition: 'ABOVE' | 'BELOW' | 'CHANGE';
    targetPrice: number;
    isActive?: boolean;
  };
}

interface RemovePriceAlertRequest {
  Params: {
    alertId: string;
  };
}

interface GetAnalyticsRequest {
  Params: {
    symbol: string;
  };
  Querystring: {
    period?: '1h' | '24h' | '7d' | '30d';
  };
}

interface GetVolumeRequest {
  Params: {
    symbol: string;
  };
  Querystring: {
    period?: '1h' | '24h' | '7d' | '30d';
  };
}

export default async function marketDataRoutes(fastify: FastifyInstance) {
  // Initialize market data service
  const marketDataService = new MarketDataService(
    fastify.prisma,
    fastify.redis,
    {
      wsPort: parseInt(process.env.MARKET_WS_PORT || '8081'),
      updateIntervalMs: parseInt(process.env.PRICE_UPDATE_INTERVAL || '30000'),
      enableWebSocket: process.env.ENABLE_MARKET_WEBSOCKET !== 'false'
    }
  );

  // Initialize the service
  await marketDataService.initialize();

  // Store service instance for other routes to use
  fastify.decorate('marketDataService', marketDataService);

  /**
   * GET /prices/live - Get real-time price for all supported symbols
   * @description Retrieves current market prices for all supported cryptocurrencies
   */
  fastify.get('/prices/live', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const supportedSymbols = ['BTC', 'ETH', 'USDT', 'BNB', 'ADA', 'DOT', 'LINK', 'UNI', 'LTC', 'XRP'];
      const prices = await marketDataService.getPrices(supportedSymbols);

      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: {
          prices,
          count: prices.length,
          lastUpdate: new Date().toISOString(),
          responseTime: `${responseTime}ms`
        },
        meta: {
          supportedSymbols,
          updateInterval: '30s',
          source: 'aggregated'
        }
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      fastify.log.error({ error: error.message, responseTime }, 'Error fetching live prices');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch live prices',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * GET /prices/:symbol - Get price for specific symbol
   * @description Retrieves current market price for a specific cryptocurrency
   */
  fastify.get<GetPriceRequest>('/prices/:symbol', async (request: FastifyRequest<GetPriceRequest>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const { symbol } = GetPriceRequestSchema.parse(request.params);
      const price = await marketDataService.getPrice(symbol);

      const responseTime = Date.now() - startTime;

      if (!price) {
        return reply.status(404).send({
          success: false,
          error: `Price data not available for ${symbol}`,
          responseTime: `${responseTime}ms`
        });
      }

      return reply.send({
        success: true,
        data: price,
        responseTime: `${responseTime}ms`
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      if (error.name === 'ZodError') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid symbol format',
          details: error.errors,
          responseTime: `${responseTime}ms`
        });
      }

      fastify.log.error({ symbol: request.params.symbol, error: error.message }, 'Error fetching price');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch price data',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * POST /prices/batch - Get prices for multiple symbols
   * @description Retrieves current market prices for multiple cryptocurrencies
   */
  fastify.post<GetMultiplePricesRequest>('/prices/batch', async (request: FastifyRequest<GetMultiplePricesRequest>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const { symbols } = GetMultiplePricesRequestSchema.parse(request.body);
      const prices = await marketDataService.getPrices(symbols);

      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: {
          prices,
          requested: symbols.length,
          found: prices.length,
          missing: symbols.filter(symbol => !prices.find(p => p.symbol === symbol))
        },
        responseTime: `${responseTime}ms`
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      if (error.name === 'ZodError') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid request format',
          details: error.errors,
          responseTime: `${responseTime}ms`
        });
      }

      fastify.log.error({ error: error.message }, 'Error fetching batch prices');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch price data',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * GET /analytics/:symbol - Get market analytics for a symbol
   * @description Retrieves comprehensive market analytics and trading statistics
   */
  fastify.get<GetAnalyticsRequest>('/analytics/:symbol', async (request: FastifyRequest<GetAnalyticsRequest>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const { symbol } = request.params;
      const { period = '24h' } = request.query;

      const analytics = await marketDataService.getMarketAnalytics(symbol, period);

      const responseTime = Date.now() - startTime;

      if (!analytics) {
        return reply.status(404).send({
          success: false,
          error: `Analytics not available for ${symbol}`,
          responseTime: `${responseTime}ms`
        });
      }

      return reply.send({
        success: true,
        data: analytics,
        responseTime: `${responseTime}ms`
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      fastify.log.error({ symbol: request.params.symbol, error: error.message }, 'Error fetching analytics');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch analytics data',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * GET /volume/:symbol - Get trading volume for a symbol
   * @description Retrieves trading volume statistics for a specific period
   */
  fastify.get<GetVolumeRequest>('/volume/:symbol', async (request: FastifyRequest<GetVolumeRequest>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const { symbol } = request.params;
      const { period = '24h' } = request.query;

      const volumeData = await marketDataService.getTradingVolume(symbol, period);

      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          period,
          ...volumeData
        },
        responseTime: `${responseTime}ms`
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      fastify.log.error({ symbol: request.params.symbol, error: error.message }, 'Error fetching volume data');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch volume data',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * POST /alerts/create - Create price alert
   * @description Creates a new price alert for the authenticated user
   */
  fastify.post<CreatePriceAlertRequest>('/alerts/create', {
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest<CreatePriceAlertRequest>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const userId = (request.user as any)?.userId;
      if (!userId) {
        return reply.status(401).send({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const alertData = CreatePriceAlertRequestSchema.parse(request.body);
      
      const alert = await marketDataService.createPriceAlert({
        ...alertData,
        userId
      });

      const responseTime = Date.now() - startTime;

      return reply.status(201).send({
        success: true,
        data: alert,
        message: 'Price alert created successfully',
        responseTime: `${responseTime}ms`
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      if (error.name === 'ZodError') {
        return reply.status(400).send({
          success: false,
          error: 'Invalid alert configuration',
          details: error.errors,
          responseTime: `${responseTime}ms`
        });
      }

      fastify.log.error({ error: error.message }, 'Error creating price alert');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to create price alert',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * GET /alerts/list - Get user's price alerts
   * @description Retrieves all active price alerts for the authenticated user
   */
  fastify.get('/alerts/list', {
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const userId = (request.user as any)?.userId;
      if (!userId) {
        return reply.status(401).send({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const alerts = await marketDataService.getUserPriceAlerts(userId);

      const responseTime = Date.now() - startTime;

      return reply.send({
        success: true,
        data: {
          alerts,
          count: alerts.length
        },
        responseTime: `${responseTime}ms`
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      fastify.log.error({ error: error.message }, 'Error fetching price alerts');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to fetch price alerts',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * DELETE /alerts/:alertId - Remove price alert
   * @description Removes a price alert for the authenticated user
   */
  fastify.delete<RemovePriceAlertRequest>('/alerts/:alertId', {
    preHandler: fastify.authenticate
  }, async (request: FastifyRequest<RemovePriceAlertRequest>, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const userId = (request.user as any)?.userId;
      if (!userId) {
        return reply.status(401).send({ 
          success: false, 
          error: 'Authentication required' 
        });
      }

      const { alertId } = request.params;
      const success = await marketDataService.removePriceAlert(alertId, userId);

      const responseTime = Date.now() - startTime;

      if (!success) {
        return reply.status(404).send({
          success: false,
          error: 'Price alert not found or not authorized',
          responseTime: `${responseTime}ms`
        });
      }

      return reply.send({
        success: true,
        message: 'Price alert removed successfully',
        responseTime: `${responseTime}ms`
      });

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      fastify.log.error({ alertId: request.params.alertId, error: error.message }, 'Error removing price alert');
      
      return reply.status(500).send({
        success: false,
        error: 'Failed to remove price alert',
        responseTime: `${responseTime}ms`
      });
    }
  });

  /**
   * GET /health - Health check for market data service
   * @description Returns health status and performance metrics
   */
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await marketDataService.healthCheck();

      const statusCode = health.status === 'healthy' ? 200 : 
                        health.status === 'degraded' ? 206 : 503;

      return reply.status(statusCode).send({
        success: health.status !== 'unhealthy',
        status: health.status,
        data: {
          activeSources: health.activeSources,
          cachedPrices: health.cachedPrices,
          connectedClients: health.connectedClients,
          lastUpdate: health.lastUpdate
        },
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      fastify.log.error({ error: error.message }, 'Error checking market data service health');
      
      return reply.status(500).send({
        success: false,
        status: 'unhealthy',
        error: 'Health check failed'
      });
    }
  });

  // Graceful shutdown handler
  fastify.addHook('onClose', async () => {
    fastify.log.info('Shutting down market data service...');
    await marketDataService.shutdown();
  });
}
