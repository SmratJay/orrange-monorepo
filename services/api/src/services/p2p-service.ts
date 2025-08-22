import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

export class P2PService {
  constructor(private prisma: PrismaClient) {}
  
  // Advertisement methods
  async createAdvertisement(userId: string, data: any) {
    return await this.prisma.p2PAd.create({
      data: {
        ...data,
        userId,
        id: nanoid(),
        status: 'ACTIVE',
        isVisible: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  }
  
  async getAdvertisements(filters?: any) {
    const where: any = {
      status: 'ACTIVE',
      isVisible: true
    };

    if (filters?.type) where.type = filters.type;
    if (filters?.cryptoAsset) where.cryptoAsset = filters.cryptoAsset;
    if (filters?.fiatCurrency) where.fiatCurrency = filters.fiatCurrency;

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;

    const [ads, total] = await Promise.all([
      this.prisma.p2PAd.findMany({
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
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.p2PAd.count({ where })
    ]);

    return {
      ads,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Trade methods
  async initiateTrade(userId: string, adId: string, tradeData: any) {
    const ad = await this.prisma.p2PAd.findUnique({
      where: { id: adId }
    });

    if (!ad || ad.status !== 'ACTIVE') {
      throw new Error('Advertisement not found or not active');
    }

    if (ad.userId === userId) {
      throw new Error('Cannot trade with your own advertisement');
    }

    // Calculate amounts and expiry
    const cryptoAmount = tradeData.amount;
    const exchangeRate = Number(ad.fixedPrice) || 0;
    const fiatAmount = cryptoAmount * exchangeRate;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const trade = await this.prisma.p2PTrade.create({
      data: {
        id: nanoid(),
        adId,
        buyerId: ad.type === 'BUY' ? ad.userId : userId,
        sellerId: ad.type === 'SELL' ? ad.userId : userId,
        cryptoAsset: ad.cryptoAsset,
        fiatCurrency: ad.fiatCurrency,
        cryptoAmount,
        fiatAmount,
        exchangeRate,
        paymentMethod: tradeData.paymentMethod,
        status: 'PENDING',
        expiresAt
      },
      include: {
        ad: true,
        buyer: true,
        seller: true
      }
    });

    return trade;
  }

  async acceptTrade(userId: string, tradeId: string) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId },
      include: { ad: true }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.sellerId !== userId) {
      throw new Error('Only the seller can accept the trade');
    }

    if (trade.status !== 'PENDING') {
      throw new Error('Trade cannot be accepted in current status');
    }

    return await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date()
      },
      include: {
        ad: true,
        buyer: true,
        seller: true
      }
    });
  }

  async markPaymentSent(userId: string, tradeId: string, paymentProof?: any) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.buyerId !== userId) {
      throw new Error('Only the buyer can mark payment as sent');
    }

    if (trade.status !== 'ACCEPTED' && trade.status !== 'ESCROW_FUNDED') {
      throw new Error('Trade must be accepted before marking payment as sent');
    }

    return await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'PAYMENT_SENT',
        paymentSentAt: new Date()
      },
      include: {
        ad: true,
        buyer: true,
        seller: true
      }
    });
  }

  async confirmPaymentReceived(userId: string, tradeId: string) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.sellerId !== userId) {
      throw new Error('Only the seller can confirm payment received');
    }

    if (trade.status !== 'PAYMENT_SENT') {
      throw new Error('Payment must be sent before confirming receipt');
    }

    return await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'COMPLETED',
        paymentConfirmedAt: new Date(),
        completedAt: new Date()
      },
      include: {
        ad: true,
        buyer: true,
        seller: true
      }
    });
  }

  // Chat methods
  async getTradeMessages(userId: string, tradeId: string) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.buyerId !== userId && trade.sellerId !== userId) {
      throw new Error('Not authorized to view messages for this trade');
    }

    return await this.prisma.p2PChat.findMany({
      where: { tradeId },
      include: {
        sender: {
          select: {
            id: true,
            username: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  async sendTradeMessage(userId: string, tradeId: string, content: string, messageType = 'TEXT') {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.buyerId !== userId && trade.sellerId !== userId) {
      throw new Error('Not authorized to send messages for this trade');
    }

    return await this.prisma.p2PChat.create({
      data: {
        id: nanoid(),
        tradeId,
        senderId: userId,
        content,
        messageType: messageType as any
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });
  }

  // Dispute methods
  async createDispute(userId: string, tradeId: string, disputeData: any) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.buyerId !== userId && trade.sellerId !== userId) {
      throw new Error('Not authorized to create dispute for this trade');
    }

    if (!['ACCEPTED', 'PAYMENT_SENT'].includes(trade.status)) {
      throw new Error('Dispute can only be created for active trades');
    }

    const dispute = await this.prisma.p2PDispute.create({
      data: {
        id: nanoid(),
        tradeId,
        initiatedBy: userId,
        reason: disputeData.reason,
        description: disputeData.description,
        status: 'PENDING', // Use correct enum value
        evidence: disputeData.evidence || []
      }
    });

    // Update trade status
    await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'DISPUTED',
        disputedAt: new Date()
      }
    });

    return dispute;
  }

  // WebSocket connection management (placeholder methods)
  async addWebSocketConnection(userId: string, ws: any) {
    // TODO: Implement WebSocket connection tracking
    console.log(`WebSocket connected for user: ${userId}`);
  }

  async removeWebSocketConnection(userId: string) {
    // TODO: Implement WebSocket connection cleanup
    console.log(`WebSocket disconnected for user: ${userId}`);
  }

  // Legacy method aliases for backward compatibility
  async createAd(userId: string, data: any) {
    return this.createAdvertisement(userId, data);
  }
  
  async getAds(filters?: any) {
    return this.getAdvertisements(filters);
  }
}
