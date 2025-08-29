import React from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PasswordStrengthProps {
  password: string;
  score: number;
  feedback: {
    hasMinLength: boolean;
    hasNumber: boolean;
    hasLowercase: boolean;
    hasUppercase: boolean;
    hasSpecialChar: boolean;
  };
  className?: string;
}

export const PasswordStrength: React.FC<PasswordStrengthProps> = ({
  password,
  score,
  feedback,
  className
}) => {
  if (!password) return null;

  const strengthLabels = [
    { label: 'Very Weak', color: 'text-red-500' },
    { label: 'Weak', color: 'text-red-400' },
    { label: 'Fair', color: 'text-yellow-500' },
    { label: 'Good', color: 'text-yellow-400' },
    { label: 'Strong', color: 'text-green-400' },
    { label: 'Very Strong', color: 'text-green-500' }
  ];

  const strengthColors = [
    'bg-red-500',
    'bg-red-400', 
    'bg-yellow-500',
    'bg-yellow-400',
    'bg-green-400',
    'bg-green-500'
  ];

  const requirements = [
    { key: 'hasMinLength', label: 'At least 8 characters', met: feedback.hasMinLength },
    { key: 'hasNumber', label: 'Contains a number', met: feedback.hasNumber },
    { key: 'hasLowercase', label: 'Contains lowercase letter', met: feedback.hasLowercase },
    { key: 'hasUppercase', label: 'Contains uppercase letter', met: feedback.hasUppercase },
    { key: 'hasSpecialChar', label: 'Contains special character', met: feedback.hasSpecialChar }
  ];

  return (
    <div className={cn('space-y-3', className)}>
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Password Strength</span>
          <span className={cn('text-xs font-medium', strengthLabels[score]?.color)}>
            {strengthLabels[score]?.label}
          </span>
        </div>
        
        <div className="relative">
          <Progress 
            value={(score + 1) * 20} 
            className="h-2 bg-gray-700"
          />
          <div 
            className={cn(
              'absolute top-0 left-0 h-full rounded-full transition-all duration-300',
              strengthColors[score]
            )}
            style={{ width: `${(score + 1) * 20}%` }}
          />
        </div>
      </div>
      
      <div className="space-y-1">
        {requirements.map((req) => (
          <div key={req.key} className="flex items-center gap-2 text-xs">
            {req.met ? (
              <CheckCircle className="w-3 h-3 text-green-400" />
            ) : (
              <XCircle className="w-3 h-3 text-gray-500" />
            )}
            <span className={cn(
              req.met ? 'text-green-400' : 'text-gray-500',
              'transition-colors duration-200'
            )}>
              {req.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordStrength;
