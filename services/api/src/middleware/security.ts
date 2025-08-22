/**
 * Security Middleware - Phase 3C Implementation
 * Advanced Security & Compliance Protection
 * 
 * Features:
 * - Rate limiting with adaptive throttling
 * - Request validation & sanitization
 * - MFA enforcement for sensitive operations
 * - Real-time fraud detection integration
 * - IP-based security controls
 * - Device fingerprinting
 * - Session security validation
 * - CORS & security headers
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { SecurityService, SecurityEventType, RiskLevel } from '../services/SecurityService.js';
import { FraudDetectionService } from '../services/FraudDetectionService.js';
import { AuditService, AuditEventType, AuditSeverity } from '../services/AuditService.js';

/**
 * Rate Limiting Configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs: number;
  keyGenerator?: (request: FastifyRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

/**
 * IP Whitelist/Blacklist Configuration
 */
export interface IPControlConfig {
  whitelist?: string[];
  blacklist?: string[];
  allowPrivateNetworks?: boolean;
  allowLoopback?: boolean;
  trustedProxies?: string[];
}

/**
 * MFA Enforcement Configuration
 */
export interface MFAConfig {
  enforceForSensitiveOperations: boolean;
  sensitiveEndpoints: string[];
  excludeEndpoints: string[];
  gracePeriodMs: number;
}

/**
 * Device Fingerprinting Configuration
 */
export interface DeviceFingerprintConfig {
  enabled: boolean;
  requireFingerprint: boolean;
  maxDevicesPerUser: number;
  blockUnknownDevices: boolean;
}

/**
 * Security Headers Configuration
 */
export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string;
  strictTransportSecurity?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

/**
 * Main Security Middleware Class
 */
export class SecurityMiddleware {
  private rateLimitStore = new Map<string, { count: number; resetTime: number; blocked?: number }>();
  private ipControlStore = new Set<string>();
  private deviceStore = new Map<string, Set<string>>();

  constructor(
    private securityService: SecurityService,
    private fraudDetectionService: FraudDetectionService,
    private auditService: AuditService,
    private config: {
      rateLimit: RateLimitConfig;
      ipControl: IPControlConfig;
      mfa: MFAConfig;
      deviceFingerprint: DeviceFingerprintConfig;
      securityHeaders: SecurityHeadersConfig;
    }
  ) {
    console.log('🛡️  Initializing Phase 3C Security Middleware...');
    this.startCleanupTimer();
  }

  /**
   * Rate Limiting Middleware
   */
  rateLimitMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();
      
