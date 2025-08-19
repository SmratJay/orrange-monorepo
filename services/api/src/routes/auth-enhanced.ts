import { FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { EnhancedAuthService } from '../services/EnhancedAuthService';
import { securityMiddleware } from '../middleware/security';
import { z } from 'zod';

// Request schemas
const WalletConnectRequest = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
  signature: z.string().min(130, 'Invalid signature length'),
  message: z.string().min(10, 'Message too short'),
  chainId: z.number().min(1, 'Invalid chain ID'),
  timestamp: z.number().min(0, 'Invalid timestamp'),
  deviceInfo: z.object({
    userAgent: z.string(),
    ip: z.string(),
    fingerprint: z.string(),
  }).optional(),
});

const Setup2FARequest = z.object({
  password: z.string().min(6, 'Password too short').optional(),
});

const Verify2FARequest = z.object({
  token: z.string().length(6, '2FA token must be 6 digits'),
  sessionId: z.string().optional(),
});

const RefreshTokenRequest = z.object({
  refreshToken: z.string().min(10, 'Invalid refresh token'),
});

export interface AuthRouteOptions {
  prisma: PrismaClient;
}

const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (fastify, options) => {
  const { prisma } = options;
  const authService = new EnhancedAuthService(prisma);

  // Apply security middleware to all auth routes
  fastify.addHook('preHandler', securityMiddleware);

  /**
   * Connect wallet and authenticate user
   * POST /auth/connect
   */
  fastify.post('/connect', {
    schema: {
      body: WalletConnectRequest,
      response: {
        200: z.object({
          success: z.boolean(),
          user: z.object({
            id: z.string(),
            walletAddress: z.string(),
            reputationScore: z.number(),
            riskLevel: z.string(),
            kycStatus: z.string(),
            twoFactorEnabled: z.boolean(),
          }).optional(),
          tokens: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number(),
          }).optional(),
          requires2FA: z.boolean().optional(),
        }),
        400: z.object({
          success: z.boolean(),
          error: z.string(),
        }),
        429: z.object({
          success: z.boolean(),
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const body = request.body as z.infer<typeof WalletConnectRequest>;
      
      // Add device info from request
      const deviceInfo = {
        userAgent: request.headers['user-agent'] || '',
        ip: request.ip,
        fingerprint: body.deviceInfo?.fingerprint || request.headers['x-fingerprint'] as string || '',
      };

      const result = await authService.connectWallet({
        ...body,
        deviceInfo,
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error || 'Authentication failed',
        });
      }

      // Set secure HTTP-only cookie for refresh token
      if (result.tokens) {
        reply.setCookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      return {
        success: true,
        user: result.user ? {
          id: result.user.id,
          walletAddress: result.user.walletAddress,
          reputationScore: result.user.reputationScore || 0,
          riskLevel: result.user.riskLevel || 'MEDIUM',
          kycStatus: result.user.kycStatus || 'UNVERIFIED',
          twoFactorEnabled: result.user.twoFactorEnabled || false,
        } : undefined,
        tokens: result.tokens,
        requires2FA: result.requires2FA,
      };

    } catch (error: any) {
      fastify.log.error('Wallet connect error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Setup 2FA for user
   * POST /auth/setup-2fa
   */
  fastify.post('/setup-2fa', {
    preHandler: [securityMiddleware],
    schema: {
      body: Setup2FARequest,
      response: {
        200: z.object({
          success: z.boolean(),
          qrCode: z.string().optional(),
          secret: z.string().optional(),
          backupCodes: z.array(z.string()).optional(),
        }),
        400: z.object({
          success: z.boolean(),
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const body = request.body as z.infer<typeof Setup2FARequest>;
      const user = (request as any).user;

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }

      const result = await authService.setup2FA({
        userId: user.userId,
        password: body.password,
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error || '2FA setup failed',
        });
      }

      return {
        success: true,
        qrCode: result.qrCode,
        secret: result.secret,
        backupCodes: result.backupCodes,
      };

    } catch (error: any) {
      fastify.log.error('2FA setup error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Verify 2FA token
   * POST /auth/verify-2fa
   */
  fastify.post('/verify-2fa', {
    schema: {
      body: Verify2FARequest,
      response: {
        200: z.object({
          success: z.boolean(),
          tokens: z.object({
            accessToken: z.string(),
            refreshToken: z.string(),
            expiresIn: z.number(),
          }).optional(),
          user: z.object({
            id: z.string(),
            walletAddress: z.string(),
            twoFactorEnabled: z.boolean(),
          }).optional(),
        }),
        400: z.object({
          success: z.boolean(),
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const body = request.body as z.infer<typeof Verify2FARequest>;
      const user = (request as any).user;

      const result = await authService.verify2FA({
        token: body.token,
        userId: user?.userId,
        sessionId: body.sessionId,
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error || '2FA verification failed',
        });
      }

      // Set refresh token cookie if tokens were generated
      if (result.tokens) {
        reply.setCookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      return {
        success: true,
        tokens: result.tokens,
        user: result.user ? {
          id: result.user.id,
          walletAddress: result.user.walletAddress,
          twoFactorEnabled: result.user.twoFactorEnabled || false,
        } : undefined,
      };

    } catch (error: any) {
      fastify.log.error('2FA verification error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Refresh access token
   * POST /auth/refresh
   */
  fastify.post('/refresh', {
    schema: {
      body: RefreshTokenRequest.optional(),
      response: {
        200: z.object({
          success: z.boolean(),
          accessToken: z.string(),
        }),
        400: z.object({
          success: z.boolean(),
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const body = request.body as z.infer<typeof RefreshTokenRequest> | undefined;
      
      // Get refresh token from cookie or body
      const refreshToken = body?.refreshToken || request.cookies.refreshToken;

      if (!refreshToken) {
        return reply.status(400).send({
          success: false,
          error: 'Refresh token required',
        });
      }

      const result = await authService.refreshAccessToken(refreshToken);

      if (!result.success) {
        // Clear invalid refresh token cookie
        reply.clearCookie('refreshToken');
        return reply.status(400).send({
          success: false,
          error: result.error || 'Token refresh failed',
        });
      }

      return {
        success: true,
        accessToken: result.accessToken!,
      };

    } catch (error: any) {
      fastify.log.error('Token refresh error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Logout user (revoke all tokens)
   * POST /auth/logout
   */
  fastify.post('/logout', {
    preHandler: [securityMiddleware],
  }, async (request, reply) => {
    try {
      const user = (request as any).user;

      if (user?.userId) {
        await authService.revokeAllTokens(user.userId);
      }

      // Clear refresh token cookie
      reply.clearCookie('refreshToken');

      return {
        success: true,
        message: 'Logged out successfully',
      };

    } catch (error: any) {
      fastify.log.error('Logout error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Get user profile
   * GET /auth/profile
   */
  fastify.get('/profile', {
    preHandler: [securityMiddleware],
    schema: {
      response: {
        200: z.object({
          success: z.boolean(),
          user: z.object({
            id: z.string(),
            walletAddress: z.string(),
            reputationScore: z.number(),
            tradeCount: z.number(),
            kycStatus: z.string(),
            riskLevel: z.string(),
            twoFactorEnabled: z.boolean(),
            createdAt: z.string(),
            lastLogin: z.string().nullable(),
          }),
        }),
        401: z.object({
          success: z.boolean(),
          error: z.string(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const user = (request as any).user;

      if (!user) {
        return reply.status(401).send({
          success: false,
          error: 'Authentication required',
        });
      }

      const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: {
          id: true,
          walletAddress: true,
          reputationScore: true,
          tradeCount: true,
          kycStatus: true,
          riskLevel: true,
          twoFactorEnabled: true,
          createdAt: true,
          lastLogin: true,
        },
      });

      if (!userData) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      return {
        success: true,
        user: {
          ...userData,
          reputationScore: userData.reputationScore || 0,
          tradeCount: userData.tradeCount || 0,
          kycStatus: userData.kycStatus || 'UNVERIFIED',
          riskLevel: userData.riskLevel || 'MEDIUM',
          twoFactorEnabled: userData.twoFactorEnabled || false,
          createdAt: userData.createdAt.toISOString(),
          lastLogin: userData.lastLogin?.toISOString() || null,
        },
      };

    } catch (error: any) {
      fastify.log.error('Profile fetch error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  /**
   * Get authentication status
   * GET /auth/status
   */
  fastify.get('/status', {
    preHandler: [securityMiddleware],
  }, async (request, reply) => {
    try {
      const user = (request as any).user;

      return {
        success: true,
        authenticated: !!user,
        user: user ? {
          userId: user.userId,
          walletAddress: user.walletAddress,
          roles: user.roles,
          requires2FA: user.requires2FA,
        } : null,
      };

    } catch (error: any) {
      fastify.log.error('Auth status error:', error);
      return {
        success: false,
        authenticated: false,
        error: 'Internal server error',
      };
    }
  });

  /**
   * Generate message for wallet signing
   * GET /auth/message
   */
  fastify.get('/message', {
    schema: {
      querystring: z.object({
        walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid wallet address'),
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
          timestamp: z.number(),
        }),
      },
    },
  }, async (request, reply) => {
    try {
      const { walletAddress } = request.query as { walletAddress: string };
      const timestamp = Date.now();
      
      const message = `Welcome to Orrange P2P Trading Platform!

This request will not trigger a blockchain transaction or cost any gas fees.

Wallet address: ${walletAddress}
Timestamp: ${timestamp}

By signing this message, you authenticate your wallet ownership for secure access to our platform.`;

      return {
        success: true,
        message,
        timestamp,
      };

    } catch (error: any) {
      fastify.log.error('Message generation error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
      });
    }
  });

  // Set up event listeners for authentication service
  authService.on('userLogin', (data) => {
    fastify.log.info('User login event', { 
      userId: data.user.id, 
      walletAddress: data.user.walletAddress 
    });
  });

  authService.on('newUserCreated', (data) => {
    fastify.log.info('New user created', { 
      userId: data.user.id, 
      walletAddress: data.user.walletAddress,
      riskScore: data.user.riskScore,
    });
  });

  authService.on('securityEvent', (data) => {
    fastify.log.warn('Security event', data);
  });
};

export { authRoutes };
