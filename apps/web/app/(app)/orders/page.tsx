'use client';

import { useState } from 'react';
import { useOrderStore } from '@/lib/store/orders';
import { OrderCard } from '@/components/Orders/OrderCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Plus, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';

const filters = {
  side: ['all', 'buy', 'sell'],
  asset: ['all', 'USDT', 'USDC', 'DAI'],
  fiatMethod: ['all', 'PayPal', 'UPI', 'SEPA', 'CashApp', 'INR', 'Wire'],
  status: ['all', 'pending', 'accepted', 'completed', 'cancelled', 'disputed'],
};

export default function OrdersPage() {
  const { orders } = useOrderStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilters, setActiveFilters] = useState({
    side: 'all',
    asset: 'all',
    fiatMethod: 'all',
    status: 'all',
  });

  // Filter orders based on search and filters
  const filteredOrders = orders.filter((order) => {
    const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.stablecoin.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         order.fiatMethod.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilters = 
      (activeFilters.side === 'all' || order.side === activeFilters.side) &&
      (activeFilters.asset === 'all' || order.stablecoin === activeFilters.asset) &&
      (activeFilters.fiatMethod === 'all' || order.fiatMethod === activeFilters.fiatMethod) &&
      (activeFilters.status === 'all' || order.status === activeFilters.status);

    return matchesSearch && matchesFilters;
  });

  const handleFilterChange = (filterType: string, value: string) => {
    setActiveFilters(prev => ({ ...prev, [filterType]: value }));
  };

  const clearFilters = () => {
    setActiveFilters({
      side: 'all',
      asset: 'all',
      fiatMethod: 'all',
      status: 'all',
    });
    setSearchTerm('');
  };

  const activeFilterCount = Object.values(activeFilters).filter(value => value !== 'all').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-textPrimary mb-2">Order Book</h1>
          <p className="text-textSecondary">
            Browse and manage all your P2P trading orders.
          </p>
        </div>

        <Link href="/create-order">
          <Button className="btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Create Order
          </Button>
        </Link>
      </motion.div>

      {/* Filters */}
      <motion.div
        className="glass-card rounded-xl p-6 space-y-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {/* Search and Clear */}
        <div className="flex items-center space-x-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-textSecondary" />
            <Input
              placeholder="Search orders by ID, asset, or payment method..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Badge variant="secondary" className="bg-orangeNeon/20 text-orangeNeon">
              <Filter className="w-3 h-3 mr-1" />
              {activeFilterCount} active
            </Badge>
            
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="hover:bg-white/10 text-textSecondary"
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Filter Selects */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Object.entries(filters).map(([filterType, options]) => (
            <Select
              key={filterType}
              value={activeFilters[filterType as keyof typeof activeFilters]}
              onValueChange={(value) => handleFilterChange(filterType, value)}
            >
              <SelectTrigger className="glass-card border-glassBorder">
                <SelectValue placeholder={`Select ${filterType}`} />
              </SelectTrigger>
              <SelectContent className="glass-card border-glassBorder">
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === 'all' ? `All ${filterType}s` : option.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
        </div>
      </motion.div>

      {/* Orders Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-textPrimary">
              Orders ({filteredOrders.length})
            </h2>
            {searchTerm || activeFilterCount > 0 ? (
              <Badge variant="outline" className="border-orangeNeon/30 text-orangeNeon">
                Filtered
              </Badge>
            ) : null}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {filteredOrders.length > 0 ? (
            <motion.div
              key="orders-grid"
              className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {filteredOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <OrderCard order={order} />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Card className="glass-card p-12 text-center">
                <BookOpen className="w-16 h-16 text-textSecondary mx-auto mb-6 opacity-50" />
                <h3 className="text-xl font-semibold text-textPrimary mb-3">
                  {searchTerm || activeFilterCount > 0 ? 'No matching orders' : 'No orders yet'}
                </h3>
                <p className="text-textSecondary mb-8 max-w-md mx-auto">
                  {searchTerm || activeFilterCount > 0 
                    ? 'Try adjusting your search terms or filters to find what you\'re looking for.'
                    : 'Create your first order to get started with P2P trading.'
                  }
                </p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center space-y-3 sm:space-y-0 sm:space-x-4">
                  {searchTerm || activeFilterCount > 0 ? (
                    <Button onClick={clearFilters} className="btn-secondary">
                      Clear Filters
                    </Button>
                  ) : null}
                  
                  <Link href="/create-order">
                    <Button className="btn-primary">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Order
                    </Button>
                  </Link>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}