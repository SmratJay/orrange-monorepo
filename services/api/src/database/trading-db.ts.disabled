// Orrange P2P - Database Service for Advanced Trading
import { PrismaClient, OrderStatus, OrderSide, OrderCategory, TimeInForce, TradeType, TradeStatus, Decimal } from '@prisma/client';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

export interface DatabaseOrder {
  id: string;
  userId: string;
  pair: string;
  side: OrderSide;
  orderType: OrderCategory;
  amount: Decimal;
  price?: Decimal;
  stopPrice?: Decimal;
  executedAmount: Decimal;
  remainingAmount: Decimal;
  avgPrice?: Decimal;
  timeInForce: TimeInForce;
  reduceOnly: boolean;
  postOnly: boolean;
  status: OrderStatus;
  clientOrderId?: string;
  source: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface DatabaseTrade {
  id: string;
  buyerId: string;
  sellerId: string;
  pair: string;
  amount: Decimal;
  price: Decimal;
  totalValue: Decimal;
  makerFee: Decimal;
  takerFee: Decimal;
  platformFee: Decimal;
  tradeType: TradeType;
  status: TradeStatus;
  executedAt: Date;
}

export interface PortfolioBalance {
  asset: string;
  totalBalance: Decimal;
  availableBalance: Decimal;
  lockedBalance: Decimal;
  realizedPnL: Decimal;
  unrealizedPnL: Decimal;
  avgCostBasis?: Decimal;
}

export class DatabaseService extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;

  constructor(prisma: PrismaClient, redis: Redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;
  }

  // ===== ORDER MANAGEMENT =====

  async createOrder(orderData: {
    userId: string;
    pair: string;
    side: OrderSide;
    orderType: OrderCategory;
    amount: number;
    price?: number;
    stopPrice?: number;
    timeInForce?: TimeInForce;
    reduceOnly?: boolean;
    postOnly?: boolean;
    clientOrderId?: string;
    source?: string;
    expiresAt?: Date;
  }): Promise<DatabaseOrder> {
    const order = await this.prisma.order.create({
      data: {
        userId: orderData.userId,
        pair: orderData.pair,
        side: orderData.side,
        orderType: orderData.orderType,
        amount: new Decimal(orderData.amount),
        price: orderData.price ? new Decimal(orderData.price) : null,
        stopPrice: orderData.stopPrice ? new Decimal(orderData.stopPrice) : null,
        remainingAmount: new Decimal(orderData.amount),
        timeInForce: orderData.timeInForce || 'GTC',
        reduceOnly: orderData.reduceOnly || false,
        postOnly: orderData.postOnly || false,
        clientOrderId: orderData.clientOrderId,
        source: orderData.source || 'web',
        expiresAt: orderData.expiresAt,
        status: 'PENDING'
      }
    });

    // Cache order for quick access
    await this.cacheOrder(order);
    
    this.emit('orderCreated', order);
    return order as DatabaseOrder;
  }

  async updateOrderStatus(orderId: string, status: OrderStatus, executedAmount?: number, avgPrice?: number): Promise<void> {
    const updateData: any = { status };
    
    if (executedAmount !== undefined) {
      updateData.executedAmount = new Decimal(executedAmount);
      updateData.remainingAmount = new Decimal(0); // Will be calculated properly
    }
    
    if (avgPrice !== undefined) {
      updateData.avgPrice = new Decimal(avgPrice);
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: updateData
    });

    // Update cache
    await this.redis.del(`order:${orderId}`);
    
