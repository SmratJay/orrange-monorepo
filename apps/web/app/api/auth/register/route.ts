import { NextRequest, NextResponse } from 'next/server';
import { registerSchema } from '@/lib/validations/auth';
import { UserRepository } from '@/lib/auth/repository';
import { JWTUtils } from '@/lib/auth/jwt';

async function registerHandler(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validation = registerSchema.safeParse(body);
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

    const { name, email, password } = validation.data;

    // Check if user exists
    const existingUser = await UserRepository.emailExists(email);
    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists',
          field: 'email',
        }
      }, { status: 400 });
    }

    // Create user
    const { user, profile } = await UserRepository.createUser(email, password, name);

    // Generate JWT
    const token = await JWTUtils.generate({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        profile: {
          username: profile.username,
          displayName: profile.displayName,
        }
      }
    }, { 
      status: 201,
      headers: {
        'Set-Cookie': `auth-token=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Registration failed. Please try again.',
      }
    }, { status: 500 });
  }
}

// Apply security middleware in layers
export async function POST(request: NextRequest) {
  return registerHandler(request);
}
