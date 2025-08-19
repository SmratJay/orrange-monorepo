'use client';

import { useState } from 'react';
import { useRates } from '@/lib/hooks/useRates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency, formatNumber } from '@/lib/utils/format';
import { ArrowDownUp, Calculator, TrendingUp, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const stablecoins = [
  { value: 'USDT', label: 'Tether (USDT)', balance: 2450.00 },
  { value: 'USDC', label: 'USD Coin (USDC)', balance: 1200.00 },
  { value: 'DAI', label: 'Dai (DAI)', balance: 850.00 },
];

const fiatRails = [
  { value: 'PayPal', label: 'PayPal', fee: '2.1%' },
  { value: 'CashApp', label: 'Cash App', fee: '1.8%' },
  { value: 'UPI', label: 'UPI (India)', fee: '0.5%' },
  { value: 'SEPA', label: 'SEPA Transfer', fee: '0.8%' },
  { value: 'INR', label: 'Indian Rupee', fee: '1.2%' },
  { value: 'Wire', label: 'Wire Transfer', fee: '1.5%' },
];

export default function ConvertPage() {
  const [fromCoin, setFromCoin] = useState('USDT');
  const [toCoin, setToCoin] = useState('PayPal');
  const [amount, setAmount] = useState(1000);
  
  const { rates } = useRates();

  // Get exchange rates
  const fromRate = rates.find(r => r.pair === `${fromCoin}/USD`)?.price || 1;
  const selectedRail = fiatRails.find(r => r.value === toCoin);
  const feePercent = parseFloat(selectedRail?.fee.replace('%', '') || '2') / 100;
  
  // Calculate conversion
  const beforeFees = amount * fromRate;
  const fees = beforeFees * feePercent;
  const afterFees = beforeFees - fees;
  
  const estimatedPayout = toCoin === 'UPI' || toCoin === 'INR' 
    ? afterFees * 83.24 
    : toCoin === 'SEPA' 
      ? afterFees * 0.92 
      : afterFees;

  const swapCoins = () => {
    // Note: In a real implementation, you'd need to handle the logic for swapping
    // between stablecoins and fiat rails properly
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-textPrimary mb-2">Asset Conversion</h1>
        <p className="text-textSecondary">
          Convert your stablecoins to fiat currencies with live rates.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Conversion Calculator */}
        <motion.div 
          className="lg:col-span-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="glass-card p-8">
            <div className="space-y-6">
              {/* From Section */}
              <div>
                <Label className="text-base font-medium text-textPrimary mb-3 block">
                  From Stablecoin
                </Label>
                <div className="space-y-3">
                  <Select value={fromCoin} onValueChange={setFromCoin}>
                    <SelectTrigger className="glass-card border-glassBorder h-12">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="glass-card border-glassBorder">
                      {stablecoins.map((coin) => (
                        <SelectItem key={coin.value} value={coin.value}>
                          <div className="flex items-center justify-between w-full">
                            <span>{coin.label}</span>
                            <span className="text-textSecondary ml-4">
                              Balance: ${formatNumber(coin.balance)}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative">
                    <Input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      placeholder="Enter amount"
                      className="input-field h-12 text-lg pr-20"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <Button
                        type="button"
                        onClick={() => {
                          const coin = stablecoins.find(c => c.value === fromCoin);
                          if (coin) setAmount(coin.balance);
                        }}
                        className="btn-secondary py-1 px-3 h-8 text-sm"
                      >
                        MAX
                      </Button>
                    </div>
                  </div>

                  <div className="text-sm text-textSecondary">
                    Available: ${formatNumber(stablecoins.find(c => c.value === fromCoin)?.balance || 0)}
                  </div>
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center">
                <Button
                  onClick={swapCoins}
                  variant="ghost"
                  size="sm"
                  className="w-10 h-10 rounded-full glass-card hover:bg-white/20 p-0"
                >
                  <ArrowDownUp className="w-4 h-4 text-orangeNeon" />
                </Button>
              </div>

              {/* To Section */}
              <div>
                <Label className="text-base font-medium text-textPrimary mb-3 block">
                  To Fiat Rail
                </Label>
                <Select value={toCoin} onValueChange={setToCoin}>
                  <SelectTrigger className="glass-card border-glassBorder h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-glassBorder">
                    {fiatRails.map((rail) => (
                      <SelectItem key={rail.value} value={rail.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{rail.label}</span>
                          <span className="text-textSecondary ml-4">
                            Fee: {rail.fee}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="mt-3 p-4 glass-card rounded-lg">
                  <div className="text-2xl font-bold text-orangeNeon">
                    {toCoin === 'UPI' || toCoin === 'INR' ? '₹' : 
                     toCoin === 'SEPA' ? '€' : '$'}
                    {formatNumber(estimatedPayout, toCoin === 'UPI' || toCoin === 'INR' ? 2 : 4)}
                  </div>
                  <div className="text-sm text-textSecondary">
                    Estimated payout
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <Link 
                href={`/create-order?side=sell&stablecoin=${fromCoin}&fiatMethod=${toCoin}&amount=${amount}`}
              >
                <Button className="w-full btn-primary h-12 text-lg">
                  <Calculator className="w-5 h-5 mr-2" />
                  Create Conversion Order
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

        {/* Conversion Details */}
        <motion.div 
          className="space-y-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">
              <TrendingUp className="w-5 h-5 inline mr-2" />
              Conversion Details
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-textSecondary">Amount</span>
                <span className="font-medium text-textPrimary">
                  {amount} {fromCoin}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-textSecondary">Rate</span>
                <span className="font-medium text-textPrimary">
                  ${formatNumber(fromRate, 4)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-textSecondary">Before fees</span>
                <span className="font-medium text-textPrimary">
                  ${formatNumber(beforeFees, 2)}
                </span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-textSecondary">Platform fee ({selectedRail?.fee})</span>
                <span className="font-medium text-danger">
                  -${formatNumber(fees, 2)}
                </span>
              </div>
              
              <div className="border-t border-glassBorder pt-3">
                <div className="flex justify-between">
                  <span className="text-textSecondary">You receive</span>
                  <span className="text-lg font-bold text-orangeNeon">
                    {toCoin === 'UPI' || toCoin === 'INR' ? '₹' : 
                     toCoin === 'SEPA' ? '€' : '$'}
                    {formatNumber(estimatedPayout, 2)}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">
              <Clock className="w-5 h-5 inline mr-2" />
              Processing Time
            </h3>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-textSecondary">PayPal</span>
                <span className="font-medium text-textPrimary">1-3 hours</span>
              </div>
              <div className="flex justify-between">
                <span className="text-textSecondary">UPI</span>
                <span className="font-medium text-textPrimary">5-15 mins</span>
              </div>
              <div className="flex justify-between">
                <span className="text-textSecondary">SEPA</span>
                <span className="font-medium text-textPrimary">1-2 days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-textSecondary">Wire Transfer</span>
                <span className="font-medium text-textPrimary">2-5 days</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-orangeNeon/10 border border-orangeNeon/30 rounded-lg">
              <p className="text-sm text-textPrimary">
                <strong>Note:</strong> Processing times may vary depending on network conditions and counterparty response.
              </p>
            </div>
          </Card>

          <Card className="glass-card p-6">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Recent Rates</h3>
            
            <div className="space-y-2">
              {rates.slice(0, 3).map((rate) => (
                <div key={rate.pair} className="flex justify-between">
                  <span className="text-textSecondary">{rate.pair}</span>
                  <span className="font-medium text-textPrimary">
                    ${formatNumber(rate.price, 4)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}