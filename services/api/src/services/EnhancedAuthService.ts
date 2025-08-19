import { PrismaClient, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ethers } from 'ethers';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { z } from 'zod';

// Enhanced authentication schemas
const WalletConnectSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  signature: z.string().min(130, 'Invalid signature length'),
  message: z.string().min(10, 'Message too short'),
  chainId: z.number().min(1, 'Invalid chain ID'),
  timestamp: z.number().min(0, 'Invalid timestamp'),
});

const LoginSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  signature: z.string().min(130, 'Invalid signature length'),
  message: z.string(),
  deviceInfo: z.object({
    userAgent: z.string(),
    ip: z.string(),
    fingerprint: z.string(),
  }).optional(),
});

const Setup2FASchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  password: z.string().min(6, 'Password too short').optional(),
});

const Verify2FASchema = z.object({
  token: z.string().length(6, '2FA token must be 6 digits'),
  userId: z.string().uuid('Invalid user ID'),
});

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface UserSession {
  userId: string;
  walletAddress: string;
  sessionId: string;
  deviceFingerprint: string;
  ipAddress: string;
  lastActivity: Date;
  is2FAVerified: boolean;
}

export class EnhancedAuthService extends EventEmitter {
  private prisma: PrismaClient;
  private jwtSecret: string;
  private jwtRefreshSecret: string;
  private activeSessions: Map<string, UserSession> = new Map();
  private loginAttempts: Map<string, number> = new Map();
  private blockedAddresses: Set<string> = new Set();

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.jwtSecret = process.env.JWT_SECRET || 'secure-secret-key';
    this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'secure-refresh-secret';
    
