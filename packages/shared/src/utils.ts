import { format } from 'date-fns';

// Format currency amounts with proper precision
export function formatCurrency(amount: string | number, currency: string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(numAmount);
}

// Format crypto amounts with proper precision
export function formatCrypto(amount: string | number, asset: string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  const decimals = asset === 'BTC' ? 8 : asset === 'ETH' ? 6 : 2;
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(numAmount) + ' ' + asset;
}

// Format dates consistently
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return format(dateObj, 'MMM dd, yyyy HH:mm');
}

// Format relative time (e.g., "2 hours ago")
export function formatRelativeTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return format(dateObj, 'MMM dd, yyyy');
}

// Generate unique IDs
export function generateId(): string {
  return crypto.randomUUID();
}

// Validate wallet addresses (basic validation)
export function isValidWalletAddress(address: string): boolean {
  // Ethereum address validation
  if (address.startsWith('0x') && address.length === 42) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  
  // Bitcoin address validation (simplified)
  if ((address.startsWith('1') || address.startsWith('3') || address.startsWith('bc1')) && 
      address.length >= 26 && address.length <= 62) {
    return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$|^bc1[a-z0-9]{39,59}$/.test(address);
  }
  
  return false;
}

// Calculate percentage change
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

// Debounce function for search/filtering
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function for rate limiting
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Sanitize user input
export function sanitizeString(str: string): string {
  return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/[<>]/g, '')
            .trim();
}

// Calculate trade fee
export function calculateTradeFee(amount: number, feePercentage: number = 0.5): number {
  return (amount * feePercentage) / 100;
}

// Validate trade parameters
export function validateTradeAmount(
  amount: number,
  minTrade: number,
  maxTrade: number,
  availableBalance: number
): { isValid: boolean; error?: string } {
  if (amount < minTrade) {
    return { isValid: false, error: `Minimum trade amount is ${minTrade}` };
  }
  
  if (amount > maxTrade) {
    return { isValid: false, error: `Maximum trade amount is ${maxTrade}` };
  }
  
  if (amount > availableBalance) {
    return { isValid: false, error: 'Insufficient balance' };
  }
  
  return { isValid: true };
}

// Sleep utility for delays
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Convert between different number formats safely
export class SafeMath {
  static add(a: string, b: string): string {
    return (parseFloat(a) + parseFloat(b)).toString();
  }
  
  static subtract(a: string, b: string): string {
    return (parseFloat(a) - parseFloat(b)).toString();
  }
  
  static multiply(a: string, b: string): string {
    return (parseFloat(a) * parseFloat(b)).toString();
  }
  
  static divide(a: string, b: string): string {
    const divisor = parseFloat(b);
    if (divisor === 0) throw new Error('Division by zero');
    return (parseFloat(a) / divisor).toString();
  }
  
  static compare(a: string, b: string): -1 | 0 | 1 {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (numA < numB) return -1;
    if (numA > numB) return 1;
    return 0;
  }
}
