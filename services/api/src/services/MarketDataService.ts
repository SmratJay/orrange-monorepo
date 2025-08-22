// Real-time Market Data Service for Orrange P2P Platform
// MIT-level engineering with enterprise-grade performance and reliability

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import axios from 'axios';
import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import * as winston from 'winston';

// Types and Interfaces
export interface MarketPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap?: number;
  lastUpdate: Date;
}

export interface PriceAlert {
  id: string;
  userId: string;
  symbol: string;
  condition: 'ABOVE' | 'BELOW' | 'CHANGE';
  targetPrice: number;
  currentPrice: number;
  isActive: boolean;
  createdAt: Date;
}

export interface MarketAnalytics {
  symbol: string;
  period: '1h' | '24h' | '7d' | '30d';
  volumeChange: number;
  priceVolatility: number;
  tradeCount: number;
  averageTradeSize: number;
  topTraders: Array<{ userId: string; volume: number }>;
}

interface ExternalPriceSource {
  name: string;
  url: string;
  parser: (data: any) => MarketPrice[];
  weight: number; // For weighted average calculations
  isActive: boolean;
  lastFetch: Date | null;
  errorCount: number;
}

// Configuration
const SUPPORTED_SYMBOLS = [
  'BTC', 'ETH', 'USDT', 'BNB', 'ADA', 'DOT', 'LINK', 'UNI',
  'LTC', 'XRP', 'BCH', 'ATOM', 'AVAX', 'MATIC', 'FTM'
];

const FIAT_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY',
  'INR', 'BRL', 'KRW', 'SGD', 'HKD', 'MXN', 'RUB'
];

export class MarketDataService extends EventEmitter {
  private prisma: PrismaClient;
  private redis: Redis;
  private logger: winston.Logger;
  private wss?: WebSocketServer;
  private priceCache = new Map<string, MarketPrice>();
  private alertCache = new Map<string, PriceAlert[]>();
  private connectedClients = new Set<WebSocket>();
  private updateInterval?: NodeJS.Timeout;
  private isInitialized = false;

  // External data sources configuration
  private priceSources: ExternalPriceSource[] = [
    {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price',
      parser: this.parseCoinGeckoData.bind(this),
      weight: 0.4,
      isActive: true,
      lastFetch: null,
      errorCount: 0
    },
    {
      name: 'CoinMarketCap',
      url: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest',
      parser: this.parseCoinMarketCapData.bind(this),
      weight: 0.3,
      isActive: true,
      lastFetch: null,
      errorCount: 0
    },
    {
      name: 'Binance',
      url: 'https://api.binance.com/api/v3/ticker/24hr',
      parser: this.parseBinanceData.bind(this),
      weight: 0.3,
      isActive: true,
      lastFetch: null,
      errorCount: 0
    }
  ];

  constructor(
    prisma: PrismaClient, 
    redis: Redis, 
    options: { 
      wsPort?: number; 
      updateIntervalMs?: number;
      enableWebSocket?: boolean;
    } = {}
  ) {
    super();
    this.prisma = prisma;
    this.redis = redis;

    // Setup logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'market-data' },
      transports: [
        new winston.transports.File({ filename: 'logs/market-data-error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/market-data.log' }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    });

    // Initialize WebSocket server if enabled
    if (options.enableWebSocket !== false) {
      this.setupWebSocketServer(options.wsPort || 8081);
    }

    // Set update interval (default: 30 seconds)
    const intervalMs = options.updateIntervalMs || 30000;
    this.updateInterval = setInterval(() => {
      this.updateAllPrices();
    }, intervalMs);

    this.logger.info('MarketDataService initialized', {
      wsEnabled: options.enableWebSocket !== false,
      wsPort: options.wsPort || 8081,
      updateInterval: intervalMs
    });
  }

