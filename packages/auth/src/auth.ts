import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { hash, compare } from 'bcryptjs';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

export interface AuthTokenPayload extends JWTPayload {
  userId: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  walletAddress?: string;
  permissions: string[];
}

export interface TwoFactorSecret {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export class AuthService {
  private jwtSecret: Uint8Array;
  private jwtIssuer: string;
  private jwtAudience: string;

  constructor(
    secret: string,
    issuer: string = 'orrange-p2p',
    audience: string = 'orrange-users'
  ) {
    this.jwtSecret = new TextEncoder().encode(secret);
    this.jwtIssuer = issuer;
    this.jwtAudience = audience;
  }

  // Password hashing and verification
  async hashPassword(password: string): Promise<string> {
    return hash(password, 12);
  }

  async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return compare(password, hashedPassword);
  }

  // JWT token management
  async createToken(payload: Omit<AuthTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>): Promise<string> {
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.jwtIssuer)
      .setAudience(this.jwtAudience)
      .setExpirationTime('24h')
      .sign(this.jwtSecret);

    return jwt;
  }

  async verifyToken(token: string): Promise<AuthTokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret, {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
      });

      return payload as AuthTokenPayload;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  }

  async createRefreshToken(userId: string): Promise<string> {
    const jwt = await new SignJWT({ userId, type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.jwtIssuer)
      .setAudience(this.jwtAudience)
      .setExpirationTime('7d')
      .sign(this.jwtSecret);

    return jwt;
  }

  // Two-Factor Authentication
  generateTwoFactorSecret(email: string): TwoFactorSecret {
    const secret = authenticator.generateSecret();
    const service = 'Orrange P2P';
    const otpAuthUrl = authenticator.keyuri(email, service, secret);
    
    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () => 
      Math.random().toString(36).substring(2, 8).toUpperCase()
    );

    return {
      secret,
      qrCode: otpAuthUrl,
      backupCodes
    };
  }

  async generateTwoFactorQRCode(secret: string, email: string): Promise<string> {
    const service = 'Orrange P2P';
    const otpAuthUrl = authenticator.keyuri(email, service, secret);
    
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);
      return qrCodeDataUrl;
    } catch (error) {
      throw new Error('Failed to generate QR code');
    }
  }

  verifyTwoFactorToken(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }

  // Wallet signature verification
  async verifyWalletSignature(
    address: string,
    message: string,
    signature: string
  ): Promise<boolean> {
    // This would integrate with wallet libraries like ethers.js
    // For now, returning a placeholder
    try {
      // Example implementation would use ethers.js:
      // const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      // return recoveredAddress.toLowerCase() === address.toLowerCase();
      
      return signature.length > 0 && address.length > 0;
    } catch (error) {
      return false;
    }
  }

  // Permission checking
  hasPermission(tokenPayload: AuthTokenPayload, requiredPermission: string): boolean {
    if (tokenPayload.role === 'ADMIN') {
      return true; // Admins have all permissions
    }

    return tokenPayload.permissions.includes(requiredPermission);
  }

  // Rate limiting helpers
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  checkRateLimit(identifier: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const record = this.rateLimitStore.get(identifier);

    if (!record || now > record.resetTime) {
      this.rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (record.count >= maxAttempts) {
      return false;
    }

    record.count++;
    return true;
  }

  clearRateLimit(identifier: string): void {
    this.rateLimitStore.delete(identifier);
  }

  // Session management
  async createSession(userId: string, deviceInfo?: any): Promise<string> {
    const sessionId = crypto.randomUUID();
    const sessionData = {
      userId,
      sessionId,
      createdAt: new Date(),
      deviceInfo,
      lastActive: new Date()
    };

    // In a real implementation, this would be stored in Redis or database
    // For now, we'll encode it in a JWT
    const sessionToken = await new SignJWT(sessionData)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.jwtIssuer)
      .setAudience(this.jwtAudience)
      .setExpirationTime('24h')
      .sign(this.jwtSecret);

    return sessionToken;
  }

  async validateSession(sessionToken: string): Promise<any | null> {
    try {
      const { payload } = await jwtVerify(sessionToken, this.jwtSecret);
      return payload;
    } catch (error) {
      return null;
    }
  }

  // Audit logging
  logAuthEvent(event: {
    userId?: string;
    action: string;
    success: boolean;
    ipAddress?: string;
    userAgent?: string;
    details?: any;
  }): void {
    const logEntry = {
      ...event,
      timestamp: new Date(),
      id: crypto.randomUUID()
    };

    // In a real implementation, this would write to a secure audit log
    console.log('AUTH_EVENT:', JSON.stringify(logEntry));
  }
}

// Middleware helpers
export function createAuthMiddleware(authService: AuthService) {
  return {
    requireAuth: (requiredPermission?: string) => {
      return async (req: any, res: any, next: any) => {
        try {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
          }

          const token = authHeader.substring(7);
          const payload = await authService.verifyToken(token);

          if (!payload) {
            return res.status(401).json({ error: 'Invalid token' });
          }

          if (requiredPermission && !authService.hasPermission(payload, requiredPermission)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
          }

          req.user = payload;
          next();
        } catch (error) {
          return res.status(401).json({ error: 'Authentication failed' });
        }
      };
    },

    requireRole: (allowedRoles: string[]) => {
      return async (req: any, res: any, next: any) => {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        if (!allowedRoles.includes(req.user.role)) {
          return res.status(403).json({ error: 'Insufficient role permissions' });
        }

        next();
      };
    }
  };
}

// Default permissions
export const PERMISSIONS = {
  // User permissions
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',

  // Trading permissions
  TRADE_CREATE: 'trade:create',
  TRADE_READ: 'trade:read',
  TRADE_UPDATE: 'trade:update',
  TRADE_CANCEL: 'trade:cancel',

  // Order permissions
  ORDER_CREATE: 'order:create',
  ORDER_READ: 'order:read',
  ORDER_UPDATE: 'order:update',
  ORDER_CANCEL: 'order:cancel',

  // Admin permissions
  ADMIN_READ: 'admin:read',
  ADMIN_WRITE: 'admin:write',
  ADMIN_DELETE: 'admin:delete',

  // Moderation permissions
  MODERATE_DISPUTES: 'moderate:disputes',
  MODERATE_USERS: 'moderate:users',
  MODERATE_CONTENT: 'moderate:content'
};

export const ROLE_PERMISSIONS = {
  USER: [
    PERMISSIONS.USER_READ,
    PERMISSIONS.USER_UPDATE,
    PERMISSIONS.TRADE_CREATE,
    PERMISSIONS.TRADE_READ,
    PERMISSIONS.TRADE_UPDATE,
    PERMISSIONS.TRADE_CANCEL,
    PERMISSIONS.ORDER_CREATE,
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.ORDER_CANCEL
  ],
  MODERATOR: [] as string[], // Will be populated below
  ADMIN: [] // Admins have all permissions by default
};

// Populate MODERATOR permissions after USER permissions are defined
ROLE_PERMISSIONS.MODERATOR = [
  ...ROLE_PERMISSIONS.USER,
  PERMISSIONS.MODERATE_DISPUTES,
  PERMISSIONS.MODERATE_USERS,
  PERMISSIONS.MODERATE_CONTENT
];
