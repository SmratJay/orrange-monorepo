'use client';

import { Order } from '@/lib/store/orders';
import { formatCurrency, formatTimeAgo, formatOrderId, getStatusColor, getStatusBg } from '@/lib/utils/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Eye, Copy, CheckCircle, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

interface OrderCardProps {
  order: Order;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  showActions?: boolean;
}

export function OrderCard({ order, onAccept, onReject, showActions = false }: OrderCardProps) {
  const handleCopyId = () => {
    navigator.clipboard.writeText(order.id);
  };

  return (
    <motion.div
      className="glass-enhanced rounded-xl p-6 shadow-glass-enhanced transition-all duration-500"
      whileHover={{ scale: 1.02, y: -4, boxShadow: "0 0 32px rgba(255, 122, 26, 0.4)" }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`px-2 py-1 rounded-lg text-xs font-medium border glass-liquid ${getStatusBg(order.status)}`}>
              {order.side === 'buy' ? 'BUY' : 'SELL'}
            </div>
            <Badge className={getStatusColor(order.status)}>
              {order.status.toUpperCase()}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyId}
              className="p-2 hover:bg-white/10 transition-all duration-300 hover:scale-110"
            >
              <Copy className="w-4 h-4 text-textSecondary" />
            </Button>
            <Link href={`/orders/${order.id}`}>
              <Button variant="ghost" size="sm" className="p-2 hover:bg-white/10 transition-all duration-300 hover:scale-110">
                <Eye className="w-4 h-4 text-textSecondary" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Order Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-textSecondary mb-1">Order ID</div>
            <div className="text-sm font-medium text-textPrimary">
              {formatOrderId(order.id)}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-textSecondary mb-1">Asset</div>
            <div className="text-sm font-medium text-textPrimary">
              {order.stablecoin}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-textSecondary mb-1">Amount</div>
            <div className="text-sm font-medium text-textPrimary">
              {formatCurrency(order.amount, 'USD')}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-textSecondary mb-1">Method</div>
            <div className="text-sm font-medium text-textPrimary">
              {order.fiatMethod}
            </div>
          </div>
        </div>

        {/* Price & Time */}
        <div className="flex items-center justify-between pt-2 border-t border-glassBorder/50">
          <div>
            <div className="text-xs text-textSecondary">Price</div>
            <div className="text-lg font-bold text-orangeNeon">
              {order.fiatMethod === 'UPI' || order.fiatMethod === 'INR' ? 
                `₹${order.price}` : 
                formatCurrency(order.price, 'USD')
              }
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-xs text-textSecondary">Created</div>
            <div className="text-sm text-textSecondary">
              {formatTimeAgo(order.createdAt)}
            </div>
          </div>
        </div>

        {/* Actions */}
        {showActions && order.status === 'pending' && (
          <div className="flex space-x-2 pt-4 border-t border-glassBorder/50">
            <Button
              onClick={() => onAccept?.(order.id)}
              className="btn-primary flex-1"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Accept
            </Button>
            <Button
              onClick={() => onReject?.(order.id)}
              variant="outline"
              className="glass-card border-danger/30 text-danger hover:bg-danger/20 flex-1"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}