  /**
   * Initialize the service with initial data load
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.logger.info('Initializing MarketDataService...');

      // Load initial price data
      await this.updateAllPrices();

      // Load active price alerts from database
      await this.loadPriceAlerts();

      // Setup Redis subscriptions for real-time events
      await this.setupRedisSubscriptions();

      this.isInitialized = true;
      this.logger.info('MarketDataService initialization complete');

      // Emit initialization event
      this.emit('initialized');

    } catch (error) {
      this.logger.error('Failed to initialize MarketDataService', { error });
      throw new Error(`MarketDataService initialization failed: ${error}`);
    }
  }

  /**
   * Get current market price for a symbol
   */
  async getPrice(symbol: string): Promise<MarketPrice | null> {
    try {
      // Try cache first
      const cachedPrice = this.priceCache.get(symbol.toUpperCase());
      if (cachedPrice && this.isFreshData(cachedPrice.lastUpdate)) {
        return cachedPrice;
      }

      // Try Redis cache
      const redisKey = `market:price:${symbol.toUpperCase()}`;
      const cachedData = await this.redis.get(redisKey);
      if (cachedData) {
        const price = JSON.parse(cachedData) as MarketPrice;
        this.priceCache.set(symbol.toUpperCase(), price);
        return price;
      }

      // If no cache, fetch fresh data
      await this.updatePriceForSymbol(symbol);
      return this.priceCache.get(symbol.toUpperCase()) || null;

    } catch (error) {
      this.logger.error('Error getting price', { symbol, error });
      return null;
    }
  }

  /**
   * Get multiple prices at once
   */
  async getPrices(symbols: string[]): Promise<MarketPrice[]> {
    const prices = await Promise.all(
      symbols.map(symbol => this.getPrice(symbol))
    );
    
    return prices.filter(price => price !== null) as MarketPrice[];
  }

