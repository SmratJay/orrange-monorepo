import { NextRequest, NextResponse } from 'next/server';
import { loginSchema } from '@/lib/validations/auth';
import { UserRepository } from '@/lib/auth/repository';
import { JWTUtils } from '@/lib/auth/jwt';
import { PasswordUtils } from '@/lib/auth/password';
import { db } from '@/lib/db/connection';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.error.errors[0].message,
          field: validation.error.errors[0].path[0],
        }
      }, { status: 400 });
    }

    const { email, password } = validation.data;

    // Find user with password hash for authentication
    const users = await db.query(
      `SELECT id, email, password_hash, email_verified, created_at, updated_at, last_login_at, status
       FROM users WHERE email = ? AND status = 'active'`,
      [email]
    );

    if (users.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        }
      }, { status: 401 });
    }

    const userRow = users[0];

    // Verify password
    const isValidPassword = await PasswordUtils.verify(password, userRow.password_hash);
    if (!isValidPassword) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        }
      }, { status: 401 });
    }

    // Get user profile
    const profiles = await db.query(
      `SELECT id, user_id, username, display_name, bio, avatar_url, created_at, updated_at
       FROM user_profiles WHERE user_id = ?`,
      [userRow.id]
    );

    const profile = profiles.length > 0 ? {
      id: profiles[0].id,
      userId: profiles[0].user_id,
      username: profiles[0].username,
      displayName: profiles[0].display_name,
      bio: profiles[0].bio,
      avatarUrl: profiles[0].avatar_url,
      createdAt: profiles[0].created_at,
      updatedAt: profiles[0].updated_at,
    } : null;

    // Generate JWT
    const token = await JWTUtils.generate({
      userId: userRow.id,
      email: userRow.email,
    });

    // Update last login time
    await db.query(
      `UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [userRow.id]
    );

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: userRow.id,
        email: userRow.email,
        profile: profile ? {
          username: profile.username,
          displayName: profile.displayName,
        } : null
      }
    }, { 
      status: 200,
      headers: {
        'Set-Cookie': `auth-token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Login failed. Please try again.',
      }
    }, { status: 500 });
  }
}
