/**
 * P2P Trade Routes - CLEAN IMPLEMENTATION
 * Week 2 Day 2: Simple, functional trade operations
 * 
 * Focus: Core P2P trading with smart contract escrow
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { SmartContractEscrowService, TradeState, ContractConfig } from '../services/SmartContractEscrowService.js';
import { ethers } from 'ethers';
import { z } from 'zod';

const prisma = new PrismaClient();

// Initialize Smart Contract Escrow Service
const contractConfig: ContractConfig = {
  contractAddress: process.env.ESCROW_CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  providerUrl: process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545',
  chainId: parseInt(process.env.CHAIN_ID || '1337'),
  privateKey: process.env.ADMIN_PRIVATE_KEY, // Optional for admin operations
  gasLimit: 500000
};

const escrowService = new SmartContractEscrowService(contractConfig);

// ===========================
// REQUEST VALIDATION SCHEMAS  
// ===========================

const CreateTradeSchema = z.object({
  buyerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
  tokenAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid token address'),
  amount: z.string().min(1, 'Amount required'),
  fiatAmount: z.number().positive('Fiat amount must be positive'),
  fiatCurrency: z.string().min(3).max(3), // USD, EUR, etc.
  exchangeRate: z.number().positive('Exchange rate must be positive'),
  paymentMethod: z.string().min(1, 'Payment method required'),
  expirationHours: z.number().min(1).max(168).default(24), // 1 hour to 1 week
  requiresKYC: z.boolean().default(false)
});

const ConfirmPaymentSchema = z.object({
  tradeId: z.string().min(1, 'Trade ID required')
});

// ===========================
// TYPE DEFINITIONS
// ===========================

interface CreateTradeRequest {
  Body: z.infer<typeof CreateTradeSchema>;
}

interface TradeParamsRequest {
  Params: {
    tradeId: string;
  };
}

interface ConfirmPaymentRequest {
  Params: {
    tradeId: string;
  };
  Body: z.infer<typeof ConfirmPaymentSchema>;
}

interface GetTradesRequest {
  Querystring: {
    status?: string;
    page?: string;
    limit?: string;
  };
}

// ===========================
// ROUTE HANDLERS
// ===========================

async function tradeRoutes(fastify: FastifyInstance) {

  // CREATE TRADE - Seller creates escrowed trade
  fastify.post<CreateTradeRequest>('/create', {
    preHandler: fastify.authenticate,
  }, async (request: FastifyRequest<CreateTradeRequest>, reply: FastifyReply) => {
    try {
      const userId = (request.user as any)?.userId;
      if (!userId) {
        return reply.status(401).send({ success: false, message: 'Authentication required' });
      }

      const validatedData = CreateTradeSchema.parse(request.body);
      
      // Get user's wallet details
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { walletAddress: true }
      });

      if (!user?.walletAddress) {
        return reply.status(400).send({ success: false, message: 'User wallet address not found' });
      }

      // Calculate expiration timestamp
      const expiresAt = Math.floor(Date.now() / 1000) + (validatedData.expirationHours * 3600);
      
      // Generate unique trade ID
      const tradeId = `trade_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Create payment hash
      const paymentHash = ethers.id(`${validatedData.paymentMethod}_${validatedData.fiatCurrency}_${validatedData.fiatAmount}`);
      
      // Create trade in database first
      const trade = await prisma.p2PTrade.create({
        data: {
          id: tradeId,
          sellerId: userId,
          buyerId: validatedData.buyerAddress, // Will be updated when buyer accepts
          cryptoAsset: 'ETH', // Default for now
          cryptoAmount: parseFloat(validatedData.amount),
          fiatCurrency: validatedData.fiatCurrency,
          fiatAmount: validatedData.fiatAmount,
          exchangeRate: validatedData.exchangeRate,
          paymentMethod: validatedData.paymentMethod,
          status: 'PENDING',
          expiresAt: new Date(expiresAt * 1000),
          requiresKYC: validatedData.requiresKYC,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // TODO: Create smart contract trade
      // This will be implemented once we have proper wallet integration
      console.log('📝 Trade created in database:', tradeId);
      console.log('⏳ Smart contract integration pending wallet setup...');

      return reply.send({
        success: true,
        data: {
          tradeId: trade.id,
          status: trade.status,
          amount: validatedData.amount,
          fiatAmount: validatedData.fiatAmount,
          expiresAt: expiresAt,
          message: 'Trade created successfully (database only - smart contract integration pending)'
        }
      });

    } catch (error: any) {
      console.error('❌ Create trade failed:', error);
      return reply.status(400).send({
        success: false,
        message: error.message || 'Failed to create trade'
      });
    }
  });

  // GET TRADE - Get trade details
  fastify.get<TradeParamsRequest>('/trade/:tradeId', {
    preHandler: fastify.authenticate,
  }, async (request: FastifyRequest<TradeParamsRequest>, reply: FastifyReply) => {
    try {
      const { tradeId } = request.params;
      const userId = (request.user as any)?.userId;

      // Get trade from database
      const trade = await prisma.p2PTrade.findUnique({
        where: { id: tradeId },
        include: {
          seller: {
            select: {
              id: true,
              username: true,
              reputationScore: true,
              tradeCount: true
            }
          }
        }
      });

      if (!trade) {
        return reply.status(404).send({
          success: false,
          message: 'Trade not found'
        });
      }

      // Check if user has access to this trade
      if (trade.sellerId !== userId && trade.buyerId !== userId) {
        return reply.status(403).send({
          success: false,
          message: 'Access denied'
        });
      }

      // TODO: Get trade details from smart contract
      // const contractTrade = await escrowService.getTrade(tradeId);

      return reply.send({
        success: true,
        data: {
          trade,
          // contractData: contractTrade,
          message: 'Smart contract data pending full integration'
        }
      });

    } catch (error: any) {
      console.error('❌ Get trade failed:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to fetch trade'
      });
    }
  });

  // CONFIRM PAYMENT - Seller confirms payment received
  fastify.post<ConfirmPaymentRequest>('/trade/:tradeId/confirm-payment', {
    preHandler: fastify.authenticate,
  }, async (request: FastifyRequest<ConfirmPaymentRequest>, reply: FastifyReply) => {
    try {
      const { tradeId } = request.params;
      const userId = (request.user as any)?.userId;

      // Get trade from database
      const trade = await prisma.p2PTrade.findUnique({
        where: { id: tradeId }
      });

      if (!trade) {
        return reply.status(404).send({
          success: false,
          message: 'Trade not found'
        });
      }

      // Check if user is the seller
      if (trade.sellerId !== userId) {
        return reply.status(403).send({
          success: false,
          message: 'Only seller can confirm payment'
        });
      }

      // Update trade status in database
      const updatedTrade = await prisma.p2PTrade.update({
        where: { id: tradeId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          updatedAt: new Date()
        }
      });

      // TODO: Call smart contract confirmPaymentReceived
      console.log('✅ Payment confirmed for trade:', tradeId);
      console.log('⏳ Smart contract confirmation pending wallet integration...');

      return reply.send({
        success: true,
        data: {
          tradeId: updatedTrade.id,
          status: updatedTrade.status,
          completedAt: updatedTrade.completedAt,
          message: 'Payment confirmed (database updated - smart contract pending)'
        }
      });

    } catch (error: any) {
      console.error('❌ Confirm payment failed:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to confirm payment'
      });
    }
  });

  // GET MY TRADES - List user's trades
  fastify.get<GetTradesRequest>('/my-trades', {
    preHandler: fastify.authenticate,
  }, async (request: FastifyRequest<GetTradesRequest>, reply: FastifyReply) => {
    try {
      const userId = (request.user as any)?.userId;
      const { status, page = '1', limit = '20' } = request.query;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        OR: [
          { sellerId: userId },
          { buyerId: userId }
        ]
      };

      if (status) {
        where.status = status.toUpperCase();
      }

      const [trades, total] = await Promise.all([
        prisma.p2PTrade.findMany({
          where,
          include: {
            seller: {
              select: {
                id: true,
                username: true,
                reputationScore: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum
        }),
        prisma.p2PTrade.count({ where })
      ]);

      return reply.send({
        success: true,
        data: {
          trades,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum)
          }
        }
      });

    } catch (error: any) {
      console.error('❌ Get trades failed:', error);
      return reply.status(500).send({
        success: false,
        message: 'Failed to fetch trades'
      });
    }
  });

  // HEALTH CHECK - Check escrow service status
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const isHealthy = await escrowService.isHealthy();
      const platformFee = await escrowService.getPlatformFeePercent();
      const totalEscrowed = await escrowService.getTotalEscrowedAmount();

      return reply.send({
        success: true,
        data: {
          contractHealthy: isHealthy,
          platformFeePercent: platformFee,
          totalEscrowedAmount: totalEscrowed,
          contractAddress: contractConfig.contractAddress,
          chainId: contractConfig.chainId
        }
      });

    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        message: 'Health check failed',
        error: error.message
      });
    }
  });
}

export default tradeRoutes;
