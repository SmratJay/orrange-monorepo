// P2P Ad Browsing Service - For manual ad selection in P2P trading
import { PrismaClient } from '@prisma/client';

export interface AdSearchFilters {
  cryptoAsset?: string;
  fiatCurrency?: string;
  type?: 'BUY' | 'SELL';
  paymentMethods?: string[];
  country?: string;
  minAmount?: number;
  maxAmount?: number;
  minReputation?: number;
}

export class P2PAdService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Browse available P2P ads with filters
  async browseAds(filters: AdSearchFilters = {}, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    
    const where: any = {
      status: 'ACTIVE',
      isVisible: true,
    };

    if (filters.cryptoAsset) where.cryptoAsset = filters.cryptoAsset;
    if (filters.fiatCurrency) where.fiatCurrency = filters.fiatCurrency;
    if (filters.type) where.type = filters.type;
    if (filters.paymentMethods?.length) {
      where.paymentMethods = { hasSome: filters.paymentMethods };
    }
    if (filters.country) {
      where.allowedCountries = { has: filters.country };
    }
    if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
      where.minLimit = {};
      if (filters.minAmount !== undefined) where.minLimit.gte = filters.minAmount;
      if (filters.maxAmount !== undefined) where.maxLimit.lte = filters.maxAmount;
    }

    const ads = await this.prisma.p2PAd.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            p2pNickname: true,
            reputationScore: true,
            completedTrades: true,
            trustScore: true,
            isOnline: true,
            lastSeenAt: true,
          },
        },
      },
      orderBy: [
        { user: { reputationScore: 'desc' } },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
    });

    const total = await this.prisma.p2PAd.count({ where });

    return {
      ads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // Get ad details for trade initiation
  async getAdDetails(adId: string) {
    return this.prisma.p2PAd.findUnique({
      where: { id: adId, status: 'ACTIVE', isVisible: true },
      include: {
        user: {
          select: {
            id: true,
            p2pNickname: true,
            reputationScore: true,
            completedTrades: true,
            trustScore: true,
            isOnline: true,
            lastSeenAt: true,
            avgResponseTime: true,
          },
        },
      },
    });
  }

  // Calculate current market price for an ad
  async calculateAdPrice(adId: string, fiatAmount: number) {
    const ad = await this.getAdDetails(adId);
    if (!ad) return null;

    let price: number;
    if (ad.pricingType === 'FIXED' && ad.fixedPrice) {
      price = ad.fixedPrice.toNumber();
    } else if (ad.pricingType === 'MARKET_PREMIUM' && ad.marketPremium) {
      // This would typically fetch from external price API
      // For now, using a placeholder market price
      const basePrice = 50000; // This should come from CoinGecko/CoinMarketCap
      price = basePrice * (1 + ad.marketPremium.toNumber() / 100);
    } else {
      return null;
    }

    const cryptoAmount = fiatAmount / price;
    return {
      price,
      cryptoAmount,
      fiatAmount,
      total: fiatAmount,
    };
  }
}
