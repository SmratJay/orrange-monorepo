'use client';

import { useState } from 'react';
import { useOrderStore } from '@/lib/store/orders';
import { useRates } from '@/lib/hooks/useRates';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Download,
  Filter
} from 'lucide-react';
import { motion } from 'framer-motion';
import { formatCurrency, formatPercent } from '@/lib/utils/format';

const analyticsData = {
  overview: {
    totalVolume: 2847293.45,
    totalTrades: 1247,
    avgTradeSize: 2284.12,
    successRate: 98.7,
    volumeChange: 12.4,
    tradesChange: 8.7,
    avgSizeChange: -2.1,
    successRateChange: 0.3,
  },
  timeframes: ['24h', '7d', '30d', '90d'],
  topAssets: [
    { symbol: 'USDT', volume: 1247293.45, trades: 547, change: 15.2 },
    { symbol: 'USDC', volume: 892847.23, trades: 423, change: 8.9 },
    { symbol: 'DAI', volume: 707152.77, trades: 277, change: 12.7 },
  ],
  topRails: [
    { name: 'UPI', volume: 1124567.89, trades: 634, change: 18.4 },
    { name: 'PayPal', volume: 892345.67, trades: 412, change: 9.2 },
    { name: 'SEPA', volume: 567234.12, trades: 201, change: 6.8 },
    { name: 'CashApp', volume: 262145.77, trades: 89, change: 22.1 },
  ],
  volumeByHour: [
    { hour: '00', volume: 45234 },
    { hour: '01', volume: 32145 },
    { hour: '02', volume: 28934 },
    { hour: '03', volume: 31245 },
    { hour: '04', volume: 42356 },
    { hour: '05', volume: 56789 },
    { hour: '06', volume: 78234 },
    { hour: '07', volume: 89456 },
    { hour: '08', volume: 124567 },
    { hour: '09', volume: 156789 },
    { hour: '10', volume: 189234 },
    { hour: '11', volume: 198765 },
    { hour: '12', volume: 234567 },
    { hour: '13', volume: 245678 },
    { hour: '14', volume: 267890 },
    { hour: '15', volume: 289123 },
    { hour: '16', volume: 298765 },
    { hour: '17', volume: 276543 },
    { hour: '18', volume: 234567 },
    { hour: '19', volume: 198765 },
    { hour: '20', volume: 167890 },
    { hour: '21', volume: 134567 },
    { hour: '22', volume: 98765 },
    { hour: '23', volume: 67890 },
  ],
};

