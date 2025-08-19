import { z } from 'zod';
import validator from 'validator';
import { 
  OrderType, 
  CryptoAsset, 
  Currency, 
  PaymentMethod,
  OrderStatus,
  DisputeStatus 
} from '@orrange/shared/types';

// Custom validators
const walletAddress = z.string().refine(
  (val) => {
    // Ethereum address
    if (val.startsWith('0x') && val.length === 42) {
      return /^0x[a-fA-F0-9]{40}$/.test(val);
    }
    // Bitcoin address
    if (val.length >= 26 && val.length <= 62) {
      return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(val);
    }
    return false;
  },
  { message: 'Invalid wallet address format' }
);

const strongPassword = z.string()
  .min(8, 'Password must be at least 8 characters')
  .refine(
    (val) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(val),
    { message: 'Password must contain uppercase, lowercase, number and special character' }
  );

const positiveDecimal = z.string().refine(
  (val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
  },
  { message: 'Must be a positive decimal number' }
);

const phoneNumber = z.string().refine(
  (val) => validator.isMobilePhone(val),
  { message: 'Invalid phone number format' }
);

// Auth Schemas
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores'),
  password: strongPassword,
  confirmPassword: z.string(),
  walletAddress: walletAddress.optional(),
  referralCode: z.string().optional(),
  acceptTerms: z.boolean().refine(val => val === true, {
    message: 'You must accept the terms and conditions'
  })
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  twoFactorCode: z.string().length(6, '2FA code must be 6 digits').optional()
});

export const WalletAuthSchema = z.object({
  address: walletAddress,
  signature: z.string().min(1, 'Signature is required'),
  message: z.string().min(1, 'Message is required'),
  nonce: z.string().min(1, 'Nonce is required')
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: strongPassword,
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// Profile Schemas
export const UpdateProfileSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be less than 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores')
    .optional(),
  email: z.string().email('Invalid email format').optional(),
  phone: phoneNumber.optional(),
  firstName: z.string().max(50, 'First name must be less than 50 characters').optional(),
  lastName: z.string().max(50, 'Last name must be less than 50 characters').optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  timezone: z.string().optional(),
  preferredCurrency: z.nativeEnum(Currency).optional(),
  marketingEmails: z.boolean().optional(),
  twoFactorEnabled: z.boolean().optional()
});

export const KYCSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  dateOfBirth: z.string().refine(
    (val) => {
      const date = new Date(val);
      const now = new Date();
      const age = now.getFullYear() - date.getFullYear();
      return age >= 18 && age <= 120;
    },
    { message: 'You must be at least 18 years old' }
  ),
  nationality: z.string().min(1, 'Nationality is required'),
  address: z.object({
    street: z.string().min(1, 'Street address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().optional(),
    postalCode: z.string().min(1, 'Postal code is required'),
    country: z.string().min(1, 'Country is required')
  }),
  idType: z.enum(['passport', 'license', 'national_id']),
  idNumber: z.string().min(1, 'ID number is required'),
  documents: z.object({
    idFront: z.string().min(1, 'ID front image is required'),
    idBack: z.string().optional(),
    selfie: z.string().min(1, 'Selfie is required'),
    proofOfAddress: z.string().optional()
  })
});

// Trading Schemas
export const CreateOrderSchema = z.object({
  type: z.nativeEnum(OrderType),
  cryptoAsset: z.nativeEnum(CryptoAsset),
  cryptoAmount: positiveDecimal,
  fiatCurrency: z.nativeEnum(Currency),
  rate: positiveDecimal,
  paymentMethods: z.array(z.nativeEnum(PaymentMethod))
    .min(1, 'At least one payment method is required')
    .max(5, 'Maximum 5 payment methods allowed'),
  minTrade: positiveDecimal,
  maxTrade: positiveDecimal,
  terms: z.string().max(1000, 'Terms must be less than 1000 characters').optional(),
  autoReply: z.string().max(500, 'Auto reply must be less than 500 characters').optional(),
  requireVerifiedUsers: z.boolean().default(false),
  expiresIn: z.number().min(3600, 'Minimum 1 hour').max(604800, 'Maximum 7 days').default(86400) // seconds
}).refine(
  (data) => parseFloat(data.minTrade) <= parseFloat(data.maxTrade),
  {
    message: 'Minimum trade amount must be less than or equal to maximum trade amount',
    path: ['maxTrade']
  }
).refine(
  (data) => parseFloat(data.maxTrade) <= parseFloat(data.cryptoAmount),
  {
    message: 'Maximum trade amount cannot exceed total crypto amount',
    path: ['maxTrade']
  }
);

