import jwt from 'jsonwebtoken';
import crypto from 'crypto-js';
import { User } from '@orrange/shared/types';

export interface TokenPayload {
  userId: string;
  email: string;
  walletAddress?: string;
  role: 'USER' | 'MERCHANT' | 'ADMIN' | 'MODERATOR';
  permissions: string[];
  iat?: number;
  exp?: number;
  jti?: string; // JWT ID for revocation
}

export interface RefreshTokenPayload {
  userId: string;
  tokenFamily: string; // For rotation detection
  version: number;
}

export class JWTManager {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly issuer: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor(config: {
    accessSecret: string;
    refreshSecret: string;
    issuer: string;
    accessTokenExpiry?: string;
    refreshTokenExpiry?: string;
  }) {
    this.accessSecret = config.accessSecret;
    this.refreshSecret = config.refreshSecret;
    this.issuer = config.issuer;
    this.accessTokenExpiry = config.accessTokenExpiry || '15m';
    this.refreshTokenExpiry = config.refreshTokenExpiry || '7d';
  }

  /**
   * Generate access token with user permissions
   */
  generateAccessToken(user: Partial<User>, permissions: string[]): string {
    const payload: TokenPayload = {
      userId: user.id!,
      email: user.email!,
      walletAddress: user.walletAddress,
      role: this.getUserRole(user),
      permissions,
      jti: crypto.lib.WordArray.random(16).toString()
    };

    return jwt.sign(payload, this.accessSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: this.issuer,
      subject: user.id,
      audience: 'orrange-api'
    });
  }

  /**
   * Generate refresh token with rotation support
   */
  generateRefreshToken(userId: string, tokenFamily?: string): string {
    const payload: RefreshTokenPayload = {
      userId,
      tokenFamily: tokenFamily || crypto.lib.WordArray.random(32).toString(),
      version: Date.now()
    };

    return jwt.sign(payload, this.refreshSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: this.issuer,
      subject: userId,
      audience: 'orrange-refresh'
    });
  }

  /**
   * Verify and decode access token
   */
  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, this.accessSecret, {
        issuer: this.issuer,
        audience: 'orrange-api'
      }) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  /**
   * Verify and decode refresh token
   */
  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      return jwt.verify(token, this.refreshSecret, {
        issuer: this.issuer,
        audience: 'orrange-refresh'
      }) as RefreshTokenPayload;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractToken(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as any;
      return decoded.exp ? new Date(decoded.exp * 1000) : null;
    } catch {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    const exp = this.getTokenExpiration(token);
    return exp ? exp < new Date() : true;
  }

  private getUserRole(user: Partial<User>): 'USER' | 'MERCHANT' | 'ADMIN' | 'MODERATOR' {
    // This would be determined by your user data
    // For now, defaulting to USER
    return 'USER';
  }
}

/**
 * Token blacklist for logout/revocation
 */
export class TokenBlacklist {
  private blacklistedTokens = new Set<string>();
  private cleanupInterval: NodeJS.Timer;

  constructor(cleanupIntervalMs: number = 3600000) { // 1 hour
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  /**
   * Add token to blacklist
   */
  blacklistToken(jti: string, expirationTime: Date): void {
    this.blacklistedTokens.add(`${jti}:${expirationTime.getTime()}`);
  }

  /**
   * Check if token is blacklisted
   */
  isBlacklisted(jti: string): boolean {
    return Array.from(this.blacklistedTokens).some(token => 
      token.startsWith(`${jti}:`)
    );
  }

  /**
   * Clean up expired tokens from blacklist
   */
  private cleanup(): void {
    const now = Date.now();
    const tokensToRemove = Array.from(this.blacklistedTokens).filter(token => {
      const [, expTime] = token.split(':');
      return parseInt(expTime) < now;
    });

    tokensToRemove.forEach(token => this.blacklistedTokens.delete(token));
  }

  /**
   * Destroy cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

/**
 * Rate limiting for token operations
 */
export class TokenRateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>();

  /**
   * Check if operation is rate limited
   */
  isRateLimited(identifier: string, maxAttempts: number = 5, windowMs: number = 300000): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (record.count >= maxAttempts) {
      return true;
    }

    record.count++;
    return false;
  }

  /**
   * Reset rate limit for identifier
   */
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Get remaining attempts
   */
  getRemainingAttempts(identifier: string, maxAttempts: number = 5): number {
    const record = this.attempts.get(identifier);
    if (!record || Date.now() > record.resetTime) {
      return maxAttempts;
    }
    return Math.max(0, maxAttempts - record.count);
  }
}
