// Real-time Order Matching Engine for Orrange P2P
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { EventEmitter } from 'events';
import Decimal from 'decimal.js';

interface Order {
  id: string;
  userId: string;
  side: 'BUY' | 'SELL';
  asset: string;
  fiatCurrency: string;
  amount: string; // Decimal as string
  price: string; // Decimal as string
  totalValue: string;
  minTradeAmount: string;
  paymentMethods: string[];
  timestamp: number;
  orderHash: string;
  nonce: bigint;
}

interface MatchResult {
  buyOrder: Order;
  sellOrder: Order;
  matchedAmount: string;
  matchedPrice: string;
  matchedValue: string;
  timestamp: number;
  tradeId: string;
}

interface OrderBookSnapshot {
  pair: string;
  bids: Array<{ price: string; amount: string; orderId: string; timestamp: number }>;
  asks: Array<{ price: string; amount: string; orderId: string; timestamp: number }>;
  lastPrice?: string;
  timestamp: number;
}

export class MatchingEngine extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private isRunning = false;
  private processingQueue = new Set<string>();
  
  // Performance metrics
  private metrics = {
    totalMatches: 0,
    averageMatchLatency: 0,
    orderBookUpdates: 0,
    lastMatchTime: 0,
  };

  constructor(redis: Redis, prisma: PrismaClient) {
    super();
    this.redis = redis;
    this.prisma = prisma;
    
    // Set up Redis event listeners
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for new orders
    this.redis.psubscribe('order:new:*');
    this.redis.psubscribe('order:cancel:*');
    this.redis.psubscribe('order:update:*');

    this.redis.on('pmessage', async (pattern, channel, message) => {
      try {
        const data = JSON.parse(message);
        
        if (pattern === 'order:new:*') {
          await this.processNewOrder(data.order);
        } else if (pattern === 'order:cancel:*') {
          await this.processCancelOrder(data.orderId);
        } else if (pattern === 'order:update:*') {
          await this.processUpdateOrder(data.order);
        }
      } catch (error) {
        console.error('Error processing Redis message:', error);
        this.emit('error', error);
      }
    });
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Matching Engine started');
    
    // Initialize order books from database
    await this.initializeOrderBooks();
    
    // Start performance monitoring
    this.startPerformanceMonitoring();
    
    this.emit('started');
  }

  async stop() {
    this.isRunning = false;
    await this.redis.punsubscribe();
    console.log('⏹️ Matching Engine stopped');
    this.emit('stopped');
  }

  private async initializeOrderBooks() {
    console.log('📊 Initializing order books from database...');
    
    try {
      // Get all active orders from database
      const activeOrders = await this.prisma.order.findMany({
        where: {
          status: { in: ['ACTIVE', 'PARTIAL'] },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      // Group by trading pair
      const ordersByPair = new Map<string, Order[]>();
      
      for (const dbOrder of activeOrders) {
        const pair = `${dbOrder.asset}-${dbOrder.fiatCurrency}`;
        const order: Order = {
          id: dbOrder.id,
          userId: dbOrder.creatorId,
          side: dbOrder.side as 'BUY' | 'SELL',
          asset: dbOrder.asset,
          fiatCurrency: dbOrder.fiatCurrency,
          amount: dbOrder.amount,
          price: dbOrder.price,
          totalValue: dbOrder.totalValue,
          minTradeAmount: dbOrder.minTradeAmount,
          paymentMethods: dbOrder.paymentMethods,
          timestamp: dbOrder.createdAt.getTime(),
          orderHash: dbOrder.orderHash,
          nonce: dbOrder.nonce,
        };

        if (!ordersByPair.has(pair)) {
          ordersByPair.set(pair, []);
        }
        ordersByPair.get(pair)!.push(order);
      }

      // Initialize Redis order books
      for (const [pair, orders] of ordersByPair) {
        await this.initializePairOrderBook(pair, orders);
      }

      console.log(`✅ Initialized ${ordersByPair.size} order books with ${activeOrders.length} orders`);
    } catch (error) {
      console.error('❌ Failed to initialize order books:', error);
      throw error;
    }
  }

  private async initializePairOrderBook(pair: string, orders: Order[]) {
    const pipeline = this.redis.pipeline();

    // Clear existing order book
    pipeline.del(`orderbook:bids:${pair}`);
    pipeline.del(`orderbook:asks:${pair}`);
    pipeline.del(`orderbook:orders:${pair}`);

    // Add orders to appropriate side
    for (const order of orders) {
      const orderKey = `orderbook:orders:${pair}`;
      const orderData = JSON.stringify(order);
      
      // Store order data
      pipeline.hset(orderKey, order.id, orderData);

      // Add to appropriate sorted set (price as score)
      const priceScore = parseFloat(order.price);
      
      if (order.side === 'BUY') {
        // For bids: higher price = higher score (descending order)
        pipeline.zadd(`orderbook:bids:${pair}`, priceScore, order.id);
      } else {
        // For asks: lower price = lower score (ascending order) 
        // Use negative timestamp as tie-breaker for same price
        const scoreWithTime = priceScore + (order.timestamp / 1e15); // Microsecond precision
        pipeline.zadd(`orderbook:asks:${pair}`, scoreWithTime, order.id);
      }
    }

    await pipeline.exec();
  }

  async processNewOrder(order: Order): Promise<MatchResult[]> {
    if (this.processingQueue.has(order.id)) {
      return []; // Already processing
    }

    this.processingQueue.add(order.id);
    const startTime = Date.now();

    try {
      const pair = `${order.asset}-${order.fiatCurrency}`;
      const matches: MatchResult[] = [];

      // Add order to order book first
      await this.addOrderToBook(pair, order);

      // Try to match with existing orders
      const matchResults = await this.matchOrder(pair, order);
      matches.push(...matchResults);

      // Update performance metrics
      const latency = Date.now() - startTime;
      this.updateMetrics(matches.length, latency);

      // Emit events for matches
      for (const match of matches) {
        this.emit('trade', match);
        
        // Publish to Redis for real-time updates
        await this.redis.publish(`trades:${pair}`, JSON.stringify(match));
      }

      // Publish order book update
      const orderBookSnapshot = await this.getOrderBookSnapshot(pair);
      await this.redis.publish(`orderbook:${pair}`, JSON.stringify(orderBookSnapshot));

      return matches;

    } finally {
      this.processingQueue.delete(order.id);
    }
  }

  private async matchOrder(pair: string, newOrder: Order): Promise<MatchResult[]> {
    const matches: MatchResult[] = [];
    let remainingAmount = new Decimal(newOrder.amount);

    // Get opposite side orders
    const oppositeSide = newOrder.side === 'BUY' ? 'asks' : 'bids';
    const orderBookKey = `orderbook:${oppositeSide}:${pair}`;

    while (remainingAmount.gt(0)) {
      // Get best price order from opposite side
      const bestOrders = newOrder.side === 'BUY' 
        ? await this.redis.zrange(orderBookKey, 0, 0, 'WITHSCORES') // Lowest ask
        : await this.redis.zrevrange(orderBookKey, 0, 0, 'WITHSCORES'); // Highest bid

      if (bestOrders.length === 0) break; // No more orders to match

      const [bestOrderId] = bestOrders;
      const bestOrderData = await this.redis.hget(`orderbook:orders:${pair}`, bestOrderId);
      
      if (!bestOrderData) {
        // Clean up stale order reference
        await this.redis.zrem(orderBookKey, bestOrderId);
        continue;
      }

      const bestOrder: Order = JSON.parse(bestOrderData);

      // Check if prices match
      if (!this.canMatch(newOrder, bestOrder)) break;

      // Calculate match amount
      const bestOrderAmount = new Decimal(bestOrder.amount);
      const matchAmount = Decimal.min(remainingAmount, bestOrderAmount);
      
      // Check minimum trade amounts
      if (matchAmount.lt(newOrder.minTradeAmount) || matchAmount.lt(bestOrder.minTradeAmount)) {
        break;
      }

      // Create match
      const matchPrice = bestOrder.price; // Use existing order price
      const matchValue = matchAmount.mul(matchPrice);
      
      const match: MatchResult = {
        buyOrder: newOrder.side === 'BUY' ? newOrder : bestOrder,
        sellOrder: newOrder.side === 'SELL' ? newOrder : bestOrder,
        matchedAmount: matchAmount.toString(),
        matchedPrice: matchPrice,
        matchedValue: matchValue.toString(),
        timestamp: Date.now(),
        tradeId: this.generateTradeId(),
      };

      matches.push(match);

      // Update remaining amounts
      remainingAmount = remainingAmount.sub(matchAmount);
      const newBestOrderAmount = bestOrderAmount.sub(matchAmount);

      // Update or remove the matched order
      if (newBestOrderAmount.gt(0)) {
        // Partially filled - update amount
        bestOrder.amount = newBestOrderAmount.toString();
        bestOrder.totalValue = newBestOrderAmount.mul(bestOrder.price).toString();
        await this.redis.hset(`orderbook:orders:${pair}`, bestOrderId, JSON.stringify(bestOrder));
        
        // Update in database
        await this.updateOrderInDB(bestOrderId, {
          amount: bestOrder.amount,
          totalValue: bestOrder.totalValue,
          status: 'PARTIAL',
        });
      } else {
        // Fully filled - remove from order book
        await this.removeOrderFromBook(pair, bestOrder);
        
        // Update in database
        await this.updateOrderInDB(bestOrderId, {
          status: 'FILLED',
        });
      }

      // Create trade record in database
      await this.createTradeInDB(match);
    }

    // Update the new order if partially filled
    if (remainingAmount.lt(newOrder.amount)) {
      const newAmount = remainingAmount.toString();
      const newTotalValue = remainingAmount.mul(newOrder.price).toString();
      
      if (remainingAmount.gt(0)) {
        // Update order amount
        newOrder.amount = newAmount;
        newOrder.totalValue = newTotalValue;
        await this.redis.hset(`orderbook:orders:${pair}`, newOrder.id, JSON.stringify(newOrder));
        
        await this.updateOrderInDB(newOrder.id, {
          amount: newAmount,
          totalValue: newTotalValue,
          status: 'PARTIAL',
        });
      } else {
        // Fully filled - remove from order book
        await this.removeOrderFromBook(pair, newOrder);
        
        await this.updateOrderInDB(newOrder.id, {
          status: 'FILLED',
        });
      }
    }

    return matches;
  }

  private canMatch(order1: Order, order2: Order): boolean {
    // Must be opposite sides
    if (order1.side === order2.side) return false;
    
    // Must be same trading pair
    if (order1.asset !== order2.asset || order1.fiatCurrency !== order2.fiatCurrency) return false;
    
    // Price compatibility check
    const buyOrder = order1.side === 'BUY' ? order1 : order2;
    const sellOrder = order1.side === 'SELL' ? order1 : order2;
    
    const buyPrice = new Decimal(buyOrder.price);
    const sellPrice = new Decimal(sellOrder.price);
    
    // Buy price must be >= sell price
    return buyPrice.gte(sellPrice);
  }

  private async addOrderToBook(pair: string, order: Order) {
    const pipeline = this.redis.pipeline();
    
    // Store order data
    pipeline.hset(`orderbook:orders:${pair}`, order.id, JSON.stringify(order));
    
    // Add to appropriate sorted set
    const priceScore = parseFloat(order.price);
    
    if (order.side === 'BUY') {
      // Bids: higher price first, then older orders first
      const score = priceScore + (1e15 - order.timestamp) / 1e15;
      pipeline.zadd(`orderbook:bids:${pair}`, score, order.id);
    } else {
      // Asks: lower price first, then older orders first  
      const score = priceScore + (order.timestamp / 1e15);
      pipeline.zadd(`orderbook:asks:${pair}`, score, order.id);
    }
    
    await pipeline.exec();
  }

  private async removeOrderFromBook(pair: string, order: Order) {
    const pipeline = this.redis.pipeline();
    
    pipeline.hdel(`orderbook:orders:${pair}`, order.id);
    pipeline.zrem(`orderbook:bids:${pair}`, order.id);
    pipeline.zrem(`orderbook:asks:${pair}`, order.id);
    
    await pipeline.exec();
  }

  private async getOrderBookSnapshot(pair: string): Promise<OrderBookSnapshot> {
    // Get top 20 bids and asks
    const [bidsData, asksData] = await Promise.all([
      this.redis.zrevrange(`orderbook:bids:${pair}`, 0, 19, 'WITHSCORES'),
      this.redis.zrange(`orderbook:asks:${pair}`, 0, 19, 'WITHSCORES'),
    ]);

    const bids: OrderBookSnapshot['bids'] = [];
    const asks: OrderBookSnapshot['asks'] = [];

    // Process bids
    for (let i = 0; i < bidsData.length; i += 2) {
      const orderId = bidsData[i];
      const orderData = await this.redis.hget(`orderbook:orders:${pair}`, orderId);
      
      if (orderData) {
        const order: Order = JSON.parse(orderData);
        bids.push({
          price: order.price,
          amount: order.amount,
          orderId: order.id,
          timestamp: order.timestamp,
        });
      }
    }

    // Process asks
    for (let i = 0; i < asksData.length; i += 2) {
      const orderId = asksData[i];
      const orderData = await this.redis.hget(`orderbook:orders:${pair}`, orderId);
      
      if (orderData) {
        const order: Order = JSON.parse(orderData);
        asks.push({
          price: order.price,
          amount: order.amount,
          orderId: order.id,
          timestamp: order.timestamp,
        });
      }
    }

    // Get last trade price
    const lastTrade = await this.prisma.trade.findFirst({
      where: {
        asset: pair.split('-')[0],
        fiatCurrency: pair.split('-')[1],
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
    });

    return {
      pair,
      bids,
      asks,
      lastPrice: lastTrade?.price,
      timestamp: Date.now(),
    };
  }

  private async updateOrderInDB(orderId: string, updates: any) {
    try {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      console.error('Failed to update order in DB:', error);
    }
  }

  private async createTradeInDB(match: MatchResult) {
    try {
      await this.prisma.trade.create({
        data: {
          id: match.tradeId,
          buyOrderId: match.buyOrder.id,
          sellOrderId: match.sellOrder.id,
          buyerId: match.buyOrder.userId,
          sellerId: match.sellOrder.userId,
          asset: match.buyOrder.asset,
          fiatCurrency: match.buyOrder.fiatCurrency,
          amount: match.matchedAmount,
          price: match.matchedPrice,
          totalValue: match.matchedValue,
          status: 'INITIATED',
          paymentMethod: match.sellOrder.paymentMethods[0], // TODO: Better payment method selection
          tradeHash: this.generateTradeHash(match),
          createdAt: new Date(match.timestamp),
        },
      });
    } catch (error) {
      console.error('Failed to create trade in DB:', error);
    }
  }

  private generateTradeId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTradeHash(match: MatchResult): string {
    // Simple hash for now - in production use crypto.createHash
    return `hash_${match.tradeId}_${match.timestamp}`;
  }

  private updateMetrics(matchCount: number, latency: number) {
    this.metrics.totalMatches += matchCount;
    this.metrics.lastMatchTime = Date.now();
    
    // Rolling average for latency
    this.metrics.averageMatchLatency = 
      (this.metrics.averageMatchLatency * 0.9) + (latency * 0.1);
  }

  private startPerformanceMonitoring() {
    setInterval(() => {
      console.log('📊 Matching Engine Metrics:', {
        totalMatches: this.metrics.totalMatches,
        avgLatency: `${this.metrics.averageMatchLatency.toFixed(2)}ms`,
        lastMatch: new Date(this.metrics.lastMatchTime).toISOString(),
        isRunning: this.isRunning,
      });
    }, 30000); // Every 30 seconds
  }

  async processCancelOrder(orderId: string) {
    // Implementation for order cancellation
    // Remove from all relevant Redis structures
  }

  async processUpdateOrder(order: Order) {
    // Implementation for order updates
    // Update Redis and re-run matching if needed
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

export default MatchingEngine;
