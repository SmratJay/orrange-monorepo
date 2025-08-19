'use client';

import { useState } from 'react';
import { useOrderStore } from '@/lib/store/orders';
import { OrderCard } from '@/components/Orders/OrderCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  DollarSign,
  Users,
  Star,
  Activity
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const performanceData = [
  { label: 'Acceptance Rate', value: '94.2%', change: '+2.1%', positive: true },
  { label: 'Avg Response Time', value: '3.2 min', change: '-0.8 min', positive: true },
  { label: 'Completion Rate', value: '98.7%', change: '+0.3%', positive: true },
  { label: 'Total Volume', value: '$45.2K', change: '+$12.1K', positive: true },
];

export default function MerchantPage() {
  const { orders, updateOrder } = useOrderStore();
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  // Filter orders by status
  const pendingOrders = orders.filter(order => order.status === 'pending');
  const acceptedOrders = orders.filter(order => order.status === 'accepted');
  const completedOrders = orders.filter(order => order.status === 'completed');
  const disputedOrders = orders.filter(order => order.status === 'disputed');

  const handleAcceptOrder = (orderId: string) => {
    updateOrder(orderId, { status: 'accepted' });
    toast.success('Order accepted successfully');
  };

  const handleRejectOrder = (orderId: string) => {
    updateOrder(orderId, { status: 'cancelled' });
    toast.success('Order rejected');
  };

  const handleCompleteOrder = (orderId: string) => {
    updateOrder(orderId, { status: 'completed' });
    toast.success('Order marked as complete');
  };

  const handleBulkAccept = () => {
    if (selectedOrders.length === 0) {
      toast.error('Please select orders to accept');
      return;
    }

    selectedOrders.forEach(orderId => {
      updateOrder(orderId, { status: 'accepted' });
    });
    
    setSelectedOrders([]);
    toast.success(`${selectedOrders.length} orders accepted`);
  };

  const handleBulkReject = () => {
    if (selectedOrders.length === 0) {
      toast.error('Please select orders to reject');
      return;
    }

    selectedOrders.forEach(orderId => {
      updateOrder(orderId, { status: 'cancelled' });
    });
    
    setSelectedOrders([]);
    toast.success(`${selectedOrders.length} orders rejected`);
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-textPrimary mb-2">Merchant Panel</h1>
            <p className="text-textSecondary">
              Manage your P2P trading orders and track performance.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <Badge className="bg-success/20 text-success border-success/30">
              <Activity className="w-3 h-3 mr-1" />
              Online
            </Badge>
            <Badge className="bg-orangeNeon/20 text-orangeNeon border-orangeNeon/30">
              <Star className="w-3 h-3 mr-1" />
              4.9 Rating
            </Badge>
          </div>
        </div>

        {/* Performance Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {performanceData.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="glass-card p-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-textSecondary">{stat.label}</span>
                  <TrendingUp className="w-4 h-4 text-success" />
                </div>
                <div className="text-2xl font-bold text-textPrimary mb-1">
                  {stat.value}
                </div>
                <div className={`text-sm ${stat.positive ? 'text-success' : 'text-danger'}`}>
                  {stat.change} this week
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Main Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Tabs defaultValue="pending" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList className="glass-card p-1">
              <TabsTrigger value="pending" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
                <Clock className="w-4 h-4 mr-2" />
                Pending ({pendingOrders.length})
              </TabsTrigger>
              <TabsTrigger value="accepted" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Accepted ({acceptedOrders.length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Completed ({completedOrders.length})
              </TabsTrigger>
              <TabsTrigger value="disputed" className="data-[state=active]:bg-orangeNeon/20 data-[state=active]:text-orangeNeon">
                <AlertTriangle className="w-4 h-4 mr-2" />
                Disputed ({disputedOrders.length})
              </TabsTrigger>
            </TabsList>

            {/* Bulk Actions */}
            {selectedOrders.length > 0 && (
              <div className="flex items-center space-x-3">
                <Badge variant="secondary" className="bg-orangeNeon/20 text-orangeNeon">
                  {selectedOrders.length} selected
                </Badge>
                <div className="hidden md:flex items-center space-x-2">
                  <Button onClick={handleBulkAccept} className="btn-primary">
                    Accept ({selectedOrders.length})
                  </Button>
                  <Button 
                    onClick={handleBulkReject}
                    variant="outline" 
                    className="border-danger/30 text-danger hover:bg-danger/20"
                  >
                    Reject ({selectedOrders.length})
                  </Button>
                </div>
              </div>
            )}
          </div>

          <TabsContent value="pending" className="space-y-6">
            {pendingOrders.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {pendingOrders.map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                    className="relative"
                  >
                    <div
                      className={`absolute top-4 left-4 w-4 h-4 rounded border-2 cursor-pointer transition-all duration-300 ${
                        selectedOrders.includes(order.id)
                          ? 'bg-orangeNeon border-orangeNeon'
                          : 'border-textSecondary/50 hover:border-orangeNeon/50'
                      }`}
                      onClick={() => toggleOrderSelection(order.id)}
                    >
                      {selectedOrders.includes(order.id) && (
                        <CheckCircle2 className="w-3 h-3 text-background ml-0.5 mt-0.5" />
                      )}
                    </div>
                    <OrderCard
                      order={order}
                      onAccept={handleAcceptOrder}
                      onReject={handleRejectOrder}
                      showActions={true}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              <Card className="glass-card p-12 text-center">
                <Clock className="w-16 h-16 text-textSecondary mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold text-textPrimary mb-2">
                  No pending requests
                </h3>
                <p className="text-textSecondary">
                  You're all caught up! New orders will appear here when submitted.
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="accepted" className="space-y-6">
            {acceptedOrders.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {acceptedOrders.map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <div className="relative">
                      <OrderCard order={order} />
                      <div className="absolute bottom-4 right-4">
                        <Button 
                          onClick={() => handleCompleteOrder(order.id)}
                          className="btn-primary"
                          size="sm"
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Mark Complete
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <Card className="glass-card p-12 text-center">
                <CheckCircle2 className="w-16 h-16 text-textSecondary mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold text-textPrimary mb-2">
                  No accepted orders
                </h3>
                <p className="text-textSecondary">
                  Accepted orders will appear here for completion.
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-6">
            {completedOrders.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {completedOrders.map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <OrderCard order={order} />
                  </motion.div>
                ))}
              </div>
            ) : (
              <Card className="glass-card p-12 text-center">
                <CheckCircle2 className="w-16 h-16 text-textSecondary mx-auto mb-4 opacity-50" />
                <h3 className="text-xl font-semibold text-textPrimary mb-2">
                  No completed orders
                </h3>
                <p className="text-textSecondary">
                  Your completed orders will be listed here.
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="disputed" className="space-y-6">
            <Card className="glass-card p-12 text-center">
              <AlertTriangle className="w-16 h-16 text-warning mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-textPrimary mb-2">
                No disputed orders
              </h3>
              <p className="text-textSecondary">
                Great! You don't have any disputed orders at the moment.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}