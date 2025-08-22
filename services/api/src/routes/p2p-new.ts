// P2P Trading API Routes - Fastify Plugin
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { P2PService } from '../services/p2p-service';
import { z } from 'zod';

const prisma = new PrismaClient();
const p2pService = new P2PService(prisma);

// Request interfaces for typed requests
interface CreateAdRequest {
  Body: {
    type: 'BUY' | 'SELL';
    cryptoAsset: string;
    fiatCurrency: string;
    amount: number;
    minLimit: number;
    maxLimit: number;
    pricingType: 'FIXED' | 'MARKET_PREMIUM' | 'MARKET_DISCOUNT';
    fixedPrice?: number;
    marketPremium?: number;
    paymentMethods: string[];
    terms?: string;
    autoReply?: string;
    allowedCountries: string[];
    timeZone?: string;
    tradingHours?: string;
    requiresKYC?: boolean;
    minReputation?: number;
  };
}

interface GetAdsRequest {
  Querystring: {
    page?: string;
    limit?: string;
    type?: string;
    cryptoAsset?: string;
    fiatCurrency?: string;
    country?: string;
    paymentMethod?: string;
    minAmount?: string;
    maxAmount?: string;
  };
}

interface AdParamsRequest {
  Params: {
    adId: string;
  };
}

interface InitiateTradeRequest {
  Params: {
    adId: string;
  };
  Body: {
    amount: number;
    paymentMethod: string;
    message?: string;
  };
}

interface TradeParamsRequest {
  Params: {
    tradeId: string;
  };
}

interface GetTradesRequest {
  Querystring: {
    status?: string;
    page?: string;
    limit?: string;
  };
}

interface SendMessageRequest {
  Params: {
    tradeId: string;
  };
  Body: {
    content: string;
    messageType?: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM' | 'PAYMENT_PROOF';
  };
}

interface PaymentSentRequest {
  Params: {
    tradeId: string;
  };
  Body: {
    paymentProof?: any;
  };
}

interface CreateDisputeRequest {
  Params: {
    tradeId: string;
  };
  Body: {
    reason: string;
    description: string;
    evidence?: any[];
  };
}

interface MarketDataRequest {
  Querystring: {
    cryptoAsset?: string;
    fiatCurrency?: string;
  };
}

// Validation Schemas
const CreateAdSchema = z.object({
  type: z.enum(['BUY', 'SELL']),
  cryptoAsset: z.string().min(1),
  fiatCurrency: z.string().length(3),
  amount: z.number().positive(),
  minLimit: z.number().positive(),
  maxLimit: z.number().positive(),
  pricingType: z.enum(['FIXED', 'MARKET_PREMIUM', 'MARKET_DISCOUNT']),
  fixedPrice: z.number().optional(),
  marketPremium: z.number().optional(),
  paymentMethods: z.array(z.string()),
  terms: z.string().optional(),
  autoReply: z.string().optional(),
  allowedCountries: z.array(z.string()),
  timeZone: z.string().optional(),
  tradingHours: z.string().optional(),
  requiresKYC: z.boolean().optional(),
  minReputation: z.number().optional()
});

async function p2pRoutes(fastify: FastifyInstance) {

  // CREATE ADVERTISEMENT
  fastify.post<CreateAdRequest>('/ads', {
    preHandler: fastify.authenticate,
  }, async (request: FastifyRequest<CreateAdRequest>, reply: FastifyReply) => {
    try {
      const userId = (request.user as any)?.userId;
      if (!userId) {
        return reply.status(401).send({ success: false, message: 'Authentication required' });
      }

      const validatedData = CreateAdSchema.parse(request.body);
      
      // Create advertisement using direct Prisma call until P2PService is implemented
      const ad = await prisma.p2PAd.create({
        data: {
          ...validatedData,
          userId,
          status: 'ACTIVE',
          isVisible: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      return reply.send({
        success: true,
        data: ad,
        message: 'Advertisement created successfully'
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false, 
        message: error.message || 'Failed to create advertisement'
      });
    }
  });

  // GET ADVERTISEMENTS (PUBLIC)
  fastify.get<GetAdsRequest>('/ads', async (request: FastifyRequest<GetAdsRequest>, reply: FastifyReply) => {
    try {
      const { page = '1', limit = '20', type, cryptoAsset, fiatCurrency, country, paymentMethod, minAmount, maxAmount } = request.query;
      
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      
      const where: any = {
        status: 'ACTIVE',
        isVisible: true
      };

      if (type) where.type = type;
      if (cryptoAsset) where.cryptoAsset = cryptoAsset;
      if (fiatCurrency) where.fiatCurrency = fiatCurrency;
      if (minAmount) where.minLimit = { gte: parseFloat(minAmount) };
      if (maxAmount) where.maxLimit = { lte: parseFloat(maxAmount) };

      const [ads, total] = await Promise.all([
        prisma.p2PAd.findMany({
          where,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                reputationScore: true,
                tradeCount: true,
                kycStatus: true,
                lastActivity: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum
        }),
        prisma.p2PAd.count({ where })
      ]);

      return reply.send({
        success: true,
        data: {
          ads,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: 'Failed to fetch advertisements'
      });
    }
  });

  // GET SINGLE ADVERTISEMENT
  fastify.get<AdParamsRequest>('/ads/:adId', async (request: FastifyRequest<AdParamsRequest>, reply: FastifyReply) => {
    try {
      const { adId } = request.params;
      
      const ad = await prisma.p2PAd.findUnique({
        where: { id: adId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              reputationScore: true,
              tradeCount: true,
              kycStatus: true,
              lastActivity: true
            }
          }
        }
      });

      if (!ad) {
        return reply.status(404).send({
          success: false,
          message: 'Advertisement not found'
        });
      }

      return reply.send({
        success: true,
        data: ad
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: 'Failed to fetch advertisement'
      });
    }
  });

  // GET MARKET DATA (PUBLIC)
  fastify.get<MarketDataRequest>('/market-data', async (request: FastifyRequest<MarketDataRequest>, reply: FastifyReply) => {
    try {
      const { cryptoAsset, fiatCurrency } = request.query;

      // For now, return mock data until proper rate service is implemented
      const mockRates = {
        'BTC': {
          'USD': { buy: 45000, sell: 44800, change24h: 2.5 },
          'EUR': { buy: 38000, sell: 37800, change24h: 2.3 }
        },
        'ETH': {
          'USD': { buy: 3000, sell: 2980, change24h: 1.8 },
          'EUR': { buy: 2530, sell: 2520, change24h: 1.6 }
        }
      };

      return reply.send({
        success: true,
        data: {
          rates: mockRates,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: 'Failed to fetch market data'
      });
    }
  });

}

export default p2pRoutes;
