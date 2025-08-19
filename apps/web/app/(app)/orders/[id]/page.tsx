'use client';

import { useParams } from 'next/navigation';
import { useOrderStore } from '@/lib/store/orders';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatTimeAgo, formatOrderId, getStatusColor, getStatusBg } from '@/lib/utils/format';
import { 
  ArrowLeft, 
  Copy, 
  MessageSquare, 
  CheckCircle2, 
  XCircle, 
  Clock,
  User,
  CreditCard,
  DollarSign,
  Calendar
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { toast } from 'sonner';

const orderTimeline = [
  { status: 'Order Created', timestamp: new Date(Date.now() - 3600000), completed: true },
  { status: 'Awaiting Merchant', timestamp: new Date(Date.now() - 3000000), completed: true },
  { status: 'Merchant Accepted', timestamp: new Date(Date.now() - 1800000), completed: true },
  { status: 'Payment Processing', timestamp: new Date(), completed: false },
  { status: 'Order Complete', timestamp: null, completed: false },
];

export default function OrderDetailPage() {
  const params = useParams();
  const { orders, updateOrder } = useOrderStore();
  const orderId = params.id as string;
  
  const order = orders.find(o => o.id === orderId);

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Card className="glass-card p-8 text-center">
          <XCircle className="w-16 h-16 text-danger mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-textPrimary mb-2">Order not found</h3>
          <p className="text-textSecondary mb-6">
            The order you're looking for doesn't exist or has been removed.
          </p>
          <Link href="/orders">
            <Button className="btn-primary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Orders
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(order.id);
    toast.success('Order ID copied to clipboard');
  };

  const handleAcceptOrder = () => {
    updateOrder(order.id, { status: 'accepted' });
    toast.success('Order accepted successfully');
  };

  const handleRejectOrder = () => {
    updateOrder(order.id, { status: 'cancelled' });
    toast.success('Order rejected');
  };

  const handleCompleteOrder = () => {
    updateOrder(order.id, { status: 'completed' });
    toast.success('Order marked as complete');
  };

  const handleCancelOrder = () => {
    updateOrder(order.id, { status: 'cancelled' });
    toast.success('Order cancelled');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center space-x-4">
          <Link href="/orders">
            <Button variant="ghost" size="sm" className="p-2 hover:bg-white/10">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <h1 className="text-2xl font-bold text-textPrimary">
                Order {formatOrderId(order.id)}
              </h1>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyId}
                className="p-2 hover:bg-white/10"
              >
                <Copy className="w-4 h-4 text-textSecondary" />
              </Button>
            </div>
            
            <div className="flex items-center space-x-3">
              <Badge className={`${getStatusBg(order.status)} border`}>
                {order.status.toUpperCase()}
              </Badge>
              <span className="text-textSecondary">
                Created {formatTimeAgo(order.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          {order.status === 'pending' && (
            <>
              <Button onClick={handleAcceptOrder} className="btn-primary">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Accept
              </Button>
              <Button 
                onClick={handleRejectOrder}
                variant="outline" 
                className="border-danger/30 text-danger hover:bg-danger/20"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject
              </Button>
            </>
          )}
          
          {order.status === 'accepted' && (
            <>
              <Button onClick={handleCompleteOrder} className="btn-primary">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark Complete
              </Button>
              <Button 
                onClick={handleCancelOrder}
                variant="outline" 
                className="border-danger/30 text-danger hover:bg-danger/20"
              >
                Cancel Order
              </Button>
            </>
          )}

          <Button variant="outline" className="btn-secondary">
            <MessageSquare className="w-4 h-4 mr-2" />
            Message
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Order Details */}
        <motion.div 
          className="lg:col-span-2 space-y-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          {/* Order Summary */}
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Order Summary</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-orangeNeon/20 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-orangeNeon" />
                  </div>
                  <div>
                    <div className="text-sm text-textSecondary">Order Type</div>
                    <div className="font-semibold text-textPrimary">
                      {order.side.toUpperCase()} {order.stablecoin}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-orangeNeon/20 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-orangeNeon" />
                  </div>
                  <div>
                    <div className="text-sm text-textSecondary">Payment Method</div>
                    <div className="font-semibold text-textPrimary">
                      {order.fiatMethod}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-success/20 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <div className="text-sm text-textSecondary">Amount</div>
                    <div className="font-semibold text-textPrimary">
                      {formatCurrency(order.amount, 'USD')}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <div className="text-sm text-textSecondary">Exchange Rate</div>
                    <div className="font-semibold text-orangeNeon">
                      {order.fiatMethod === 'UPI' || order.fiatMethod === 'INR' ? 
                        `₹${order.price}` : 
                        formatCurrency(order.price, 'USD')
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-orangeNeon/10 border border-orangeNeon/30 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Total Amount</span>
                <span className="text-xl font-bold text-orangeNeon">
                  {order.fiatMethod === 'UPI' || order.fiatMethod === 'INR' ? 
                    `₹${(order.amount * order.price).toLocaleString()}` : 
                    formatCurrency(order.amount * order.price, 'USD')
                  }
                </span>
              </div>
            </div>
          </Card>

          {/* Order Timeline */}
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-6">Order Timeline</h3>
            
            <div className="space-y-4">
              {orderTimeline.map((event, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    event.completed 
                      ? 'bg-success border-success' 
                      : index === orderTimeline.findIndex(e => !e.completed)
                        ? 'bg-orangeNeon border-orangeNeon animate-pulse-glow'
                        : 'bg-transparent border-textSecondary/30'
                  }`}>
                    {event.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-background" />
                    ) : index === orderTimeline.findIndex(e => !e.completed) ? (
                      <Clock className="w-4 h-4 text-background" />
                    ) : (
                      <div className="w-2 h-2 bg-textSecondary/50 rounded-full" />
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className={`font-medium ${
                      event.completed ? 'text-textPrimary' : 'text-textSecondary'
                    }`}>
                      {event.status}
                    </div>
                    {event.timestamp && (
                      <div className="text-sm text-textSecondary">
                        {formatTimeAgo(event.timestamp)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>

        {/* Sidebar */}
        <motion.div 
          className="space-y-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* Counterparty Info */}
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">
              {order.side === 'buy' ? 'Merchant' : 'Buyer'} Info
            </h3>
            
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orangeNeon to-orangeGlow rounded-full flex items-center justify-center">
                <User className="w-6 h-6 text-background" />
              </div>
              <div>
                <div className="font-semibold text-textPrimary">
                  {order.side === 'buy' ? 'MerchantPro' : 'BuyerX'}
                </div>
                <div className="text-sm text-textSecondary">
                  Rating: 4.9 ⭐ (247 trades)
                </div>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-textSecondary">Total Trades</span>
                <span className="text-textPrimary">247</span>
              </div>
              <div className="flex justify-between">
                <span className="text-textSecondary">Success Rate</span>
                <span className="text-success">99.2%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-textSecondary">Avg Response</span>
                <span className="text-textPrimary">2 mins</span>
              </div>
              <div className="flex justify-between">
                <span className="text-textSecondary">Member Since</span>
                <span className="text-textPrimary">Jan 2023</span>
              </div>
            </div>

            <Button className="w-full mt-4 btn-secondary">
              <MessageSquare className="w-4 h-4 mr-2" />
              Send Message
            </Button>
          </Card>

          {/* Security Info */}
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Security</h3>
            
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="text-sm text-textPrimary">Funds are escrowed</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="text-sm text-textPrimary">Identity verified</span>
              </div>
              <div className="flex items-center space-x-3">
                <CheckCircle2 className="w-5 h-5 text-success" />
                <span className="text-sm text-textPrimary">Payment method verified</span>
              </div>
              <div className="flex items-center space-x-3">
                <Clock className="w-5 h-5 text-warning" />
                <span className="text-sm text-textPrimary">Auto-release in 24h</span>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Quick Actions</h3>
            
            <div className="space-y-3">
              <Button variant="outline" className="w-full btn-secondary">
                <Copy className="w-4 h-4 mr-2" />
                Copy Order Link
              </Button>
              
              <Button variant="outline" className="w-full btn-secondary">
                <MessageSquare className="w-4 h-4 mr-2" />
                Contact Support
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}