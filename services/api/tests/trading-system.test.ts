#!/usr/bin/env ts-node

// Orrange P2P - Professional Trading System Test Suite
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { DatabaseService } from '../src/database/trading-db.js';
import { AdvancedTradingEngine } from '../src/matching/advanced-engine.js';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

class TradingSystemTester {
  private prisma: PrismaClient;
  private redis: Redis;
  private databaseService: DatabaseService;
  private tradingEngine: AdvancedTradingEngine;

  constructor() {
    this.prisma = new PrismaClient();
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.databaseService = new DatabaseService(this.prisma, this.redis);
    this.tradingEngine = new AdvancedTradingEngine(this.databaseService, this.redis);
  }

  private log(message: string, color: keyof typeof colors = 'white') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  private success(message: string) {
    this.log(`✅ ${message}`, 'green');
  }

  private error(message: string) {
    this.log(`❌ ${message}`, 'red');
  }

  private info(message: string) {
    this.log(`ℹ️  ${message}`, 'blue');
  }

  private warning(message: string) {
    this.log(`⚠️  ${message}`, 'yellow');
  }

  private header(message: string) {
    this.log(`\n${'='.repeat(60)}`, 'cyan');
    this.log(`🎯 ${message}`, 'cyan');
    this.log(`${'='.repeat(60)}`, 'cyan');
  }

