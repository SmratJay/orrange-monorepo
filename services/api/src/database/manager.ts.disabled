// Database Connection Manager with Advanced Features
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private prisma: PrismaClient;
  private redis: Redis;
  private connectionPool: Map<string, any> = new Map();

  private constructor() {
    // Initialize Prisma with optimized settings
    this.prisma = new PrismaClient({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'info', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Initialize Redis with basic configuration
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      enableReadyCheck: true,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 5000,
    });

    // Setup query logging for performance monitoring
    this.setupQueryLogging();
    this.setupConnectionHealth();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private setupQueryLogging() {
    this.prisma.$on('query', (e) => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Query: ${e.query}`);
        console.log(`Duration: ${e.duration}ms`);
      }
      
      // Log slow queries (>100ms) in production
      if (e.duration > 100) {
        console.warn(`Slow query detected: ${e.query} (${e.duration}ms)`);
      }
    });
  }

  private setupConnectionHealth() {
    // Database health check every 30 seconds
    setInterval(async () => {
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        await this.redis.ping();
      } catch (error) {
        console.error('Database health check failed:', error);
      }
    }, 30000);
  }

  // Transaction wrapper with retry logic
  public async withTransaction<T>(
    fn: (prisma: PrismaClient) => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        return await this.prisma.$transaction(fn, {
          maxWait: 5000, // 5s max wait
          timeout: 10000, // 10s timeout
        });
      } catch (error: any) {
        attempt++;
        
        if (attempt >= maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw new Error('Transaction failed after maximum retries');
  }

  // Cache wrapper with Redis
  public async withCache<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 300 // 5 minutes default
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }

      // Execute function and cache result
      const result = await fn();
      await this.redis.setex(key, ttl, JSON.stringify(result));
      
      return result;
    } catch (error) {
      console.error(`Cache error for key ${key}:`, error);
      // Fallback to function execution
      return await fn();
    }
  }

  // Order book specific optimized queries
  public async getOrderBook(pair: string, limit: number = 100) {
    const cacheKey = `orderbook:${pair}:${limit}`;
    
    return this.withCache(cacheKey, async () => {
      const [bids, asks] = await Promise.all([
        this.prisma.order.findMany({
          where: {
            asset: pair.split('-')[0],
            fiatCurrency: pair.split('-')[1],
            side: 'BUY',
            status: 'ACTIVE',
          },
          orderBy: {
            price: 'desc',
          },
          take: limit,
          select: {
            id: true,
            amount: true,
            price: true,
            filledAmount: true,
            createdAt: true,
          },
        }),
        this.prisma.order.findMany({
          where: {
            asset: pair.split('-')[0],
            fiatCurrency: pair.split('-')[1],
            side: 'SELL',
            status: 'ACTIVE',
          },
          orderBy: {
            price: 'asc',
          },
          take: limit,
          select: {
            id: true,
            amount: true,
            price: true,
            filledAmount: true,
            createdAt: true,
          },
        }),
      ]);

      return { bids, asks };
    }, 10); // 10 seconds cache for order book
  }

  // Bulk operations for high-frequency trading
  public async bulkUpdateOrders(updates: Array<{id: string, data: any}>) {
    const queries = updates.map(({ id, data }) =>
      this.prisma.order.update({
        where: { id },
        data,
      })
    );

    return this.prisma.$transaction(queries);
  }

  // User statistics with caching
  public async getUserStats(userId: string) {
    const cacheKey = `user:stats:${userId}`;
    
    return this.withCache(cacheKey, async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          _count: {
            select: {
              createdOrders: true,
              buyTrades: true,
              sellTrades: true,
              disputes: true,
            },
          },
        },
      });

      if (!user) return null;

      const totalVolume = await this.prisma.trade.aggregate({
        where: {
          OR: [
            { buyerId: userId },
            { sellerId: userId },
          ],
          status: 'COMPLETED',
        },
        _sum: {
          totalValue: true,
        },
      });

      return {
        ...user,
        totalVolume: totalVolume._sum.totalValue || '0',
      };
    }, 60); // 1 minute cache for user stats
  }

  // Cleanup and connection management
  public async disconnect() {
    await this.prisma.$disconnect();
    await this.redis.quit();
  }

  // Getters for direct access when needed
  public get db() {
    return this.prisma;
  }

  public get cache() {
    return this.redis;
  }
}

// Export singleton instance
export const dbManager = DatabaseManager.getInstance();
