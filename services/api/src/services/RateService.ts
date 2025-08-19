// Rate Service for Orrange P2P API
import Redis from 'ioredis';

export interface CryptoRate {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  lastUpdated: string;
}

export class RateService {
  private redis: Redis;
  private isRunning = false;
  private updateInterval?: NodeJS.Timeout;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log('📈 Rate Service started');

    // Update rates immediately
    await this.updateRates();

    // Update rates every 30 seconds
    this.updateInterval = setInterval(() => {
      this.updateRates().catch(console.error);
    }, 30000);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }

    console.log('📈 Rate Service stopped');
  }

  private async updateRates(): Promise<void> {
    try {
      // Mock rates - in production, fetch from external APIs
      const mockRates: CryptoRate[] = [
        {
          symbol: 'BTC',
          price: 50000 + (Math.random() - 0.5) * 2000,
          change24h: (Math.random() - 0.5) * 0.1,
          volume24h: Math.random() * 1000000,
          lastUpdated: new Date().toISOString()
        },
        {
          symbol: 'ETH',
          price: 3000 + (Math.random() - 0.5) * 200,
          change24h: (Math.random() - 0.5) * 0.15,
          volume24h: Math.random() * 500000,
          lastUpdated: new Date().toISOString()
        },
        {
          symbol: 'USDT',
          price: 1.0 + (Math.random() - 0.5) * 0.001,
          change24h: (Math.random() - 0.5) * 0.005,
          volume24h: Math.random() * 2000000,
          lastUpdated: new Date().toISOString()
        }
      ];

      // Store rates in Redis
      for (const rate of mockRates) {
        await this.redis.setex(
          `rate:${rate.symbol}`,
          300, // 5 minutes TTL
          JSON.stringify(rate)
        );
      }

      // Store all rates
      await this.redis.setex(
        'rates:all',
        300,
        JSON.stringify(mockRates)
      );

      console.log(`📈 Updated rates for ${mockRates.length} cryptocurrencies`);

    } catch (error) {
      console.error('Error updating rates:', error);
    }
  }

  async getRate(symbol: string): Promise<CryptoRate | null> {
    try {
      const rateData = await this.redis.get(`rate:${symbol.toUpperCase()}`);
      return rateData ? JSON.parse(rateData) : null;
    } catch (error) {
      console.error(`Error getting rate for ${symbol}:`, error);
      return null;
    }
  }

  async getAllRates(): Promise<CryptoRate[]> {
    try {
      const ratesData = await this.redis.get('rates:all');
      return ratesData ? JSON.parse(ratesData) : [];
    } catch (error) {
      console.error('Error getting all rates:', error);
      return [];
    }
  }

  async getRatePair(baseSymbol: string, quoteSymbol: string): Promise<number | null> {
    try {
      const baseRate = await this.getRate(baseSymbol);
      const quoteRate = await this.getRate(quoteSymbol);

      if (!baseRate || !quoteRate) {
        return null;
      }

      // Calculate pair rate (base/quote)
      return baseRate.price / quoteRate.price;
    } catch (error) {
      console.error(`Error getting rate pair ${baseSymbol}/${quoteSymbol}:`, error);
      return null;
    }
  }

  async getHistoricalRates(symbol: string, hours: number = 24): Promise<any[]> {
    try {
      // Mock historical data - in production, fetch from external APIs
      const historical = [];
      const now = Date.now();
      const interval = (hours * 60 * 60 * 1000) / 100; // 100 data points

      for (let i = 0; i < 100; i++) {
        const timestamp = now - (i * interval);
        const basePrice = symbol === 'BTC' ? 50000 : symbol === 'ETH' ? 3000 : 1;
        const price = basePrice + (Math.random() - 0.5) * basePrice * 0.1;

        historical.unshift({
          timestamp: new Date(timestamp).toISOString(),
          price,
          volume: Math.random() * 100000
        });
      }

      return historical;
    } catch (error) {
      console.error(`Error getting historical rates for ${symbol}:`, error);
      return [];
    }
  }
}
