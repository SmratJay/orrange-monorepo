import { Router, Request, Response } from 'express';
import { AuthService } from '@/services/auth.service';
import { prisma } from '@/config/database';
import { validateRequest } from '@/middleware/validation.middleware';
import { authenticateToken, optionalAuth } from '@/middleware/auth.middleware';
import { authRateLimitMiddleware } from '@/middleware/security.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updatePasswordSchema,
  updateProfileSchema,
} from '@/utils/validation.schemas';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user with email and password
 */
router.post(
  '/register',
  authRateLimitMiddleware,
  validateRequest({ body: registerSchema }),
  async (req: Request, res: Response) => {
    try {
      const { email, password, username } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email.toLowerCase() },
            ...(username ? [{ username }] : []),
          ],
        },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: existingUser.email === email.toLowerCase() 
            ? 'An account with this email already exists' 
            : 'Username is already taken',
        });
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          username,
        },
        select: {
          id: true,
          email: true,
          username: true,
          walletAddress: true,
          kycStatus: true,
          trustScore: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Generate tokens
      const accessToken = AuthService.generateAccessToken({
        userId: user.id,
        email: user.email,
      });

      const refreshToken = AuthService.generateRefreshToken({
        userId: user.id,
      });

      // Store refresh token
      await AuthService.storeRefreshToken(user.id, refreshToken);

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          user,
          accessToken,
          refreshToken, // Also return in response for frontend storage flexibility
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create account',
      });
    }
  }
);

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post(
  '/login',
  authRateLimitMiddleware,
  validateRequest({ body: loginSchema }),
  async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated. Please contact support.',
        });
      }

      // Verify password
      const isPasswordValid = await AuthService.comparePassword(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password',
        });
      }

      // Update last login time
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      // Generate tokens
      const accessToken = AuthService.generateAccessToken({
        userId: user.id,
        email: user.email,
      });

      const refreshToken = AuthService.generateRefreshToken({
        userId: user.id,
      });

      // Store refresh token
      await AuthService.storeRefreshToken(user.id, refreshToken);

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      // Return user data (excluding password)
      const { password: _, ...userWithoutPassword } = user;

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userWithoutPassword,
          accessToken,
          refreshToken, // Also return in response for frontend storage flexibility
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
      });
    }
  }
);

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  '/refresh',
  validateRequest({ body: refreshTokenSchema }),
  async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;

      // Verify refresh token
      const decoded = AuthService.verifyRefreshToken(refreshToken);
      if (!decoded) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token',
        });
      }

      // Check if token exists in database and is not expired
      const isValid = await AuthService.validateRefreshToken(refreshToken);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token expired or invalid',
        });
      }

      // Get user
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          username: true,
          walletAddress: true,
          kycStatus: true,
          trustScore: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive',
        });
      }

      // Generate new access token
      const newAccessToken = AuthService.generateAccessToken({
        userId: user.id,
        email: user.email,
      });

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: newAccessToken,
          user,
        },
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        message: 'Token refresh failed',
      });
    }
  }
);

/**
 * POST /api/auth/logout
 * Logout and invalidate refresh token
 */
router.post(
  '/logout',
  optionalAuth,
  async (req: Request, res: Response) => {
    try {
      const refreshToken = req.body.refreshToken || req.cookies.refreshToken;

      if (refreshToken) {
        // Invalidate the refresh token
        await AuthService.invalidateRefreshToken(refreshToken);
      }

      // Clear the refresh token cookie
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Logout failed',
      });
    }
  }
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get(
  '/me',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      // User is already attached to req by authenticateToken middleware
      res.json({
        success: true,
        data: { user: req.user },
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user profile',
      });
    }
  }
);

/**
 * PATCH /api/auth/profile
 * Update user profile
 */
router.patch(
  '/profile',
  authenticateToken,
  validateRequest({ body: updateProfileSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const updates = req.body;

      // If username is being updated, check if it's already taken
      if (updates.username) {
        const existingUser = await prisma.user.findFirst({
          where: {
            username: updates.username,
            NOT: { id: userId },
          },
        });

        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: 'Username is already taken',
          });
        }
      }

      // Update user profile
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updates,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          bio: true,
          walletAddress: true,
          kycStatus: true,
          trustScore: true,
          isActive: true,
          updatedAt: true,
        },
      });

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user: updatedUser },
      });
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
      });
    }
  }
);

/**
 * PATCH /api/auth/password
 * Update user password
 */
router.patch(
  '/password',
  authenticateToken,
  validateRequest({ body: updatePasswordSchema }),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      // Get current user with password
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await AuthService.comparePassword(
        currentPassword,
        user.password
      );

      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect',
        });
      }

      // Hash new password
      const hashedNewPassword = await AuthService.hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword },
      });

      // Invalidate all refresh tokens for security
      await prisma.refreshToken.deleteMany({
        where: { userId },
      });

      // Clear refresh token cookie
      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Password updated successfully. Please log in again.',
      });
    } catch (error) {
      console.error('Password update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update password',
      });
    }
  }
);

export default router;
