// App Constants
export const APP_CONFIG = {
  name: 'Orrange P2P',
  version: '1.0.0',
  description: 'Global P2P Crypto Trading Platform',
  
  // API Configuration
  api: {
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000
  },
  
  // WebSocket Configuration
  ws: {
    reconnectInterval: 5000,
    maxReconnectAttempts: 10,
    pingInterval: 30000
  },
  
  // Trade Configuration
  trade: {
    defaultFeePercentage: 0.5,
    escrowTimeoutHours: 24,
    disputeTimeoutHours: 72,
    maxTradeAmountUSD: 10000,
    minTradeAmountUSD: 10
  },
  
  // Rate Configuration
  rates: {
    updateIntervalMs: 30000,
    cacheTtlMs: 60000,
    maxDeviationPercent: 5
  },
  
  // Security Configuration
  security: {
    maxLoginAttempts: 5,
    lockoutDurationMs: 300000, // 5 minutes
    sessionTimeoutMs: 86400000, // 24 hours
    twoFactorRequired: true
  }
};

// Supported Chains
export const SUPPORTED_CHAINS = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
    explorerUrl: 'https://etherscan.io',
    nativeToken: {
      symbol: 'ETH',
      decimals: 18
    },
    tokens: {
      USDT: {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6
      },
      USDC: {
        address: '0xA0b86a33E6441fd58D3fD7d0d86f9C6e1c02CCa3',
        decimals: 6
      }
    }
  },
  polygon: {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeToken: {
      symbol: 'MATIC',
      decimals: 18
    },
    tokens: {
      USDT: {
        address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
        decimals: 6
      },
      USDC: {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimals: 6
      }
    }
  }
};

// Payment Method Metadata
export const PAYMENT_METHODS = {
  BANK_TRANSFER: {
    name: 'Bank Transfer',
    icon: 'bank',
    processingTime: '1-3 business days',
    fees: 'Usually free',
    regions: ['US', 'EU', 'UK', 'NG', 'KE', 'GH']
  },
  PAYPAL: {
    name: 'PayPal',
    icon: 'paypal',
    processingTime: 'Instant',
    fees: '2.9% + $0.30',
    regions: ['US', 'EU', 'UK']
  },
  WISE: {
    name: 'Wise',
    icon: 'wise',
    processingTime: '1-2 business days',
    fees: '0.35% - 2%',
    regions: ['Global']
  },
  MOBILE_MONEY: {
    name: 'Mobile Money',
    icon: 'mobile',
    processingTime: 'Instant',
    fees: '1-3%',
    regions: ['KE', 'GH', 'NG', 'UG']
  },
  CASH: {
    name: 'Cash',
    icon: 'cash',
    processingTime: 'Instant',
    fees: 'None',
    regions: ['Local only']
  }
};

// Supported Currencies with metadata
export const CURRENCIES = {
  USD: {
    name: 'US Dollar',
    symbol: '$',
    decimals: 2,
    region: 'US'
  },
  EUR: {
    name: 'Euro',
    symbol: '€',
    decimals: 2,
    region: 'EU'
  },
  GBP: {
    name: 'British Pound',
    symbol: '£',
    decimals: 2,
    region: 'UK'
  },
  NGN: {
    name: 'Nigerian Naira',
    symbol: '₦',
    decimals: 2,
    region: 'NG'
  },
  KES: {
    name: 'Kenyan Shilling',
    symbol: 'KSh',
    decimals: 2,
    region: 'KE'
  },
  GHS: {
    name: 'Ghanaian Cedi',
    symbol: 'GH₵',
    decimals: 2,
    region: 'GH'
  }
};

// Crypto Assets metadata
export const CRYPTO_ASSETS = {
  BTC: {
    name: 'Bitcoin',
    symbol: 'BTC',
    decimals: 8,
    minTradeAmount: '0.001',
    maxTradeAmount: '10'
  },
  ETH: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
    minTradeAmount: '0.01',
    maxTradeAmount: '100'
  },
  USDT: {
    name: 'Tether',
    symbol: 'USDT',
    decimals: 6,
    minTradeAmount: '10',
    maxTradeAmount: '50000'
  },
  USDC: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    minTradeAmount: '10',
    maxTradeAmount: '50000'
  }
};

// UI Constants
export const UI_CONFIG = {
  // Colors (matching your existing theme)
  colors: {
    background: '#0B0C0E',
    panel: '#0F1115',
    textPrimary: '#FFFFFF',
    textSecondary: '#B4B7C1',
    orangeNeon: '#FF7A1A',
    orangeGlow: '#FF8F3A',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444'
  },
  
  // Animation durations
  animations: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms'
  },
  
  // Breakpoints
  breakpoints: {
    mobile: '640px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1280px'
  },
  
  // Z-index scale
  zIndex: {
    dropdown: 1000,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
    notification: 1080
  }
};

// Error Messages
export const ERROR_MESSAGES = {
  // Authentication
  INVALID_CREDENTIALS: 'Invalid email or password',
  ACCOUNT_LOCKED: 'Account locked due to too many failed attempts',
  TOKEN_EXPIRED: 'Session expired, please login again',
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action',
  
  // Trading
  INSUFFICIENT_BALANCE: 'Insufficient balance to complete this trade',
  ORDER_NOT_FOUND: 'Order not found or has been removed',
  TRADE_ALREADY_COMPLETED: 'This trade has already been completed',
  INVALID_TRADE_AMOUNT: 'Trade amount is outside the allowed range',
  
  // Network
  NETWORK_ERROR: 'Network error, please try again',
  SERVER_ERROR: 'Server error, please try again later',
  RATE_LIMIT_EXCEEDED: 'Too many requests, please slow down',
  
  // Validation
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_WALLET_ADDRESS: 'Please enter a valid wallet address',
  REQUIRED_FIELD: 'This field is required',
  
  // General
  UNKNOWN_ERROR: 'An unexpected error occurred'
};

// Success Messages
export const SUCCESS_MESSAGES = {
  ORDER_CREATED: 'Order created successfully',
  TRADE_COMPLETED: 'Trade completed successfully',
  PAYMENT_CONFIRMED: 'Payment confirmed',
  PROFILE_UPDATED: 'Profile updated successfully',
  KYC_SUBMITTED: 'KYC documents submitted for review'
};

// Regex Patterns
export const REGEX_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  username: /^[a-zA-Z0-9_]{3,30}$/,
  ethereumAddress: /^0x[a-fA-F0-9]{40}$/,
  bitcoinAddress: /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/,
  strongPassword: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
};
