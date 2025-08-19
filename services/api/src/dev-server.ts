// Simple Development Server - No Database Dependencies
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const fastify = Fastify({
  logger: true,
});

async function start() {
  try {
    // Register basic plugins
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false
    });

    await fastify.register(cors, {
      origin: ['http://localhost:3000', 'http://localhost:3002'],
      credentials: true
    });

    await fastify.register(websocket);

    // Health check endpoint
    fastify.get('/health', async (request, reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
          api: 'running',
          version: '1.0.0'
        }
      };
    });

    // Mock authentication endpoint
    fastify.post('/api/v1/auth/connect', async (request, reply) => {
      const body = request.body as any;
      
      return {
        success: true,
        message: 'Mock authentication successful',
        data: {
          user: {
            id: 'mock-user-id',
            walletAddress: body.address || '0x123...',
            kycStatus: 'VERIFIED',
            reputationScore: 4.8
          },
          accessToken: 'mock-jwt-token',
          refreshToken: 'mock-refresh-token'
        }
      };
    });

    // Mock orders endpoint
    fastify.get('/api/v1/orders', async (request, reply) => {
      return {
        success: true,
        data: [
          {
            id: '1',
            type: 'BUY',
            asset: 'USDT',
            amount: '1000',
            price: '1.00',
            status: 'ACTIVE',
            createdAt: new Date().toISOString()
          },
          {
            id: '2',
            type: 'SELL',
            asset: 'USDT',
            amount: '500',
            price: '0.99',
            status: 'ACTIVE',
            createdAt: new Date().toISOString()
          }
        ],
        total: 2
      };
    });

    // Mock order creation
    fastify.post('/api/v1/orders', async (request, reply) => {
      const body = request.body as any;
      
      return {
        success: true,
        message: 'Order created successfully',
        data: {
          id: `order-${Date.now()}`,
          ...body,
          status: 'ACTIVE',
          createdAt: new Date().toISOString()
        }
      };
    });

    // Mock trades endpoint
    fastify.get('/api/v1/trades', async (request, reply) => {
      return {
        success: true,
        data: [
          {
            id: '1',
            buyOrderId: 'order-1',
            sellOrderId: 'order-2',
            asset: 'USDT',
            amount: '500',
            price: '0.99',
            status: 'COMPLETED',
            completedAt: new Date().toISOString()
          }
        ],
        total: 1
      };
    });

    // Mock user profile
    fastify.get('/api/v1/users/profile', async (request, reply) => {
      return {
        success: true,
        data: {
          id: 'mock-user-id',
          walletAddress: '0x742d35cc6436c0532925a3b8c7bc5d7e1e0b2b1f',
          email: 'user@example.com',
          username: 'trader123',
          kycStatus: 'VERIFIED',
          reputationScore: 4.8,
          tradeCount: 25,
          totalVolume: '125000.00',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      };
    });

    // Mock market data
    fastify.get('/api/v1/market/rates', async (request, reply) => {
      return {
        success: true,
        data: {
          'BTC-USD': { price: '45250.00', change24h: '2.34' },
          'ETH-USD': { price: '2890.50', change24h: '1.87' },
          'USDT-USD': { price: '1.00', change24h: '0.01' },
          'USDC-USD': { price: '1.00', change24h: '0.00' }
        },
        timestamp: new Date().toISOString()
      };
    });

    // Mock analytics data
    fastify.get('/api/v1/analytics/overview', async (request, reply) => {
      return {
        success: true,
        data: {
          totalVolume: 2847293.45,
          totalTrades: 1247,
          avgTradeSize: 2284.12,
          successRate: 98.7,
          volumeChange: 12.4,
          activeUsers: 892,
          newUsers: 47
        }
      };
    });

    // WebSocket endpoint
    fastify.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection, req) => {
        connection.send(JSON.stringify({
          type: 'connected',
          message: 'Connected to Orrange P2P WebSocket',
          timestamp: Date.now()
        }));

        connection.on('message', message => {
          try {
            const data = JSON.parse(message.toString());
            
            // Echo back with mock data
            if (data.type === 'subscribe' && data.pair) {
              connection.send(JSON.stringify({
                type: 'orderbook',
                pair: data.pair,
                data: {
                  bids: [
                    { price: '44950.00', amount: '0.5', total: '22475.00' },
                    { price: '44900.00', amount: '1.2', total: '53880.00' }
                  ],
                  asks: [
                    { price: '45050.00', amount: '0.8', total: '36040.00' },
                    { price: '45100.00', amount: '2.1', total: '94710.00' }
                  ]
                },
                timestamp: Date.now()
              }));
            }
          } catch (error) {
            connection.send(JSON.stringify({
              type: 'error',
              message: 'Invalid message format',
              timestamp: Date.now()
            }));
          }
        });
      });
    });

    const port = parseInt(process.env.PORT || '8080', 10);
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    
    console.log('🚀 Orrange P2P Development Server Started!');
    console.log('═══════════════════════════════════════════');
    console.log(`📡 Server: http://${host}:${port}`);
    console.log(`📊 Health: http://${host}:${port}/health`);
    console.log(`🔐 Auth: POST http://${host}:${port}/api/v1/auth/connect`);
    console.log(`📋 Orders: http://${host}:${port}/api/v1/orders`);
    console.log(`🤝 Trades: http://${host}:${port}/api/v1/trades`);
    console.log(`🔌 WebSocket: ws://${host}:${port}/ws`);
    console.log('⚡ Environment: Development (Mock Data)');
    console.log('═══════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ Server failed to start:', error);
    process.exit(1);
  }
}

start();
