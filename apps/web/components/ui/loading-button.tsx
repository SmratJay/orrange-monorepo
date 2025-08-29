import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingButtonProps {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading = false,
  disabled = false,
  children,
  className,
  variant = 'default',
  size = 'default',
  onClick,
  type = 'button'
}) => {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      disabled={loading || disabled}
      onClick={onClick}
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        loading && 'cursor-not-allowed',
        className
      )}
    >
      <span className={cn(
        'flex items-center justify-center gap-2 transition-opacity duration-200',
        loading && 'opacity-50'
      )}>
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </span>
      
      {loading && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
      )}
    </Button>
  );
};

export default LoadingButton;
