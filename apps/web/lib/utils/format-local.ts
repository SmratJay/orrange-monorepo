// Enhanced format utilities with local implementations
// Temporary workaround for workspace import issues

// Currency formatting
export function formatCurrency(amount: number | string, currency: string = 'USD'): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) return '0';
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
    maximumFractionDigits: currency === 'USD' ? 2 : 8,
  }).format(numAmount);
}

// Crypto formatting
export function formatCrypto(amount: number | string, asset: string): string {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) return '0';
  
  const decimals = ['BTC', 'ETH'].includes(asset.toUpperCase()) ? 8 : 6;
  
  return `${numAmount.toFixed(decimals)} ${asset.toUpperCase()}`;
}

// Date formatting
export function formatDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
}

// Number formatting
export function formatNumber(num: number): string {
  if (num >= 1e9) {
    return (num / 1e9).toFixed(1) + 'B';
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(1) + 'M';
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(1) + 'K';
  }
  return num.toString();
}

// Percentage formatting
export function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// Price change formatting with color indication
export function formatPriceChange(change: number, price: number): {
  change: string;
  percent: string;
  isPositive: boolean;
} {
  const percentChange = price > 0 ? (change / (price - change)) * 100 : 0;
  
  return {
    change: change >= 0 ? `+$${change.toFixed(2)}` : `-$${Math.abs(change).toFixed(2)}`,
    percent: `${change >= 0 ? '+' : ''}${percentChange.toFixed(2)}%`,
    isPositive: change >= 0
  };
}
