import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { JWTUtils } from '@/lib/auth/jwt';
import { UserRepository } from '@/lib/auth/repository';
import { authRateLimit } from '@/lib/security/rateLimit';
import { sanitizeInput } from '@/lib/security/sanitization';
import { randomBytes } from 'crypto';

const redirectBase = process.env.GOOGLE_REDIRECT_URI || (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/api/auth/google/callback` : undefined);
const client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: redirectBase,
});

export async function GET() {
  try {
    const state = randomBytes(32).toString('hex');
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['profile', 'email'],
      state: state,
    });
    
    const response = NextResponse.redirect(authUrl);
    response.cookies.set('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 600, // 10 minutes
      sameSite: 'lax',
    });
    
    return response;
  } catch (error) {
    return NextResponse.redirect('/login?error=oauth_init_failed');
  }
}

export async function POST(req: NextRequest) {
  return await authRateLimit(req, async () => {
    try {
      const { token, action } = await req.json();

      if (!token) {
        return NextResponse.json(
          { error: { code: 'MISSING_TOKEN', message: 'Google token is required' } },
          { status: 400 }
        );
      }

      // Verify the Google token
      const ticket = await client.verifyIdToken({
        idToken: sanitizeInput(token),
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload?.sub || !payload?.email) {
        return NextResponse.json(
          { error: { code: 'INVALID_TOKEN', message: 'Invalid Google token' } },
          { status: 400 }
        );
      }

      const { sub: googleId, email, name, email_verified, picture } = payload;

      if (action === 'register') {
        // Check if user already exists
        const existingUser = await UserRepository.findByEmail(email);
        if (existingUser) {
        return NextResponse.json(
          { error: { code: 'USER_EXISTS', message: 'User with this email already exists' } },
          { status: 409 }
        );
      }

      // Check if Google ID already exists
      const existingGoogleUser = await UserRepository.findByGoogleId(googleId);
      if (existingGoogleUser) {
        return NextResponse.json(
          { error: { code: 'GOOGLE_ACCOUNT_EXISTS', message: 'This Google account is already registered' } },
          { status: 409 }
        );
      }

      // Create new user with Google OAuth
      const { user, profile } = await UserRepository.createUser(
        email,
        undefined, // No password for OAuth users
        name || undefined,
        googleId,
        'google'
      );

      // Update profile with Google avatar if provided
      if (picture) {
        await UserRepository.updateProfile(user.id, { avatarUrl: picture });
        profile.avatarUrl = picture;
      }

      // Generate JWT token
      const jwtToken = await JWTUtils.generate({ userId: user.id, email: user.email });

      // Create session
      await UserRepository.createSession(user.id, jwtToken, {
        userAgent: req.headers.get('user-agent') || 'unknown',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      });

      return NextResponse.json({
        success: true,
        user: { ...user, profile },
        token: jwtToken,
      });

    } else if (action === 'login') {
      // Find user by Google ID
      const user = await UserRepository.findByGoogleId(googleId);
      
      if (!user) {
        return NextResponse.json(
          { error: { code: 'USER_NOT_FOUND', message: 'No account found with this Google account' } },
          { status: 404 }
        );
      }

      // Update last login
      await UserRepository.updateLastLogin(user.id);

      // Get user profile
      const profile = await UserRepository.getProfile(user.id);

      // Generate JWT token
      const jwtToken = await JWTUtils.generate({ userId: user.id, email: user.email });

      // Create session
      await UserRepository.createSession(user.id, jwtToken, {
        userAgent: req.headers.get('user-agent') || 'unknown',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
      });

      return NextResponse.json({
        success: true,
        user: { ...user, profile },
        token: jwtToken,
      });

    } else {
      return NextResponse.json(
        { error: { code: 'INVALID_ACTION', message: 'Action must be "register" or "login"' } },
        { status: 400 }
      );
      }

    } catch (error: any) {
      console.error('Google OAuth error:', error);
      
      if (error.message?.includes('Token used too early') || error.message?.includes('Token used too late')) {
        return NextResponse.json(
          { error: { code: 'EXPIRED_TOKEN', message: 'Google token has expired' } },
          { status: 401 }
        );
      }

      return NextResponse.json(
        { error: { code: 'SERVER_ERROR', message: 'Authentication failed' } },
        { status: 500 }
      );
    }
  });
}