export default function AnalyticsPage() {
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');
  const { orders } = useOrderStore();
  const { rates } = useRates();

  const overviewStats = [
    {
      label: 'Total Volume',
      value: formatCurrency(analyticsData.overview.totalVolume),
      change: analyticsData.overview.volumeChange,
      icon: DollarSign,
    },
    {
      label: 'Total Trades',
      value: analyticsData.overview.totalTrades.toLocaleString(),
      change: analyticsData.overview.tradesChange,
      icon: Activity,
    },
    {
      label: 'Avg Trade Size',
      value: formatCurrency(analyticsData.overview.avgTradeSize),
      change: analyticsData.overview.avgSizeChange,
      icon: BarChart3,
    },
    {
      label: 'Success Rate',
      value: `${analyticsData.overview.successRate}%`,
      change: analyticsData.overview.successRateChange,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <h1 className="text-3xl font-bold text-textPrimary mb-2">Analytics</h1>
          <p className="text-textSecondary">
            Comprehensive insights into your P2P trading performance.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <Button variant="outline" className="glass-liquid">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </Button>
          <Button className="btn-primary shadow-liquid">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
        </div>
      </motion.div>

      {/* Timeframe Selector */}
      <motion.div
        className="flex items-center space-x-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        {analyticsData.timeframes.map((timeframe) => (
          <Button
            key={timeframe}
            variant={selectedTimeframe === timeframe ? "default" : "outline"}
            onClick={() => setSelectedTimeframe(timeframe)}
            className={selectedTimeframe === timeframe ? "btn-primary" : "glass-liquid"}
          >
            {timeframe}
          </Button>
        ))}
      </motion.div>

      {/* Overview Stats */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {overviewStats.map((stat, index) => {
          const Icon = stat.icon;
          const isPositive = stat.change >= 0;
          
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 + index * 0.1, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ scale: 1.02, y: -4 }}
            >
              <Card className="glass-enhanced p-6 shadow-glass-enhanced">
                <div className="flex items-center justify-between mb-4">
                  <div className="glass-liquid p-3 rounded-lg shadow-liquid">
                    <Icon className="w-6 h-6 text-orangeNeon neon-glow" />
                  </div>
                  <div className={`flex items-center space-x-1 text-sm ${
                    isPositive ? 'text-success' : 'text-danger'
                  }`}>
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span>{formatPercent(Math.abs(stat.change))}</span>
                  </div>
                </div>
                
                <div>
                  <div className="text-2xl font-bold text-textPrimary mb-1">
                    {stat.value}
                  </div>
                  <div className="text-sm text-textSecondary">
                    {stat.label}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Main Analytics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <Tabs defaultValue="volume" className="space-y-6">
          <TabsList className="glass-enhanced p-1 shadow-glass-enhanced">
            <TabsTrigger value="volume" className="data-[state=active]:glass-liquid data-[state=active]:text-orangeNeon">
              <BarChart3 className="w-4 h-4 mr-2" />
              Volume Analysis
            </TabsTrigger>
            <TabsTrigger value="assets" className="data-[state=active]:glass-liquid data-[state=active]:text-orangeNeon">
              <PieChart className="w-4 h-4 mr-2" />
              Asset Breakdown
            </TabsTrigger>
            <TabsTrigger value="rails" className="data-[state=active]:glass-liquid data-[state=active]:text-orangeNeon">
              <Users className="w-4 h-4 mr-2" />
              Payment Rails
            </TabsTrigger>
          </TabsList>

          <TabsContent value="volume" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Volume Chart */}
              <Card className="lg:col-span-2 glass-enhanced p-6 shadow-glass-enhanced">
                <h3 className="text-lg font-semibold text-textPrimary mb-6">
                  Volume by Hour ({selectedTimeframe})
                </h3>
                
                <div className="h-64 flex items-end space-x-1">
                  {analyticsData.volumeByHour.map((data, index) => {
                    const maxVolume = Math.max(...analyticsData.volumeByHour.map(d => d.volume));
                    const height = (data.volume / maxVolume) * 100;
                    
                    return (
                      <motion.div
                        key={data.hour}
                        className="flex-1 glass-liquid rounded-t-lg relative group cursor-pointer"
                        style={{ height: `${height}%` }}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.8, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                        whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 122, 26, 0.2)' }}
                      >
                        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="glass-liquid px-2 py-1 rounded text-xs text-textPrimary">
                            {formatCurrency(data.volume, 'USD')}
                          </div>
                        </div>
                        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-textSecondary">
                          {data.hour}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </Card>

              {/* Volume Summary */}
              <Card className="glass-enhanced p-6 shadow-glass-enhanced">
                <h3 className="text-lg font-semibold text-textPrimary mb-6">Volume Summary</h3>
                
                <div className="space-y-4">
                  <div className="glass-liquid p-4 rounded-lg">
                    <div className="text-sm text-textSecondary mb-1">Peak Hour</div>
                    <div className="text-xl font-bold text-orangeNeon">15:00</div>
                    <div className="text-xs text-textSecondary">
                      {formatCurrency(298765)} volume
                    </div>
                  </div>
                  
                  <div className="glass-liquid p-4 rounded-lg">
                    <div className="text-sm text-textSecondary mb-1">Avg Hourly</div>
                    <div className="text-xl font-bold text-textPrimary">
                      {formatCurrency(156789)}
                    </div>
                    <div className="text-xs text-success">+12.4% vs yesterday</div>
                  </div>
                  
                  <div className="glass-liquid p-4 rounded-lg">
                    <div className="text-sm text-textSecondary mb-1">Total Today</div>
                    <div className="text-xl font-bold text-textPrimary">
                      {formatCurrency(3762945)}
                    </div>
                    <div className="text-xs text-success">+8.7% vs yesterday</div>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="assets" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Assets */}
              <Card className="glass-enhanced p-6 shadow-glass-enhanced">
                <h3 className="text-lg font-semibold text-textPrimary mb-6">Top Assets</h3>
                
                <div className="space-y-4">
                  {analyticsData.topAssets.map((asset, index) => (
                    <motion.div
                      key={asset.symbol}
                      className="glass-liquid p-4 rounded-lg"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                      whileHover={{ scale: 1.02, x: 4 }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-textPrimary">{asset.symbol}</div>
                          <div className="text-sm text-textSecondary">
                            {asset.trades} trades
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-orangeNeon">
                            {formatCurrency(asset.volume)}
                          </div>
                          <div className="text-sm text-success">
                            +{formatPercent(asset.change)}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>

              {/* Asset Distribution */}
              <Card className="glass-enhanced p-6 shadow-glass-enhanced">
                <h3 className="text-lg font-semibold text-textPrimary mb-6">Asset Distribution</h3>
                
                <div className="space-y-6">
                  {analyticsData.topAssets.map((asset, index) => {
                    const totalVolume = analyticsData.topAssets.reduce((sum, a) => sum + a.volume, 0);
                    const percentage = (asset.volume / totalVolume) * 100;
                    
                    return (
                      <div key={asset.symbol} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-textPrimary">{asset.symbol}</span>
                          <span className="text-sm text-textSecondary">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="glass-liquid rounded-full h-2 overflow-hidden">
                          <motion.div
                            className="h-full gradient-orange"
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1, delay: index * 0.2, ease: [0.22, 1, 0.36, 1] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="rails" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Payment Rails */}
              <Card className="glass-enhanced p-6 shadow-glass-enhanced">
                <h3 className="text-lg font-semibold text-textPrimary mb-6">Top Payment Rails</h3>
                
                <div className="space-y-4">
                  {analyticsData.topRails.map((rail, index) => (
                    <motion.div
                      key={rail.name}
                      className="glass-liquid p-4 rounded-lg"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.6, delay: index * 0.1, ease: [0.22, 1, 0.36, 1] }}
                      whileHover={{ scale: 1.02, x: 4 }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-textPrimary">{rail.name}</div>
                          <div className="text-sm text-textSecondary">
                            {rail.trades} trades
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-orangeNeon">
                            {formatCurrency(rail.volume)}
                          </div>
                          <div className="text-sm text-success">
                            +{formatPercent(rail.change)}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>

              {/* Rail Performance */}
              <Card className="glass-enhanced p-6 shadow-glass-enhanced">
                <h3 className="text-lg font-semibold text-textPrimary mb-6">Rail Performance</h3>
                
                <div className="space-y-4">
                  <div className="glass-liquid p-4 rounded-lg">
                    <div className="text-sm text-textSecondary mb-1">Fastest Rail</div>
                    <div className="text-xl font-bold text-orangeNeon">UPI</div>
                    <div className="text-xs text-textSecondary">Avg: 3.2 minutes</div>
                  </div>
                  
                  <div className="glass-liquid p-4 rounded-lg">
                    <div className="text-sm text-textSecondary mb-1">Most Popular</div>
                    <div className="text-xl font-bold text-textPrimary">PayPal</div>
                    <div className="text-xs text-textSecondary">412 trades today</div>
                  </div>
                  
                  <div className="glass-liquid p-4 rounded-lg">
                    <div className="text-sm text-textSecondary mb-1">Highest Volume</div>
                    <div className="text-xl font-bold text-textPrimary">UPI</div>
                    <div className="text-xs text-success">
                      {formatCurrency(1124567.89)}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}