import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormNotificationProps {
  type: 'error' | 'success' | 'info' | 'warning';
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

export const FormNotification: React.FC<FormNotificationProps> = ({
  type,
  title,
  message,
  onClose,
  className
}) => {
  const config = {
    error: {
      icon: AlertCircle,
      className: 'border-red-500/50 bg-red-500/10 text-red-400',
      iconColor: 'text-red-400'
    },
    success: {
      icon: CheckCircle,
      className: 'border-green-500/50 bg-green-500/10 text-green-400',
      iconColor: 'text-green-400'
    },
    info: {
      icon: Info,
      className: 'border-blue-500/50 bg-blue-500/10 text-blue-400',
      iconColor: 'text-blue-400'
    },
    warning: {
      icon: AlertCircle,
      className: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400',
      iconColor: 'text-yellow-400'
    }
  };

  const { icon: Icon, className: typeClassName, iconColor } = config[type];

  return (
    <Alert className={cn(
      'backdrop-blur-sm border transition-all duration-300',
      typeClassName,
      className
    )}>
      <Icon className={cn('h-4 w-4', iconColor)} />
      <AlertDescription className="flex justify-between items-start">
        <div className="space-y-1">
          {title && (
            <div className="font-medium text-sm">{title}</div>
          )}
          <div className="text-sm opacity-90">{message}</div>
        </div>
        
        {onClose && (
          <button
            onClick={onClose}
            className={cn(
              'ml-4 p-1 rounded-md hover:bg-white/10 transition-colors duration-200',
              iconColor
            )}
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </AlertDescription>
    </Alert>
  );
};

export default FormNotification;
