// P2P Service - Core P2P Marketplace Logic
import { PrismaClient } from '@prisma/client';
import { WebSocket } from 'ws';
import crypto from 'crypto';
import type {
  P2PAdType,
  PricingType,
  P2PAdStatus,
  P2PTradeStatus,
  P2PEscrowStatus,
  P2PDisputeReason,
  P2PDisputeStatus,
  ChatMessageType
} from '@prisma/client';

export class P2PService {
  private prisma: PrismaClient;
  private wsConnections: Map<string, WebSocket> = new Map();
  private marketPrices: Map<string, number> = new Map();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.initializeMarketPrices();
  }

  // Advertisement Management
  async createAd(userId: string, adData: {
    type: P2PAdType;
    cryptoAsset: string;
    fiatCurrency: string;
    amount: number;
    minLimit: number;
    maxLimit: number;
    pricingType: PricingType;
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
  }) {
    // Validate user can create ads
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.isActive) {
      throw new Error('User not authorized to create advertisements');
    }

    // Validate pricing
    if (adData.pricingType === 'FIXED' && !adData.fixedPrice) {
      throw new Error('Fixed price required for fixed pricing type');
    }

    if (adData.pricingType !== 'FIXED' && !adData.marketPremium) {
      throw new Error('Market premium required for market-based pricing');
    }

    // Create the advertisement
    const ad = await this.prisma.p2PAd.create({
      data: {
        userId,
        type: adData.type,
        cryptoAsset: adData.cryptoAsset,
        fiatCurrency: adData.fiatCurrency,
        amount: adData.amount,
        minLimit: adData.minLimit,
        maxLimit: adData.maxLimit,
        pricingType: adData.pricingType,
        fixedPrice: adData.fixedPrice,
        marketPremium: adData.marketPremium,
        paymentMethods: adData.paymentMethods,
        terms: adData.terms,
        autoReply: adData.autoReply,
        allowedCountries: adData.allowedCountries,
        timeZone: adData.timeZone,
        tradingHours: adData.tradingHours,
        requiresKYC: adData.requiresKYC || false,
        minReputation: adData.minReputation || 0
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            reputationScore: true,
            tradeCount: true,
            kycStatus: true
          }
        }
      }
    });

    // Broadcast new ad to relevant users
    this.broadcastAdUpdate('NEW_AD', ad);

    return ad;
  }

  async getAds(filters: {
    type?: P2PAdType;
    cryptoAsset?: string;
    fiatCurrency?: string;
    country?: string;
    paymentMethod?: string;
    minAmount?: number;
    maxAmount?: number;
    status?: P2PAdStatus;
    page?: number;
    limit?: number;
  } = {}) {
    const {
      type,
      cryptoAsset,
      fiatCurrency,
      country,
      paymentMethod,
      minAmount,
      maxAmount,
      status = 'ACTIVE',
      page = 1,
      limit = 20
    } = filters;

    const where: any = {
      status,
      isVisible: true
    };

    if (type) where.type = type;
    if (cryptoAsset) where.cryptoAsset = cryptoAsset;
    if (fiatCurrency) where.fiatCurrency = fiatCurrency;
    if (country) where.allowedCountries = { has: country };
    if (paymentMethod) where.paymentMethods = { has: paymentMethod };
    if (minAmount !== undefined) where.minLimit = { lte: minAmount };
    if (maxAmount !== undefined) where.maxLimit = { gte: maxAmount };

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
        orderBy: [
          { user: { reputationScore: 'desc' } },
          { createdAt: 'desc' }
        ],
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.p2PAd.count({ where })
    ]);

    // Calculate current prices for ads
    const adsWithPrices = ads.map(ad => ({
      ...ad,
      currentPrice: this.calculateAdPrice(ad),
      isOnline: this.isUserOnline(ad.userId)
    }));

    return {
      ads: adsWithPrices,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Trade Lifecycle Management
  async initiateTrade(buyerId: string, adId: string, tradeData: {
    amount: number;
    paymentMethod: string;
    message?: string;
  }) {
    const ad = await this.prisma.p2PAd.findUnique({
      where: { id: adId },
      include: { user: true }
    });

    if (!ad || ad.status !== 'ACTIVE') {
      throw new Error('Advertisement not available');
    }

    if (ad.userId === buyerId) {
      throw new Error('Cannot trade with your own advertisement');
    }

    // Validate trade amount
    const currentPrice = this.calculateAdPrice(ad);
    const fiatAmount = tradeData.amount * currentPrice;

    if (fiatAmount < ad.minLimit || fiatAmount > ad.maxLimit) {
      throw new Error(`Trade amount must be between ${ad.minLimit} and ${ad.maxLimit} ${ad.fiatCurrency}`);
    }

    // Check if payment method is supported
    if (!ad.paymentMethods.includes(tradeData.paymentMethod)) {
      throw new Error('Payment method not supported by this advertisement');
    }

    // Determine seller and buyer
    const sellerId = ad.type === 'SELL' ? ad.userId : buyerId;
    const actualBuyerId = ad.type === 'SELL' ? buyerId : ad.userId;

    // Create the trade
    const trade = await this.prisma.p2PTrade.create({
      data: {
        adId,
        sellerId,
        buyerId: actualBuyerId,
        cryptoAsset: ad.cryptoAsset,
        fiatCurrency: ad.fiatCurrency,
        cryptoAmount: tradeData.amount,
        fiatAmount,
        exchangeRate: currentPrice,
        paymentMethod: tradeData.paymentMethod,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      },
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
        }
      }
    });

    // Create initial chat message
    if (tradeData.message) {
      await this.sendTradeMessage(actualBuyerId, trade.id, tradeData.message);
    }

    // Send auto-reply if configured
    if (ad.autoReply) {
      setTimeout(() => {
        this.sendTradeMessage(sellerId, trade.id, ad.autoReply!, 'SYSTEM');
      }, 2000);
    }

    // Notify participants
    this.notifyTradeUpdate(trade, 'TRADE_INITIATED');

    return trade;
  }

  async acceptTrade(userId: string, tradeId: string) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId },
      include: { ad: true, seller: true, buyer: true }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.sellerId !== userId) {
      throw new Error('Only seller can accept trade');
    }

    if (trade.status !== 'PENDING') {
      throw new Error('Trade cannot be accepted in current status');
    }

    // Update trade status
    const updatedTrade = await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date()
      },
      include: {
        seller: true,
        buyer: true,
        ad: true
      }
    });

    // Create escrow
    await this.createEscrow(tradeId, trade.cryptoAsset, trade.cryptoAmount);

    this.notifyTradeUpdate(updatedTrade, 'TRADE_ACCEPTED');
    return updatedTrade;
  }

  async markPaymentSent(userId: string, tradeId: string, paymentProof?: any) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId },
      include: { seller: true, buyer: true }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.buyerId !== userId) {
      throw new Error('Only buyer can mark payment as sent');
    }

    if (trade.status !== 'ESCROW_FUNDED') {
      throw new Error('Cannot mark payment sent - escrow not funded');
    }

    const updatedTrade = await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'PAYMENT_SENT',
        paymentSentAt: new Date(),
        paymentDetails: paymentProof
      },
      include: {
        seller: true,
        buyer: true
      }
    });

    // Send system message about payment
    await this.sendTradeMessage(
      userId,
      tradeId,
      `Payment of ${trade.fiatAmount} ${trade.fiatCurrency} has been sent via ${trade.paymentMethod}`,
      'SYSTEM'
    );

    this.notifyTradeUpdate(updatedTrade, 'PAYMENT_SENT');
    return updatedTrade;
  }

  async confirmPaymentReceived(userId: string, tradeId: string) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId },
      include: { seller: true, buyer: true, escrow: true }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.sellerId !== userId) {
      throw new Error('Only seller can confirm payment received');
    }

    if (trade.status !== 'PAYMENT_SENT') {
      throw new Error('Payment not marked as sent yet');
    }

    // Update trade status
    const updatedTrade = await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'PAYMENT_CONFIRMED',
        paymentConfirmedAt: new Date()
      },
      include: {
        seller: true,
        buyer: true,
        escrow: true
      }
    });

    // Release escrow
    if (trade.escrow) {
      await this.releaseEscrow(trade.escrow.id);
    }

    // Complete trade
    await this.completeTrade(tradeId);

    this.notifyTradeUpdate(updatedTrade, 'PAYMENT_CONFIRMED');
    return updatedTrade;
  }

  // Escrow Management
  private async createEscrow(tradeId: string, cryptoAsset: string, amount: number) {
    // Generate mock contract address for demonstration
    const contractAddress = `0x${crypto.randomBytes(20).toString('hex')}`;

    const escrow = await this.prisma.p2PEscrow.create({
      data: {
        tradeId,
        contractAddress,
        cryptoAsset,
        amount,
        chainId: 1, // Ethereum mainnet
        status: 'CREATED'
      }
    });

    // Simulate funding the escrow
    setTimeout(async () => {
      await this.prisma.p2PEscrow.update({
        where: { id: escrow.id },
        data: {
          status: 'FUNDED',
          fundedAt: new Date(),
          fundTxHash: `0x${crypto.randomBytes(32).toString('hex')}`
        }
      });

      // Update trade status
      await this.prisma.p2PTrade.update({
        where: { id: tradeId },
        data: { status: 'ESCROW_FUNDED' }
      });

      this.notifyTradeUpdate(await this.getTradeById(tradeId), 'ESCROW_FUNDED');
    }, 5000);

    return escrow;
  }

  private async releaseEscrow(escrowId: string) {
    const escrow = await this.prisma.p2PEscrow.update({
      where: { id: escrowId },
      data: {
        status: 'RELEASED',
        releasedAt: new Date(),
        releaseTxHash: `0x${crypto.randomBytes(32).toString('hex')}`
      }
    });

    return escrow;
  }

  // Chat System
  async sendTradeMessage(
    senderId: string,
    tradeId: string,
    content: string,
    messageType: ChatMessageType = 'TEXT'
  ) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.sellerId !== senderId && trade.buyerId !== senderId) {
      throw new Error('Not authorized to send messages in this trade');
    }

    const message = await this.prisma.p2PChat.create({
      data: {
        tradeId,
        senderId,
        messageType,
        content: this.encryptMessage(content),
        originalContent: messageType === 'SYSTEM' ? content : undefined,
        isSystemMessage: messageType === 'SYSTEM'
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

    // Broadcast message to trade participants
    this.broadcastTradeMessage(tradeId, {
      ...message,
      content: content // Send decrypted content to participants
    });

    return message;
  }

  async getTradeMessages(userId: string, tradeId: string) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.sellerId !== userId && trade.buyerId !== userId) {
      throw new Error('Not authorized to view messages');
    }

    const messages = await this.prisma.p2PChat.findMany({
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

    // Decrypt messages for authorized user
    return messages.map(msg => ({
      ...msg,
      content: this.decryptMessage(msg.content)
    }));
  }

  // Dispute Management
  async createDispute(userId: string, tradeId: string, disputeData: {
    reason: P2PDisputeReason;
    description: string;
    evidence?: any[];
  }) {
    const trade = await this.prisma.p2PTrade.findUnique({
      where: { id: tradeId }
    });

    if (!trade) {
      throw new Error('Trade not found');
    }

    if (trade.sellerId !== userId && trade.buyerId !== userId) {
      throw new Error('Not authorized to create dispute');
    }

    if (['COMPLETED', 'CANCELLED'].includes(trade.status)) {
      throw new Error('Cannot dispute completed or cancelled trade');
    }

    const dispute = await this.prisma.p2PDispute.create({
      data: {
        tradeId,
        initiatedBy: userId,
        reason: disputeData.reason,
        description: disputeData.description,
        evidence: disputeData.evidence || []
      },
      include: {
        trade: true,
        initiator: {
          select: {
            id: true,
            username: true
          }
        }
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

    this.notifyTradeUpdate(await this.getTradeById(tradeId), 'DISPUTE_CREATED');
    return dispute;
  }

  // Helper Methods
  private calculateAdPrice(ad: any): number {
    if (ad.pricingType === 'FIXED') {
      return ad.fixedPrice || 0;
    }

    const marketPrice = this.getMarketPrice(ad.cryptoAsset, ad.fiatCurrency);
    const premium = (ad.marketPremium || 0) / 100;
    
    return marketPrice * (1 + premium);
  }

  private getMarketPrice(cryptoAsset: string, fiatCurrency: string): number {
    const pair = `${cryptoAsset}-${fiatCurrency}`;
    return this.marketPrices.get(pair) || 50000; // Default fallback
  }

  private async initializeMarketPrices() {
    // Initialize with mock data - in production, connect to real price feeds
    this.marketPrices.set('BTC-USD', 67500);
    this.marketPrices.set('ETH-USD', 3800);
    this.marketPrices.set('USDT-USD', 1.00);
    this.marketPrices.set('BTC-EUR', 62000);
    this.marketPrices.set('ETH-EUR', 3500);
  }

  private encryptMessage(content: string): string {
    // Simple encryption - in production, use proper encryption
    return Buffer.from(content).toString('base64');
  }

  private decryptMessage(encryptedContent: string): string {
    try {
      return Buffer.from(encryptedContent, 'base64').toString('utf8');
    } catch {
      return encryptedContent;
    }
  }

  private async completeTrade(tradeId: string) {
    const trade = await this.prisma.p2PTrade.update({
      where: { id: tradeId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });

    // Update user statistics
    await Promise.all([
      this.updateUserTradeStats(trade.sellerId),
      this.updateUserTradeStats(trade.buyerId)
    ]);

    return trade;
  }

  private async updateUserTradeStats(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tradeCount: { increment: 1 }
      }
    });
  }

  private isUserOnline(userId: string): boolean {
    return this.wsConnections.has(userId);
  }

  private async getTradeById(tradeId: string) {
    return this.prisma.p2PTrade.findUnique({
      where: { id: tradeId },
      include: {
        seller: true,
        buyer: true,
        ad: true,
        escrow: true
      }
    });
  }

  // WebSocket Broadcasting
  private broadcastAdUpdate(eventType: string, ad: any) {
    const message = JSON.stringify({
      type: eventType,
      data: ad
    });

    this.wsConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  private notifyTradeUpdate(trade: any, eventType: string) {
    const message = JSON.stringify({
      type: eventType,
      data: trade
    });

    // Send to both trade participants
    [trade.sellerId, trade.buyerId].forEach(userId => {
      const ws = this.wsConnections.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  private broadcastTradeMessage(tradeId: string, message: any) {
    const wsMessage = JSON.stringify({
      type: 'NEW_MESSAGE',
      tradeId,
      data: message
    });

    this.wsConnections.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(wsMessage);
      }
    });
  }

  // WebSocket Connection Management
  addWebSocketConnection(userId: string, ws: WebSocket) {
    this.wsConnections.set(userId, ws);
  }

  removeWebSocketConnection(userId: string) {
    this.wsConnections.delete(userId);
  }
}
