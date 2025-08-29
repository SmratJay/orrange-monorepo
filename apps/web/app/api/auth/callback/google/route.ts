import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from '@/lib/auth/google';
import { UserRepository } from '@/lib/auth/repository';
import { JWTUtils } from '@/lib/auth/jwt';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const storedState = request.cookies.get('oauth_state')?.value;
    
    if (!code || !state || state !== storedState) {
      return NextResponse.redirect(new URL('/login?error=oauth_state_mismatch', request.url));
    }
    
    // Exchange code for tokens
    const tokens = await GoogleAuth.exchangeCode(code);
    if (!tokens.id_token) throw new Error('No ID token received');
    
    // Verify Google token
    const googleUser = await GoogleAuth.verifyToken(tokens.id_token);
    
    // Find or create user
    let user = await UserRepository.findByEmail(googleUser.email);
    
    if (!user) {
      const { user: newUser, profile } = await UserRepository.createUser(
        googleUser.email,
        '', // No password for OAuth users
        googleUser.name
      );
      
      // Update user with OAuth info
      await UserRepository.updateOAuthUser(newUser.id, {
        provider: 'google',
        providerId: googleUser.id,
        emailVerified: googleUser.emailVerified,
        avatarUrl: googleUser.picture,
      });
      
      user = newUser;
    }
    
    // Generate JWT
    const token = await JWTUtils.generate({
      userId: user.id,
      email: user.email,
    });
    
    const response = NextResponse.redirect(new URL('/dashboard', request.url));
    response.cookies.delete('oauth_state');
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      sameSite: 'lax',
    });
    
    return response;
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', request.url));
  }
}