  /**
   * Get market analytics for a symbol
   */
  async getMarketAnalytics(symbol: string, period: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<MarketAnalytics | null> {
    try {
      const cacheKey = `analytics:${symbol}:${period}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached) as MarketAnalytics;
      }

      // Calculate analytics from database
      const analytics = await this.calculateAnalytics(symbol, period);
      
      // Cache for appropriate time based on period
      const ttl = this.getAnalyticsTTL(period);
      await this.redis.setex(cacheKey, ttl, JSON.stringify(analytics));

      return analytics;

    } catch (error) {
      this.logger.error('Error getting market analytics', { symbol, period, error });
      return null;
    }
  }

  /**
   * Create a price alert for a user
   */
  async createPriceAlert(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'currentPrice'>): Promise<PriceAlert> {
    try {
      const currentPrice = await this.getPrice(alert.symbol);
      
      const newAlert: PriceAlert = {
        ...alert,
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        currentPrice: currentPrice?.price || 0,
        createdAt: new Date()
      };

      // Store in database
      await this.prisma.priceAlert.create({
        data: {
          id: newAlert.id,
          userId: newAlert.userId,
          symbol: newAlert.symbol,
          condition: newAlert.condition,
          targetPrice: newAlert.targetPrice,
          isActive: newAlert.isActive
        }
      });

      // Update cache
      const userAlerts = this.alertCache.get(alert.userId) || [];
      userAlerts.push(newAlert);
      this.alertCache.set(alert.userId, userAlerts);

      this.logger.info('Price alert created', { alertId: newAlert.id, userId: alert.userId, symbol: alert.symbol });
      
      return newAlert;

    } catch (error) {
      this.logger.error('Error creating price alert', { alert, error });
      throw new Error(`Failed to create price alert: ${error}`);
    }
  }

  /**
   * Get price alerts for a user
   */
  async getUserPriceAlerts(userId: string): Promise<PriceAlert[]> {
    try {
      // Check cache first
      const cached = this.alertCache.get(userId);
      if (cached) {
        return cached.filter(alert => alert.isActive);
      }

      // Load from database
      const alerts = await this.prisma.priceAlert.findMany({
        where: { userId, isActive: true }
      });

      const mappedAlerts: PriceAlert[] = alerts.map(alert => ({
        id: alert.id,
        userId: alert.userId,
        symbol: alert.symbol,
        condition: alert.condition as 'ABOVE' | 'BELOW' | 'CHANGE',
        targetPrice: Number(alert.targetPrice),
        currentPrice: 0, // Will be updated
        isActive: alert.isActive,
        createdAt: alert.createdAt
      }));

      // Update current prices
      for (const alert of mappedAlerts) {
        const price = await this.getPrice(alert.symbol);
        alert.currentPrice = price?.price || 0;
      }

      // Cache the results
      this.alertCache.set(userId, mappedAlerts);

      return mappedAlerts;

    } catch (error) {
      this.logger.error('Error getting user price alerts', { userId, error });
      return [];
    }
  }

  /**
   * Remove a price alert
   */
  async removePriceAlert(alertId: string, userId: string): Promise<boolean> {
    try {
      await this.prisma.priceAlert.update({
        where: { id: alertId },
        data: { isActive: false }
      });

      // Update cache
      const userAlerts = this.alertCache.get(userId) || [];
      const updatedAlerts = userAlerts.filter(alert => alert.id !== alertId);
      this.alertCache.set(userId, updatedAlerts);

      this.logger.info('Price alert removed', { alertId, userId });
      return true;

    } catch (error) {
      this.logger.error('Error removing price alert', { alertId, userId, error });
      return false;
    }
  }

  /**
   * Get trading volume for a specific period
   */
  async getTradingVolume(symbol: string, period: '1h' | '24h' | '7d' | '30d'): Promise<{ volume: number; count: number }> {
    try {
      const cacheKey = `volume:${symbol}:${period}`;
      const cached = await this.redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const timeFrame = this.getTimeFrameFromPeriod(period);
      
      const result = await this.prisma.p2PTrade.aggregate({
        where: {
          cryptoAsset: symbol,
          status: 'COMPLETED',
          completedAt: {
            gte: timeFrame
          }
        },
        _sum: {
          fiatAmount: true
        },
        _count: true
      });

      const volumeData = {
        volume: Number(result._sum.fiatAmount) || 0,
        count: result._count || 0
      };

      // Cache for appropriate time
      const ttl = this.getAnalyticsTTL(period);
      await this.redis.setex(cacheKey, ttl, JSON.stringify(volumeData));

      return volumeData;

    } catch (error) {
      this.logger.error('Error getting trading volume', { symbol, period, error });
      return { volume: 0, count: 0 };
    }
  }

  /**
   * Private Methods
   */

  private async setupWebSocketServer(port: number): Promise<void> {
    try {
      this.wss = new WebSocketServer({ port });

      this.wss.on('connection', (ws: WebSocket, request) => {
        const clientIP = request.socket.remoteAddress;
        this.logger.info('WebSocket client connected', { clientIP });

        this.connectedClients.add(ws);

        // Send initial price data
        this.sendInitialPriceData(ws);

        // Handle client messages
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            this.handleClientMessage(ws, data);
          } catch (error) {
            this.logger.warn('Invalid WebSocket message', { message: message.toString(), error });
          }
        });

        // Handle disconnection
        ws.on('close', () => {
          this.connectedClients.delete(ws);
          this.logger.info('WebSocket client disconnected', { clientIP });
        });

        // Handle errors
        ws.on('error', (error) => {
          this.logger.error('WebSocket error', { clientIP, error });
          this.connectedClients.delete(ws);
        });
      });

      this.logger.info(`WebSocket server listening on port ${port}`);

    } catch (error) {
      this.logger.error('Failed to setup WebSocket server', { port, error });
      throw error;
    }
  }

  private async sendInitialPriceData(ws: WebSocket): Promise<void> {
    try {
      const prices = await this.getPrices(SUPPORTED_SYMBOLS);
      
      ws.send(JSON.stringify({
        type: 'INITIAL_PRICES',
        data: prices,
        timestamp: new Date().toISOString()
      }));

    } catch (error) {
      this.logger.error('Error sending initial price data', { error });
    }
  }

  private handleClientMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'SUBSCRIBE':
        // Handle subscription to specific symbols
        break;
      case 'UNSUBSCRIBE':
        // Handle unsubscription
        break;
      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
        break;
      default:
        this.logger.warn('Unknown WebSocket message type', { messageType: message.type });
    }
  }

  private async broadcastPriceUpdate(price: MarketPrice): Promise<void> {
    if (this.connectedClients.size === 0) return;

    const message = JSON.stringify({
      type: 'PRICE_UPDATE',
      data: price,
      timestamp: new Date().toISOString()
    });

    const deadConnections: WebSocket[] = [];

    for (const client of this.connectedClients) {
      try {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        } else {
          deadConnections.push(client);
        }
      } catch (error) {
        this.logger.warn('Error broadcasting to client', { error });
        deadConnections.push(client);
      }
    }

    // Clean up dead connections
    deadConnections.forEach(client => this.connectedClients.delete(client));
  }

  private async updateAllPrices(): Promise<void> {
    try {
      this.logger.debug('Updating all prices...');

      const allPrices: MarketPrice[] = [];

      // Fetch from all sources concurrently
      const sourcePromises = this.priceSources
        .filter(source => source.isActive)
        .map(async (source) => {
          try {
            const prices = await this.fetchFromSource(source);
            source.lastFetch = new Date();
            source.errorCount = 0;
            return prices;
          } catch (error) {
            source.errorCount++;
            this.logger.warn(`Error fetching from ${source.name}`, { error, errorCount: source.errorCount });
            
            // Disable source if too many errors
            if (source.errorCount > 5) {
              source.isActive = false;
              this.logger.error(`Disabling price source ${source.name} due to repeated errors`);
            }
            
            return [];
          }
        });

      const sourceResults = await Promise.allSettled(sourcePromises);
      
      // Collect all successful results
      sourceResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allPrices.push(...result.value);
        }
      });

      // Calculate weighted averages for each symbol
      const symbolPrices = new Map<string, MarketPrice[]>();
      
      allPrices.forEach(price => {
        const existing = symbolPrices.get(price.symbol) || [];
        existing.push(price);
        symbolPrices.set(price.symbol, existing);
      });

      // Process each symbol
      for (const [symbol, prices] of symbolPrices) {
        if (prices.length === 0) continue;

        const averagedPrice = this.calculateWeightedAverage(prices);
        
        // Update caches
        this.priceCache.set(symbol, averagedPrice);
        
        const redisKey = `market:price:${symbol}`;
        await this.redis.setex(redisKey, 300, JSON.stringify(averagedPrice)); // 5-minute cache

        // Broadcast update via WebSocket
        await this.broadcastPriceUpdate(averagedPrice);

        // Check price alerts
        await this.checkPriceAlerts(symbol, averagedPrice.price);
      }

      this.logger.debug(`Updated prices for ${symbolPrices.size} symbols`);

    } catch (error) {
      this.logger.error('Error in updateAllPrices', { error });
    }
  }

  private calculateWeightedAverage(prices: MarketPrice[]): MarketPrice {
    let totalWeight = 0;
    let weightedPrice = 0;
    let weightedChange = 0;
    let weightedVolume = 0;

    prices.forEach((price, index) => {
      const weight = this.priceSources[index]?.weight || 1;
      totalWeight += weight;
      weightedPrice += price.price * weight;
      weightedChange += price.change24h * weight;
      weightedVolume += price.volume24h * weight;
    });

    return {
      symbol: prices[0].symbol,
      price: weightedPrice / totalWeight,
      change24h: weightedChange / totalWeight,
      volume24h: weightedVolume / totalWeight,
      lastUpdate: new Date()
    };
  }

  private async updatePriceForSymbol(symbol: string): Promise<void> {
    // Implementation for updating single symbol price
    // This would be similar to updateAllPrices but for a single symbol
  }

  private async fetchFromSource(source: ExternalPriceSource): Promise<MarketPrice[]> {
    const response = await axios.get(source.url, {
      timeout: 5000,
      headers: source.name === 'CoinMarketCap' ? {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY || ''
      } : undefined
    });

    return source.parser(response.data);
  }

  private parseCoinGeckoData(data: any): MarketPrice[] {
    // Implementation for parsing CoinGecko data
    return [];
  }

  private parseCoinMarketCapData(data: any): MarketPrice[] {
    // Implementation for parsing CoinMarketCap data
    return [];
  }

  private parseBinanceData(data: any): MarketPrice[] {
    // Implementation for parsing Binance data
    return [];
  }

  private isFreshData(timestamp: Date): boolean {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    return diffMs < 60000; // 1 minute freshness
  }

  private async loadPriceAlerts(): Promise<void> {
    try {
      const alerts = await this.prisma.priceAlert.findMany({
        where: { isActive: true }
      });

      // Group by userId
      const userAlerts = new Map<string, PriceAlert[]>();
      
      alerts.forEach(alert => {
        const mappedAlert: PriceAlert = {
          id: alert.id,
          userId: alert.userId,
          symbol: alert.symbol,
          condition: alert.condition as 'ABOVE' | 'BELOW' | 'CHANGE',
          targetPrice: Number(alert.targetPrice),
          currentPrice: 0,
          isActive: alert.isActive,
          createdAt: alert.createdAt
        };

        const existing = userAlerts.get(alert.userId) || [];
        existing.push(mappedAlert);
        userAlerts.set(alert.userId, existing);
      });

      // Update cache
      for (const [userId, alertList] of userAlerts) {
        this.alertCache.set(userId, alertList);
      }

      this.logger.info(`Loaded ${alerts.length} price alerts for ${userAlerts.size} users`);

    } catch (error) {
      this.logger.error('Error loading price alerts', { error });
    }
  }

  private async setupRedisSubscriptions(): Promise<void> {
    // Setup Redis pub/sub for cross-instance communication
    const subscriber = this.redis.duplicate();
    
    subscriber.on('message', (channel, message) => {
      if (channel === 'price-alerts') {
        const alert = JSON.parse(message);
        // Handle price alert from other instances
      }
    });

    await subscriber.subscribe('price-alerts');
  }

  private async checkPriceAlerts(symbol: string, currentPrice: number): Promise<void> {
    try {
      for (const [userId, alerts] of this.alertCache) {
        const symbolAlerts = alerts.filter(alert => alert.symbol === symbol && alert.isActive);
        
        for (const alert of symbolAlerts) {
          let triggered = false;
          
          switch (alert.condition) {
            case 'ABOVE':
              triggered = currentPrice > alert.targetPrice;
              break;
            case 'BELOW':
              triggered = currentPrice < alert.targetPrice;
              break;
            case 'CHANGE':
              const changePercent = Math.abs((currentPrice - alert.currentPrice) / alert.currentPrice * 100);
              triggered = changePercent >= alert.targetPrice; // targetPrice as percentage
              break;
          }

          if (triggered) {
            await this.triggerPriceAlert(alert, currentPrice);
          }
        }
      }

    } catch (error) {
      this.logger.error('Error checking price alerts', { symbol, currentPrice, error });
    }
  }

  private async triggerPriceAlert(alert: PriceAlert, currentPrice: number): Promise<void> {
    try {
      // Deactivate the alert
      await this.removePriceAlert(alert.id, alert.userId);

      // Send notification
      const notification = {
        type: 'PRICE_ALERT',
        userId: alert.userId,
        data: {
          symbol: alert.symbol,
          condition: alert.condition,
          targetPrice: alert.targetPrice,
          currentPrice,
          alertId: alert.id
        },
        timestamp: new Date().toISOString()
      };

      // Publish to Redis for other services to handle
      await this.redis.publish('notifications', JSON.stringify(notification));

      this.logger.info('Price alert triggered', {
        alertId: alert.id,
        userId: alert.userId,
        symbol: alert.symbol,
        currentPrice
      });

      // Emit event for local handling
      this.emit('priceAlertTriggered', alert, currentPrice);

    } catch (error) {
      this.logger.error('Error triggering price alert', { alert, currentPrice, error });
    }
  }

  private async calculateAnalytics(symbol: string, period: '1h' | '24h' | '7d' | '30d'): Promise<MarketAnalytics> {
    const timeFrame = this.getTimeFrameFromPeriod(period);
    
    // This would contain complex analytics calculations
    // For now, returning a basic structure
    return {
      symbol,
      period,
      volumeChange: 0,
      priceVolatility: 0,
      tradeCount: 0,
      averageTradeSize: 0,
      topTraders: []
    };
  }

  private getTimeFrameFromPeriod(period: string): Date {
    const now = new Date();
    switch (period) {
      case '1h': return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h': return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default: return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }

  private getAnalyticsTTL(period: string): number {
    switch (period) {
      case '1h': return 300; // 5 minutes
      case '24h': return 900; // 15 minutes
      case '7d': return 3600; // 1 hour
      case '30d': return 7200; // 2 hours
      default: return 900;
    }
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down MarketDataService...');

    // Clear update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    // Close all client connections
    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });

    this.logger.info('MarketDataService shutdown complete');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activeSources: number;
    cachedPrices: number;
    connectedClients: number;
    lastUpdate: Date | null;
  }> {
    const activeSources = this.priceSources.filter(source => source.isActive).length;
    const totalSources = this.priceSources.length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (activeSources === 0) {
      status = 'unhealthy';
    } else if (activeSources < totalSources / 2) {
      status = 'degraded';
    }

    const lastUpdate = this.priceSources
      .filter(source => source.lastFetch)
      .sort((a, b) => (b.lastFetch?.getTime() || 0) - (a.lastFetch?.getTime() || 0))[0]?.lastFetch || null;

    return {
      status,
      activeSources,
      cachedPrices: this.priceCache.size,
      connectedClients: this.connectedClients.size,
      lastUpdate
    };
  }
}
