import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Chrome } from 'lucide-react';

interface GoogleOAuthButtonProps {
  text?: string;
  disabled?: boolean;
  className?: string;
}

export function GoogleOAuthButton({ 
  text = "Continue with Google", 
  disabled = false,
  className = "" 
}: GoogleOAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleAuth = async () => {
    try {
      setIsLoading(true);
      window.location.href = '/api/auth/google';
    } catch (error) {
      console.error('Google OAuth error:', error);
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleGoogleAuth}
      disabled={disabled || isLoading}
      className={`w-full border-gray-700 hover:bg-gray-800/50 hover:border-gray-600 h-12 rounded-xl transition-all duration-300 text-[rgba(52,255,0,1)] bg-transparent disabled:opacity-50 ${className}`}
    >
      {isLoading ? (
        <div className="w-4 h-4 border-2 border-green-400/20 border-t-green-400 rounded-full animate-spin mr-2" />
      ) : (
        <Chrome className="w-4 h-4 mr-2" />
      )}
      {text}
    </Button>
  );
}
