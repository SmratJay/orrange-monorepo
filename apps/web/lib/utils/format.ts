// Enhanced format utilities - temporary local implementation
// TODO: Switch back to @orrange/shared when workspace imports are fixed
import { 
  formatCurrency, 
  formatCrypto, 
  formatDate, 
  formatNumber as formatNumberLocal, 
  formatPercent as formatPercentLocal, 
  formatPriceChange 
} from './format-local';

// Re-export all utilities
export {
  formatCurrency,
  formatCrypto,
  formatDate,
  formatPriceChange
};

export function formatNumber(number: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(number);
}

export function formatPercent(percent: number): string {
  const formatted = Math.abs(percent).toFixed(2);
  const sign = percent >= 0 ? '+' : '-';
  return `${sign}${formatted}%`;
}

export function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) {
    return 'Just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else {
    return `${diffInDays}d ago`;
  }
}

export function formatOrderId(id: string): string {
  return `#${id.toUpperCase().slice(0, 8)}`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'text-warning';
    case 'accepted':
      return 'text-orangeNeon';
    case 'completed':
      return 'text-success';
    case 'cancelled':
    case 'disputed':
      return 'text-danger';
    default:
      return 'text-textSecondary';
  }
}

export function getStatusBg(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-warning/20 border-warning/30';
    case 'accepted':
      return 'bg-orangeNeon/20 border-orangeNeon/30';
    case 'completed':
      return 'bg-success/20 border-success/30';
    case 'cancelled':
    case 'disputed':
      return 'bg-danger/20 border-danger/30';
    default:
      return 'bg-textSecondary/20 border-textSecondary/30';
  }
}