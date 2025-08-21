// Production-Grade Auth Middleware for Orrange P2P API
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface AuthenticatedUser {
  id: string;
  walletAddress: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR' | 'ARBITRATOR';
  isVerified: boolean;
  kycStatus: string;
  sessionId: string;
}

export interface AuthRequest extends FastifyRequest {
  user: AuthenticatedUser;
}

interface TokenPayload {
  userId: string;
  walletAddress: string;
  sessionId: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export class AuthService {
  private prisma: PrismaClient;
  private redis: Redis;
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry = '15m'; // Short-lived access tokens
  private refreshTokenExpiry = '7d'; // Long-lived refresh tokens

  constructor(prisma: PrismaClient, redis: Redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.accessTokenSecret = process.env.JWT_ACCESS_SECRET || (() => {
      throw new Error('JWT_ACCESS_SECRET environment variable is required');
    })();
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || (() => {
      throw new Error('JWT_REFRESH_SECRET environment variable is required');
    })();
  }

  // Generate secure token pair
  async generateTokens(userId: string, walletAddress: string): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: string;
  }> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36)}`;

    const accessToken = jwt.sign(
      { 
        userId, 
        walletAddress, 
        sessionId,
        type: 'access' 
      },
      this.accessTokenSecret,
      { expiresIn: this.accessTokenExpiry }
    );

    const refreshToken = jwt.sign(
      { 
        userId, 
        walletAddress, 
        sessionId,
        type: 'refresh' 
      },
      this.refreshTokenSecret,
      { expiresIn: this.refreshTokenExpiry }
    );

    // Store session in Redis for immediate revocation capability
    await this.redis.setex(
      `session:${sessionId}`,
      7 * 24 * 60 * 60, // 7 days in seconds
      JSON.stringify({
        userId,
        walletAddress,
        createdAt: new Date().toISOString(),
        isActive: true
      })
    );

    return { accessToken, refreshToken, sessionId };
  }

  // Verify and decode access token
  async verifyAccessToken(token: string): Promise<AuthenticatedUser | null> {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as TokenPayload;
      
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      // Check if session is still active
      const sessionData = await this.redis.get(`session:${decoded.sessionId}`);
      if (!sessionData) {
        throw new Error('Session expired or revoked');
      }

      const session = JSON.parse(sessionData);
      if (!session.isActive) {
        throw new Error('Session revoked');
      }

      // Get current user data from database
      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          walletAddress: true,
          role: true,
          isVerified: true,
          kycStatus: true,
          isActive: true,
          isBlacklisted: true
        }
      });

      if (!user || !user.isActive || user.isBlacklisted) {
        // Revoke session for inactive/blacklisted users
        await this.revokeSession(decoded.sessionId);
        throw new Error('User account inactive');
      }

      return {
        id: user.id,
        walletAddress: user.walletAddress,
        role: user.role,
        isVerified: user.isVerified,
        kycStatus: user.kycStatus,
        sessionId: decoded.sessionId
      };
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  // Revoke specific session
  async revokeSession(sessionId: string): Promise<void> {
    const sessionData = await this.redis.get(`session:${sessionId}`);
    if (sessionData) {
      const session = JSON.parse(sessionData);
      session.isActive = false;
      await this.redis.set(`session:${sessionId}`, JSON.stringify(session));
    }
  }

  // Revoke all sessions for a user
  async revokeAllUserSessions(userId: string): Promise<void> {
    const keys = await this.redis.keys('session:*');
    for (const key of keys) {
      const sessionData = await this.redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        if (session.userId === userId) {
          session.isActive = false;
          await this.redis.set(key, JSON.stringify(session));
        }
      }
    }
  }
}

// Production-grade auth middleware
export function createAuthMiddleware(authService: AuthService) {
  return async function authMiddleware(
    request: AuthRequest,
    reply: FastifyReply
  ) {
    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          success: false,
          error: 'Missing or invalid authorization header'
        });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      if (!token) {
        return reply.code(401).send({
          success: false,
          error: 'No token provided'
        });
      }

      const user = await authService.verifyAccessToken(token);
      
      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Invalid or expired token'
        });
      }

      request.user = user;
      
      // Update last activity
      await authService.redis.expire(`session:${user.sessionId}`, 7 * 24 * 60 * 60);
      
    } catch (error) {
      console.error('Authentication error:', error);
      return reply.code(401).send({
        success: false,
        error: 'Authentication failed'
      });
    }
  };
}

// Optional auth middleware (for public endpoints that can benefit from user context)
export function createOptionalAuthMiddleware(authService: AuthService) {
  return async function optionalAuthMiddleware(
    request: AuthRequest,
    reply: FastifyReply
  ) {
    try {
      const authHeader = request.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const user = await authService.verifyAccessToken(token);
        
        if (user) {
          request.user = user;
          // Update last activity
          await authService.redis.expire(`session:${user.sessionId}`, 7 * 24 * 60 * 60);
        }
      }
      
      // Continue regardless of auth status
    } catch (error) {
      console.error('Optional auth error:', error);
      // Continue without auth for optional middleware
    }
  };
}
