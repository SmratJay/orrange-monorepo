// Orrange P2P Platform - Decentralized P2P Exchange Server (Fastify)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';

// Import P2P services
import { P2PService } from './services/p2p-service.js';

// Import WebSocket handler
import { P2PWebSocketHandler } from './websocket/p2p-handler.js';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: process.env.NODE_ENV !== 'production' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  }
});

const prisma = new PrismaClient();
const p2pService = new P2PService(prisma);
const p2pWsHandler = new P2PWebSocketHandler();

// Register plugins
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
});

await fastify.register(cors, {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://orrange.exchange', 'https://app.orrange.exchange']
    : ['http://localhost:3000', 'http://localhost:3001', true],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

await fastify.register(rateLimit, {
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  timeWindow: '15 minutes'
});

await fastify.register(websocket, {
  options: {
    maxPayload: 1048576, // 1MB
    perMessageDeflate: true
  }
});

// Health Check Route
fastify.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const stats = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: 'connected',
      websocket: {
        connections: p2pWsHandler.getConnectionCount(),
        uptime: process.uptime()
      },
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };

    return stats;
  } catch (error) {
    reply.code(503);
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed'
    };
  }
});

// API Information Route
fastify.get('/', async (request, reply) => {
  return {
    name: 'Orrange P2P Exchange API',
    version: '1.0.0',
    description: 'Decentralized P2P cryptocurrency exchange platform',
    features: [
      'P2P Advertisement System',
      'Secure Escrow Integration',
      'Real-time Trade Chat',
      'Dispute Resolution',
      'Multi-payment Method Support',
      'Real-time WebSocket Updates'
    ],
    endpoints: {
      auth: '/api/auth',
      p2p: '/api/p2p',
      users: '/api/users',
      websocket: '/p2p-ws'
    },
    documentation: 'https://docs.orrange.exchange',
    support: 'support@orrange.exchange'
  };
});

// P2P Statistics Route
fastify.get('/api/stats', async (request, reply) => {
  try {
    const [
      totalAds,
      activeAds,
      totalTrades,
      completedTrades,
      totalUsers,
      activeUsers
    ] = await Promise.all([
      prisma.p2PAd.count(),
      prisma.p2PAd.count({ where: { status: 'ACTIVE', isVisible: true } }),
      prisma.p2PTrade.count(),
      prisma.p2PTrade.count({ where: { status: 'COMPLETED' } }),
      prisma.user.count(),
      prisma.user.count({ 
        where: { 
          lastActivity: { 
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000) 
          } 
        } 
      })
    ]);

    const last24Hours = await prisma.p2PTrade.aggregate({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      },
      _sum: {
        cryptoAmount: true,
        fiatAmount: true
      },
      _count: true
    });

    const popularPairs = await prisma.p2PTrade.groupBy({
      by: ['cryptoAsset', 'fiatCurrency'],
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      _count: true,
      orderBy: {
        _count: {
          cryptoAsset: 'desc'
        }
      },
      take: 5
    });

    return {
      success: true,
      data: {
        overview: {
          totalAds,
          activeAds,
          totalTrades,
          completedTrades,
          totalUsers,
          activeUsers,
          completionRate: totalTrades > 0 ? ((completedTrades / totalTrades) * 100).toFixed(2) : '0'
        },
        last24Hours: {
          trades: last24Hours._count,
          volume: {
            crypto: last24Hours._sum.cryptoAmount || 0,
            fiat: last24Hours._sum.fiatAmount || 0
          }
        },
        popularPairs: popularPairs.map(pair => ({
          pair: `${pair.cryptoAsset}-${pair.fiatCurrency}`,
          trades: pair._count
        })),
        websocket: {
          activeConnections: p2pWsHandler.getConnectionCount()
        }
      }
    };
  } catch (error: any) {
    reply.code(500);
    return {
      success: false,
      error: error.message
    };
  }
});

