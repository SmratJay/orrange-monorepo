import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

export interface SimpleOrder {
  id: string;
  userId: string;
  type: 'BUY' | 'SELL';
  cryptoAsset: string;
  fiatCurrency: string;
  amount: number;
  price: number;
  status: string;
  createdAt: Date;
}

export interface TradeMatch {
  id: string;
  buyOrderId: string;
  sellOrderId: string;
  amount: number;
  price: number;
  timestamp: Date;
}

export default class SimpleMatchingEngine extends EventEmitter {
  private prisma: PrismaClient;
  private orderBooks: Map<string, SimpleOrder[]> = new Map();

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
  }

  async initialize() {
    console.log('🚀 Simple Matching Engine initialized');
    await this.loadActiveOrders();
  }

  private async loadActiveOrders() {
    try {
      const activeAds = await this.prisma.p2PAd.findMany({
        where: {
          status: 'ACTIVE',
        },
      });

      for (const ad of activeAds) {
        const pair = `${ad.cryptoAsset}-${ad.fiatCurrency}`;
        if (!this.orderBooks.has(pair)) {
          this.orderBooks.set(pair, []);
        }

        const simpleOrder: SimpleOrder = {
          id: ad.id,
          userId: ad.userId,
          type: ad.type,
          cryptoAsset: ad.cryptoAsset,
          fiatCurrency: ad.fiatCurrency,
          amount: Number(ad.amount),
          price: ad.fixedPrice ? Number(ad.fixedPrice) : 0,
          status: ad.status,
          createdAt: ad.createdAt,
        };

        this.orderBooks.get(pair)?.push(simpleOrder);
      }

      console.log(`📊 Loaded ${activeAds.length} active ads into order books`);
    } catch (error) {
      console.error('Failed to load active orders:', error);
    }
  }

  async addOrder(order: SimpleOrder) {
    const pair = `${order.cryptoAsset}-${order.fiatCurrency}`;
    
    if (!this.orderBooks.has(pair)) {
      this.orderBooks.set(pair, []);
    }

    this.orderBooks.get(pair)?.push(order);
    this.emit('order:added', order);

    // Try to match immediately
    await this.matchOrders(pair);
  }

  private async matchOrders(pair: string) {
    const orders = this.orderBooks.get(pair) || [];
    const buyOrders = orders.filter(o => o.type === 'BUY').sort((a, b) => b.price - a.price);
    const sellOrders = orders.filter(o => o.type === 'SELL').sort((a, b) => a.price - b.price);

    for (const buyOrder of buyOrders) {
      for (const sellOrder of sellOrders) {
        if (buyOrder.price >= sellOrder.price && buyOrder.amount > 0 && sellOrder.amount > 0) {
          const matchAmount = Math.min(buyOrder.amount, sellOrder.amount);
          const matchPrice = sellOrder.price; // Seller's price takes precedence

          const trade: TradeMatch = {
            id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            buyOrderId: buyOrder.id,
            sellOrderId: sellOrder.id,
            amount: matchAmount,
            price: matchPrice,
            timestamp: new Date(),
          };

          await this.executeTrade(trade);
          
          buyOrder.amount -= matchAmount;
          sellOrder.amount -= matchAmount;

          if (buyOrder.amount <= 0) break;
        }
      }
    }

    // Clean up empty orders
    const activeOrders = orders.filter(o => o.amount > 0);
    this.orderBooks.set(pair, activeOrders);
  }

  private async executeTrade(trade: TradeMatch) {
    try {
      // Create P2P trade record
      await this.prisma.p2PTrade.create({
        data: {
          adId: trade.sellOrderId, // Reference the sell ad
          sellerId: '', // Will need to get from ad
          buyerId: '', // Will need to get from buy order
          cryptoAsset: '', // Will need to determine
          fiatCurrency: '', // Will need to determine
          cryptoAmount: trade.amount,
          fiatAmount: trade.amount * trade.price,
          exchangeRate: trade.price,
          status: 'PENDING',
          paymentMethod: 'BANK_TRANSFER', // Default
          expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        },
      });

      this.emit('trade:executed', trade);
      console.log('✅ Trade executed:', trade);
    } catch (error) {
      console.error('Failed to execute trade:', error);
    }
  }

  getOrderBook(pair: string) {
    return this.orderBooks.get(pair) || [];
  }

  async shutdown() {
    console.log('🛑 Simple Matching Engine shutting down');
  }
}