      try {
        const key = this.config.rateLimit.keyGenerator 
          ? this.config.rateLimit.keyGenerator(request)
          : `${request.ip}:${request.routerPath}`;

        const now = Date.now();
        const windowStart = now - this.config.rateLimit.windowMs;
        
        let rateData = this.rateLimitStore.get(key);
        
        // Initialize or reset if window expired
        if (!rateData || rateData.resetTime <= now) {
          rateData = {
            count: 0,
            resetTime: now + this.config.rateLimit.windowMs
          };
        }

        // Check if currently blocked
        if (rateData.blocked && rateData.blocked > now) {
          const remainingTime = Math.ceil((rateData.blocked - now) / 1000);
          
          await this.auditService.logAuditEvent({
            eventType: AuditEventType.SECURITY_ALERT,
            severity: AuditSeverity.WARNING,
            userId: request.user?.id,
            sessionId: request.headers['x-session-id'] as string,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            resource: request.routerPath,
            action: 'rate-limit-blocked',
            details: { remainingTime, attempts: rateData.count }
          });

          return reply.status(429).send({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter: remainingTime,
            code: 'RATE_LIMITED'
          });
        }

        // Increment counter
        rateData.count++;
        
        // Check if limit exceeded
        if (rateData.count > this.config.rateLimit.maxRequests) {
          rateData.blocked = now + this.config.rateLimit.blockDurationMs;
          
          await this.auditService.logAuditEvent({
            eventType: AuditEventType.SECURITY_ALERT,
            severity: AuditSeverity.WARNING,
            userId: request.user?.id,
            sessionId: request.headers['x-session-id'] as string,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            resource: request.routerPath,
            action: 'rate-limit-exceeded',
            details: { attempts: rateData.count, blockDuration: this.config.rateLimit.blockDurationMs }
          });

          const blockDuration = Math.ceil(this.config.rateLimit.blockDurationMs / 1000);
          return reply.status(429).send({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter: blockDuration,
            code: 'RATE_LIMITED'
          });
        }

        this.rateLimitStore.set(key, rateData);

        // Add rate limit headers
        const remaining = Math.max(0, this.config.rateLimit.maxRequests - rateData.count);
        const resetTime = Math.ceil(rateData.resetTime / 1000);

        reply.header('X-RateLimit-Limit', this.config.rateLimit.maxRequests);
        reply.header('X-RateLimit-Remaining', remaining);
        reply.header('X-RateLimit-Reset', resetTime);

      } catch (error: any) {
        console.error('Rate limiting error:', error);
        // Continue processing on middleware error
      }
    };
  }

  /**
   * IP Control Middleware
   */
  ipControlMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const clientIp = this.getClientIP(request);
        
        // Check blacklist
        if (this.config.ipControl.blacklist?.includes(clientIp) || this.ipControlStore.has(`blacklist:${clientIp}`)) {
          await this.auditService.logAuditEvent({
            eventType: AuditEventType.SECURITY_ALERT,
            severity: AuditSeverity.CRITICAL,
            userId: request.user?.id,
            sessionId: request.headers['x-session-id'] as string,
            ipAddress: clientIp,
            userAgent: request.headers['user-agent'],
            resource: request.routerPath,
            action: 'ip-blacklisted',
            details: { clientIp }
          });

          return reply.status(403).send({
            success: false,
            error: 'Access denied',
            code: 'IP_BLACKLISTED'
          });
        }

        // Check whitelist (if configured)
        if (this.config.ipControl.whitelist && this.config.ipControl.whitelist.length > 0) {
          const isWhitelisted = this.config.ipControl.whitelist.includes(clientIp) ||
                               this.isPrivateIP(clientIp) && this.config.ipControl.allowPrivateNetworks ||
                               this.isLoopbackIP(clientIp) && this.config.ipControl.allowLoopback;

          if (!isWhitelisted) {
            await this.auditService.logAuditEvent({
              eventType: AuditEventType.SECURITY_ALERT,
              severity: AuditSeverity.WARNING,
              userId: request.user?.id,
              sessionId: request.headers['x-session-id'] as string,
              ipAddress: clientIp,
              userAgent: request.headers['user-agent'],
              resource: request.routerPath,
              action: 'ip-not-whitelisted',
              details: { clientIp }
            });

            return reply.status(403).send({
              success: false,
              error: 'Access denied',
              code: 'IP_NOT_WHITELISTED'
            });
          }
        }

      } catch (error: any) {
        console.error('IP control error:', error);
        // Continue processing on middleware error
      }
    };
  }

  /**
   * MFA Enforcement Middleware
   */
  mfaEnforcementMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!this.config.mfa.enforceForSensitiveOperations) {
          return; // MFA not required
        }

        const user = request.user as any;
        if (!user) {
          return; // Not authenticated
        }

        const endpoint = request.routerPath;
        const isExcluded = this.config.mfa.excludeEndpoints.some(pattern => 
          new RegExp(pattern).test(endpoint)
        );

        if (isExcluded) {
          return; // Endpoint excluded from MFA
        }

        const isSensitive = this.config.mfa.sensitiveEndpoints.some(pattern =>
          new RegExp(pattern).test(endpoint)
        );

        if (!isSensitive) {
          return; // Not a sensitive endpoint
        }

        // Check if MFA is enabled and verified
        const mfaToken = request.headers['x-mfa-token'] as string;
        if (!mfaToken) {
          return reply.status(403).send({
            success: false,
            error: 'MFA token required for sensitive operations',
            code: 'MFA_REQUIRED'
          });
        }

        // Verify MFA token
        const isValidMFA = await this.securityService.verifyTOTP(user.id, mfaToken);
        if (!isValidMFA) {
          await this.auditService.logAuditEvent({
            eventType: AuditEventType.MFA_FAILED,
            severity: AuditSeverity.WARNING,
            userId: user.id,
            sessionId: request.headers['x-session-id'] as string,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            resource: endpoint,
            action: 'mfa-verification-failed',
            details: { endpoint }
          });

          return reply.status(403).send({
            success: false,
            error: 'Invalid MFA token',
            code: 'INVALID_MFA'
          });
        }

      } catch (error: any) {
        console.error('MFA enforcement error:', error);
        return reply.status(500).send({
          success: false,
          error: 'MFA verification failed',
          code: 'MFA_ERROR'
        });
      }
    };
  }

  /**
   * Device Fingerprinting Middleware
   */
  deviceFingerprintMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!this.config.deviceFingerprint.enabled) {
          return;
        }

        const user = request.user as any;
        if (!user) {
          return; // Not authenticated
        }

        const deviceFingerprint = this.generateDeviceFingerprint(request);
        const userId = user.id;

        // Get user's registered devices
        let userDevices = this.deviceStore.get(userId);
        if (!userDevices) {
          userDevices = new Set();
          this.deviceStore.set(userId, userDevices);
        }

        // Check if device is known
        const isKnownDevice = userDevices.has(deviceFingerprint);

        if (!isKnownDevice) {
          if (this.config.deviceFingerprint.blockUnknownDevices) {
            await this.auditService.logAuditEvent({
              eventType: AuditEventType.SECURITY_ALERT,
              severity: AuditSeverity.WARNING,
              userId: user.id,
              sessionId: request.headers['x-session-id'] as string,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
              resource: request.routerPath,
              action: 'unknown-device-blocked',
              details: { deviceFingerprint }
            });

            return reply.status(403).send({
              success: false,
              error: 'Unknown device detected. Please verify your identity.',
              code: 'UNKNOWN_DEVICE'
            });
          }

          // Check device limit
          if (userDevices.size >= this.config.deviceFingerprint.maxDevicesPerUser) {
            await this.auditService.logAuditEvent({
              eventType: AuditEventType.SECURITY_ALERT,
              severity: AuditSeverity.WARNING,
              userId: user.id,
              sessionId: request.headers['x-session-id'] as string,
              ipAddress: request.ip,
              userAgent: request.headers['user-agent'],
              resource: request.routerPath,
              action: 'device-limit-exceeded',
              details: { deviceCount: userDevices.size, deviceFingerprint }
            });

            return reply.status(403).send({
              success: false,
              error: 'Device limit exceeded. Please remove old devices.',
              code: 'DEVICE_LIMIT_EXCEEDED'
            });
          }

          // Register new device
          userDevices.add(deviceFingerprint);
          
          await this.auditService.logAuditEvent({
            eventType: AuditEventType.DEVICE_REGISTERED,
            severity: AuditSeverity.INFO,
            userId: user.id,
            sessionId: request.headers['x-session-id'] as string,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            resource: request.routerPath,
            action: 'new-device-registered',
            details: { deviceFingerprint }
          });
        }

        // Add device fingerprint to request
        (request as any).deviceFingerprint = deviceFingerprint;

      } catch (error: any) {
        console.error('Device fingerprinting error:', error);
      }
    };
  }

  /**
   * Fraud Detection Middleware
   */
  fraudDetectionMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as any;
        if (!user) {
          return; // Not authenticated
        }

        // Skip fraud detection for safe operations
        if (request.method === 'GET' && !request.routerPath.includes('withdraw')) {
          return;
        }

        // Prepare transaction data for analysis
        const transactionData = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: user.id,
          timestamp: new Date(),
          amount: this.extractAmount(request.body),
          tradingPair: this.extractTradingPair(request.body),
          orderType: this.extractOrderType(request.body),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          deviceFingerprint: (request as any).deviceFingerprint,
          location: await this.getLocationFromIP(request.ip)
        };

        // Analyze for fraud
        const fraudAnalysis = await this.fraudDetectionService.analyzeFraud(transactionData);

        // Handle high-risk transactions
        if (fraudAnalysis.riskLevel === 'HIGH' || fraudAnalysis.riskLevel === 'CRITICAL') {
          await this.auditService.logAuditEvent({
            eventType: AuditEventType.FRAUD_DETECTED,
            severity: fraudAnalysis.riskLevel === 'CRITICAL' ? AuditSeverity.CRITICAL : AuditSeverity.WARNING,
            userId: user.id,
            sessionId: request.headers['x-session-id'] as string,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            resource: request.routerPath,
            action: 'fraud-risk-detected',
            details: {
              riskScore: fraudAnalysis.riskScore,
              riskLevel: fraudAnalysis.riskLevel,
              fraudTypes: fraudAnalysis.fraudTypes,
              recommendations: fraudAnalysis.recommendations
            }
          });

          if (fraudAnalysis.riskLevel === 'CRITICAL') {
            return reply.status(403).send({
              success: false,
              error: 'Transaction blocked due to security concerns. Please contact support.',
              code: 'FRAUD_DETECTED',
              riskScore: fraudAnalysis.riskScore
            });
          }

          // Add fraud warning headers for HIGH risk
          reply.header('X-Fraud-Warning', 'true');
          reply.header('X-Risk-Score', fraudAnalysis.riskScore.toString());
        }

        // Add fraud analysis to request context
        (request as any).fraudAnalysis = fraudAnalysis;

      } catch (error: any) {
        console.error('Fraud detection error:', error);
        // Continue processing on error
      }
    };
  }

  /**
   * Security Headers Middleware
   */
  securityHeadersMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const headers = this.config.securityHeaders;

      // Set security headers
      if (headers.contentSecurityPolicy) {
        reply.header('Content-Security-Policy', headers.contentSecurityPolicy);
      }

      if (headers.strictTransportSecurity) {
        reply.header('Strict-Transport-Security', headers.strictTransportSecurity);
      }

      if (headers.xFrameOptions) {
        reply.header('X-Frame-Options', headers.xFrameOptions);
      }

      if (headers.xContentTypeOptions) {
        reply.header('X-Content-Type-Options', headers.xContentTypeOptions);
      }

      if (headers.referrerPolicy) {
        reply.header('Referrer-Policy', headers.referrerPolicy);
      }

      if (headers.permissionsPolicy) {
        reply.header('Permissions-Policy', headers.permissionsPolicy);
      }

      // Add standard security headers
      reply.header('X-Powered-By', ''); // Remove server information
      reply.header('X-DNS-Prefetch-Control', 'off');
      reply.header('X-Download-Options', 'noopen');
      reply.header('X-Permitted-Cross-Domain-Policies', 'none');
    };
  }

  /**
   * Session Security Validation
   */
  sessionSecurityMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user as any;
        if (!user) {
          return; // Not authenticated
        }

        const sessionId = request.headers['x-session-id'] as string;
        if (!sessionId) {
          return; // No session ID provided
        }

        // Validate session security
        const sessionValid = await this.securityService.validateSessionSecurity(sessionId, {
          userId: user.id,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          deviceFingerprint: (request as any).deviceFingerprint
        });

        if (!sessionValid) {
          await this.auditService.logAuditEvent({
            eventType: AuditEventType.SESSION_HIJACKED,
            severity: AuditSeverity.CRITICAL,
            userId: user.id,
            sessionId: sessionId,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            resource: request.routerPath,
            action: 'session-security-violation',
            details: { reason: 'Session validation failed' }
          });

          return reply.status(403).send({
            success: false,
            error: 'Session security validation failed',
            code: 'INVALID_SESSION'
          });
        }

      } catch (error: any) {
        console.error('Session security error:', error);
        return reply.status(500).send({
          success: false,
          error: 'Session validation error',
          code: 'SESSION_ERROR'
        });
      }
    };
  }

  // ===================
  // UTILITY METHODS
  // ===================

  private getClientIP(request: FastifyRequest): string {
    const forwarded = request.headers['x-forwarded-for'];
    const realIp = request.headers['x-real-ip'];
    
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    
    if (typeof realIp === 'string') {
      return realIp.trim();
    }

    return request.ip;
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./
    ];
    return privateRanges.some(range => range.test(ip));
  }

  private isLoopbackIP(ip: string): boolean {
    return ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.');
  }

  private generateDeviceFingerprint(request: FastifyRequest): string {
    const components = [
      request.headers['user-agent'] || '',
      request.headers['accept-language'] || '',
      request.headers['accept-encoding'] || '',
      request.ip
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 32);
  }

  private extractAmount(body: any): number {
    if (!body) return 0;
    
    const amount = body.amount || body.value || body.quantity || 0;
    return typeof amount === 'string' ? parseFloat(amount) : amount;
  }

  private extractTradingPair(body: any): string {
    if (!body) return 'UNKNOWN';
    
    return body.tradingPair || body.pair || body.symbol || 'UNKNOWN';
  }

  private extractOrderType(body: any): string {
    if (!body) return 'UNKNOWN';
    
    return body.orderType || body.type || body.action || 'UNKNOWN';
  }

  private async getLocationFromIP(ip: string): Promise<any> {
    // Placeholder for IP geolocation
    return {
      country: 'Unknown',
      region: 'Unknown',
      city: 'Unknown'
    };
  }

  private startCleanupTimer() {
    // Clean up expired rate limit entries every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.rateLimitStore.entries()) {
        if (data.resetTime <= now && (!data.blocked || data.blocked <= now)) {
          this.rateLimitStore.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }
}

