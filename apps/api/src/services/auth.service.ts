import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '@/config';
import { prisma } from '@/config/database';
import crypto from 'crypto';

const SALT_ROUNDS = 12;

export class AuthService {
  /**
   * Hash a password using bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Compare a password with its hash
   */
  static async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access token
   */
  static generateAccessToken(payload: { userId: string; email: string }): string {
    return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN,
      issuer: 'orrange-api',
      audience: 'orrange-client',
    });
  }

  /**
   * Generate JWT refresh token
   */
  static generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN,
      issuer: 'orrange-api',
      audience: 'orrange-client',
    });
  }

  /**
   * Verify JWT access token
   */
  static verifyAccessToken(token: string): { userId: string; email: string } | null {
    try {
      const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET, {
        issuer: 'orrange-api',
        audience: 'orrange-client',
      }) as any;
      
      return { userId: decoded.userId, email: decoded.email };
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify JWT refresh token
   */
  static verifyRefreshToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET, {
        issuer: 'orrange-api',
        audience: 'orrange-client',
      }) as any;
      
      return { userId: decoded.userId };
    } catch (error) {
      return null;
    }
  }

  /**
   * Store refresh token in database
   */
  static async storeRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    // Clean up old refresh tokens for this user (keep only last 5)
    const existingTokens = await prisma.refreshToken.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: 4, // Keep the 5 most recent tokens
    });

    if (existingTokens.length > 0) {
      await prisma.refreshToken.deleteMany({
        where: {
          id: { in: existingTokens.map((t) => t.id) }
        }
      });
    }

    // Store new refresh token
    await prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Invalidate refresh token
   */
  static async invalidateRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token }
    });
  }

  /**
   * Validate stored refresh token
   */
  static async validateRefreshToken(token: string): Promise<boolean> {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token }
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      if (storedToken) {
        // Clean up expired token
        await prisma.refreshToken.delete({
          where: { id: storedToken.id }
        });
      }
      return false;
    }

    return true;
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Clean up expired refresh tokens (should be run periodically)
   */
  static async cleanupExpiredTokens(): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
  }
}
