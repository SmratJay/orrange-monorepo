// API Client for Orrange P2P Platform
import { ApiResponse, AuthResponse, WalletConnectResponse } from '../types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1';

class ApiError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiClient {
  private baseURL: string;
  private authToken?: string;

  constructor(baseURL = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  setAuthToken(token: string) {
    this.authToken = token;
    // Also store in localStorage for persistence
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearAuthToken() {
    this.authToken = undefined;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  isAuthenticated(): boolean {
    // Load token from localStorage if not in memory
    if (!this.authToken && typeof window !== 'undefined') {
      this.authToken = localStorage.getItem('auth_token') || undefined;
    }
    return !!this.authToken;
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(response.status, data.message || 'Request failed', data);
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Network error', error);
    }
  }

  // Authentication endpoints
  async walletConnect(signature: string, message: string, address: string, nonce: string) {
    return this.request('/auth/wallet-connect', {
      method: 'POST',
      body: JSON.stringify({ signature, message, address, nonce }),
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }

  // Additional auth methods for our backend compatibility
  async connectWallet(data: { address: string; signature: string; message: string }) {
    return this.walletConnect(data.signature, data.message, data.address, Date.now().toString());
  }

  // Health check
  async getHealthCheck() {
    return this.request('/health');
  }

  // Orders endpoints
  async getOrders(params?: {
    type?: 'BUY' | 'SELL';
    cryptoAsset?: string;
    fiatCurrency?: string;
    page?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }

    return this.request(`/orders?${searchParams.toString()}`);
  }

  async createOrder(orderData: {
    type: 'BUY' | 'SELL';
    cryptoAsset: string;
    cryptoAmount: string;
    fiatCurrency: string;
    rate: string;
    paymentMethods: string[];
    minTrade: string;
    maxTrade: string;
    terms?: string;
  }) {
    return this.request('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  async getOrderById(id: string) {
    return this.request(`/orders/${id}`);
  }

  async updateOrder(id: string, updates: Record<string, any>) {
    return this.request(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteOrder(id: string) {
    return this.request(`/orders/${id}`, {
      method: 'DELETE',
    });
  }

  // Additional order methods for our backend
  async getOrderBook(pair: string) {
    return this.request(`/orders/book/${pair}`);
  }

  async getMyOrders(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }

    return this.request(`/orders/my?${searchParams.toString()}`);
  }

  // Trades endpoints
  async initiateTrade(tradeData: {
    orderId: string;
    amount: string;
    paymentMethod: string;
    message?: string;
  }) {
    return this.request('/trades', {
      method: 'POST',
      body: JSON.stringify(tradeData),
    });
  }

  async getTrades(params?: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }

    return this.request(`/trades?${searchParams.toString()}`);
  }

  async getTradeById(id: string) {
    return this.request(`/trades/${id}`);
  }

  async confirmPayment(tradeId: string, data: {
    transactionId?: string;
    notes?: string;
  }) {
    return this.request(`/trades/${tradeId}/confirm-payment`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async releaseCrypto(tradeId: string, data: {
    txHash?: string;
    notes?: string;
  }) {
    return this.request(`/trades/${tradeId}/release-crypto`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // User endpoints
  async getProfile() {
    return this.request('/users/profile');
  }

  async updateProfile(updates: Record<string, any>) {
    return this.request('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async submitKYC(kycData: Record<string, any>) {
    return this.request('/users/kyc', {
      method: 'POST',
      body: JSON.stringify(kycData),
    });
  }

  // Disputes endpoints
  async createDispute(disputeData: {
    tradeId: string;
    reason: string;
    description: string;
    evidence?: string[];
  }) {
    return this.request('/disputes', {
      method: 'POST',
      body: JSON.stringify(disputeData),
    });
  }

  async getDisputes() {
    return this.request('/disputes');
  }

  async getDisputeById(id: string) {
    return this.request(`/disputes/${id}`);
  }

  // Rates endpoints
  async getRates() {
    return this.request('/rates');
  }

  async getHistoricalRates(pair: string, timeframe: string) {
    return this.request(`/rates/historical?pair=${pair}&timeframe=${timeframe}`);
  }

  // File upload endpoint
  async uploadFile(file: File, type: 'kyc' | 'evidence') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const response = await fetch(`${this.baseURL}/upload`, {
      method: 'POST',
      headers: {
        ...(this.authToken && { Authorization: `Bearer ${this.authToken}` }),
      },
      body: formData,
    });

    return response.json();
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Convenience hooks for React Query
export const apiEndpoints = {
  // Orders
  orders: (params?: any) => ['orders', params],
  order: (id: string) => ['orders', id],
  
  // Trades
  trades: (params?: any) => ['trades', params],
  trade: (id: string) => ['trades', id],
  
  // User
  profile: () => ['user', 'profile'],
  
  // Disputes
  disputes: () => ['disputes'],
  dispute: (id: string) => ['disputes', id],
  
  // Rates
  rates: () => ['rates'],
  historicalRates: (pair: string, timeframe: string) => ['rates', 'historical', pair, timeframe],
};

export { ApiError };