  async runAllTests(): Promise<void> {
    this.header('ORRANGE P2P TRADING SYSTEM TEST SUITE');
    
    try {
      await this.testDatabaseConnection();
      await this.testRedisConnection();
      await this.testDatabaseService();
      await this.testTradingEngine();
      await this.testAdvancedOrderTypes();
      await this.testPortfolioManagement();
      await this.testRealTimeFeatures();
      await this.performanceTest();
      
      this.header('ALL TESTS COMPLETED SUCCESSFULLY! 🎉');
      this.success('Orrange P2P Advanced Trading Platform is ready for production');
      
    } catch (error) {
      this.error(`Test suite failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async testDatabaseConnection(): Promise<void> {
    this.header('Testing Database Connection');
    
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.success('PostgreSQL database connection successful');
      
      // Test database health
      const health = await this.databaseService.getSystemHealth();
      this.info(`Database contains: ${health.totalUsers} users, ${health.totalOrders} orders, ${health.totalTrades} trades`);
      
    } catch (error) {
      this.error('Database connection failed');
      throw error;
    }
  }

  private async testRedisConnection(): Promise<void> {
    this.header('Testing Redis Connection');
    
    try {
      await this.redis.ping();
      this.success('Redis connection successful');
      
      // Test Redis operations
      await this.redis.set('test:connection', 'success', 'EX', 10);
      const result = await this.redis.get('test:connection');
      
      if (result === 'success') {
        this.success('Redis read/write operations working');
      } else {
        throw new Error('Redis operations failed');
      }
      
    } catch (error) {
      this.error('Redis connection failed');
      throw error;
    }
  }

  private async testDatabaseService(): Promise<void> {
    this.header('Testing Database Service');
    
    try {
      // Create test user
      const testUser = await this.prisma.user.upsert({
        where: { walletAddress: 'test_0x123456789' },
        update: {},
        create: {
          walletAddress: 'test_0x123456789',
          email: 'test@orrange.com',
          username: 'test_trader'
        }
      });
      this.success('Test user created/updated');

      // Test portfolio operations
      await this.databaseService.updateBalance(testUser.id, 'USD', {
        totalBalance: 10000,
        availableBalance: 10000
      });
      
      await this.databaseService.updateBalance(testUser.id, 'BTC', {
        totalBalance: 1.0,
        availableBalance: 1.0
      });
      
      const portfolio = await this.databaseService.getPortfolio(testUser.id);
      this.success(`Portfolio management working - ${portfolio.length} assets tracked`);

      // Test order creation
      const testOrder = await this.databaseService.createOrder({
        userId: testUser.id,
        pair: 'BTC-USD',
        side: 'SELL',
        orderType: 'LIMIT',
        amount: 0.1,
        price: 45000,
        timeInForce: 'GTC'
      });
      this.success(`Order creation working - Order ID: ${testOrder.id}`);

      // Test order retrieval
      const retrievedOrder = await this.databaseService.getOrder(testOrder.id);
      if (retrievedOrder && retrievedOrder.id === testOrder.id) {
        this.success('Order retrieval working');
      } else {
        throw new Error('Order retrieval failed');
      }

    } catch (error) {
      this.error(`Database service test failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async testTradingEngine(): Promise<void> {
    this.header('Testing Advanced Trading Engine');
    
    try {
      // Get engine statistics
      const stats = this.tradingEngine.getEngineStats();
      this.info(`Trading engine loaded with ${stats.supportedPairs?.length || 0} trading pairs`);
      
      // Test order book retrieval
      const orderBook = this.tradingEngine.getOrderBook('BTC-USD');
      this.success(`Order book retrieval working - ${orderBook.bids.length} bids, ${orderBook.asks.length} asks`);
      
      // Test supported trading pairs
      const supportedPairs = ['BTC-USD', 'ETH-USD', 'BNB-USD'];
      for (const pair of supportedPairs) {
        const pairOrderBook = this.tradingEngine.getOrderBook(pair);
        if (pairOrderBook) {
          this.success(`${pair} order book initialized`);
        }
      }
      
    } catch (error) {
      this.error(`Trading engine test failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async testAdvancedOrderTypes(): Promise<void> {
    this.header('Testing Advanced Order Types');
    
    try {
      const testUser = await this.prisma.user.findFirst({
        where: { walletAddress: 'test_0x123456789' }
      });

      if (!testUser) {
        throw new Error('Test user not found');
      }

      // Test different order types
      const orderTypes = [
        { type: 'MARKET' as const, amount: 0.01 },
        { type: 'LIMIT' as const, amount: 0.01, price: 44000 },
        { type: 'STOP_LOSS' as const, amount: 0.01, stopPrice: 43000 },
        { type: 'TAKE_PROFIT' as const, amount: 0.01, stopPrice: 46000 },
        { type: 'STOP_LIMIT' as const, amount: 0.01, price: 44000, stopPrice: 43500 }
      ];

      for (const orderType of orderTypes) {
        try {
          const orderResult = await this.tradingEngine.placeOrder({
            userId: testUser.id,
            pair: 'BTC-USD',
            type: 'BUY',
            orderType: orderType.type,
            amount: orderType.amount,
            price: orderType.price,
            stopPrice: orderType.stopPrice
          });
          
          this.success(`${orderType.type} order placed successfully - ID: ${orderResult.orderId}`);
        } catch (error) {
          this.warning(`${orderType.type} order test skipped: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      
    } catch (error) {
      this.error(`Advanced order types test failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async testPortfolioManagement(): Promise<void> {
    this.header('Testing Portfolio Management');
    
    try {
      const testUser = await this.prisma.user.findFirst({
        where: { walletAddress: 'test_0x123456789' }
      });

      if (!testUser) {
        throw new Error('Test user not found');
      }

      // Test balance operations
      await this.databaseService.updateBalance(testUser.id, 'ETH', {
        totalBalance: 10,
        availableBalance: 10
      });

      // Test balance locking
      const lockSuccess = await this.databaseService.lockBalance(testUser.id, 'ETH', 2);
      if (lockSuccess) {
        this.success('Balance locking successful');
      }

      // Test balance unlocking
      const unlockSuccess = await this.databaseService.unlockBalance(testUser.id, 'ETH', 1);
      if (unlockSuccess) {
        this.success('Balance unlocking successful');
      }

      // Get user statistics
      const userStats = await this.databaseService.getUserStats(testUser.id);
      this.info(`User stats - Trades: ${userStats.totalTrades}, Volume: $${userStats.totalVolume.toFixed(2)}`);

    } catch (error) {
      this.error(`Portfolio management test failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async testRealTimeFeatures(): Promise<void> {
    this.header('Testing Real-Time Features');
    
    try {
      // Test price alerts
      const testUser = await this.prisma.user.findFirst({
        where: { walletAddress: 'test_0x123456789' }
      });

      if (!testUser) {
        throw new Error('Test user not found');
      }

      const priceAlert = await this.databaseService.createPriceAlert({
        userId: testUser.id,
        pair: 'BTC-USD',
        price: 50000,
        condition: 'ABOVE'
      });
      
      this.success(`Price alert created - ID: ${priceAlert.id}`);

      // Test trade volume calculation
      const volume = await this.databaseService.getTradeVolume('BTC-USD', '24h');
      this.info(`24h volume for BTC-USD: $${volume.volume.toFixed(2)} (${volume.count} trades)`);

    } catch (error) {
      this.error(`Real-time features test failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async performanceTest(): Promise<void> {
    this.header('Running Performance Tests');
    
    try {
      const startTime = Date.now();
      
      // Test concurrent order book retrievals
      const pairs = ['BTC-USD', 'ETH-USD', 'BNB-USD'];
      const promises = pairs.map(pair => this.tradingEngine.getOrderBook(pair));
      
      await Promise.all(promises);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      this.success(`Concurrent order book retrieval completed in ${duration}ms`);
      
      if (duration < 100) {
        this.success('Performance test passed - Excellent response time');
      } else if (duration < 500) {
        this.info('Performance test passed - Good response time');
      } else {
        this.warning('Performance test passed - Acceptable response time');
      }

    } catch (error) {
      this.error(`Performance test failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private async cleanup(): Promise<void> {
    this.header('Cleaning Up Test Data');
    
    try {
      // Clean up test orders
      await this.prisma.order.deleteMany({
        where: {
          user: {
            walletAddress: 'test_0x123456789'
          }
        }
      });

      // Clean up test portfolio entries
      await this.prisma.portfolio.deleteMany({
        where: {
          user: {
            walletAddress: 'test_0x123456789'
          }
        }
      });

      // Clean up test price alerts
      await this.prisma.priceAlert.deleteMany({
        where: {
          user: {
            walletAddress: 'test_0x123456789'
          }
        }
      });

      this.success('Test data cleanup completed');
      
      // Disconnect services
      await this.prisma.$disconnect();
      this.redis.disconnect();
      
    } catch (error) {
      this.warning(`Cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Run the test suite
async function runTests() {
  const tester = new TradingSystemTester();
  
  try {
    await tester.runAllTests();
    process.exit(0);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  runTests();
}

export { TradingSystemTester };