    this.emit('orderUpdated', { orderId, status, executedAmount, avgPrice });
  }

  async getOrder(orderId: string): Promise<DatabaseOrder | null> {
    // Try cache first
    const cached = await this.redis.get(`order:${orderId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId }
    });

    if (order) {
      await this.cacheOrder(order);
    }

    return order as DatabaseOrder | null;
  }

  async getUserOrders(userId: string, pair?: string, status?: OrderStatus[]): Promise<DatabaseOrder[]> {
    const where: any = { userId };
    
    if (pair) where.pair = pair;
    if (status) where.status = { in: status };

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return orders as DatabaseOrder[];
  }

  async getActiveOrders(pair: string): Promise<DatabaseOrder[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        pair,
        status: { in: ['PENDING', 'ACTIVE', 'PARTIAL'] }
      },
      orderBy: [
        { side: 'asc' }, // BUY first, then SELL
        { price: 'desc' }
      ]
    });

    return orders as DatabaseOrder[];
  }

  async cancelOrder(orderId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.order.update({
        where: { 
          id: orderId,
          userId: userId,
          status: { in: ['PENDING', 'ACTIVE', 'PARTIAL'] }
        },
        data: { status: 'CANCELLED' }
      });

      await this.redis.del(`order:${orderId}`);
      this.emit('orderCancelled', orderId);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ===== TRADE MANAGEMENT =====

  async createTrade(tradeData: {
    buyerId: string;
    sellerId: string;
    pair: string;
    amount: number;
    price: number;
    makerFee?: number;
    takerFee?: number;
    platformFee?: number;
    tradeType?: TradeType;
  }): Promise<DatabaseTrade> {
    const totalValue = tradeData.amount * tradeData.price;
    
    const trade = await this.prisma.trade.create({
      data: {
        buyerId: tradeData.buyerId,
        sellerId: tradeData.sellerId,
        pair: tradeData.pair,
        amount: new Decimal(tradeData.amount),
        price: new Decimal(tradeData.price),
        totalValue: new Decimal(totalValue),
        makerFee: new Decimal(tradeData.makerFee || 0),
        takerFee: new Decimal(tradeData.takerFee || 0),
        platformFee: new Decimal(tradeData.platformFee || 0),
        tradeType: tradeData.tradeType || 'MARKET',
        status: 'MATCHED'
      }
    });

    this.emit('tradeCreated', trade);
    return trade as DatabaseTrade;
  }

  async getTrades(pair: string, limit: number = 50): Promise<DatabaseTrade[]> {
    const trades = await this.prisma.trade.findMany({
      where: { pair },
      orderBy: { executedAt: 'desc' },
      take: limit
    });

    return trades as DatabaseTrade[];
  }

  async getUserTrades(userId: string, pair?: string, limit: number = 100): Promise<DatabaseTrade[]> {
    const where: any = {
      OR: [
        { buyerId: userId },
        { sellerId: userId }
      ]
    };

    if (pair) where.pair = pair;

    const trades = await this.prisma.trade.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: limit
    });

    return trades as DatabaseTrade[];
  }

  // ===== PORTFOLIO MANAGEMENT =====

  async getPortfolio(userId: string): Promise<PortfolioBalance[]> {
    const balances = await this.prisma.portfolio.findMany({
      where: { userId }
    });

    return balances.map(balance => ({
      asset: balance.asset,
      totalBalance: balance.totalBalance,
      availableBalance: balance.availableBalance,
      lockedBalance: balance.lockedBalance,
      realizedPnL: balance.realizedPnL,
      unrealizedPnL: balance.unrealizedPnL,
      avgCostBasis: balance.avgCostBasis
    }));
  }

  async updateBalance(userId: string, asset: string, change: {
    totalBalance?: number;
    availableBalance?: number;
    lockedBalance?: number;
    realizedPnL?: number;
    unrealizedPnL?: number;
    avgCostBasis?: number;
  }): Promise<void> {
    const updateData: any = {};
    
    Object.entries(change).forEach(([key, value]) => {
      if (value !== undefined) {
        updateData[key] = new Decimal(value);
      }
    });

    await this.prisma.portfolio.upsert({
      where: {
        userId_asset: { userId, asset }
      },
      update: updateData,
      create: {
        userId,
        asset,
        totalBalance: new Decimal(change.totalBalance || 0),
        availableBalance: new Decimal(change.availableBalance || 0),
        lockedBalance: new Decimal(change.lockedBalance || 0),
        realizedPnL: new Decimal(change.realizedPnL || 0),
        unrealizedPnL: new Decimal(change.unrealizedPnL || 0),
        avgCostBasis: change.avgCostBasis ? new Decimal(change.avgCostBasis) : null
      }
    });

    this.emit('balanceUpdated', { userId, asset, change });
  }

  async lockBalance(userId: string, asset: string, amount: number): Promise<boolean> {
    try {
      await this.prisma.portfolio.update({
        where: { userId_asset: { userId, asset } },
        data: {
          availableBalance: { decrement: new Decimal(amount) },
          lockedBalance: { increment: new Decimal(amount) }
        }
      });

      this.emit('balanceLocked', { userId, asset, amount });
      return true;
    } catch (error) {
      return false;
    }
  }

  async unlockBalance(userId: string, asset: string, amount: number): Promise<boolean> {
    try {
      await this.prisma.portfolio.update({
        where: { userId_asset: { userId, asset } },
        data: {
          availableBalance: { increment: new Decimal(amount) },
          lockedBalance: { decrement: new Decimal(amount) }
        }
      });

      this.emit('balanceUnlocked', { userId, asset, amount });
      return true;
    } catch (error) {
      return false;
    }
  }

  // ===== PRICE ALERTS =====

  async createPriceAlert(alertData: {
    userId: string;
    pair: string;
    price: number;
    condition: 'ABOVE' | 'BELOW' | 'CROSSES_UP' | 'CROSSES_DOWN';
    expiresAt?: Date;
  }) {
    return await this.prisma.priceAlert.create({
      data: {
        userId: alertData.userId,
        pair: alertData.pair,
        price: new Decimal(alertData.price),
        condition: alertData.condition,
        expiresAt: alertData.expiresAt
      }
    });
  }

  async getActivePriceAlerts(pair?: string) {
    const where: any = {
      isActive: true,
      triggered: false
    };

    if (pair) where.pair = pair;

    return await this.prisma.priceAlert.findMany({ where });
  }

  async triggerPriceAlert(alertId: string) {
    await this.prisma.priceAlert.update({
      where: { id: alertId },
      data: {
        triggered: true,
        triggeredAt: new Date()
      }
    });

    this.emit('priceAlertTriggered', alertId);
  }

  // ===== CACHING UTILITIES =====

  private async cacheOrder(order: any): Promise<void> {
    await this.redis.setex(`order:${order.id}`, 3600, JSON.stringify(order)); // 1 hour cache
  }

  // ===== ANALYTICS & REPORTING =====

  async getTradeVolume(pair: string, timeframe: '1h' | '24h' | '7d' | '30d'): Promise<{
    volume: number;
    count: number;
    high: number;
    low: number;
    open: number;
    close: number;
  }> {
    const timeMap = {
      '1h': 1,
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30
    };

    const hours = timeMap[timeframe];
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const trades = await this.prisma.trade.findMany({
      where: {
        pair,
        executedAt: { gte: since },
        status: 'COMPLETED'
      },
      orderBy: { executedAt: 'asc' }
    });

    if (trades.length === 0) {
      return { volume: 0, count: 0, high: 0, low: 0, open: 0, close: 0 };
    }

    const volume = trades.reduce((sum, trade) => sum + Number(trade.totalValue), 0);
    const prices = trades.map(t => Number(t.price));
    
    return {
      volume,
      count: trades.length,
      high: Math.max(...prices),
      low: Math.min(...prices),
      open: prices[0],
      close: prices[prices.length - 1]
    };
  }

  async getUserStats(userId: string): Promise<{
    totalTrades: number;
    totalVolume: number;
    avgTradeSize: number;
    winRate: number;
    realizedPnL: number;
  }> {
    const trades = await this.prisma.trade.findMany({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        status: 'COMPLETED'
      }
    });

    const portfolio = await this.prisma.portfolio.findMany({
      where: { userId }
    });

    const totalVolume = trades.reduce((sum, trade) => sum + Number(trade.totalValue), 0);
    const totalPnL = portfolio.reduce((sum, p) => sum + Number(p.realizedPnL), 0);

    return {
      totalTrades: trades.length,
      totalVolume,
      avgTradeSize: trades.length > 0 ? totalVolume / trades.length : 0,
      winRate: 0, // This would require more complex PnL tracking per trade
      realizedPnL: totalPnL
    };
  }

  // ===== CLEANUP & MAINTENANCE =====

  async cleanupExpiredOrders(): Promise<number> {
    const result = await this.prisma.order.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { in: ['PENDING', 'ACTIVE', 'PARTIAL'] }
      },
      data: { status: 'EXPIRED' }
    });

    if (result.count > 0) {
      this.emit('ordersExpired', result.count);
    }

    return result.count;
  }

  async getSystemHealth(): Promise<{
    totalOrders: number;
    activeOrders: number;
    totalTrades: number;
    totalUsers: number;
  }> {
    const [totalOrders, activeOrders, totalTrades, totalUsers] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.count({
        where: { status: { in: ['PENDING', 'ACTIVE', 'PARTIAL'] } }
      }),
      this.prisma.trade.count(),
      this.prisma.user.count()
    ]);

    return {
      totalOrders,
      activeOrders,
      totalTrades,
      totalUsers
    };
  }
}
