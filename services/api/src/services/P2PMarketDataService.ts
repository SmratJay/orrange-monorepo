/**
 * P2P Market Data Analytics Service
 * MIT-Level Engineering - Pure P2P Crypto Platform
 * 
 * Features:
 * - Real-time market data aggregation
 * - Advanced trading analytics
 * - Liquidity analysis
 * - Price discovery algorithms
 * - Market health monitoring
 * - Performance benchmarking
 * - Reputation-weighted metrics
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import BigNumber from 'bignumber.js';
import P2PMatchingEngine, { P2POrder, P2PTrade, P2POrderBook } from './P2PMatchingEngine.js';
import { AuditService } from './AuditService.js';

// ===========================
// MARKET DATA TYPES
// ===========================

export interface MarketSnapshot {
  symbol: string;
  timestamp: Date;
  
  // Price data
  price: {
    current: BigNumber;
    change24h: BigNumber;
    changePercent24h: BigNumber;
    high24h: BigNumber;
    low24h: BigNumber;
    open24h: BigNumber;
  };
  
  // Volume data
  volume: {
    total24h: BigNumber;
    baseVolume24h: BigNumber;
    quoteVolume24h: BigNumber;
    tradeCount24h: number;
    avgTradeSize: BigNumber;
  };
  
  // Liquidity metrics
  liquidity: {
    totalBidLiquidity: BigNumber;
    totalAskLiquidity: BigNumber;
    spread: BigNumber;
    spreadPercent: BigNumber;
    depthBids: OrderBookLevel[];
    depthAsks: OrderBookLevel[];
    midPrice: BigNumber;
  };
  
  // P2P specific metrics
  p2p: {
    avgReputationScore: number;
    totalActiveOrders: number;
    avgOrderSize: BigNumber;
    escrowedVolume: BigNumber;
    avgSettlementTime: number; // in minutes
    popularPaymentMethods: PaymentMethodStats[];
  };
  
  // Market health indicators
  health: {
    liquidityScore: number; // 0-100
    volatilityScore: number; // 0-100
    trustScore: number; // 0-100, based on reputation
    overallScore: number; // 0-100
  };
}

export interface OrderBookLevel {
  price: BigNumber;
  quantity: BigNumber;
  orderCount: number;
  avgReputation: number;
  depth: BigNumber; // cumulative quantity at this level and above
}

export interface PaymentMethodStats {
  method: string;
  volume24h: BigNumber;
  tradeCount: number;
  avgReputation: number;
}

export interface TradingPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  isActive: boolean;
  minTradeSize: BigNumber;
  tickSize: BigNumber; // minimum price increment
}

export interface MarketTrend {
  symbol: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  strength: number; // 0-100
  confidence: number; // 0-100
  supportLevel: BigNumber;
  resistanceLevel: BigNumber;
}

export interface LiquidityAnalysis {
  symbol: string;
  timestamp: Date;
  
  // Depth analysis
  bidDepth: {
    depth_1: BigNumber; // liquidity within 1% of best bid
    depth_5: BigNumber; // liquidity within 5% of best bid
    depth_10: BigNumber; // liquidity within 10% of best bid
  };
  
  askDepth: {
    depth_1: BigNumber;
    depth_5: BigNumber;
    depth_10: BigNumber;
  };
  
  // Market impact analysis
  priceImpact: {
    buy_1000: BigNumber; // price impact for $1000 buy order
    buy_10000: BigNumber;
    sell_1000: BigNumber;
    sell_10000: BigNumber;
  };
  
  // Time-weighted metrics
  timeWeighted: {
    avgSpread: BigNumber;
    avgDepth: BigNumber;
    uptime: number; // percentage of time with active orders
  };
}

/**
 * P2P Market Data Analytics Service
 */
