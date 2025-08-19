import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { ethers } from 'ethers';

// Security configuration
const SECURITY_CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-super-secure-secret-key',
  JWT_EXPIRES_IN: '24h',
  BCRYPT_ROUNDS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  REQUIRE_2FA_FOR_HIGH_VALUE: 10000, // USD
  SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 hours
};

interface AuthenticatedUser {
  id: string;
  walletAddress: string;
  roles: string[];
  riskScore: number;
  twoFactorEnabled: boolean;
  kycStatus: string;
  sessionId: string;
}

/**
 * JWT-based authentication middleware
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        success: false,
        error: 'Missing or invalid authorization header',
        code: 'UNAUTHORIZED',
      });
    }

    const token = authHeader.substring(7);
    
    let decoded: any;
    try {
      decoded = jwt.verify(token, SECURITY_CONFIG.JWT_SECRET);
    } catch (jwtError) {
      await logSecurityEvent(request, 'INVALID_JWT_TOKEN', 'WARN', {
        token: token.substring(0, 10) + '...',
        error: jwtError instanceof Error ? jwtError.message : 'Unknown JWT error',
      });

      return reply.code(401).send({
        success: false,
        error: 'Invalid or expired token',
        code: 'TOKEN_INVALID',
      });
    }

    // Get user from database
    const user = await (request.server as any).prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        walletAddress: true,
        riskScore: true,
        twoFactorEnabled: true,
        kycStatus: true,
        isActive: true,
        isBlacklisted: true,
        lockedUntil: true,
        lastActivity: true,
      },
    });

    if (!user) {
      return reply.code(401).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    if (!user.isActive || user.isBlacklisted) {
      await logSecurityEvent(request, 'BLOCKED_USER_ACCESS_ATTEMPT', 'WARN', {
        userId: user.id,
        isActive: user.isActive,
        isBlacklisted: user.isBlacklisted,
      });

      return reply.code(403).send({
        success: false,
        error: 'Account is suspended or blacklisted',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    if (user.lockedUntil && new Date() < user.lockedUntil) {
      return reply.code(423).send({
        success: false,
        error: 'Account is temporarily locked',
        code: 'ACCOUNT_LOCKED',
        unlockAt: user.lockedUntil.toISOString(),
      });
    }

    // Check session timeout
    if (user.lastActivity && 
        Date.now() - user.lastActivity.getTime() > SECURITY_CONFIG.SESSION_TIMEOUT) {
      return reply.code(401).send({
        success: false,
        error: 'Session has expired',
        code: 'SESSION_EXPIRED',
      });
    }

    // Update last activity
    await (request.server as any).prisma.user.update({
      where: { id: user.id },
      data: { lastActivity: new Date() },
    });

    // Attach user to request
    (request as any).user = {
      id: user.id,
      walletAddress: user.walletAddress,
      roles: decoded.roles || [],
      riskScore: user.riskScore,
      twoFactorEnabled: user.twoFactorEnabled,
      kycStatus: user.kycStatus,
      sessionId: decoded.sessionId,
    } as AuthenticatedUser;

  } catch (error) {
    request.server.log.error('Authentication error:', error);
    
    return reply.code(500).send({
      success: false,
      error: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR',
    });
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(allowedRoles: string[]) {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user as AuthenticatedUser;
    
    if (!user) {
      return reply.code(401).send({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED',
      });
    }

    const hasRole = allowedRoles.some(role => user.roles.includes(role));
    
    if (!hasRole) {
      await logSecurityEvent(request, 'INSUFFICIENT_PERMISSIONS', 'WARN', {
        userId: user.id,
        requiredRoles: allowedRoles,
        userRoles: user.roles,
      });

      return reply.code(403).send({
        success: false,
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }
  };
}

/**
 * Two-factor authentication middleware for high-value operations
 */
export function require2FA(minAmount: number = SECURITY_CONFIG.REQUIRE_2FA_FOR_HIGH_VALUE) {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    const user = (request as any).user as AuthenticatedUser;
    const body = request.body as any;
    
    // Check if 2FA is required based on amount or risk score
    const amount = parseFloat(body.amount || '0');
    const requiresFor2FA = amount >= minAmount || user.riskScore > 70;
    
    if (requiresFor2FA && user.twoFactorEnabled) {
      const twoFactorCode = request.headers['x-2fa-code'] as string;
      
      if (!twoFactorCode) {
        return reply.code(428).send({
          success: false,
          error: 'Two-factor authentication required',
          code: 'TWO_FACTOR_REQUIRED',
        });
      }

      // Verify 2FA code
      const userSecret = await (request.server as any).prisma.user.findUnique({
        where: { id: user.id },
        select: { twoFactorSecret: true },
      });

      if (!userSecret?.twoFactorSecret) {
        return reply.code(500).send({
          success: false,
          error: '2FA not properly configured',
          code: 'TWO_FACTOR_CONFIG_ERROR',
        });
      }

      const isValidToken = speakeasy.totp.verify({
        secret: userSecret.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2, // Allow 2 time steps before/after
      });

      if (!isValidToken) {
        await logSecurityEvent(request, 'INVALID_TWO_FACTOR_CODE', 'WARN', {
          userId: user.id,
        });

        return reply.code(401).send({
          success: false,
          error: 'Invalid two-factor authentication code',
          code: 'INVALID_TWO_FACTOR_CODE',
        });
      }
    }
  };
}

