import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

interface AuthenticatedUser {
  userId: string;
  walletAddress: string;
  roles: string[];
  riskLevel: string;
  requires2FA: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Enhanced security middleware with JWT authentication and 2FA support
 */
export async function securityMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Skip auth for public endpoints
    const publicEndpoints = [
      '/health',
      '/api/auth/connect',
      '/api/auth/message',
      '/api/auth/refresh',
      '/api/auth/verify-2fa',
    ];

    const isPublicEndpoint = publicEndpoints.some(endpoint => 
      request.url.startsWith(endpoint)
    );

    if (isPublicEndpoint) {
      return;
    }

    // Extract JWT token
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: 'Authorization token required',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const jwtSecret = process.env.JWT_SECRET || 'secure-secret-key';
    let decodedToken: any;

    try {
      decodedToken = jwt.verify(token, jwtSecret);
    } catch (jwtError) {
      return reply.status(401).send({
        success: false,
        error: 'Invalid or expired token',
      });
    }

    // Attach user info to request
    request.user = {
      userId: decodedToken.userId,
      walletAddress: decodedToken.walletAddress,
      roles: decodedToken.roles || ['USER'],
      riskLevel: decodedToken.riskLevel || 'MEDIUM',
      requires2FA: decodedToken.requires2FA || false,
    };

    // Check 2FA requirement for sensitive operations
    const sensitive2FAEndpoints = [
      '/api/escrow/',
      '/api/auth/setup-2fa',
      '/api/trades/',
    ];

    const requiresTwoFAVerification = sensitive2FAEndpoints.some(endpoint => 
      request.url.includes(endpoint) && 
      ['POST', 'PUT', 'DELETE'].includes(request.method)
    );

    if (requiresTwoFAVerification && request.user.requires2FA) {
      const twoFAToken = request.headers['x-2fa-token'] as string;
      
      if (!twoFAToken) {
        return reply.status(403).send({
          success: false,
          error: '2FA token required for this operation',
          requires2FA: true,
        });
      }

      // Validate 2FA token format
      if (!/^\d{6}$/.test(twoFAToken)) {
        return reply.status(403).send({
          success: false,
          error: 'Invalid 2FA token format',
        });
      }
    }

    // Risk-based access control
    await performRiskAssessment(request, reply);

    // Audit logging for sensitive operations
    if (requiresTwoFAVerification || request.url.includes('/api/escrow/')) {
      await logSecurityAudit(request);
    }

  } catch (error: any) {
    request.log.error('Security middleware error:', error);
    return reply.status(500).send({
      success: false,
      error: 'Security validation failed',
    });
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(requiredRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = request.user;
    
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: 'Authentication required',
      });
    }

    const hasRequiredRole = requiredRoles.some(role => 
      user.roles.includes(role)
    );

    if (!hasRequiredRole) {
      await logSecurityAudit(request, 'UNAUTHORIZED_ACCESS_ATTEMPT');
      
      return reply.status(403).send({
        success: false,
        error: 'Insufficient permissions',
      });
    }
  };
}

/**
 * Enhanced request risk assessment
 */
async function performRiskAssessment(
  request: FastifyRequest, 
  reply: FastifyReply
): Promise<void> {
  const user = request.user!;
  let riskScore = 0;

  // Factor 1: User risk level
  const riskMultipliers = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    BLACKLISTED: 100,
  };
  riskScore += riskMultipliers[user.riskLevel as keyof typeof riskMultipliers] || 2;

  // Factor 2: Request frequency (mock implementation)
  const userRequests = await getUserRequestFrequency(user.userId);
  if (userRequests > 100) riskScore += 10; // High frequency user

  // Factor 3: Unusual request patterns
  const isUnusualTime = isOffHours();
  if (isUnusualTime) riskScore += 5;

  // Factor 4: Large transaction amounts
  if (request.body && typeof request.body === 'object') {
    const body = request.body as any;
    const amount = parseFloat(body.amount || '0');
    if (amount > 10000) riskScore += 15; // Large amount
    if (amount > 50000) riskScore += 25; // Very large amount
  }

  // Block high-risk requests
  if (riskScore > 50) {
    await logSecurityAudit(request, 'HIGH_RISK_REQUEST_BLOCKED', { riskScore });
    
    return reply.status(429).send({
      success: false,
      error: 'Request blocked due to high risk assessment',
      riskScore,
    });
  }

  // Flag medium-risk requests for enhanced monitoring
  if (riskScore > 25) {
    await logSecurityAudit(request, 'MEDIUM_RISK_REQUEST_FLAGGED', { riskScore });
  }
}

/**
 * Rate limiting helper (mock implementation)
 */
function getUserRequestFrequency(userId: string): Promise<number> {
  return Promise.resolve(Math.floor(Math.random() * 150));
}

/**
 * Check if request is during off-hours
 */
function isOffHours(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour > 22; // Before 6 AM or after 10 PM
}

/**
 * Security audit logging
 */
async function logSecurityAudit(
  request: FastifyRequest, 
  event: string = 'API_REQUEST',
  additionalData: any = {}
): Promise<void> {
  try {
    const auditEntry = {
      timestamp: new Date().toISOString(),
      event,
      userId: request.user?.userId,
      walletAddress: request.user?.walletAddress,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      method: request.method,
      url: request.url,
      riskLevel: request.user?.riskLevel,
      ...additionalData,
    };

    // In production, this would write to a secure audit log
    request.log.info('Security audit:', auditEntry);

    // For high-severity events, trigger real-time alerts
    const highSeverityEvents = [
      'HIGH_RISK_REQUEST_BLOCKED',
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      'SUSPICIOUS_ACTIVITY_DETECTED',
    ];

    if (highSeverityEvents.includes(event)) {
      console.warn('🚨 SECURITY ALERT:', auditEntry);
    }

  } catch (error) {
    request.log.error('Audit logging failed:', error);
  }
}

/**
 * Wallet signature verification
 */
export function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signature: string
): boolean {
  try {
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
  } catch (error) {
    return false;
  }
}

/**
 * Password hashing utilities
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  return await bcrypt.hash(password, saltRounds);
}

export async function verifyPassword(
  password: string, 
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * 2FA utilities
 */
export function generate2FASecret(): { secret: string; qrCode: string } {
  const secret = speakeasy.generateSecret({
    name: 'Orrange P2P',
    issuer: 'Orrange P2P Trading Platform',
  });

  return {
    secret: secret.base32!,
    qrCode: secret.otpauth_url!,
  };
}

export function verify2FAToken(token: string, secret: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2, // Allow 2 time steps of drift
  });
}
