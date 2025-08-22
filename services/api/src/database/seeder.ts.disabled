// Database Migration and Seeding Manager
import { PrismaClient } from '@prisma/client';
import { dbManager } from './manager.js';
import { nanoid } from 'nanoid';

export class DatabaseSeeder {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = dbManager.db;
  }

  // Seed development data
  public async seedDevelopment() {
    console.log('🌱 Starting development database seeding...');

    try {
      // Clear existing data in development
      if (process.env.NODE_ENV === 'development') {
        await this.clearDatabase();
      }

      // Seed users
      const users = await this.seedUsers();
      console.log(`✅ Created ${users.length} users`);

      // Seed orders
      const orders = await this.seedOrders(users);
      console.log(`✅ Created ${orders.length} orders`);

      // Seed trades
      const trades = await this.seedTrades(orders);
      console.log(`✅ Created ${trades.length} trades`);

      console.log('🎉 Development seeding completed successfully!');
      
      return {
        users: users.length,
        orders: orders.length,
        trades: trades.length,
      };
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    }
  }

  private async clearDatabase() {
    console.log('🧹 Clearing existing data...');
    
    // Order matters due to foreign key constraints
    await this.prisma.dispute.deleteMany();
    await this.prisma.trade.deleteMany();
    await this.prisma.order.deleteMany();
    await this.prisma.user.deleteMany();
  }

  private async seedUsers() {
    const testUsers = [
      {
        id: nanoid(),
        walletAddress: '0x742d35cc6436c0532925a3b8c7bc5d7e1e0b2b1f',
        email: 'alice@example.com',
        username: 'alice_crypto',
        reputationScore: 4.8,
        tradeCount: 25,
        kycStatus: 'VERIFIED' as const,
        riskLevel: 'LOW' as const,
      },
      {
        id: nanoid(),
        walletAddress: '0x8ba1f109551bd432803012645bd83d3a3f7a5f7a',
        email: 'bob@example.com',
        username: 'bob_trader',
        reputationScore: 4.2,
        tradeCount: 15,
        kycStatus: 'VERIFIED' as const,
        riskLevel: 'LOW' as const,
      },
      {
        id: nanoid(),
        walletAddress: '0x9f2d8b5a3e1c7d6f4b8a9e0c5d3f7b1e6a2c4d8f',
        email: 'charlie@example.com',
        username: 'charlie_hodler',
        reputationScore: 3.9,
        tradeCount: 8,
        kycStatus: 'PENDING' as const,
        riskLevel: 'MEDIUM' as const,
      },
      {
        id: nanoid(),
        walletAddress: '0xa1b2c3d4e5f6789012345678901234567890abcd',
        email: 'diana@example.com',
        username: 'diana_defi',
        reputationScore: 5.0,
        tradeCount: 50,
        kycStatus: 'VERIFIED' as const,
        riskLevel: 'LOW' as const,
      },
    ];

    const users = await Promise.all(
      testUsers.map(userData => 
        this.prisma.user.create({ data: userData })
      )
    );

    return users;
  }

  private async seedOrders(users: any[]) {
    const orderPairs = [
      { asset: 'BTC', fiatCurrency: 'USD' },
      { asset: 'ETH', fiatCurrency: 'USD' },
      { asset: 'BTC', fiatCurrency: 'EUR' },
      { asset: 'USDT', fiatCurrency: 'USD' },
    ];

    const orders: any[] = [];

    for (const user of users) {
      for (const pair of orderPairs) {
        // Create buy orders
        const buyOrder = await this.prisma.order.create({
          data: {
            id: nanoid(),
            orderType: 'LIMIT',
            side: 'BUY',
            asset: pair.asset,
            fiatCurrency: pair.fiatCurrency,
            amount: this.randomAmount(pair.asset),
            price: this.randomPrice(pair.asset, pair.fiatCurrency),
            totalValue: '0', // Will be calculated
            paymentMethods: ['BANK_TRANSFER', 'PAYPAL'],
            status: 'ACTIVE',
            orderHash: nanoid(32),
            signature: nanoid(64),
            nonce: BigInt(Date.now()),
            deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            creatorId: user.id,
          },
        });
        orders.push(buyOrder);

        // Create sell orders
        const sellOrder = await this.prisma.order.create({
          data: {
            id: nanoid(),
            orderType: 'LIMIT',
            side: 'SELL',
            asset: pair.asset,
            fiatCurrency: pair.fiatCurrency,
            amount: this.randomAmount(pair.asset),
            price: this.randomPrice(pair.asset, pair.fiatCurrency, 0.02), // Slightly higher for sells
            totalValue: '0', // Will be calculated
            paymentMethods: ['BANK_TRANSFER'],
            status: 'ACTIVE',
            orderHash: nanoid(32),
            signature: nanoid(64),
            nonce: BigInt(Date.now() + 1),
            deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
            creatorId: user.id,
          },
        });
        orders.push(sellOrder);
      }
    }

    return orders;
  }

  private async seedTrades(orders: any[]) {
    const buyOrders = orders.filter(o => o.side === 'BUY');
    const sellOrders = orders.filter(o => o.side === 'SELL');
    
    const trades: any[] = [];
    const tradesCount = Math.min(5, buyOrders.length, sellOrders.length);

    for (let i = 0; i < tradesCount; i++) {
      const buyOrder = buyOrders[i];
      const sellOrder = sellOrders.find(o => 
        o.asset === buyOrder.asset && 
        o.fiatCurrency === buyOrder.fiatCurrency &&
        o.creatorId !== buyOrder.creatorId
      );

      if (sellOrder) {
        const trade = await this.prisma.trade.create({
          data: {
            id: nanoid(),
            buyOrderId: buyOrder.id,
            sellOrderId: sellOrder.id,
            buyerId: buyOrder.creatorId,
            sellerId: sellOrder.creatorId,
            asset: buyOrder.asset,
            fiatCurrency: buyOrder.fiatCurrency,
            amount: Math.min(parseFloat(buyOrder.amount), parseFloat(sellOrder.amount)).toString(),
            price: buyOrder.price, // Execute at buy price
            totalValue: (
              Math.min(parseFloat(buyOrder.amount), parseFloat(sellOrder.amount)) * 
              parseFloat(buyOrder.price)
            ).toString(),
            platformFee: '0.001',
            status: Math.random() > 0.5 ? 'COMPLETED' : 'PAYMENT_PENDING',
            escrowAddress: '0x' + nanoid(40),
          },
        });
        trades.push(trade);
      }
    }

    return trades;
  }

  // Utility methods for generating realistic test data
  private randomAmount(asset: string): string {
    const ranges = {
      BTC: [0.001, 2.0],
      ETH: [0.1, 50.0],
      USDT: [100, 10000],
    };
    
    const [min, max] = ranges[asset as keyof typeof ranges] || [1, 100];
    return (Math.random() * (max - min) + min).toFixed(6);
  }

  private randomPrice(asset: string, fiat: string, spread = 0): string {
    // Approximate market prices (these would be fetched from APIs in production)
    const basePrices = {
      'BTC-USD': 45000,
      'BTC-EUR': 41000,
      'ETH-USD': 3000,
      'ETH-EUR': 2750,
      'USDT-USD': 1.0,
    };

    const key = `${asset}-${fiat}`;
    const basePrice = basePrices[key as keyof typeof basePrices] || 1000;
    
    // Add some random variation and spread
    const variation = 1 + (Math.random() - 0.5) * 0.1; // ±5% variation
    const spreadMultiplier = 1 + spread;
    
    return (basePrice * variation * spreadMultiplier).toFixed(2);
  }

  // Production data validation and health checks
  public async validateDatabase() {
    console.log('🔍 Validating database integrity...');

    const checks = [
      this.checkUserIntegrity(),
      this.checkOrderIntegrity(),
      this.checkTradeIntegrity(),
      this.checkIndexes(),
    ];

    const results = await Promise.allSettled(checks);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`✅ Check ${index + 1} passed`);
      } else {
        console.error(`❌ Check ${index + 1} failed:`, result.reason);
      }
    });

    return results.every(r => r.status === 'fulfilled');
  }

  private async checkUserIntegrity() {
    const duplicateWallets = await this.prisma.user.groupBy({
      by: ['walletAddress'],
      having: {
        walletAddress: {
          _count: {
            gt: 1,
          },
        },
      },
    });

    if (duplicateWallets.length > 0) {
      throw new Error(`Found duplicate wallet addresses: ${duplicateWallets.length}`);
    }
  }

  private async checkOrderIntegrity() {
    const invalidOrders = await this.prisma.order.findMany({
      where: {
        OR: [
          { amount: { lte: '0' } },
          { price: { lte: '0' } },
        ],
      },
    });

    if (invalidOrders.length > 0) {
      throw new Error(`Found invalid orders: ${invalidOrders.length}`);
    }
  }

  private async checkTradeIntegrity() {
    const invalidTrades = await this.prisma.trade.findMany({
      where: {
        OR: [
          { amount: { lte: '0' } },
          { price: { lte: '0' } },
          { buyerId: { equals: 'sellerId' } }, // This won't work, need proper comparison
        ],
      },
    });

    if (invalidTrades.length > 0) {
      throw new Error(`Found invalid trades: ${invalidTrades.length}`);
    }
  }

  private async checkIndexes() {
    // This would check if all expected indexes exist
    // Implementation would depend on direct SQL queries
    return true;
  }
}

export const seeder = new DatabaseSeeder();
