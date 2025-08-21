// P2P Trading API Routes
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { P2PService } from '../services/p2p-service';
import { requireAuth } from '../middleware/security';
import { z } from 'zod';

const router = express.Router();
const prisma = new PrismaClient();
const p2pService = new P2PService(prisma);

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

const InitiateTradeSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.string(),
  message: z.string().optional()
});

const SendMessageSchema = z.object({
  content: z.string().min(1),
  messageType: z.enum(['TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'PAYMENT_PROOF']).optional()
});

const CreateDisputeSchema = z.object({
  reason: z.enum([
    'PAYMENT_NOT_RECEIVED',
    'PAYMENT_NOT_SENT', 
    'WRONG_AMOUNT',
    'FAKE_PAYMENT_PROOF',
    'SELLER_UNRESPONSIVE',
    'BUYER_UNRESPONSIVE',
    'TERMS_VIOLATION',
    'FRAUD_SUSPECTED',
    'TECHNICAL_ISSUE',
    'OTHER'
  ]),
  description: z.string().min(10),
  evidence: z.array(z.any()).optional()
});

// Advertisement Routes

/**
 * @route POST /p2p/ads
 * @desc Create new P2P advertisement
 * @access Private
 */
router.post('/ads', 
  authenticateToken, 
  validateRequest(CreateAdSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const ad = await p2pService.createAd(userId, req.body);
      
      res.status(201).json({
        success: true,
        data: ad,
        message: 'Advertisement created successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /p2p/ads
 * @desc Get P2P advertisements with filters
 * @access Public
 */
router.get('/ads', async (req: Request, res: Response) => {
  try {
    const filters = {
      type: req.query.type as any,
      cryptoAsset: req.query.cryptoAsset as string,
      fiatCurrency: req.query.fiatCurrency as string,
      country: req.query.country as string,
      paymentMethod: req.query.paymentMethod as string,
      minAmount: req.query.minAmount ? parseFloat(req.query.minAmount as string) : undefined,
      maxAmount: req.query.maxAmount ? parseFloat(req.query.maxAmount as string) : undefined,
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined
    };

    const result = await p2pService.getAds(filters);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route GET /p2p/ads/:adId
 * @desc Get single advertisement details
 * @access Public
 */
router.get('/ads/:adId', async (req: Request, res: Response) => {
  try {
    const { adId } = req.params;
    
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
      return res.status(404).json({
        success: false,
        error: 'Advertisement not found'
      });
    }

    res.json({
      success: true,
      data: ad
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route PUT /p2p/ads/:adId
 * @desc Update advertisement
 * @access Private
 */
router.put('/ads/:adId', 
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { adId } = req.params;

      const ad = await prisma.p2PAd.findUnique({
        where: { id: adId }
      });

      if (!ad) {
        return res.status(404).json({
          success: false,
          error: 'Advertisement not found'
        });
      }

      if (ad.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to update this advertisement'
        });
      }

      const updatedAd = await prisma.p2PAd.update({
        where: { id: adId },
        data: {
          ...req.body,
          updatedAt: new Date()
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              reputationScore: true,
              tradeCount: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: updatedAd,
        message: 'Advertisement updated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route DELETE /p2p/ads/:adId
 * @desc Delete advertisement
 * @access Private
 */
router.delete('/ads/:adId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { adId } = req.params;

      const ad = await prisma.p2PAd.findUnique({
        where: { id: adId }
      });

      if (!ad) {
        return res.status(404).json({
          success: false,
          error: 'Advertisement not found'
        });
      }

      if (ad.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to delete this advertisement'
        });
      }

      await prisma.p2PAd.update({
        where: { id: adId },
        data: { 
          status: 'DELETED',
          isVisible: false
        }
      });

      res.json({
        success: true,
        message: 'Advertisement deleted successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Trade Routes

/**
 * @route POST /p2p/trades
 * @desc Initiate a new trade
 * @access Private
 */
router.post('/trades',
  authenticateToken,
  validateRequest(InitiateTradeSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { adId, ...tradeData } = req.body;

      const trade = await p2pService.initiateTrade(userId, adId, tradeData);
      
      res.status(201).json({
        success: true,
        data: trade,
        message: 'Trade initiated successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /p2p/trades
 * @desc Get user's trades
 * @access Private
 */
router.get('/trades',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const status = req.query.status as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const where: any = {
        OR: [
          { sellerId: userId },
          { buyerId: userId }
        ]
      };

      if (status) {
        where.status = status;
      }

      const [trades, total] = await Promise.all([
        prisma.p2PTrade.findMany({
          where,
          include: {
            ad: true,
            seller: {
              select: {
                id: true,
                username: true,
                reputationScore: true
              }
            },
            buyer: {
              select: {
                id: true,
                username: true,
                reputationScore: true
              }
            },
            escrow: true
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit
        }),
        prisma.p2PTrade.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          trades,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /p2p/trades/:tradeId
 * @desc Get trade details
 * @access Private
 */
router.get('/trades/:tradeId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { tradeId } = req.params;

      const trade = await prisma.p2PTrade.findUnique({
        where: { id: tradeId },
        include: {
          ad: true,
          seller: {
            select: {
              id: true,
              username: true,
              reputationScore: true,
              tradeCount: true
            }
          },
          buyer: {
            select: {
              id: true,
              username: true,
              reputationScore: true,
              tradeCount: true
            }
          },
          escrow: true
        }
      });

      if (!trade) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found'
        });
      }

      if (trade.sellerId !== userId && trade.buyerId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to view this trade'
        });
      }

      res.json({
        success: true,
        data: trade
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route POST /p2p/trades/:tradeId/accept
 * @desc Accept a trade (seller only)
 * @access Private
 */
router.post('/trades/:tradeId/accept',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { tradeId } = req.params;

      const trade = await p2pService.acceptTrade(userId, tradeId);
      
      res.json({
        success: true,
        data: trade,
        message: 'Trade accepted successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route POST /p2p/trades/:tradeId/payment-sent
 * @desc Mark payment as sent (buyer only)
 * @access Private
 */
router.post('/trades/:tradeId/payment-sent',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { tradeId } = req.params;
      const { paymentProof } = req.body;

      const trade = await p2pService.markPaymentSent(userId, tradeId, paymentProof);
      
      res.json({
        success: true,
        data: trade,
        message: 'Payment marked as sent'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route POST /p2p/trades/:tradeId/payment-confirmed
 * @desc Confirm payment received (seller only)
 * @access Private
 */
router.post('/trades/:tradeId/payment-confirmed',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { tradeId } = req.params;

      const trade = await p2pService.confirmPaymentReceived(userId, tradeId);
      
      res.json({
        success: true,
        data: trade,
        message: 'Payment confirmed, trade completed'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Chat Routes

/**
 * @route GET /p2p/trades/:tradeId/messages
 * @desc Get trade chat messages
 * @access Private
 */
router.get('/trades/:tradeId/messages',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { tradeId } = req.params;

      const messages = await p2pService.getTradeMessages(userId, tradeId);
      
      res.json({
        success: true,
        data: messages
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route POST /p2p/trades/:tradeId/messages
 * @desc Send message in trade chat
 * @access Private
 */
router.post('/trades/:tradeId/messages',
  authenticateToken,
  validateRequest(SendMessageSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { tradeId } = req.params;
      const { content, messageType = 'TEXT' } = req.body;

      const message = await p2pService.sendTradeMessage(userId, tradeId, content, messageType);
      
      res.status(201).json({
        success: true,
        data: message,
        message: 'Message sent successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Dispute Routes

/**
 * @route POST /p2p/trades/:tradeId/dispute
 * @desc Create a dispute for a trade
 * @access Private
 */
router.post('/trades/:tradeId/dispute',
  authenticateToken,
  validateRequest(CreateDisputeSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;
      const { tradeId } = req.params;

      const dispute = await p2pService.createDispute(userId, tradeId, req.body);
      
      res.status(201).json({
        success: true,
        data: dispute,
        message: 'Dispute created successfully'
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

/**
 * @route GET /p2p/disputes
 * @desc Get user's disputes
 * @access Private
 */
router.get('/disputes',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.id;

      const disputes = await prisma.p2PDispute.findMany({
        where: {
          OR: [
            { initiatedBy: userId },
            { trade: { sellerId: userId } },
            { trade: { buyerId: userId } }
          ]
        },
        include: {
          trade: {
            include: {
              seller: {
                select: { id: true, username: true }
              },
              buyer: {
                select: { id: true, username: true }
              }
            }
          },
          initiator: {
            select: { id: true, username: true }
          },
          arbitrator: {
            select: { id: true, username: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        data: disputes
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Market Data Routes

/**
 * @route GET /p2p/market-data
 * @desc Get P2P market statistics
 * @access Public
 */
router.get('/market-data', async (req: Request, res: Response) => {
  try {
    const { cryptoAsset, fiatCurrency } = req.query;

    const stats = await prisma.p2PTrade.aggregate({
      where: {
        status: 'COMPLETED',
        ...(cryptoAsset && { cryptoAsset: cryptoAsset as string }),
        ...(fiatCurrency && { fiatCurrency: fiatCurrency as string }),
        completedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      _avg: {
        exchangeRate: true
      },
      _count: true,
      _sum: {
        cryptoAmount: true,
        fiatAmount: true
      }
    });

    const recentTrades = await prisma.p2PTrade.findMany({
      where: {
        status: 'COMPLETED',
        ...(cryptoAsset && { cryptoAsset: cryptoAsset as string }),
        ...(fiatCurrency && { fiatCurrency: fiatCurrency as string })
      },
      select: {
        exchangeRate: true,
        cryptoAmount: true,
        fiatAmount: true,
        completedAt: true
      },
      orderBy: { completedAt: 'desc' },
      take: 10
    });

    res.json({
      success: true,
      data: {
        stats,
        recentTrades
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
