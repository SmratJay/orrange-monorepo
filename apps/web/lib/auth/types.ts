export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  googleId?: string;
  authProvider: 'email' | 'google';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  status: 'active' | 'suspended' | 'deleted';
}

export interface UserProfile {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  id: string;
  userId: string;
  tokenHash: string;
  deviceInfo?: Record<string, any>;
  ipAddress?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface AuthError {
  code: string;
  message: string;
  field?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User & { profile?: UserProfile };
  token?: string;
  error?: AuthError;
}

export interface PasswordStrength {
  score: number;
  feedback: string[];
  valid: boolean;
}
