// Temporary local types - TODO: Replace with @orrange/shared imports

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface User {
  id: string;
  email?: string;
  username?: string;
  walletAddress: string;
  kycStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  reputationScore: number;
  tradeCount: number;
  isVerified: boolean;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  isActive: boolean;
  createdAt: string;
  lastActivity?: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface WalletConnectResponse extends AuthResponse {}

// Order types
export interface Order {
  id: string;
  orderType: 'MARKET' | 'LIMIT';
  side: 'BUY' | 'SELL';
  asset: string;
  fiatCurrency: string;
  amount: string;
  price: string;
  totalValue: string;
  minTradeAmount: string;
  paymentMethods: string[];
  status: 'PENDING' | 'ACTIVE' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'EXPIRED';
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  creator: {
    id: string;
    walletAddress: string;
    reputationScore: number;
    tradeCount: number;
  };
}

export interface CreateOrderRequest {
  orderType: 'MARKET' | 'LIMIT';
  side: 'BUY' | 'SELL';
  asset: string;
  fiatCurrency: string;
  amount: string;
  price: string;
  paymentMethods: string[];
  minTradeAmount?: string;
}

export interface OrderBook {
  pair: string;
  bids: Array<{
    price: string;
    amount: string;
    orderId: string;
  }>;
  asks: Array<{
    price: string;
    amount: string;
    orderId: string;
  }>;
  lastPrice?: string;
  timestamp: number;
}

export interface WalletConnectResponse extends AuthResponse {
  // Wallet-specific fields
}
