import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { JWTUtils } from '@/lib/auth/jwt';
import { UserRepository } from '@/lib/auth/repository';

const callbackRedirect = process.env.GOOGLE_REDIRECT_URI || (process.env.NEXTAUTH_URL ? `${process.env.NEXTAUTH_URL}/api/auth/google/callback` : undefined);
const client = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: callbackRedirect,
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Check for OAuth errors
    if (error) {
      return NextResponse.redirect('/login?error=oauth_cancelled');
    }

    if (!code) {
      return NextResponse.redirect('/login?error=missing_code');
    }

    // Verify state parameter
    const expectedState = req.cookies.get('oauth_state')?.value;
    if (!expectedState || expectedState !== state) {
      return NextResponse.redirect('/login?error=invalid_state');
    }

    // Exchange code for tokens
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      return NextResponse.redirect('/login?error=missing_token');
    }

    // Verify the ID token
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      return NextResponse.redirect('/login?error=invalid_payload');
    }

    const { sub: googleId, email, name, email_verified, picture } = payload;

    // Check if user exists by Google ID
    let user = await UserRepository.findByGoogleId(googleId);
    
    if (!user) {
      // Check if user exists with same email but different provider
      const existingEmailUser = await UserRepository.findByEmail(email);
      if (existingEmailUser) {
        return NextResponse.redirect('/login?error=email_exists_different_provider');
      }

      // Create new user
      const { user: newUser, profile } = await UserRepository.createUser(
        email,
        undefined, // No password for OAuth users
        name || undefined,
        googleId,
        'google'
      );

      user = newUser;

      // Update profile with Google avatar if provided
      if (picture) {
        await UserRepository.updateProfile(user.id, { avatarUrl: picture });
      }
    } else {
      // Update existing user's last login
      await UserRepository.updateLastLogin(user.id);
    }

    // Generate JWT token
    const jwtToken = await JWTUtils.generate({ userId: user.id, email: user.email });

    // Create session
    await UserRepository.createSession(user.id, jwtToken, {
      userAgent: req.headers.get('user-agent') || 'unknown',
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    });

    // Set JWT as HTTP-only cookie
    const response = NextResponse.redirect('/dashboard');
    response.cookies.set('auth-token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      sameSite: 'lax',
    });

    // Clear OAuth state cookie
    response.cookies.delete('oauth_state');

    return response;

  } catch (error: any) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect('/login?error=oauth_failed');
  }
}
