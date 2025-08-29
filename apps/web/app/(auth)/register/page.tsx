'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Checkbox } from '@/components/ui/checkbox';
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton';
import { User, Mail, Lock } from 'lucide-react';
import { FormInput } from '@/components/ui/form-input';
import { PasswordStrength } from '@/components/ui/password-strength';
import { LoadingButton } from '@/components/ui/loading-button';
import { FormNotification } from '@/components/ui/form-notification';
import { useFormValidation } from '@/lib/hooks/useFormValidation';
import { usePasswordStrength } from '@/lib/hooks/usePasswordStrength';

const validationRules = {
  name: {
    required: true,
    rules: [
      {
        validate: (value: any) => typeof value === 'string' && value.length >= 2,
        message: 'Name must be at least 2 characters'
      },
      {
        validate: (value: any) => typeof value === 'string' && /^[a-zA-Z\s]+$/.test(value),
        message: 'Name can only contain letters and spaces'
      }
    ]
  },
  email: {
    required: true,
    rules: [
      {
        validate: (value: any) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        message: 'Please enter a valid email address'
      }
    ]
  },
  password: {
    required: true,
    rules: [
      {
        validate: (value: any) => typeof value === 'string' && value.length >= 8,
        message: 'Password must be at least 8 characters'
      }
    ]
  },
  confirmPassword: {
    required: true,
    rules: []
  }
};

export default function RegisterPage() {
  const [notification, setNotification] = useState<{type: 'error' | 'success' | 'info', message: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  
  // Form validation hook
  const form = useFormValidation({
    initialValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeToTerms: false,
    },
    validationRules
  });
  
  // Password strength analysis
  const passwordStrength = usePasswordStrength(form.values.password);
  
  // Create feedback object for PasswordStrength component
  const passwordFeedback = {
    hasMinLength: form.values.password.length >= 8,
    hasNumber: /\d/.test(form.values.password),
    hasLowercase: /[a-z]/.test(form.values.password),
    hasUppercase: /[A-Z]/.test(form.values.password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(form.values.password)
  };

  // Custom validation for password confirmation
  const passwordsMatch = form.values.password === form.values.confirmPassword;
  const confirmPasswordError = form.touched.confirmPassword && form.values.confirmPassword && !passwordsMatch 
    ? 'Passwords do not match' 
    : form.errors.confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all fields
    if (!form.isValid || !passwordsMatch) {
      form.validateForm();
      return;
    }
    
    // Check terms agreement
    if (!form.values.agreeToTerms) {
      setNotification({ 
        type: 'error', 
        message: 'Please agree to the Terms of Service and Privacy Policy' 
      });
      return;
    }
    
    setIsLoading(true);
    setNotification(null);
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.values.name,
          email: form.values.email,
          password: form.values.password,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setNotification({ 
          type: 'success', 
          message: 'Account created successfully! Redirecting to login...' 
        });
        
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      } else {
        setNotification({ 
          type: 'error', 
          message: data.error?.message || data.error || 'Registration failed. Please try again.' 
        });
      }
    } catch (error) {
      console.error('Registration error:', error);
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
          <h1 className="text-3xl font-bold text-white mb-2">Create Account</h1>
          <p className="text-gray-400">Join the future of P2P trading</p>
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
            {/* Full Name */}
            <FormInput
              id="name"
              label="Full Name"
              type="text"
              placeholder="Enter your full name"
              value={form.values.name}
              onChange={(value) => form.setValue('name', value)}
              onBlur={() => form.setFieldTouched('name')}
              error={form.touched.name ? form.errors.name : undefined}
              success={form.touched.name && !form.errors.name && form.values.name.length > 0}
              disabled={isLoading}
              icon={<User className="w-4 h-4" />}
            />

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
            <div className="space-y-3">
              <FormInput
                id="password"
                label="Password"
                type="password"
                placeholder="Create a strong password"
                value={form.values.password}
                onChange={(value) => form.setValue('password', value)}
                onBlur={() => form.setFieldTouched('password')}
                error={form.touched.password ? form.errors.password : undefined}
                disabled={isLoading}
                icon={<Lock className="w-4 h-4" />}
                showPasswordToggle={true}
              />
              
              {/* Password Strength Indicator */}
              {form.values.password && (
                <PasswordStrength
                  password={form.values.password}
                  score={passwordStrength.score}
                  feedback={passwordFeedback}
                />
              )}
            </div>

            {/* Confirm Password */}
            <FormInput
              id="confirmPassword"
              label="Confirm Password"
              type="password"
              placeholder="Confirm your password"
              value={form.values.confirmPassword}
              onChange={(value) => form.setValue('confirmPassword', value)}
              onBlur={() => form.setFieldTouched('confirmPassword')}
              error={confirmPasswordError}
              success={form.touched.confirmPassword && !confirmPasswordError && form.values.confirmPassword.length > 0 && passwordsMatch}
              disabled={isLoading}
              icon={<Lock className="w-4 h-4" />}
              showPasswordToggle={true}
            />

            {/* Terms Agreement */}
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="terms"
                  checked={form.values.agreeToTerms}
                  onCheckedChange={(checked) => form.setValue('agreeToTerms', checked as boolean)}
                  className="mt-1 border-gray-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                />
                <label htmlFor="terms" className="text-sm text-gray-300 leading-relaxed">
                  I agree to the{' '}
                  <Link href="/legal/terms" className="text-orange-400 hover:text-orange-300 underline">
                    Terms of Service
                  </Link>
                  {' '}and{' '}
                  <Link href="/legal/privacy" className="text-orange-400 hover:text-orange-300 underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <LoadingButton
              type="submit"
              loading={isLoading}
              disabled={!form.isValid || !passwordsMatch || !form.values.agreeToTerms}
              className="w-full h-12 bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-orange-600 hover:to-yellow-600 text-white font-semibold rounded-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              Create Account
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

          {/* Login Link */}
          <div className="mt-8 text-center">
            <p className="text-gray-400">
              Already have an account?{' '}
              <Link 
                href="/login" 
                className="text-orange-400 hover:text-orange-300 font-medium transition-colors duration-200"
              >
                Sign in
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
