// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}

// User Types
export interface User {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  walletAddress?: string;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  trustScore: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

// Auth Types
export interface AuthResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// Order Types
export type OrderType = 'BUY' | 'SELL';
export type OrderStatus = 'ACTIVE' | 'INACTIVE' | 'MATCHED' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export interface Order {
  id: string;
  userId: string;
  type: OrderType;
  cryptoAsset: string;
  chain?: string;
  amount: number;
  fiatCurrency: string;
  fiatAmount: number;
  rate: number;
  paymentMethods: string[];
  minLimit?: number;
  maxLimit?: number;
  timeLimit: number;
  status: OrderStatus;
  description?: string;
  tradingPartnerId?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

// Trade Types
export type TradeStatus = 'PENDING' | 'PAYMENT_PENDING' | 'PAYMENT_CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';

export interface Trade {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  fiatAmount: number;
  rate: number;
  paymentMethod: string;
  status: TradeStatus;
  escrowTxHash?: string;
  releaseTxHash?: string;
  isDisputed: boolean;
  disputeReason?: string;
  resolvedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Message Types
export type MessageType = 'TEXT' | 'IMAGE' | 'SYSTEM' | 'DISPUTE';

export interface Message {
  id: string;
  content: string;
  senderId: string;
  orderId?: string;
  tradeId?: string;
  type: MessageType;
  createdAt: Date;
  updatedAt: Date;
}
