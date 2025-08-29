'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useOrderStore } from '@/lib/store/orders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils/format';
import { ArrowUpRight, ArrowDownLeft, Calculator, CheckCircle2, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

const orderSchema = z.object({
  side: z.enum(['buy', 'sell']),
  stablecoin: z.enum(['USDT', 'USDC', 'DAI']),
  amount: z.number().min(10, 'Minimum amount is $10').max(100000, 'Maximum amount is $100,000'),
  fiatMethod: z.enum(['PayPal', 'CashApp', 'UPI', 'SEPA', 'INR', 'Wire']),
  price: z.number().min(0.01, 'Price must be greater than 0'),
});

type OrderForm = z.infer<typeof orderSchema>;

const stablecoins = [
  { value: 'USDT', label: 'Tether (USDT)', rate: 1.001 },
  { value: 'USDC', label: 'USD Coin (USDC)', rate: 0.999 },
  { value: 'DAI', label: 'Dai (DAI)', rate: 1.003 },
];

const fiatMethods = [
  { value: 'PayPal', label: 'PayPal', rate: 1.02, currency: 'USD' },
  { value: 'CashApp', label: 'Cash App', rate: 1.01, currency: 'USD' },
  { value: 'UPI', label: 'UPI (India)', rate: 83.24, currency: 'INR' },
  { value: 'SEPA', label: 'SEPA Transfer', rate: 0.92, currency: 'EUR' },
  { value: 'INR', label: 'Indian Rupee', rate: 83.24, currency: 'INR' },
  { value: 'Wire', label: 'Wire Transfer', rate: 1.0, currency: 'USD' },
];

export default function CreateOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addOrder } = useOrderStore();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string>('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrderForm>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      side: (searchParams.get('side') as 'buy' | 'sell') || 'buy',
      stablecoin: 'USDT',
      amount: 1000,
      fiatMethod: 'PayPal',
      price: 1.02,
    },
  });

  const watchedValues = watch();
  const selectedStablecoin = stablecoins.find(s => s.value === watchedValues.stablecoin);
  const selectedFiatMethod = fiatMethods.find(f => f.value === watchedValues.fiatMethod);

  // Auto-calculate suggested price
  const suggestedPrice = selectedStablecoin && selectedFiatMethod 
    ? selectedStablecoin.rate * selectedFiatMethod.rate 
    : 1.0;

  const totalAmount = watchedValues.amount * watchedValues.price;

  const onSubmit = async (data: OrderForm) => {
    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newOrderId = addOrder(data);
      setCreatedOrderId(newOrderId);
      setShowSuccessModal(true);
      
      toast.success('Order created successfully!');
    } catch (error) {
      toast.error('Something went wrong — please retry.');
    }
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    router.push(`/orders/${createdOrderId}`);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-textPrimary mb-2">Create Order</h1>
        <p className="text-textSecondary">
          Set up a new P2P trading order with your preferred terms.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Order Form */}
        <motion.div 
          className="lg:col-span-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card className="glass-card p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Order Type */}
              <div>
                <Label className="text-base font-medium text-textPrimary mb-3 block">
                  Order Type
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  {(['buy', 'sell'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => setValue('side', side)}
                      className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                        watchedValues.side === side
                          ? side === 'buy'
                            ? 'border-success bg-success/20 text-success'
                            : 'border-orangeNeon bg-orangeNeon/20 text-orangeNeon'
                          : 'border-glassBorder bg-glass text-textSecondary hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        {side === 'buy' ? (
                          <ArrowDownLeft className="w-5 h-5" />
                        ) : (
                          <ArrowUpRight className="w-5 h-5" />
                        )}
                        <span className="font-medium">{side.toUpperCase()}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Stablecoin */}
              <div>
                <Label className="text-base font-medium text-textPrimary mb-3 block">
                  Stablecoin
                </Label>
                <Select 
                  value={watchedValues.stablecoin} 
                  onValueChange={(value: 'USDT' | 'USDC' | 'DAI') => setValue('stablecoin', value)}
                >
                  <SelectTrigger className="glass-card border-glassBorder h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-glassBorder">
                    {stablecoins.map((coin) => (
                      <SelectItem key={coin.value} value={coin.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{coin.label}</span>
                          <Badge variant="secondary" className="ml-2">
                            ${coin.rate.toFixed(3)}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div>
                <Label className="text-base font-medium text-textPrimary mb-3 block">
                  Amount (USD)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-textSecondary">
                    $
                  </span>
                  <Input
                    {...register('amount', { valueAsNumber: true })}
                    type="number"
                    step="0.01"
                    min="10"
                    max="100000"
                    placeholder="1,000.00"
                    className="input-field pl-8 h-12 text-lg"
                  />
                </div>
                {errors.amount && (
                  <p className="text-danger text-sm mt-2">{errors.amount.message}</p>
                )}
                <p className="text-textSecondary text-sm mt-2">
                  Minimum: $10 • Maximum: $100,000
                </p>
              </div>

              {/* Fiat Method */}
              <div>
                <Label className="text-base font-medium text-textPrimary mb-3 block">
                  Payment Method
                </Label>
                <Select 
                  value={watchedValues.fiatMethod} 
                  onValueChange={(value: any) => {
                    setValue('fiatMethod', value);
                    // Auto-update price when fiat method changes
                    const method = fiatMethods.find(f => f.value === value);
                    if (method && selectedStablecoin) {
                      setValue('price', selectedStablecoin.rate * method.rate);
                    }
                  }}
                >
                  <SelectTrigger className="glass-card border-glassBorder h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="glass-card border-glassBorder">
                    {fiatMethods.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        <div className="flex items-center justify-between w-full">
                          <span>{method.label}</span>
                          <Badge variant="secondary" className="ml-2">
                            {method.currency}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Price */}
              <div>
                <Label className="text-base font-medium text-textPrimary mb-3 block">
                  Exchange Rate
                </Label>
                <div className="space-y-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-textSecondary">
                      {selectedFiatMethod?.currency === 'INR' ? '₹' : 
                       selectedFiatMethod?.currency === 'EUR' ? '€' : '$'}
                    </span>
                    <Input
                      {...register('price', { valueAsNumber: true })}
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="1.02"
                      className="input-field pl-8 h-12 text-lg"
                    />
                    <Button
                      type="button"
                      onClick={() => setValue('price', suggestedPrice)}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 btn-secondary py-1 px-3 h-8"
                    >
                      <Calculator className="w-3 h-3 mr-1" />
                      Auto
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-textSecondary">Suggested rate:</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setValue('price', suggestedPrice)}
                      className="text-orangeNeon hover:text-orangeGlow p-0 h-auto"
                    >
                      {selectedFiatMethod?.currency === 'INR' ? '₹' : 
                       selectedFiatMethod?.currency === 'EUR' ? '€' : '$'}
                      {suggestedPrice.toFixed(4)}
                    </Button>
                  </div>
                </div>
                {errors.price && (
                  <p className="text-danger text-sm mt-2">{errors.price.message}</p>
                )}
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full btn-primary h-12 text-lg"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin mr-2" />
                    Creating Order...
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 mr-2" />
                    Create Order
                  </>
                )}
              </Button>
            </form>
          </Card>
        </motion.div>

        {/* Order Preview */}
        <motion.div 
          className="space-y-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="glass-card p-6 sticky top-24">
            <h3 className="text-lg font-semibold text-textPrimary mb-4">Order Preview</h3>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Type</span>
                <Badge className={watchedValues.side === 'buy' ? 'bg-success/20 text-success' : 'bg-orangeNeon/20 text-orangeNeon'}>
                  {watchedValues.side.toUpperCase()}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Asset</span>
                <span className="font-medium text-textPrimary">{watchedValues.stablecoin}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Amount</span>
                <span className="font-medium text-textPrimary">
                  {formatCurrency(watchedValues.amount || 0, 'USD')}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Method</span>
                <span className="font-medium text-textPrimary">{watchedValues.fiatMethod}</span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-textSecondary">Rate</span>
                <span className="font-medium text-textPrimary">
                  {selectedFiatMethod?.currency === 'INR' ? '₹' : 
                   selectedFiatMethod?.currency === 'EUR' ? '€' : '$'}
                  {(watchedValues.price || 0).toFixed(4)}
                </span>
              </div>
              
              <div className="border-t border-glassBorder pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-textSecondary">Total</span>
                  <span className="text-xl font-bold text-orangeNeon">
                    {selectedFiatMethod?.currency === 'INR' ? '₹' : 
                     selectedFiatMethod?.currency === 'EUR' ? '€' : '$'}
                    {totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-orangeNeon/10 border border-orangeNeon/30 rounded-lg">
              <h4 className="font-medium text-textPrimary mb-2">What happens next?</h4>
              <ul className="text-sm text-textSecondary space-y-1">
                <li>• Order is published to the marketplace</li>
                <li>• Merchants can accept your order</li>
                <li>• Complete payment with your counterparty</li>
                <li>• Funds are released automatically</li>
              </ul>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="glass-card border-glassBorder max-w-md">
          <DialogHeader>
            <div className="w-16 h-16 bg-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <DialogTitle className="text-center text-2xl text-textPrimary">
              Order Created!
            </DialogTitle>
            <DialogDescription className="text-center text-textSecondary">
              Your order has been successfully created and is now live in the marketplace. 
              Merchants can now accept your order.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col space-y-3">
            <Button onClick={handleSuccessClose} className="btn-primary">
              View Order Details
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowSuccessModal(false);
                router.push('/orders');
              }}
              className="btn-secondary"
            >
              Go to Order Book
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}