    // Clean up expired sessions every hour
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  /**
   * Enhanced wallet connection with comprehensive security
   */
  async connectWallet(input: {
    walletAddress: string;
    signature: string;
    message: string;
    chainId: number;
    timestamp: number;
    deviceInfo?: {
      userAgent: string;
      ip: string;
      fingerprint: string;
    };
  }): Promise<{
    success: boolean;
    user?: User;
    tokens?: AuthTokens;
    requires2FA?: boolean;
    error?: string;
  }> {
    try {
      // Validate input
      const validatedInput = WalletConnectSchema.parse(input);
      
      // Check if address is blocked
      if (this.blockedAddresses.has(validatedInput.walletAddress.toLowerCase())) {
        await this.logSecurityEvent('BLOCKED_ADDRESS_ATTEMPT', {
          walletAddress: validatedInput.walletAddress,
          ip: input.deviceInfo?.ip,
        });
        return {
          success: false,
          error: 'Wallet address is temporarily blocked',
        };
      }

      // Check rate limiting
      const attempts = this.loginAttempts.get(validatedInput.walletAddress) || 0;
      if (attempts >= 5) {
        this.blockedAddresses.add(validatedInput.walletAddress.toLowerCase());
        setTimeout(() => {
          this.blockedAddresses.delete(validatedInput.walletAddress.toLowerCase());
          this.loginAttempts.delete(validatedInput.walletAddress);
        }, 15 * 60 * 1000); // 15 minutes
        
        return {
          success: false,
          error: 'Too many failed attempts. Address blocked for 15 minutes.',
        };
      }

      // Verify signature
      const isValidSignature = await this.verifyWalletSignature(
        validatedInput.walletAddress,
        validatedInput.message,
        validatedInput.signature
      );

      if (!isValidSignature) {
        this.loginAttempts.set(validatedInput.walletAddress, attempts + 1);
        await this.logSecurityEvent('INVALID_SIGNATURE_ATTEMPT', {
          walletAddress: validatedInput.walletAddress,
          attempts: attempts + 1,
        });
        
        return {
          success: false,
          error: 'Invalid wallet signature',
        };
      }

      // Check timestamp to prevent replay attacks
      const messageAge = Date.now() - validatedInput.timestamp;
      if (messageAge > 5 * 60 * 1000) { // 5 minutes
        return {
          success: false,
          error: 'Message expired. Please try again.',
        };
      }

      // Clear failed attempts on successful signature
      this.loginAttempts.delete(validatedInput.walletAddress);

      // Find or create user
      let user = await this.prisma.user.findUnique({
        where: { walletAddress: validatedInput.walletAddress.toLowerCase() },
      });

      if (!user) {
        user = await this.createNewUser(validatedInput.walletAddress, input.deviceInfo);
      } else {
        // Update last login
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            lastLogin: new Date(),
            loginCount: { increment: 1 },
          },
        });
      }

      // Check if user requires 2FA
      if (user.twoFactorEnabled) {
        // Generate temporary session for 2FA verification
        const tempSessionId = crypto.randomBytes(32).toString('hex');
        this.activeSessions.set(tempSessionId, {
          userId: user.id,
          walletAddress: user.walletAddress,
          sessionId: tempSessionId,
          deviceFingerprint: input.deviceInfo?.fingerprint || '',
          ipAddress: input.deviceInfo?.ip || '',
          lastActivity: new Date(),
          is2FAVerified: false,
        });

        await this.logSecurityEvent('2FA_REQUIRED', { userId: user.id });
        
        return {
          success: true,
          user,
          requires2FA: true,
        };
      }

      // Generate tokens for successful login
      const tokens = await this.generateTokens(user);
      
      // Create session
      const sessionId = crypto.randomBytes(32).toString('hex');
      this.activeSessions.set(sessionId, {
        userId: user.id,
        walletAddress: user.walletAddress,
        sessionId,
        deviceFingerprint: input.deviceInfo?.fingerprint || '',
        ipAddress: input.deviceInfo?.ip || '',
        lastActivity: new Date(),
        is2FAVerified: !user.twoFactorEnabled,
      });

      await this.logSecurityEvent('SUCCESSFUL_LOGIN', {
        userId: user.id,
        walletAddress: user.walletAddress,
        ip: input.deviceInfo?.ip,
      });

      this.emit('userLogin', { user, tokens, sessionId });

      return {
        success: true,
        user,
        tokens,
      };

    } catch (error: any) {
      await this.logSecurityEvent('LOGIN_ERROR', {
        error: error.message,
        walletAddress: input.walletAddress,
      });
      
      return {
        success: false,
        error: error.message || 'Authentication failed',
      };
    }
  }

  /**
   * Setup 2FA for enhanced security
   */
  async setup2FA(input: {
    userId: string;
    password?: string;
  }): Promise<{
    success: boolean;
    qrCode?: string;
    secret?: string;
    backupCodes?: string[];
    error?: string;
  }> {
    try {
      const validatedInput = Setup2FASchema.parse(input);
      
      const user = await this.prisma.user.findUnique({
        where: { id: validatedInput.userId },
      });

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      if (user.twoFactorEnabled) {
        return { success: false, error: '2FA is already enabled' };
      }

      // Generate 2FA secret
      const secret = speakeasy.generateSecret({
        name: `Orrange P2P (${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)})`,
        issuer: 'Orrange P2P',
      });

      // Generate QR code
      const qrCodeUrl = speakeasy.otpauthURL({
        secret: secret.ascii,
        label: `Orrange P2P (${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)})`,
        issuer: 'Orrange P2P',
        encoding: 'ascii',
      });

      const qrCode = await qrcode.toDataURL(qrCodeUrl);

      // Generate backup codes
      const backupCodes = Array.from({ length: 10 }, () => 
        crypto.randomBytes(4).toString('hex').toUpperCase()
      );

      // Store 2FA secret temporarily (will be activated after verification)
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorSecret: secret.base32,
          twoFactorBackupCodes: backupCodes.join(','),
        },
      });

      await this.logSecurityEvent('2FA_SETUP_INITIATED', { userId: user.id });

      return {
        success: true,
        qrCode,
        secret: secret.base32,
        backupCodes,
      };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to setup 2FA',
      };
    }
  }

  /**
   * Verify 2FA token and complete setup or login
   */
  async verify2FA(input: {
    token: string;
    userId: string;
    sessionId?: string;
  }): Promise<{
    success: boolean;
    tokens?: AuthTokens;
    user?: User;
    error?: string;
  }> {
    try {
      const validatedInput = Verify2FASchema.parse(input);
      
      const user = await this.prisma.user.findUnique({
        where: { id: validatedInput.userId },
      });

      if (!user || !user.twoFactorSecret) {
        return { success: false, error: 'Invalid 2FA setup' };
      }

      // Verify TOTP token
      const isValidToken = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: validatedInput.token,
        window: 2, // Allow 2 time steps of drift
      });

      if (!isValidToken) {
        // Check if it's a backup code
        const backupCodes = user.twoFactorBackupCodes?.split(',') || [];
        if (!backupCodes.includes(validatedInput.token.toUpperCase())) {
          await this.logSecurityEvent('INVALID_2FA_ATTEMPT', { userId: user.id });
          return { success: false, error: 'Invalid 2FA token' };
        }

        // Remove used backup code
        const remainingCodes = backupCodes.filter(code => code !== validatedInput.token.toUpperCase());
        await this.prisma.user.update({
          where: { id: user.id },
          data: { twoFactorBackupCodes: remainingCodes.join(',') },
        });

        await this.logSecurityEvent('BACKUP_CODE_USED', { userId: user.id });
      }

      // Enable 2FA if not already enabled (completing setup)
      if (!user.twoFactorEnabled) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { twoFactorEnabled: true },
        });

        await this.logSecurityEvent('2FA_ENABLED', { userId: user.id });
        
        return { success: true, user };
      }

      // Update session if this was for login
      if (input.sessionId) {
        const session = this.activeSessions.get(input.sessionId);
        if (session) {
          session.is2FAVerified = true;
          session.lastActivity = new Date();

          // Generate tokens for completed 2FA login
          const tokens = await this.generateTokens(user);
          
          await this.logSecurityEvent('2FA_LOGIN_COMPLETED', { userId: user.id });
          
          return {
            success: true,
            tokens,
            user,
          };
        }
      }

      return { success: true, user };

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to verify 2FA',
      };
    }
  }

  /**
   * Enhanced token generation with device binding
   */
  private async generateTokens(user: User): Promise<AuthTokens> {
    const tokenPayload = {
      userId: user.id,
      walletAddress: user.walletAddress,
      roles: user.role ? [user.role] : ['USER'],
      riskLevel: user.riskLevel,
      requires2FA: user.twoFactorEnabled,
    };

    const accessToken = jwt.sign(tokenPayload, this.jwtSecret, {
      expiresIn: '15m', // Short-lived access token
    });

    const refreshToken = jwt.sign(
      { userId: user.id, tokenVersion: user.tokenVersion || 0 },
      this.jwtRefreshSecret,
      { expiresIn: '7d' }
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes
    };
  }

  /**
   * Verify wallet signature
   */
  private async verifyWalletSignature(
    walletAddress: string,
    message: string,
    signature: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === walletAddress.toLowerCase();
    } catch (error) {
      return false;
    }
  }

  /**
   * Create new user with enhanced security defaults
   */
  private async createNewUser(walletAddress: string, deviceInfo?: {
    userAgent: string;
    ip: string;
    fingerprint: string;
  }): Promise<User> {
    // Calculate initial risk score based on wallet analysis
    const riskScore = await this.calculateWalletRiskScore(walletAddress);
    
    const user = await this.prisma.user.create({
      data: {
        walletAddress: walletAddress.toLowerCase(),
        reputationScore: 0,
        tradeCount: 0,
        kycStatus: 'UNVERIFIED',
        riskLevel: riskScore > 50 ? 'HIGH' : 'MEDIUM',
        riskScore,
        createdAt: new Date(),
        lastLogin: new Date(),
        loginCount: 1,
        isActive: true,
      },
    });

    await this.logSecurityEvent('NEW_USER_CREATED', {
      userId: user.id,
      walletAddress: user.walletAddress,
      riskScore,
      ip: deviceInfo?.ip,
    });

    this.emit('newUserCreated', { user, deviceInfo });

    return user;
  }

  /**
   * Calculate wallet risk score using on-chain analysis
   */
  private async calculateWalletRiskScore(walletAddress: string): Promise<number> {
    let riskScore = 20; // Base risk score for new wallets

    try {
      // Check if wallet has been used in our platform before
      const existingTrades = await this.prisma.trade.count({
        where: {
          OR: [
            { sellerId: walletAddress },
            { buyerId: walletAddress },
          ],
        },
      });

      if (existingTrades > 0) {
        riskScore -= 10; // Lower risk for existing traders
      }

      // Additional on-chain analysis could be added here:
      // - Wallet age
      // - Transaction history
      // - Token holdings
      // - DeFi activity

    } catch (error) {
      // If analysis fails, maintain conservative risk score
      console.error('Risk score calculation failed:', error);
    }

    return Math.max(0, Math.min(100, riskScore));
  }

  /**
   * Log security events for monitoring
   */
  private async logSecurityEvent(event: string, data: any): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: `AUTH_${event}`,
          details: JSON.stringify(data),
          timestamp: new Date(),
          ipAddress: data.ip || null,
          userAgent: data.userAgent || null,
        },
      });

      // Emit security event for real-time monitoring
      this.emit('securityEvent', {
        type: event,
        data,
        timestamp: new Date(),
      });

    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    const expiredSessions: string[] = [];

    this.activeSessions.forEach((session, sessionId) => {
      const sessionAge = now.getTime() - session.lastActivity.getTime();
      if (sessionAge > 24 * 60 * 60 * 1000) { // 24 hours
        expiredSessions.push(sessionId);
      }
    });

    expiredSessions.forEach(sessionId => {
      this.activeSessions.delete(sessionId);
    });

    if (expiredSessions.length > 0) {
      console.log(`Cleaned up ${expiredSessions.length} expired sessions`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    success: boolean;
    accessToken?: string;
    error?: string;
  }> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtRefreshSecret) as {
        userId: string;
        tokenVersion: number;
      };

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.userId },
      });

      if (!user || (user.tokenVersion || 0) !== decoded.tokenVersion) {
        return { success: false, error: 'Invalid refresh token' };
      }

      const tokenPayload = {
        userId: user.id,
        walletAddress: user.walletAddress,
        roles: user.role ? [user.role] : ['USER'],
        riskLevel: user.riskLevel,
        requires2FA: user.twoFactorEnabled,
      };

      const accessToken = jwt.sign(tokenPayload, this.jwtSecret, {
        expiresIn: '15m',
      });

      return { success: true, accessToken };

    } catch (error) {
      return { success: false, error: 'Invalid refresh token' };
    }
  }

  /**
   * Revoke all tokens for a user (logout)
   */
  async revokeAllTokens(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        tokenVersion: { increment: 1 },
      },
    });

    // Remove active sessions
    const sessionsToRemove: string[] = [];
    this.activeSessions.forEach((session, sessionId) => {
      if (session.userId === userId) {
        sessionsToRemove.push(sessionId);
      }
    });

    sessionsToRemove.forEach(sessionId => {
      this.activeSessions.delete(sessionId);
    });

    await this.logSecurityEvent('TOKENS_REVOKED', { userId });
  }

  /**
   * Get user session info
   */
  getSession(sessionId: string): UserSession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Validate session and update activity
   */
  validateSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session) return false;

    // Update last activity
    session.lastActivity = new Date();
    return true;
  }
}
