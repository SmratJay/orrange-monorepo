// Custom Fastify type extensions for Orrange P2P API
import 'fastify';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    validateOrderLimits: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    rateLimiter: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    authUser?: {
      id: string;
      walletAddress: string;
      email?: string;
      reputationScore: number;
      tradeCount: number;
      isVerified: boolean;
      createdAt: Date;
      role: 'USER' | 'ADMIN' | 'MODERATOR';
    };
    
    rateLimit?: {
      limit: number;
      remaining: number;
      resetTime: Date;
    };
  }
}

// JWT Payload interface
export interface JwtPayload {
  userId: string;
  walletAddress: string;
  role: string;
  iat: number;
  exp: number;
}

// API Response interfaces
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: number;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  data: {
    items: T[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  };
}

// Order matching engine interfaces
export interface MatchingResult {
  matches: Array<{
    buyOrderId: string;
    sellOrderId: string;
    amount: string;
    price: string;
    timestamp: number;
  }>;
  remainingAmount: string;
  executedTrades: string[];
}

// Risk management interfaces
export interface RiskAssessment {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskFactors: string[];
  requiresManualReview: boolean;
  maxTradeAmount: string;
  dailyTradeLimit: string;
}

// WebSocket event types
export interface WebSocketEvent {
  type: 'order_created' | 'order_updated' | 'order_cancelled' | 'trade_executed' | 'price_update';
  data: any;
  timestamp: number;
  channel: string;
}

export interface OrderBookUpdate {
  pair: string;
  bids: Array<{ price: string; amount: string; orderId: string }>;
  asks: Array<{ price: string; amount: string; orderId: string }>;
  lastPrice?: string;
  timestamp: number;
}
