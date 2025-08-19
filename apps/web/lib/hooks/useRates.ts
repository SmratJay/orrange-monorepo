'use client';

import { useQuery } from '@tanstack/react-query';
import { useOrderStore } from '@/lib/store/orders';
import { useEffect } from 'react';

// Mock rates simulation
const simulateRateUpdate = (currentRates: any[]) => {
  return currentRates.map(rate => ({
    ...rate,
    price: Math.max(0, rate.price + (Math.random() - 0.5) * 0.01),
    change24h: rate.change24h + (Math.random() - 0.5) * 0.2,
    lastUpdated: new Date(),
  }));
};

export function useRates() {
  const { rates, updateRates } = useOrderStore();
  
  const query = useQuery({
    queryKey: ['rates'],
    queryFn: async () => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      return simulateRateUpdate(rates);
    },
    refetchInterval: 3000, // Update every 3 seconds
    initialData: rates,
  });

  useEffect(() => {
    if (query.data) {
      updateRates(query.data);
    }
  }, [query.data, updateRates]);

  return {
    rates: query.data || rates,
    isLoading: query.isLoading,
    error: query.error,
  };
}