/**
 * Security Middleware Factory
 */
export function createSecurityMiddleware(
  securityService: SecurityService,
  fraudDetectionService: FraudDetectionService,
  auditService: AuditService,
  options: {
    rateLimit?: Partial<RateLimitConfig>;
    ipControl?: Partial<IPControlConfig>;
    mfa?: Partial<MFAConfig>;
    deviceFingerprint?: Partial<DeviceFingerprintConfig>;
    securityHeaders?: Partial<SecurityHeadersConfig>;
  } = {}
): SecurityMiddleware {
  
  const defaultConfig = {
    rateLimit: {
      maxRequests: 100,
      windowMs: 15 * 60 * 1000, // 15 minutes
      blockDurationMs: 60 * 1000, // 1 minute
      keyGenerator: (req: FastifyRequest) => `${req.ip}:${req.routerPath}`,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...options.rateLimit
    },
    ipControl: {
      whitelist: [],
      blacklist: [],
      allowPrivateNetworks: true,
      allowLoopback: true,
      trustedProxies: [],
      ...options.ipControl
    },
    mfa: {
      enforceForSensitiveOperations: true,
      sensitiveEndpoints: [
        '/api/v1/trading/orders/create',
        '/api/v1/wallet/withdraw',
        '/api/v1/user/settings/security',
        '/api/v1/security/.*'
      ],
      excludeEndpoints: [
        '/api/v1/security/mfa/.*',
        '/api/v1/auth/.*',
        '/health'
      ],
      gracePeriodMs: 5 * 60 * 1000, // 5 minutes
      ...options.mfa
    },
    deviceFingerprint: {
      enabled: true,
      requireFingerprint: false,
      maxDevicesPerUser: 5,
      blockUnknownDevices: false,
      ...options.deviceFingerprint
    },
    securityHeaders: {
      contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: 'geolocation=(), microphone=(), camera=()',
      ...options.securityHeaders
    }
  };

  return new SecurityMiddleware(
    securityService,
    fraudDetectionService,
    auditService,
    defaultConfig
  );
}

