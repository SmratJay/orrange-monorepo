'use client';

import { useRates } from '@/lib/hooks/useRates';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function RateTicker() {
  const { rates, isLoading } = useRates();

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex space-x-6 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-1 min-w-32">
              <div className="h-4 bg-white/10 rounded mb-2"></div>
              <div className="h-6 bg-white/10 rounded mb-1"></div>
              <div className="h-3 bg-white/10 rounded w-16"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div 
      className="glass-enhanced rounded-xl p-6 overflow-hidden shadow-glass-enhanced"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <h3 className="text-lg font-semibold text-textPrimary mb-4">Live Rates</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <AnimatePresence mode="wait">
          {rates.map((rate) => {
            const isPositive = rate.change24h >= 0;
            const TrendIcon = isPositive ? TrendingUp : TrendingDown;
            
            return (
              <motion.div
                key={rate.pair}
                className="space-y-2 glass-liquid p-4 rounded-lg"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ scale: 1.05, y: -2 }}
              >
                <div className="text-sm font-medium text-textSecondary">
                  {rate.pair}
                </div>
                
                <motion.div
                  key={rate.price}
                  className="text-xl font-bold text-textPrimary"
                  initial={{ scale: 1.2, color: '#FF7A1A' }}
                  animate={{ scale: 1, color: '#FFFFFF' }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                >
                  {rate.pair.includes('USD') ? 
                    `$${formatNumber(rate.price, 3)}` : 
                    formatNumber(rate.price, 2)
                  }
                </motion.div>
                
                <div className={`flex items-center space-x-1 text-sm ${
                  isPositive ? 'text-success' : 'text-danger'
                }`}>
                  <TrendIcon className="w-3 h-3" />
                  <span>{formatPercent(rate.change24h)}</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      
      <div className="mt-4 text-xs text-textSecondary">
        Updates every 3 seconds • Last updated: {new Date().toLocaleTimeString()}
      </div>
    </motion.div>
  );
}