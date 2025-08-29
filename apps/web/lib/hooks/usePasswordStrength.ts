import { useState, useEffect } from 'react';

interface PasswordStrength {
  score: number;
  feedback: string[];
  color: string;
  text: string;
}

export function usePasswordStrength(password: string): PasswordStrength {
  const [strength, setStrength] = useState<PasswordStrength>({
    score: 0,
    feedback: [],
    color: 'bg-gray-600',
    text: 'Enter password'
  });

  useEffect(() => {
    if (!password) {
      setStrength({
        score: 0,
        feedback: [],
        color: 'bg-gray-600',
        text: 'Enter password'
      });
      return;
    }

    const feedback: string[] = [];
    let score = 0;

    // Length check
    if (password.length >= 8) score += 1;
    else feedback.push('At least 8 characters');

    // Uppercase check
    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('One uppercase letter');

    // Lowercase check
    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('One lowercase letter');

    // Number check
    if (/\d/.test(password)) score += 1;
    else feedback.push('One number');

    // Special character check
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
    else feedback.push('One special character');

    const getStrengthInfo = (score: number) => {
      if (score <= 1) return { color: 'bg-red-500', text: 'Very Weak' };
      if (score <= 2) return { color: 'bg-orange-500', text: 'Weak' };
      if (score <= 3) return { color: 'bg-yellow-500', text: 'Fair' };
      if (score <= 4) return { color: 'bg-blue-500', text: 'Good' };
      return { color: 'bg-green-500', text: 'Strong' };
    };

    const { color, text } = getStrengthInfo(score);

    setStrength({
      score,
      feedback,
      color,
      text
    });
  }, [password]);

  return strength;
}
