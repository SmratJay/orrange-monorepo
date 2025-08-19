// Simple Matching Engine Integration for Orrange P2P
// This version removes external dependencies and integrates with the existing server setup

import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

interface Order {
  id: string;
  userId: string;
  type: 'BUY' | 'SELL';
  amount: number;
  price: number;
  pair: string;
  status: 'PENDING' | 'PARTIAL' | 'FILLED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

interface Trade {
  id: string;
  buyOrderId: string;
  sellOrderId: string;
  pair: string;
  price: number;
  amount: number;
  buyerFee: number;
  sellerFee: number;
  executedAt: Date;
}

interface OrderBookLevel {
  price: number;
  amount: number;
  orderCount: number;
}

interface OrderBook {
  pair: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdated: Date;
}

class SimpleMatchingEngine extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private isRunning = false;
  
  // Performance tracking
  private metrics = {
    totalMatches: 0,
    totalTrades: 0,
    averageMatchTime: 0,
    lastMatchTime: 0,
  };

  constructor(prisma: PrismaClient, redis: Redis) {
    super();
    this.prisma = prisma;
    this.redis = redis;
  }

  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🎯 Simple Matching Engine started');
    
    // Listen for new order events
    this.setupOrderListener();
    
    this.emit('started');
  }

  async stop() {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    console.log('⏹️ Simple Matching Engine stopped');
    this.emit('stopped');
  }

  private setupOrderListener() {
    // In a real implementation, this would listen to Redis pub/sub for new orders
    // For now, we'll provide a method to manually trigger matching
    setInterval(async () => {
      try {
        await this.processAllPairs();
      } catch (error) {
        console.error('Error in periodic matching:', error);
      }
    }, 5000); // Check every 5 seconds
  }

  async processAllPairs() {
    const pairs = ['BTC-USD', 'ETH-USD']; // Add more pairs as needed
    
    for (const pair of pairs) {
      await this.processPair(pair);
    }
  }

  async processPair(pair: string) {
    const startTime = Date.now();
    
    try {
      // Get pending orders for this pair
      const orders = await this.prisma.order.findMany({
        where: {
          status: 'PENDING',
          // Add pair filter when the field is available
        },
        orderBy: [
          { createdAt: 'asc' }, // FIFO for same price
          { price: 'desc' }, // Higher buy prices first, lower sell prices first
        ],
      });

      // Separate buy and sell orders
      const buyOrders = orders.filter(order => order.type === 'BUY');
      const sellOrders = orders.filter(order => order.type === 'SELL');

      // Sort orders by price priority
      buyOrders.sort((a, b) => b.price - a.price); // Highest price first for buys
      sellOrders.sort((a, b) => a.price - b.price); // Lowest price first for sells

      let matchCount = 0;
      
      // Match orders
      for (const buyOrder of buyOrders) {
        for (const sellOrder of sellOrders) {
          if (buyOrder.price >= sellOrder.price && 
              buyOrder.status === 'PENDING' && 
              sellOrder.status === 'PENDING') {
            
            const matched = await this.executeMatch(buyOrder, sellOrder);
            if (matched) {
              matchCount++;
              break; // Move to next buy order
            }
          }
        }
      }

      if (matchCount > 0) {
        // Update order book cache
        await this.updateOrderBookCache(pair);
        
        // Update metrics
        const matchTime = Date.now() - startTime;
        this.metrics.lastMatchTime = matchTime;
        this.metrics.averageMatchTime = (this.metrics.averageMatchTime * 0.9) + (matchTime * 0.1);
        this.metrics.totalMatches += matchCount;
        
        console.log(`✅ Processed ${pair}: ${matchCount} matches in ${matchTime}ms`);
      }

    } catch (error) {
      console.error(`Error processing pair ${pair}:`, error);
    }
  }

  private async executeMatch(buyOrder: any, sellOrder: any): Promise<boolean> {
    try {
      // Calculate trade details
      const tradePrice = sellOrder.price; // Seller gets their asking price
      const tradeAmount = Math.min(buyOrder.amount, sellOrder.amount);
      
      // Calculate fees (0.1% for each side)
      const feeRate = 0.001;
      const buyerFee = tradeAmount * tradePrice * feeRate;
      const sellerFee = tradeAmount * tradePrice * feeRate;

      // Execute in transaction
      const result = await this.prisma.$transaction(async (tx) => {
        // Create trade record
        const trade = await tx.trade.create({
          data: {
            id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            buyOrderId: buyOrder.id,
            sellOrderId: sellOrder.id,
            price: tradePrice,
            amount: tradeAmount,
            buyerFee,
            sellerFee,
            status: 'COMPLETED',
          },
        });

        // Update buy order
        const newBuyAmount = buyOrder.amount - tradeAmount;
        await tx.order.update({
          where: { id: buyOrder.id },
          data: {
            amount: newBuyAmount,
            status: newBuyAmount === 0 ? 'FILLED' : 'PARTIAL',
            updatedAt: new Date(),
          },
        });

        // Update sell order
        const newSellAmount = sellOrder.amount - tradeAmount;
        await tx.order.update({
          where: { id: sellOrder.id },
          data: {
            amount: newSellAmount,
            status: newSellAmount === 0 ? 'FILLED' : 'PARTIAL',
            updatedAt: new Date(),
          },
        });

        return trade;
      });

      // Emit trade event
      this.emit('tradeExecuted', {
        trade: result,
        buyOrder,
        sellOrder,
        pair: 'BTC-USD', // TODO: Get from order
      });

      // Cache trade in Redis for real-time updates
      await this.redis.setex(
        `recent_trade:${result.id}`,
        3600, // 1 hour
        JSON.stringify({
          id: result.id,
          price: result.price,
          amount: result.amount,
          timestamp: new Date().toISOString(),
        })
      );

      this.metrics.totalTrades++;
      return true;

    } catch (error) {
      console.error('Error executing match:', error);
      return false;
    }
  }

  private async updateOrderBookCache(pair: string) {
    try {
      // Get current orders for order book
      const orders = await this.prisma.order.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          // Add pair filter when available
        },
      });

      // Build order book
      const buyOrders = orders.filter(o => o.type === 'BUY');
      const sellOrders = orders.filter(o => o.type === 'SELL');

      // Aggregate by price level
      const bids = this.aggregateOrdersByPrice(buyOrders).sort((a, b) => b.price - a.price);
      const asks = this.aggregateOrdersByPrice(sellOrders).sort((a, b) => a.price - b.price);

      const orderBook: OrderBook = {
        pair,
        bids: bids.slice(0, 20), // Top 20 levels
        asks: asks.slice(0, 20),
        lastUpdated: new Date(),
      };

      // Cache in Redis
      await this.redis.setex(
        `orderbook:${pair}`,
        60, // 1 minute
        JSON.stringify(orderBook)
      );

      // Publish update
      await this.redis.publish(`orderbook_updates:${pair}`, JSON.stringify(orderBook));

    } catch (error) {
      console.error(`Error updating order book cache for ${pair}:`, error);
    }
  }

  private aggregateOrdersByPrice(orders: any[]): OrderBookLevel[] {
    const priceMap = new Map<number, { amount: number; count: number }>();

    for (const order of orders) {
      const existing = priceMap.get(order.price) || { amount: 0, count: 0 };
      priceMap.set(order.price, {
        amount: existing.amount + order.amount,
        count: existing.count + 1,
      });
    }

    return Array.from(priceMap.entries()).map(([price, { amount, count }]) => ({
      price,
      amount,
      orderCount: count,
    }));
  }

  // Public API methods
  async getOrderBook(pair: string): Promise<OrderBook | null> {
    try {
      const cached = await this.redis.get(`orderbook:${pair}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Generate fresh order book
      await this.updateOrderBookCache(pair);
      const fresh = await this.redis.get(`orderbook:${pair}`);
      return fresh ? JSON.parse(fresh) : null;
    } catch (error) {
      console.error(`Error getting order book for ${pair}:`, error);
      return null;
    }
  }

  async getRecentTrades(pair: string, limit = 50): Promise<any[]> {
    try {
      const trades = await this.prisma.trade.findMany({
        where: {
          status: 'COMPLETED',
          // Add pair filter when available
        },
        orderBy: {
          executedAt: 'desc',
        },
        take: limit,
      });

      return trades;
    } catch (error) {
      console.error(`Error getting recent trades for ${pair}:`, error);
      return [];
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  // Method to manually trigger matching (for testing)
  async triggerMatching(pair?: string) {
    if (pair) {
      await this.processPair(pair);
    } else {
      await this.processAllPairs();
    }
  }
}

export default SimpleMatchingEngine;
