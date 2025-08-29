'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton';
import { Mail, Lock } from 'lucide-react';
import { FormInput } from '@/components/ui/form-input';
import { LoadingButton } from '@/components/ui/loading-button';
import { FormNotification } from '@/components/ui/form-notification';
import { useFormValidation } from '@/lib/hooks/useFormValidation';

const validationRules = {
  email: {
    required: true,
    rules: [
      {
        validate: (value: string | boolean) => {
          if (typeof value !== 'string') return false;
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        },
        message: 'Please enter a valid email address'
      }
    ]
  },
  password: {
    required: true,
    rules: []
  }
};

export default function LoginPage() {
  const [notification, setNotification] = useState<{type: 'error' | 'success' | 'info', message: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  
  // Form validation hook
  const form = useFormValidation({
    initialValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
    validationRules
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all fields
    if (!form.isValid) {
      form.validateForm();
      return;
    }
    
    setIsLoading(true);
    setNotification(null);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.values.email,
          password: form.values.password,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setNotification({ 
          type: 'success', 
          message: 'Welcome back! Redirecting to dashboard...' 
        });
        
        // Store authentication state
        if (data.token) {
          localStorage.setItem('auth_token', data.token);
          if (form.values.rememberMe) {
            localStorage.setItem('remember_user', form.values.email);
          }
        }
        
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        setNotification({ 
          type: 'error', 
          message: data.error?.message || data.error || 'Invalid email or password. Please try again.' 
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      setNotification({ 
        type: 'error', 
        message: 'Network error. Please check your connection and try again.' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-orange-950/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-yellow-500 rounded-lg"></div>
            <span className="text-2xl font-bold text-white">Orrange</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-gray-400">Sign in to your account</p>
        </div>

        {/* Glass morphism card */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-8 shadow-2xl">
          {/* Notification */}
          {notification && (
            <div className="mb-6">
              <FormNotification
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification(null)}
              />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <FormInput
              id="email"
              label="Email Address"
              type="email"
              placeholder="Enter your email"
              value={form.values.email}
              onChange={(value) => form.setValue('email', value)}
              onBlur={() => form.setFieldTouched('email')}
              error={form.touched.email ? form.errors.email : undefined}
              success={form.touched.email && !form.errors.email && form.values.email.length > 0}
              disabled={isLoading}
              icon={<Mail className="w-4 h-4" />}
            />

            {/* Password */}
            <div className="space-y-2">
              <FormInput
                id="password"
                label="Password"
                type="password"
                placeholder="Enter your password"
                value={form.values.password}
                onChange={(value) => form.setValue('password', value)}
                onBlur={() => form.setFieldTouched('password')}
                error={form.touched.password ? form.errors.password : undefined}
                success={form.touched.password && !form.errors.password && form.values.password.length > 0}
                disabled={isLoading}
                icon={<Lock className="w-4 h-4" />}
                showPasswordToggle={true}
              />
              
              {/* Forgot Password Link */}
              <div className="flex justify-end">
                <Link 
                  href="/forgot-password" 
                  className="text-sm text-orange-400 hover:text-orange-300 transition-colors duration-200"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center space-x-2">
              <input
                id="rememberMe"
                type="checkbox"
                checked={form.values.rememberMe}
                onChange={(e) => form.setValue('rememberMe', e.target.checked)}
                className="w-4 h-4 text-orange-500 bg-gray-800 border-gray-600 rounded focus:ring-orange-500 focus:ring-2"
              />
              <label htmlFor="rememberMe" className="text-sm text-gray-300">
                Remember me for 30 days
              </label>
            </div>

            {/* Submit Button */}
            <LoadingButton
              type="submit"
              loading={isLoading}
              disabled={!form.isValid}
              className="w-full h-12 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              Sign In
            </LoadingButton>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-transparent px-2 text-gray-500">Or continue with</span>
              </div>
            </div>

            {/* Google OAuth */}
            <GoogleOAuthButton disabled={isLoading} />
          </form>

          {/* Register Link */}
          <div className="mt-8 text-center">
            <p className="text-gray-400">
              Don't have an account?{' '}
              <Link 
                href="/register" 
                className="text-orange-400 hover:text-orange-300 font-medium transition-colors duration-200"
              >
                Create account
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            Secure • Decentralized • Trustless
          </p>
        </div>
      </div>
    </div>
  );
}