export const InitiateTradeSchema = z.object({
  orderId: z.string().uuid('Invalid order ID'),
  amount: positiveDecimal,
  paymentMethod: z.nativeEnum(PaymentMethod),
  paymentDetails: z.record(z.string()).optional(),
  message: z.string().max(500, 'Message must be less than 500 characters').optional()
});

export const ConfirmPaymentSchema = z.object({
  tradeId: z.string().uuid('Invalid trade ID'),
  transactionId: z.string().optional(),
  notes: z.string().max(500, 'Notes must be less than 500 characters').optional()
});

export const ReleaseCryptoSchema = z.object({
  tradeId: z.string().uuid('Invalid trade ID'),
  txHash: z.string().optional(),
  notes: z.string().max(500, 'Notes must be less than 500 characters').optional()
});

// Dispute Schemas
export const CreateDisputeSchema = z.object({
  tradeId: z.string().uuid('Invalid trade ID'),
  reason: z.enum([
    'payment_not_received',
    'wrong_payment_amount',
    'payment_method_issue',
    'crypto_not_released',
    'communication_issue',
    'fraudulent_activity',
    'other'
  ]),
  description: z.string()
    .min(20, 'Description must be at least 20 characters')
    .max(2000, 'Description must be less than 2000 characters'),
  evidence: z.array(z.string()).max(10, 'Maximum 10 evidence files').optional()
});

export const ResolveDisputeSchema = z.object({
  disputeId: z.string().uuid('Invalid dispute ID'),
  resolution: z.enum(['favor_buyer', 'favor_seller', 'partial_refund', 'escalate']),
  resolutionNotes: z.string()
    .min(10, 'Resolution notes must be at least 10 characters')
    .max(1000, 'Resolution notes must be less than 1000 characters'),
  refundAmount: positiveDecimal.optional()
});

// Search and Filter Schemas
export const SearchOrdersSchema = z.object({
  type: z.nativeEnum(OrderType).optional(),
  cryptoAsset: z.nativeEnum(CryptoAsset).optional(),
  fiatCurrency: z.nativeEnum(Currency).optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  minAmount: positiveDecimal.optional(),
  maxAmount: positiveDecimal.optional(),
  location: z.string().optional(),
  verified: z.boolean().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(['rate', 'amount', 'created_at', 'trust_score']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export const GetTradeHistorySchema = z.object({
  status: z.enum(['all', 'completed', 'active', 'cancelled', 'disputed']).default('all'),
  type: z.nativeEnum(OrderType).optional(),
  cryptoAsset: z.nativeEnum(CryptoAsset).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20)
});

// Admin Schemas
export const AdminUpdateUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  kycStatus: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  isActive: z.boolean().optional(),
  trustScore: z.number().min(0).max(100).optional(),
  role: z.enum(['USER', 'MERCHANT', 'ADMIN', 'MODERATOR']).optional(),
  notes: z.string().max(1000, 'Notes must be less than 1000 characters').optional()
});

// Notification Schemas
export const NotificationPreferencesSchema = z.object({
  email: z.object({
    orderUpdates: z.boolean().default(true),
    tradeUpdates: z.boolean().default(true),
    disputeUpdates: z.boolean().default(true),
    priceAlerts: z.boolean().default(false),
    marketing: z.boolean().default(false)
  }).optional(),
  push: z.object({
    orderUpdates: z.boolean().default(true),
    tradeUpdates: z.boolean().default(true),
    disputeUpdates: z.boolean().default(true),
    priceAlerts: z.boolean().default(false)
  }).optional(),
  sms: z.object({
    tradeUpdates: z.boolean().default(false),
    disputeUpdates: z.boolean().default(false),
    securityAlerts: z.boolean().default(true)
  }).optional()
});

// Rate Limiting Schema
export const RateLimitConfigSchema = z.object({
  windowMs: z.number().min(1000).max(3600000), // 1 second to 1 hour
  maxRequests: z.number().min(1).max(10000),
  skipSuccessfulRequests: z.boolean().default(false),
  skipFailedRequests: z.boolean().default(false)
});

// WebSocket Schemas
export const WebSocketSubscribeSchema = z.object({
  events: z.array(z.enum([
    'order_updates',
    'trade_updates',
    'rate_updates',
    'dispute_updates',
    'notifications'
  ])).min(1, 'At least one event type is required'),
  filters: z.object({
    cryptoAsset: z.nativeEnum(CryptoAsset).optional(),
    fiatCurrency: z.nativeEnum(Currency).optional(),
    userId: z.string().uuid().optional()
  }).optional()
});

// Export all schemas
export * from '@orrange/shared/types';
