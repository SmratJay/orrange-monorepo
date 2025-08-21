// Authentication routes for Orrange P2P API
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

// Extend Fastify types inline
declare module 'fastify' {
  interface FastifyInstance {
    jwt: any;
    redis: any;
  }
}

const prisma = new PrismaClient();

// Request interfaces
interface WalletConnectRequest {
  Body: {
    signature: string;
    message: string;
    address: string;
    nonce: string;
  };
}

interface RefreshTokenRequest {
  Body: {
    refreshToken: string;
  };
}

async function authRoutes(fastify: FastifyInstance) {
  
  // POST /auth/wallet/connect - Wallet authentication
  fastify.post<WalletConnectRequest>('/connect', {
    schema: {
      body: {
        type: 'object',
        required: ['signature', 'message', 'address', 'nonce'],
        properties: {
          signature: { type: 'string' },
          message: { type: 'string' },
          address: { type: 'string' },
          nonce: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<WalletConnectRequest>, reply: FastifyReply) => {
    try {
      const { signature, message, address, nonce } = request.body;

      // TODO: Verify signature with wallet auth service
      // For now, we'll create or find the user
      
      let user = await prisma.user.findUnique({
        where: { walletAddress: address.toLowerCase() },
      });

      if (!user) {
        // Create new user
        user = await prisma.user.create({
          data: {
            id: nanoid(),
            walletAddress: address.toLowerCase(),
            kycStatus: 'UNVERIFIED',
            riskLevel: 'LOW',
            isActive: true,
            reputationScore: 0.0,
            tradeCount: 0,
            disputeRatio: 0.0,
            lastActivity: new Date(),
          },
        });
      } else {
        // Update last activity
        await prisma.user.update({
          where: { id: user.id },
          data: { lastActivity: new Date() },
        });
      }

      // Generate JWT tokens using Fastify's built-in JWT support
      const accessToken = fastify.jwt.sign({
        userId: user.id,
        walletAddress: user.walletAddress,
        role: user.role || 'USER',
      });

      // Create simple refresh token
      const refreshToken = nanoid(64);

      // Store refresh token in Redis with 7 day expiration
      await fastify.redis.setex(
        `refresh_token:${user.id}`, 
        7 * 24 * 60 * 60, // 7 days in seconds
        refreshToken
      );

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            walletAddress: user.walletAddress,
            kycStatus: user.kycStatus,
            reputationScore: user.reputationScore,
            tradeCount: user.tradeCount,
            isVerified: user.isVerified,
            role: user.role,
          },
          accessToken,
          refreshToken,
        },
      };

    } catch (error) {
      console.error('Wallet connect error:', error);
      return reply.code(500).send({
        error: 'Authentication failed',
      });
    }
  });

  // POST /auth/refresh - Refresh access token
  fastify.post<RefreshTokenRequest>('/refresh', {
    schema: {
      body: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<RefreshTokenRequest>, reply: FastifyReply) => {
    try {
      const { refreshToken } = request.body;

      // Find user by scanning Redis for the refresh token
      const keys = await fastify.redis.keys('refresh_token:*');
      let userId: string | null = null;

      for (const key of keys) {
        const storedToken = await fastify.redis.get(key);
        if (storedToken === refreshToken) {
          userId = key.split(':')[1];
          break;
        }
      }

      if (!userId) {
        return reply.code(401).send({
          error: 'Invalid refresh token',
        });
      }

      // Get user data
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          walletAddress: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        // Clean up invalid refresh token
        await fastify.redis.del(`refresh_token:${userId}`);
        return reply.code(401).send({
          error: 'User not found or inactive',
        });
      }

      // Generate new access token
      const accessToken = fastify.jwt.sign({
        userId: user.id,
        walletAddress: user.walletAddress,
        role: user.role || 'USER',
      });

      // Generate new refresh token
      const newRefreshToken = nanoid(64);

      // Replace old refresh token with new one
      await fastify.redis.del(`refresh_token:${userId}`);
      await fastify.redis.setex(
        `refresh_token:${userId}`,
        7 * 24 * 60 * 60, // 7 days
        newRefreshToken
      );

      return {
        success: true,
        data: {
          accessToken,
          refreshToken: newRefreshToken,
        },
      };

    } catch (error) {
      console.error('Token refresh error:', error);
      return reply.code(500).send({
        error: 'Token refresh failed',
      });
    }
  });

  // GET /auth/profile - Get current user profile
  fastify.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // TODO: Implement proper authentication middleware
      const mockUser = {
        id: 'mock-user-id',
        walletAddress: '0x...',
        createdAt: new Date().toISOString()
      };

      // Fetch latest user data
      const userData = await prisma.user.findUnique({
        where: { id: mockUser.id },
        select: {
          id: true,
          walletAddress: true,
          email: true,
          reputationScore: true,
          tradeCount: true,
          isVerified: true,
          kycStatus: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!userData) {
        return reply.code(404).send({
          error: 'User not found',
        });
      }

      return {
        success: true,
        data: userData,
      };

    } catch (error) {
      console.error('Get profile error:', error);
      return reply.code(500).send({
        error: 'Failed to get profile',
      });
    }
  });

  // GET /auth/nonce/:address - Get nonce for wallet signature
  fastify.get<{ Params: { address: string } }>('/nonce/:address', {
    schema: {
      params: {
        type: 'object',
        required: ['address'],
        properties: {
          address: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest<{ Params: { address: string } }>, reply: FastifyReply) => {
    try {
      const { address } = request.params;
      
      // Generate and store nonce for signature verification
      const nonce = nanoid(32);
      const message = `Welcome to Orrange P2P!\n\nSign this message to authenticate with your wallet.\n\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;

      // Store nonce in Redis with 10 minute expiration
      await fastify.redis.setex(
        `auth_nonce:${address.toLowerCase()}`,
        10 * 60, // 10 minutes
        nonce
      );

      return {
        success: true,
        data: {
          nonce,
          message,
          address: address.toLowerCase(),
        },
      };

    } catch (error) {
      console.error('Get nonce error:', error);
      return reply.code(500).send({
        error: 'Failed to generate nonce',
      });
    }
  });
}

export default authRoutes;
