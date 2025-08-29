import { create } from 'zustand';

export interface Order {
  id: string;
  side: 'buy' | 'sell';
  stablecoin: 'USDT' | 'USDC' | 'DAI';
  amount: number;
  fiatMethod: 'PayPal' | 'CashApp' | 'UPI' | 'SEPA' | 'INR' | 'Wire';
  price: number;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled' | 'disputed';
  createdAt: Date;
  updatedAt: Date;
  merchantId?: string;
  buyerId?: string;
}

export interface Rate {
  pair: string;
  price: number;
  change24h: number;
  lastUpdated: Date;
}

interface OrderStore {
  orders: Order[];
  rates: Rate[];
  selectedOrderId: string | null;
  isLoading: boolean;
  
  // Actions
  addOrder: (order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  setSelectedOrder: (id: string | null) => void;
  updateRates: (rates: Rate[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useOrderStore = create<OrderStore>((set, get) => ({
  orders: [
    {
      id: '1',
      side: 'buy',
      stablecoin: 'USDT',
      amount: 1000,
      fiatMethod: 'PayPal',
      price: 1.02,
      status: 'pending',
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(Date.now() - 3600000),
      merchantId: 'merchant1',
    },
    {
      id: '2',
      side: 'sell',
      stablecoin: 'USDC',
      amount: 500,
      fiatMethod: 'UPI',
      price: 82.5,
      status: 'accepted',
      createdAt: new Date(Date.now() - 7200000),
      updatedAt: new Date(Date.now() - 1800000),
      buyerId: 'buyer1',
    },
    {
      id: '3',
      side: 'buy',
      stablecoin: 'DAI',
      amount: 250,
      fiatMethod: 'SEPA',
      price: 0.98,
      status: 'completed',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 3600000),
      merchantId: 'merchant2',
    },
  ],
  rates: [
    { pair: 'USDT/USD', price: 1.001, change24h: 0.05, lastUpdated: new Date() },
    { pair: 'USDC/USD', price: 0.999, change24h: -0.02, lastUpdated: new Date() },
    { pair: 'DAI/USD', price: 1.003, change24h: 0.12, lastUpdated: new Date() },
    { pair: 'USDT/INR', price: 83.24, change24h: 0.15, lastUpdated: new Date() },
    { pair: 'USDC/EUR', price: 0.92, change24h: -0.08, lastUpdated: new Date() },
  ],
  selectedOrderId: null,
  isLoading: false,
  
  addOrder: (orderData) => {
    const newOrder: Order = {
      ...orderData,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    set((state) => ({
      orders: [newOrder, ...state.orders]
    }));
  },
  
  updateOrder: (id, updates) => {
    set((state) => ({
      orders: state.orders.map((order) =>
        order.id === id
          ? { ...order, ...updates, updatedAt: new Date() }
          : order
      ),
    }));
  },
  
  setSelectedOrder: (id) => set({ selectedOrderId: id }),
  
  updateRates: (rates) => set({ rates }),
  
  setLoading: (loading) => set({ isLoading: loading }),
}));