export class P2PMarketDataService extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private p2pEngine: P2PMatchingEngine;
  private auditService: AuditService;
  
  // Data storage
  private marketSnapshots: Map<string, MarketSnapshot>; // symbol -> latest snapshot
  private tradingPairs: Map<string, TradingPair>;
  private recentTrades: Map<string, P2PTrade[]>; // symbol -> recent trades
  private priceHistory: Map<string, Array<{timestamp: Date; price: BigNumber}>>; // symbol -> price points
  
  // Analytics cache
  private liquidityAnalysis: Map<string, LiquidityAnalysis>;
  private marketTrends: Map<string, MarketTrend[]>;
  private performanceMetrics: Map<string, any>;
  
  // Configuration
  private readonly SNAPSHOT_INTERVAL = 60000; // 1 minute snapshots
  private readonly TRADE_HISTORY_LIMIT = 1000; // Keep last 1000 trades per pair
  private readonly PRICE_HISTORY_LIMIT = 10000; // Keep last 10000 price points
  private readonly TREND_ANALYSIS_INTERVAL = 300000; // 5 minutes
  private readonly CACHE_TTL = 300; // 5 minutes Redis cache

  constructor(
    p2pEngine: P2PMatchingEngine,
    auditService: AuditService,
    prisma: PrismaClient,
    redis: Redis
  ) {
    super();
    
    this.p2pEngine = p2pEngine;
    this.auditService = auditService;
    this.prisma = prisma;
    this.redis = redis;
    
    this.marketSnapshots = new Map();
    this.tradingPairs = new Map();
    this.recentTrades = new Map();
    this.priceHistory = new Map();
    this.liquidityAnalysis = new Map();
    this.marketTrends = new Map();
    this.performanceMetrics = new Map();

    this.initialize();
  }

  /**
   * Initialize the market data service
   */
  private async initialize(): Promise<void> {
    console.log('🚀 Initializing P2P Market Data Service...');

    // Load trading pairs
    await this.loadTradingPairs();
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Start background services
    this.startSnapshotService();
    this.startTrendAnalysis();
    this.startPerformanceTracking();
    
    console.log('✅ P2P Market Data Service initialized');
  }

  /**
   * Get current market snapshot for a symbol
   */
  async getMarketSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    try {
      // Check cache first
      const cached = await this.redis.get(`market:snapshot:${symbol}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Generate fresh snapshot
      const snapshot = await this.generateMarketSnapshot(symbol);
      if (snapshot) {
        // Cache it
        await this.redis.setex(`market:snapshot:${symbol}`, this.CACHE_TTL, JSON.stringify(snapshot));
        this.marketSnapshots.set(symbol, snapshot);
      }

      return snapshot;
    } catch (error) {
      console.error(`❌ Error getting market snapshot for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get market snapshots for all active trading pairs
   */
  async getAllMarketSnapshots(): Promise<MarketSnapshot[]> {
    const snapshots: MarketSnapshot[] = [];
    
    for (const symbol of this.tradingPairs.keys()) {
      const snapshot = await this.getMarketSnapshot(symbol);
      if (snapshot) {
        snapshots.push(snapshot);
      }
    }

    return snapshots;
  }

  /**
   * Get liquidity analysis for a symbol
   */
  async getLiquidityAnalysis(symbol: string): Promise<LiquidityAnalysis | null> {
    try {
      const cached = await this.redis.get(`liquidity:analysis:${symbol}`);
      if (cached) {
        return JSON.parse(cached);
      }

      const analysis = await this.generateLiquidityAnalysis(symbol);
      if (analysis) {
        await this.redis.setex(`liquidity:analysis:${symbol}`, this.CACHE_TTL, JSON.stringify(analysis));
        this.liquidityAnalysis.set(symbol, analysis);
      }

      return analysis;
    } catch (error) {
      console.error(`❌ Error getting liquidity analysis for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get market trends for a symbol
   */
  getMarketTrends(symbol: string): MarketTrend[] {
    return this.marketTrends.get(symbol) || [];
  }

  /**
   * Get recent trades for a symbol
   */
  getRecentTrades(symbol: string, limit: number = 50): P2PTrade[] {
    const trades = this.recentTrades.get(symbol) || [];
    return trades.slice(0, Math.min(limit, trades.length));
  }

  /**
   * Get trading pair information
   */
  getTradingPair(symbol: string): TradingPair | undefined {
    return this.tradingPairs.get(symbol);
  }

  /**
   * Get all active trading pairs
   */
  getAllTradingPairs(): TradingPair[] {
    return Array.from(this.tradingPairs.values()).filter(pair => pair.isActive);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    return {
      totalPairs: this.tradingPairs.size,
      activePairs: Array.from(this.tradingPairs.values()).filter(p => p.isActive).length,
      totalSnapshots: this.marketSnapshots.size,
      avgSnapshotAge: this.calculateAvgSnapshotAge(),
      cacheHitRate: this.calculateCacheHitRate(),
      dataLatency: this.calculateDataLatency()
    };
  }

  // ===========================
  // SNAPSHOT GENERATION
  // ===========================

  /**
   * Generate comprehensive market snapshot
   */
  private async generateMarketSnapshot(symbol: string): Promise<MarketSnapshot | null> {
    try {
      const orderBook = this.p2pEngine.getOrderBook(symbol);
      if (!orderBook) {
        return null;
      }

      const recentTrades = this.getRecentTrades(symbol, 100);
      const last24hTrades = recentTrades.filter(trade => 
        trade.executedAt.getTime() > Date.now() - 24 * 60 * 60 * 1000
      );

      // Calculate price metrics
      const currentPrice = this.calculateCurrentPrice(orderBook, recentTrades);
      const priceMetrics = this.calculatePriceMetrics(symbol, currentPrice, last24hTrades);
      
      // Calculate volume metrics
      const volumeMetrics = this.calculateVolumeMetrics(last24hTrades);
      
      // Calculate liquidity metrics
      const liquidityMetrics = this.calculateLiquidityMetrics(orderBook);
      
      // Calculate P2P specific metrics
      const p2pMetrics = this.calculateP2PMetrics(symbol, orderBook, last24hTrades);
      
      // Calculate health indicators
      const healthIndicators = this.calculateHealthIndicators(orderBook, last24hTrades, p2pMetrics);

      const snapshot: MarketSnapshot = {
        symbol,
        timestamp: new Date(),
        price: priceMetrics,
        volume: volumeMetrics,
        liquidity: liquidityMetrics,
        p2p: p2pMetrics,
        health: healthIndicators
      };

      return snapshot;
    } catch (error) {
      console.error(`❌ Error generating market snapshot for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Calculate current price based on orderbook and recent trades
   */
  private calculateCurrentPrice(orderBook: P2POrderBook, recentTrades: P2PTrade[]): BigNumber {
    // Use most recent trade price if available
    if (recentTrades.length > 0) {
      return recentTrades[0].price;
    }

    // Otherwise use mid price from orderbook
    if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      const bestBid = orderBook.bids[0].price;
      const bestAsk = orderBook.asks[0].price;
      return bestBid.plus(bestAsk).dividedBy(2);
    }

    // Fallback to best bid or ask
    if (orderBook.bids.length > 0) return orderBook.bids[0].price;
    if (orderBook.asks.length > 0) return orderBook.asks[0].price;

    return new BigNumber(0);
  }

  /**
   * Calculate price-related metrics
   */
  private calculatePriceMetrics(symbol: string, currentPrice: BigNumber, trades: P2PTrade[]): any {
    if (trades.length === 0) {
      return {
        current: currentPrice,
        change24h: new BigNumber(0),
        changePercent24h: new BigNumber(0),
        high24h: currentPrice,
        low24h: currentPrice,
        open24h: currentPrice
      };
    }

    const prices = trades.map(t => t.price);
    const high24h = BigNumber.maximum(...prices);
    const low24h = BigNumber.minimum(...prices);
    const open24h = trades[trades.length - 1].price; // Oldest trade

    const change24h = currentPrice.minus(open24h);
    const changePercent24h = open24h.eq(0) ? new BigNumber(0) : 
      change24h.dividedBy(open24h).times(100);

    return {
      current: currentPrice,
      change24h,
      changePercent24h,
      high24h,
      low24h,
      open24h
    };
  }

  /**
   * Calculate volume-related metrics
   */
  private calculateVolumeMetrics(trades: P2PTrade[]): any {
    if (trades.length === 0) {
      return {
        total24h: new BigNumber(0),
        baseVolume24h: new BigNumber(0),
        quoteVolume24h: new BigNumber(0),
        tradeCount24h: 0,
        avgTradeSize: new BigNumber(0)
      };
    }

    const baseVolume = trades.reduce((sum, trade) => sum.plus(trade.quantity), new BigNumber(0));
    const quoteVolume = trades.reduce((sum, trade) => sum.plus(trade.quantity.times(trade.price)), new BigNumber(0));
    const avgTradeSize = baseVolume.dividedBy(trades.length);

    return {
      total24h: quoteVolume,
      baseVolume24h: baseVolume,
      quoteVolume24h: quoteVolume,
      tradeCount24h: trades.length,
      avgTradeSize
    };
  }

  /**
   * Calculate liquidity-related metrics
   */
  private calculateLiquidityMetrics(orderBook: P2POrderBook): any {
    const totalBidLiquidity = orderBook.bids.reduce((sum, level) => sum.plus(level.quantity), new BigNumber(0));
    const totalAskLiquidity = orderBook.asks.reduce((sum, level) => sum.plus(level.quantity), new BigNumber(0));

    let spread = new BigNumber(0);
    let spreadPercent = new BigNumber(0);
    let midPrice = new BigNumber(0);

    if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      const bestBid = orderBook.bids[0].price;
      const bestAsk = orderBook.asks[0].price;
      spread = bestAsk.minus(bestBid);
      midPrice = bestBid.plus(bestAsk).dividedBy(2);
      spreadPercent = midPrice.eq(0) ? new BigNumber(0) : spread.dividedBy(midPrice).times(100);
    }

    return {
      totalBidLiquidity,
      totalAskLiquidity,
      spread,
      spreadPercent,
      depthBids: this.formatOrderBookLevels(orderBook.bids),
      depthAsks: this.formatOrderBookLevels(orderBook.asks),
      midPrice
    };
  }

  /**
   * Calculate P2P specific metrics
   */
  private calculateP2PMetrics(symbol: string, orderBook: P2POrderBook, trades: P2PTrade[]): any {
    const allOrders = [...orderBook.bids, ...orderBook.asks];
    
    const avgReputationScore = allOrders.length > 0 ? 
      allOrders.reduce((sum, level) => sum + level.averageReputation, 0) / allOrders.length : 50;
    
    const totalActiveOrders = allOrders.reduce((sum, level) => sum + level.orderCount, 0);
    
    const avgOrderSize = allOrders.length > 0 ? 
      allOrders.reduce((sum, level) => sum.plus(level.quantity), new BigNumber(0)).dividedBy(allOrders.length) :
      new BigNumber(0);

    // Mock escrow and settlement data (integrate with actual services)
    const escrowedVolume = new BigNumber(Math.random() * 10000);
    const avgSettlementTime = Math.random() * 30 + 15; // 15-45 minutes

    const popularPaymentMethods: PaymentMethodStats[] = [
      { method: 'Bank Transfer', volume24h: new BigNumber(50000), tradeCount: 25, avgReputation: 85 },
      { method: 'PayPal', volume24h: new BigNumber(30000), tradeCount: 45, avgReputation: 78 },
      { method: 'Cash', volume24h: new BigNumber(20000), tradeCount: 10, avgReputation: 92 }
    ];

    return {
      avgReputationScore,
      totalActiveOrders,
      avgOrderSize,
      escrowedVolume,
      avgSettlementTime,
      popularPaymentMethods
    };
  }

  /**
   * Calculate market health indicators
   */
  private calculateHealthIndicators(orderBook: P2POrderBook, trades: P2PTrade[], p2pMetrics: any): any {
    // Liquidity score (0-100)
    const totalLiquidity = orderBook.bids.length + orderBook.asks.length;
    const liquidityScore = Math.min(100, totalLiquidity * 5); // 20 levels = 100 score

    // Volatility score (0-100, lower is better)
    let volatilityScore = 50; // neutral default
    if (trades.length > 1) {
      const prices = trades.map(t => t.price.toNumber());
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const variance = prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);
      const volatility = avgPrice > 0 ? (stdDev / avgPrice) * 100 : 0;
      volatilityScore = Math.max(0, Math.min(100, volatility * 10)); // Scale volatility
    }

    // Trust score based on reputation
    const trustScore = Math.round(p2pMetrics.avgReputationScore);

    // Overall score (weighted average)
    const overallScore = Math.round(
      liquidityScore * 0.3 + 
      (100 - volatilityScore) * 0.3 + 
      trustScore * 0.4
    );

    return {
      liquidityScore,
      volatilityScore,
      trustScore,
      overallScore
    };
  }

  // ===========================
  // LIQUIDITY ANALYSIS
  // ===========================

  /**
   * Generate detailed liquidity analysis
   */
  private async generateLiquidityAnalysis(symbol: string): Promise<LiquidityAnalysis | null> {
    try {
      const orderBook = this.p2pEngine.getOrderBook(symbol);
      if (!orderBook) return null;

      const analysis: LiquidityAnalysis = {
        symbol,
        timestamp: new Date(),
        bidDepth: this.calculateDepthAnalysis(orderBook.bids, 'BID'),
        askDepth: this.calculateDepthAnalysis(orderBook.asks, 'ASK'),
        priceImpact: this.calculatePriceImpact(orderBook),
        timeWeighted: await this.calculateTimeWeightedMetrics(symbol)
      };

      return analysis;
    } catch (error) {
      console.error(`❌ Error generating liquidity analysis for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Calculate depth analysis for bid or ask side
   */
  private calculateDepthAnalysis(levels: any[], side: 'BID' | 'ASK'): any {
    if (levels.length === 0) {
      return { depth_1: new BigNumber(0), depth_5: new BigNumber(0), depth_10: new BigNumber(0) };
    }

    const bestPrice = levels[0].price;
    const depth_1 = this.calculateDepthWithinPercent(levels, bestPrice, 1);
    const depth_5 = this.calculateDepthWithinPercent(levels, bestPrice, 5);
    const depth_10 = this.calculateDepthWithinPercent(levels, bestPrice, 10);

    return { depth_1, depth_5, depth_10 };
  }

  /**
   * Calculate liquidity depth within a price percentage
   */
  private calculateDepthWithinPercent(levels: any[], bestPrice: BigNumber, percent: number): BigNumber {
    const threshold = bestPrice.times(percent / 100);
    let depth = new BigNumber(0);

    for (const level of levels) {
      const priceDiff = level.price.minus(bestPrice).abs();
      if (priceDiff.lte(threshold)) {
        depth = depth.plus(level.quantity);
      } else {
        break; // Levels are sorted by price
      }
    }

    return depth;
  }

  /**
   * Calculate price impact for different order sizes
   */
  private calculatePriceImpact(orderBook: P2POrderBook): any {
    return {
      buy_1000: this.calculatePriceImpactForSize(orderBook.asks, new BigNumber(1000), 'BUY'),
      buy_10000: this.calculatePriceImpactForSize(orderBook.asks, new BigNumber(10000), 'BUY'),
      sell_1000: this.calculatePriceImpactForSize(orderBook.bids, new BigNumber(1000), 'SELL'),
      sell_10000: this.calculatePriceImpactForSize(orderBook.bids, new BigNumber(10000), 'SELL')
    };
  }

  /**
   * Calculate price impact for a specific order size
   */
  private calculatePriceImpactForSize(levels: any[], targetValue: BigNumber, side: 'BUY' | 'SELL'): BigNumber {
    if (levels.length === 0) return new BigNumber(0);

    const bestPrice = levels[0].price;
    let remainingValue = targetValue;
    let weightedPrice = new BigNumber(0);
    let totalQuantity = new BigNumber(0);

    for (const level of levels) {
      if (remainingValue.lte(0)) break;

      const levelValue = level.quantity.times(level.price);
      const usedValue = BigNumber.minimum(remainingValue, levelValue);
      const usedQuantity = usedValue.dividedBy(level.price);

      weightedPrice = weightedPrice.plus(level.price.times(usedQuantity));
      totalQuantity = totalQuantity.plus(usedQuantity);
      remainingValue = remainingValue.minus(usedValue);
    }

    if (totalQuantity.eq(0)) return new BigNumber(0);

    const avgExecutionPrice = weightedPrice.dividedBy(totalQuantity);
    const impact = avgExecutionPrice.minus(bestPrice).dividedBy(bestPrice).times(100).abs();
    
    return impact;
  }

  /**
   * Calculate time-weighted metrics (mock implementation)
   */
  private async calculateTimeWeightedMetrics(symbol: string): Promise<any> {
    // In production, this would analyze historical data over time
    return {
      avgSpread: new BigNumber(0.1), // Mock 0.1% average spread
      avgDepth: new BigNumber(10000), // Mock $10k average depth
      uptime: 95.5 // Mock 95.5% uptime with active orders
    };
  }

  // ===========================
  // EVENT HANDLERS & SERVICES
  // ===========================

  /**
   * Setup event listeners for real-time data updates
   */
  private setupEventListeners(): void {
    // Trade execution updates
    this.p2pEngine.on('trade:executed', (trade: P2PTrade) => {
      this.handleTradeExecution(trade);
    });

    // Order book updates
    this.p2pEngine.on('orderbook:updated', (data: { symbol: string; orderBook: P2POrderBook }) => {
      this.handleOrderBookUpdate(data.symbol, data.orderBook);
    });
  }

  /**
   * Handle trade execution for data tracking
   */
  private handleTradeExecution(trade: P2PTrade): void {
    // Update recent trades
    if (!this.recentTrades.has(trade.symbol)) {
      this.recentTrades.set(trade.symbol, []);
    }
    
    const trades = this.recentTrades.get(trade.symbol)!;
    trades.unshift(trade); // Add to beginning
    
    // Limit trade history
    if (trades.length > this.TRADE_HISTORY_LIMIT) {
      trades.splice(this.TRADE_HISTORY_LIMIT);
    }

    // Update price history
    this.updatePriceHistory(trade.symbol, trade.price, trade.executedAt);

    // Invalidate cache
    this.redis.del(`market:snapshot:${trade.symbol}`);
    
    // Emit real-time update
    this.emit('trade:executed', trade);
  }

  /**
   * Handle order book updates
   */
  private handleOrderBookUpdate(symbol: string, orderBook: P2POrderBook): void {
    // Invalidate cache
    this.redis.del(`market:snapshot:${symbol}`);
    this.redis.del(`liquidity:analysis:${symbol}`);
    
    // Emit real-time update
    this.emit('orderbook:updated', { symbol, orderBook });
  }

  /**
   * Update price history for trend analysis
   */
  private updatePriceHistory(symbol: string, price: BigNumber, timestamp: Date): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    
    const history = this.priceHistory.get(symbol)!;
    history.unshift({ timestamp, price });
    
    // Limit history
    if (history.length > this.PRICE_HISTORY_LIMIT) {
      history.splice(this.PRICE_HISTORY_LIMIT);
    }
  }

  /**
   * Start periodic snapshot generation
   */
  private startSnapshotService(): void {
    setInterval(async () => {
      for (const symbol of this.tradingPairs.keys()) {
        try {
          await this.getMarketSnapshot(symbol); // This will generate and cache
        } catch (error) {
          console.error(`❌ Error updating snapshot for ${symbol}:`, error);
        }
      }
    }, this.SNAPSHOT_INTERVAL);
  }

  /**
   * Start trend analysis service
   */
  private startTrendAnalysis(): void {
    setInterval(async () => {
      for (const symbol of this.tradingPairs.keys()) {
        try {
          const trends = await this.analyzeTrends(symbol);
          this.marketTrends.set(symbol, trends);
        } catch (error) {
          console.error(`❌ Error analyzing trends for ${symbol}:`, error);
        }
      }
    }, this.TREND_ANALYSIS_INTERVAL);
  }

  /**
   * Start performance tracking
   */
  private startPerformanceTracking(): void {
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 30000); // Every 30 seconds
  }

  // ===========================
  // UTILITY METHODS
  // ===========================

  /**
   * Load trading pairs from database
   */
  private async loadTradingPairs(): Promise<void> {
    // Mock trading pairs - in production, load from database
    const pairs = [
      { symbol: 'BTC-USDC', baseAsset: 'BTC', quoteAsset: 'USDC', isActive: true, minTradeSize: new BigNumber(0.001), tickSize: new BigNumber(0.01) },
      { symbol: 'ETH-USDC', baseAsset: 'ETH', quoteAsset: 'USDC', isActive: true, minTradeSize: new BigNumber(0.01), tickSize: new BigNumber(0.01) },
      { symbol: 'BTC-ETH', baseAsset: 'BTC', quoteAsset: 'ETH', isActive: true, minTradeSize: new BigNumber(0.001), tickSize: new BigNumber(0.0001) }
    ];

    for (const pair of pairs) {
      this.tradingPairs.set(pair.symbol, pair);
    }
  }

  /**
   * Format order book levels for API response
   */
  private formatOrderBookLevels(levels: any[]): OrderBookLevel[] {
    let cumulativeQuantity = new BigNumber(0);
    
    return levels.slice(0, 10).map(level => { // Top 10 levels
      cumulativeQuantity = cumulativeQuantity.plus(level.quantity);
      return {
        price: level.price,
        quantity: level.quantity,
        orderCount: level.orderCount,
        avgReputation: level.averageReputation,
        depth: cumulativeQuantity
      };
    });
  }

  /**
   * Analyze market trends (simplified implementation)
   */
  private async analyzeTrends(symbol: string): Promise<MarketTrend[]> {
    const trends: MarketTrend[] = [];
    const timeframes: ('1m' | '5m' | '15m' | '1h' | '4h' | '1d')[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
    
    for (const timeframe of timeframes) {
      const trend = await this.analyzeTrendForTimeframe(symbol, timeframe);
      trends.push(trend);
    }
    
    return trends;
  }

  /**
   * Analyze trend for specific timeframe
   */
  private async analyzeTrendForTimeframe(symbol: string, timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d'): Promise<MarketTrend> {
    // Mock trend analysis - in production, use technical indicators
    const trends: ('BULLISH' | 'BEARISH' | 'SIDEWAYS')[] = ['BULLISH', 'BEARISH', 'SIDEWAYS'];
    const randomTrend = trends[Math.floor(Math.random() * trends.length)];
    
    return {
      symbol,
      timeframe,
      trend: randomTrend,
      strength: Math.floor(Math.random() * 100),
      confidence: Math.floor(Math.random() * 100),
      supportLevel: new BigNumber(Math.random() * 50000 + 30000),
      resistanceLevel: new BigNumber(Math.random() * 50000 + 45000)
    };
  }

  private calculateAvgSnapshotAge(): number {
    const now = Date.now();
    const ages = Array.from(this.marketSnapshots.values())
      .map(snapshot => now - snapshot.timestamp.getTime());
    
    return ages.length > 0 ? ages.reduce((a, b) => a + b, 0) / ages.length / 1000 : 0; // seconds
  }

  private calculateCacheHitRate(): number {
    // Mock cache hit rate - in production, track actual hits/misses
    return Math.random() * 30 + 70; // 70-100% hit rate
  }

  private calculateDataLatency(): number {
    // Mock data latency - in production, measure actual latency
    return Math.random() * 100 + 50; // 50-150ms latency
  }

  private updatePerformanceMetrics(): void {
    // Update internal performance tracking
    // This would integrate with monitoring systems in production
  }
}

console.log('📈 P2P Market Data Service module loaded');
export default P2PMarketDataService;