// Market Data Route
fastify.get('/api/market/:pair', async (request: any, reply) => {
  try {
    const { pair } = request.params;
    const [cryptoAsset, fiatCurrency] = pair.split('-');

    if (!cryptoAsset || !fiatCurrency) {
      reply.code(400);
      return {
        success: false,
        error: 'Invalid trading pair format. Use: BTC-USD'
      };
    }

    const [buyAds, sellAds, recentTrades] = await Promise.all([
      // Buy orders (users wanting to buy crypto)
      prisma.p2PAd.findMany({
        where: {
          type: 'BUY',
          cryptoAsset,
          fiatCurrency,
          status: 'ACTIVE',
          isVisible: true
        },
        include: {
          user: {
            select: {
              username: true,
              reputationScore: true,
              tradeCount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),

      // Sell orders (users wanting to sell crypto)
      prisma.p2PAd.findMany({
        where: {
          type: 'SELL',
          cryptoAsset,
          fiatCurrency,
          status: 'ACTIVE',
          isVisible: true
        },
        include: {
          user: {
            select: {
              username: true,
              reputationScore: true,
              tradeCount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      }),

      // Recent completed trades
      prisma.p2PTrade.findMany({
        where: {
          cryptoAsset,
          fiatCurrency,
          status: 'COMPLETED'
        },
        select: {
          exchangeRate: true,
          cryptoAmount: true,
          fiatAmount: true,
          completedAt: true
        },
        orderBy: { completedAt: 'desc' },
        take: 20
      })
    ]);

    // Calculate market statistics
    const last24hTrades = recentTrades.filter(
      trade => trade.completedAt && 
      trade.completedAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const avgPrice = last24hTrades.length > 0 
      ? last24hTrades.reduce((sum, trade) => sum + Number(trade.exchangeRate), 0) / last24hTrades.length
      : 0;

    const volume24h = last24hTrades.reduce((sum, trade) => sum + Number(trade.cryptoAmount), 0);

    return {
      success: true,
      data: {
        pair: `${cryptoAsset}-${fiatCurrency}`,
        buyOrders: buyAds,
        sellOrders: sellAds,
        recentTrades,
        statistics: {
          averagePrice24h: avgPrice,
          volume24h,
          tradesCount24h: last24hTrades.length,
          totalActiveAds: buyAds.length + sellAds.length
        },
        timestamp: new Date().toISOString()
      }
    };
  } catch (error: any) {
    reply.code(500);
    return {
      success: false,
      error: error.message
    };
  }
});

// P2P Advertisements Routes
fastify.get('/api/p2p/ads', async (request: any, reply) => {
  try {
    const filters = {
      type: request.query.type,
      cryptoAsset: request.query.cryptoAsset,
      fiatCurrency: request.query.fiatCurrency,
      country: request.query.country,
      paymentMethod: request.query.paymentMethod,
      minAmount: request.query.minAmount ? parseFloat(request.query.minAmount) : undefined,
      maxAmount: request.query.maxAmount ? parseFloat(request.query.maxAmount) : undefined,
      page: request.query.page ? parseInt(request.query.page) : undefined,
      limit: request.query.limit ? parseInt(request.query.limit) : undefined
    };

    const result = await p2pService.getAds(filters);
    
    return {
      success: true,
      data: result
    };
  } catch (error: any) {
    reply.code(500);
    return {
      success: false,
      error: error.message
    };
  }
});

// WebSocket Route
fastify.register(async function (fastify) {
  fastify.get('/p2p-ws', { websocket: true }, (connection, request) => {
    p2pWsHandler.handleConnection(connection.socket as any, request.raw);
  });
});

// Mock authentication middleware for testing
const mockAuth = async (request: any, reply: any) => {
  const authHeader = request.headers.authorization;
  if (!authHeader) {
    reply.code(401);
    return { error: 'No authorization header' };
  }

  try {
    // For testing, just decode the token as user ID
    const token = authHeader.replace('Bearer ', '');
    request.user = { id: token };
  } catch (error) {
    reply.code(401);
    return { error: 'Invalid token' };
  }
};

// P2P Routes with mock authentication
fastify.post('/api/p2p/ads', { preHandler: mockAuth }, async (request: any, reply) => {
  try {
    const userId = request.user.id;
    const ad = await p2pService.createAd(userId, request.body);
    
    return {
      success: true,
      data: ad,
      message: 'Advertisement created successfully'
    };
  } catch (error: any) {
    reply.code(400);
    return {
      success: false,
      error: error.message
    };
  }
});

fastify.post('/api/p2p/trades', { preHandler: mockAuth }, async (request: any, reply) => {
  try {
    const userId = request.user.id;
    const { adId, ...tradeData } = request.body;

    const trade = await p2pService.initiateTrade(userId, adId, tradeData);
    
    reply.code(201);
    return {
      success: true,
      data: trade,
      message: 'Trade initiated successfully'
    };
  } catch (error: any) {
    reply.code(400);
    return {
      success: false,
      error: error.message
    };
  }
});

fastify.get('/api/p2p/trades', { preHandler: mockAuth }, async (request: any, reply) => {
  try {
    const userId = request.user.id;
    const status = request.query.status;
    const page = parseInt(request.query.page) || 1;
    const limit = parseInt(request.query.limit) || 20;

    const where: any = {
      OR: [
        { sellerId: userId },
        { buyerId: userId }
      ]
    };

    if (status) {
      where.status = status;
    }

    const [trades, total] = await Promise.all([
      prisma.p2PTrade.findMany({
        where,
        include: {
          ad: true,
          seller: {
            select: {
              id: true,
              username: true,
              reputationScore: true
            }
          },
          buyer: {
            select: {
              id: true,
              username: true,
              reputationScore: true
            }
          },
          escrow: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.p2PTrade.count({ where })
    ]);

    return {
      success: true,
      data: {
        trades,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  } catch (error: any) {
    reply.code(500);
    return {
      success: false,
      error: error.message
    };
  }
});

// Mock user creation for testing
fastify.post('/api/users/create', async (request: any, reply) => {
  try {
    const { walletAddress, email, username } = request.body;

    const user = await prisma.user.create({
      data: {
        walletAddress: walletAddress || `0x${Math.random().toString(16).substr(2, 40)}`,
        email: email || `user${Date.now()}@test.com`,
        username: username || `user_${Date.now()}`,
        p2pNickname: username || `trader_${Date.now()}`,
        reputationScore: Math.random() * 5,
        tradeCount: Math.floor(Math.random() * 100)
      }
    });

    return {
      success: true,
      data: user,
      message: 'User created successfully'
    };
  } catch (error: any) {
    reply.code(400);
    return {
      success: false,
      error: error.message
    };
  }
});

// Error handling
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.code(error.statusCode || 500);
  return {
    success: false,
    error: error.message || 'Internal server error',
    statusCode: error.statusCode || 500
  };
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  fastify.log.info('SIGTERM received, shutting down gracefully');
  
  // Close WebSocket connections
  await p2pWsHandler.shutdown();
  
  // Close Fastify server
  await fastify.close();
  
  // Close database connection
  await prisma.$disconnect();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  fastify.log.info('SIGINT received, shutting down gracefully');
  
  await p2pWsHandler.shutdown();
  await fastify.close();
  await prisma.$disconnect();
  
  process.exit(0);
});

// Start server
const start = async () => {
  try {
    const PORT = process.env.PORT || 3001;
    
    await fastify.listen({ 
      port: parseInt(PORT.toString()), 
      host: '0.0.0.0' 
    });

    console.log(`
🚀 Orrange P2P Exchange Server Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Server: http://localhost:${PORT}
🔌 WebSocket: ws://localhost:${PORT}/p2p-ws
📊 Health Check: http://localhost:${PORT}/health
📈 Statistics: http://localhost:${PORT}/api/stats
🔐 Environment: ${process.env.NODE_ENV || 'development'}

📚 API Endpoints:
   • GET  /api/p2p/ads - Browse advertisements
   • POST /api/p2p/ads - Create advertisement
   • POST /api/p2p/trades - Initiate trades
   • GET  /api/p2p/trades - Get user trades
   • GET  /api/market/:pair - Market data
   • POST /api/users/create - Create test user

🎯 Features Ready:
   ✅ P2P Advertisement System
   ✅ Real-time Trade Matching
   ✅ Secure Chat System
   ✅ Escrow Integration
   ✅ Dispute Resolution
   ✅ WebSocket Real-time Updates
   ✅ Multi-payment Methods
   ✅ Market Analytics

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
