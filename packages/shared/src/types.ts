import { z } from 'zod';

// Core Entity Types
export enum OrderStatus {
  PENDING = 'PENDING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  DISPUTED = 'DISPUTED'
}

export enum OrderType {
  BUY = 'BUY',
  SELL = 'SELL'
}

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  PAYPAL = 'PAYPAL',
  WISE = 'WISE',
  CASH = 'CASH',
  MOBILE_MONEY = 'MOBILE_MONEY'
}

export enum Currency {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  NGN = 'NGN',
  KES = 'KES',
  GHS = 'GHS'
}

export enum CryptoAsset {
  BTC = 'BTC',
  ETH = 'ETH',
  USDT = 'USDT',
  USDC = 'USDC'
}

export enum DisputeStatus {
  OPEN = 'OPEN',
  INVESTIGATING = 'INVESTIGATING',
  RESOLVED = 'RESOLVED',
  ESCALATED = 'ESCALATED'
}

// Base Entity Schemas
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  username: z.string().min(3).max(30),
  walletAddress: z.string(),
  kycStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  trustScore: z.number().min(0).max(100),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const OrderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.nativeEnum(OrderType),
  cryptoAsset: z.nativeEnum(CryptoAsset),
  cryptoAmount: z.string(), // Using string for precision
  fiatCurrency: z.nativeEnum(Currency),
  fiatAmount: z.string(),
  rate: z.string(),
  paymentMethods: z.array(z.nativeEnum(PaymentMethod)),
  minTrade: z.string(),
  maxTrade: z.string(),
  status: z.nativeEnum(OrderStatus),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const TradeSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  buyerId: z.string().uuid(),
  sellerId: z.string().uuid(),
  cryptoAsset: z.nativeEnum(CryptoAsset),
  cryptoAmount: z.string(),
  fiatCurrency: z.nativeEnum(Currency),
  fiatAmount: z.string(),
  rate: z.string(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  status: z.enum(['INITIATED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'CRYPTO_RELEASED', 'COMPLETED', 'CANCELLED', 'DISPUTED']),
  escrowTxHash: z.string().optional(),
  releaseTxHash: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const DisputeSchema = z.object({
  id: z.string().uuid(),
  tradeId: z.string().uuid(),
  initiatorId: z.string().uuid(),
  reason: z.string(),
  status: z.nativeEnum(DisputeStatus),
  resolution: z.string().optional(),
  resolvedById: z.string().uuid().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

// Export types
export type User = z.infer<typeof UserSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type Trade = z.infer<typeof TradeSchema>;
export type Dispute = z.infer<typeof DisputeSchema>;

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// WebSocket Event Types
export enum WebSocketEvent {
  ORDER_UPDATED = 'ORDER_UPDATED',
  TRADE_UPDATED = 'TRADE_UPDATED',
  RATE_UPDATED = 'RATE_UPDATED',
  DISPUTE_CREATED = 'DISPUTE_CREATED',
  NOTIFICATION = 'NOTIFICATION'
}

export interface WebSocketMessage<T = any> {
  event: WebSocketEvent;
  data: T;
  timestamp: string;
  userId?: string;
}

// Configuration Types
export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  nativeToken: {
    symbol: string;
    decimals: number;
  };
  tokens: Record<CryptoAsset, {
    address: string;
    decimals: number;
  }>;
}

export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
  };
  ws: {
    url: string;
    reconnectInterval: number;
  };
  chains: Record<string, ChainConfig>;
  features: {
    kyc: boolean;
    disputes: boolean;
    analytics: boolean;
  };
}
