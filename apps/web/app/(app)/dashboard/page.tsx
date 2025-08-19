'use client';

import { useState } from 'react';
import { useOrderStore } from '@/lib/store/orders';
import { RateTicker } from '@/components/Ticker/RateTicker';
import { OrderCard } from '@/components/Orders/OrderCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw, 
  Plus,
  TrendingUp,
  DollarSign,
  Clock,
  Users
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const quickActions = [
  { 
    name: 'Buy Stablecoin', 
    icon: ArrowDownLeft, 
    href: '/create-order?side=buy',
    color: 'text-success bg-success/20 border-success/30'
  },
  { 
    name: 'Sell Stablecoin', 
    icon: ArrowUpRight, 
    href: '/create-order?side=sell',
    color: 'text-orangeNeon bg-orangeNeon/20 border-orangeNeon/30'
  },
  { 
    name: 'Create Order', 
    icon: Plus, 
    href: '/create-order',
    color: 'text-warning bg-warning/20 border-warning/30'
  },
  { 
    name: 'Convert', 
    icon: RefreshCw, 
    href: '/convert',
    color: 'text-textPrimary bg-white/20 border-white/30'
  },
];

const summaryStats = [
  { 
    label: 'Portfolio Value', 
    value: '$12,450.00', 
    change: '+5.2%', 
    icon: DollarSign,
    positive: true 
  },
  { 
    label: 'Active Orders', 
    value: '3', 
    change: '+1', 
    icon: Clock,
    positive: true 
  },
  { 
    label: 'Completed Trades', 
    value: '147', 
    change: '+12', 
    icon: TrendingUp,
    positive: true 
  },
  { 
    label: 'Trading Partners', 
    value: '89', 
    change: '+7', 
    icon: Users,
    positive: true 
  },
];

export default function DashboardPage() {
  const { orders } = useOrderStore();
  const recentOrders = orders.slice(0, 3);

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-textPrimary mb-2">
          Welcome back, Trader
        </h1>
        <p className="text-textSecondary">
          Here's what's happening with your P2P trading today.
        </p>
      </motion.div>

      {/* Summary Stats */}
      <motion.div 
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        {summaryStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ scale: 1.02, y: -4 }}
            >
              <Card className="glass-enhanced p-6 shadow-glass-enhanced">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-textSecondary mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-textPrimary">{stat.value}</p>
                  <p className={`text-sm ${stat.positive ? 'text-success' : 'text-danger'}`}>
                    {stat.change} today
                  </p>
                </div>
                <div className="w-12 h-12 glass-liquid rounded-lg flex items-center justify-center shadow-liquid">
                  <Icon className="w-6 h-6 text-orangeNeon neon-glow" />
                </div>
              </div>
            </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Live Rates */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <RateTicker />
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <h2 className="text-2xl font-bold text-textPrimary mb-6">Quick Actions</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Link key={action.name} href={action.href}>
                <motion.div
                  className={`glass-card p-6 rounded-xl border hover:shadow-neon-hover transition-all duration-300 cursor-pointer ${action.color}`}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-6 h-6" />
                    <span className="font-medium">{action.name}</span>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </motion.div>

      {/* Recent Orders */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-textPrimary">Recent Orders</h2>
          <Link href="/orders">
            <Button variant="outline" className="btn-secondary">
              View All Orders
            </Button>
          </Link>
        </div>

        {recentOrders.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {recentOrders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <OrderCard order={order} />
              </motion.div>
            ))}
          </div>
        ) : (
          <Card className="glass-card p-12 text-center">
            <Clock className="w-12 h-12 text-textSecondary mx-auto mb-4" />
            <h3 className="text-lg font-medium text-textPrimary mb-2">
              No orders yet
            </h3>
            <p className="text-textSecondary mb-6">
              Create your first order to get started with P2P trading.
            </p>
            <Link href="/create-order">
              <Button className="btn-primary">
                <Plus className="w-4 h-4 mr-2" />
                Create Order
              </Button>
            </Link>
          </Card>
        )}
      </motion.div>
    </div>
  );
}