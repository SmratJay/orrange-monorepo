// React hooks for Orrange P2P orders
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { Order, CreateOrderRequest, OrderBook } from '../types/api';

interface UseOrdersOptions {
  asset?: string;
  fiatCurrency?: string;
  side?: 'BUY' | 'SELL';
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useOrders(options: UseOrdersOptions = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.getOrders({
        type: options.side,
        cryptoAsset: options.asset,
        fiatCurrency: options.fiatCurrency,
        limit: 20,
      });

      if (response.success && response.data) {
        setOrders(response.data.orders || []);
      } else {
        setError(response.error || 'Failed to fetch orders');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [options.asset, options.fiatCurrency, options.side]);

  useEffect(() => {
    fetchOrders();

    // Auto-refresh if enabled
    if (options.autoRefresh) {
      const interval = setInterval(fetchOrders, options.refreshInterval || 30000);
      return () => clearInterval(interval);
    }
  }, [fetchOrders, options.autoRefresh, options.refreshInterval]);

  return {
    orders,
    loading,
    error,
    refresh: fetchOrders,
  };
}

export function useOrderBook(pair: string, autoRefresh = true) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderBook = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.getOrderBook(pair);

      if (response.success && response.data) {
        setOrderBook(response.data);
      } else {
        setError(response.error || 'Failed to fetch order book');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [pair]);

  useEffect(() => {
    if (pair) {
      fetchOrderBook();

      if (autoRefresh) {
        const interval = setInterval(fetchOrderBook, 5000); // 5 second refresh for order book
        return () => clearInterval(interval);
      }
    }
  }, [fetchOrderBook, autoRefresh, pair]);

  return {
    orderBook,
    loading,
    error,
    refresh: fetchOrderBook,
  };
}

export function useCreateOrder() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOrder = useCallback(async (orderData: CreateOrderRequest) => {
    try {
      setLoading(true);
      setError(null);
      
      // Transform our interface to match the existing API
      const apiOrderData = {
        type: orderData.side as 'BUY' | 'SELL',
        cryptoAsset: orderData.asset,
        cryptoAmount: orderData.amount,
        fiatCurrency: orderData.fiatCurrency,
        rate: orderData.price,
        paymentMethods: orderData.paymentMethods,
        minTrade: orderData.minTradeAmount || orderData.amount,
        maxTrade: orderData.amount,
        terms: '',
      };
      
      const response = await apiClient.createOrder(apiOrderData);

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to create order');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    createOrder,
    loading,
    error,
  };
}

export function useMyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMyOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.getMyOrders({
        limit: 50,
      });

      if (response.success && response.data) {
        setOrders(response.data.orders || []);
      } else {
        setError(response.error || 'Failed to fetch your orders');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateOrder = useCallback(async (orderId: string, updates: {
    price?: string;
    amount?: string;
    paymentMethods?: string[];
    status?: 'ACTIVE' | 'CANCELLED';
  }) => {
    try {
      const response = await apiClient.updateOrder(orderId, updates);
      
      if (response.success) {
        // Refresh orders to get updated data
        await fetchMyOrders();
        return response.data;
      } else {
        throw new Error(response.error || 'Failed to update order');
      }
    } catch (err) {
      throw err;
    }
  }, [fetchMyOrders]);

  useEffect(() => {
    if (apiClient.isAuthenticated()) {
      fetchMyOrders();
    }
  }, [fetchMyOrders]);

  return {
    orders,
    loading,
    error,
    refresh: fetchMyOrders,
    updateOrder,
  };
}