/**
 * Request validation middleware
 */
export function validateRequest(schema: z.ZodSchema<any>) {
  return async function(request: FastifyRequest, reply: FastifyReply) {
    try {
      schema.parse(request.body);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request data',
          code: 'VALIDATION_ERROR',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      
      throw error;
    }
  };
}

/**
 * IP-based rate limiting middleware
 */
export function rateLimit(options: {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
}) {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return async function(request: FastifyRequest, reply: FastifyReply) {
    const ip = request.ip;
    const now = Date.now();
    
    // Clean expired entries
    for (const [key, value] of requests.entries()) {
      if (now > value.resetTime) {
        requests.delete(key);
      }
    }
    
    const current = requests.get(ip) || { count: 0, resetTime: now + options.windowMs };
    
    if (current.count >= options.maxRequests) {
      await logSecurityEvent(request, 'RATE_LIMIT_EXCEEDED', 'WARN', {
        ip,
        requests: current.count,
        windowMs: options.windowMs,
      });

      return reply.code(429).send({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((current.resetTime - now) / 1000),
      });
    }
    
    current.count++;
    requests.set(ip, current);
  };
}

/**
 * Wallet signature verification
 */
export async function verifyWalletSignature(
  address: string,
  message: string,
  signature: string
): Promise<boolean> {
  try {
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Create audit log entry
 */
export async function createAuditLog(
  prisma: PrismaClient,
  data: {
    userId?: string;
    action: string;
    resource: string;
    resourceId: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    oldValues?: any;
    newValues?: any;
    riskScore?: number;
    flags?: string[];
    severity?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
    metadata?: any;
  }
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        ipAddress: data.ipAddress || 'unknown',
        userAgent: data.userAgent || null,
        sessionId: data.sessionId || null,
        oldValues: data.oldValues || null,
        newValues: data.newValues || null,
        riskScore: data.riskScore || null,
        flags: data.flags || [],
        severity: data.severity || 'INFO',
        metadata: data.metadata || null,
      },
    });
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break the main flow
  }
}

/**
 * Log security events
 */
async function logSecurityEvent(
  request: FastifyRequest,
  eventType: string,
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL',
  metadata: any = {}
) {
  const user = (request as any).user;
  
  try {
    await createAuditLog((request.server as any).prisma, {
      userId: user?.id,
      action: eventType,
      resource: 'SECURITY',
      resourceId: 'SYSTEM',
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
      sessionId: user?.sessionId,
      severity,
      metadata,
    });
  } catch (error) {
    request.server.log.error('Failed to log security event:', error);
  }
}

/**
 * Hash password securely
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SECURITY_CONFIG.BCRYPT_ROUNDS);
}

/**
 * Verify password
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
export function generateJWT(payload: {
  userId: string;
  walletAddress: string;
  roles: string[];
  sessionId: string;
}): string {
  return jwt.sign(payload, SECURITY_CONFIG.JWT_SECRET, {
    expiresIn: SECURITY_CONFIG.JWT_EXPIRES_IN,
    issuer: 'orrange-p2p',
    audience: 'orrange-users',
  });
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomArray = new Uint8Array(length);
  crypto.getRandomValues(randomArray);
  
  for (let i = 0; i < length; i++) {
    result += chars[randomArray[i] % chars.length];
  }
  
  return result;
}

/**
 * Risk assessment for requests
 */
export async function assessRequestRisk(
  request: FastifyRequest,
  prisma: PrismaClient
): Promise<{
  score: number;
  factors: string[];
  blockRequest: boolean;
}> {
  const factors: string[] = [];
  let score = 0;
  
  const ip = request.ip;
  const userAgent = request.headers['user-agent'] || '';
  const user = (request as any).user;
  
  // Check for suspicious IP patterns
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip === '127.0.0.1') {
    // Local IPs might be proxies/VPNs
    score += 10;
    factors.push('INTERNAL_IP');
  }
  
  // Check user agent
  if (!userAgent || userAgent.length < 50) {
    score += 15;
    factors.push('SUSPICIOUS_USER_AGENT');
  }
  
  // Check request timing patterns
  if (user) {
    const recentRequests = await prisma.auditLog.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // Last 5 minutes
      },
    });
    
    if (recentRequests > 20) {
      score += 25;
      factors.push('HIGH_REQUEST_FREQUENCY');
    }
  }
  
  // Check for known attack patterns
  const body = JSON.stringify(request.body || {});
  const suspiciousPatterns = [
    /script/gi,
    /javascript/gi,
    /eval\(/gi,
    /document\./gi,
    /window\./gi,
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(body)) {
      score += 50;
      factors.push('SUSPICIOUS_PAYLOAD');
      break;
    }
  }
  
  return {
    score,
    factors,
    blockRequest: score > 75, // Block requests with very high risk scores
  };
}

export { SECURITY_CONFIG };