/**
 * Register Security Middleware with Fastify
 */
export function registerSecurityMiddleware(
  fastify: FastifyInstance,
  securityMiddleware: SecurityMiddleware,
  options: {
    enableRateLimit?: boolean;
    enableIPControl?: boolean;
    enableMFA?: boolean;
    enableDeviceFingerprint?: boolean;
    enableFraudDetection?: boolean;
    enableSecurityHeaders?: boolean;
    enableSessionSecurity?: boolean;
  } = {}
) {
  console.log('🛡️  Registering security middleware...');

  const config = {
    enableRateLimit: true,
    enableIPControl: false,
    enableMFA: true,
    enableDeviceFingerprint: true,
    enableFraudDetection: true,
    enableSecurityHeaders: true,
    enableSessionSecurity: true,
    ...options
  };

  // Security headers (first)
  if (config.enableSecurityHeaders) {
    fastify.addHook('onRequest', securityMiddleware.securityHeadersMiddleware());
  }

  // Rate limiting (second)
  if (config.enableRateLimit) {
    fastify.addHook('onRequest', securityMiddleware.rateLimitMiddleware());
  }

  // IP control (third)
  if (config.enableIPControl) {
    fastify.addHook('onRequest', securityMiddleware.ipControlMiddleware());
  }

  // Device fingerprinting (after authentication)
  if (config.enableDeviceFingerprint) {
    fastify.addHook('preHandler', securityMiddleware.deviceFingerprintMiddleware());
  }

  // Session security validation (after authentication)
  if (config.enableSessionSecurity) {
    fastify.addHook('preHandler', securityMiddleware.sessionSecurityMiddleware());
  }

  // MFA enforcement (after authentication)
  if (config.enableMFA) {
    fastify.addHook('preHandler', securityMiddleware.mfaEnforcementMiddleware());
  }

  // Fraud detection (last, after all security checks)
  if (config.enableFraudDetection) {
    fastify.addHook('preHandler', securityMiddleware.fraudDetectionMiddleware());
  }

  console.log('✅ Security middleware registered successfully');
}
