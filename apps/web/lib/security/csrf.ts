import { NextRequest } from 'next/server';
import crypto from 'crypto';

export class CSRFProtection {
  private static readonly TOKEN_LENGTH = 32;
  private static readonly HEADER_NAME = 'x-csrf-token';
  private static readonly COOKIE_NAME = 'csrf-token';

  /**
   * Generate a cryptographically secure CSRF token
   */
  static generateToken(): string {
    return crypto.randomBytes(this.TOKEN_LENGTH).toString('hex');
  }

  /**
   * Create CSRF token and set cookie
   */
  static createTokenResponse(): { token: string; cookie: string } {
    const token = this.generateToken();
    const cookie = `${this.COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`;
    
    return { token, cookie };
  }

  /**
   * Validate CSRF token from request
   */
  static validateToken(req: NextRequest): boolean {
    // Skip CSRF for safe methods
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
      return true;
    }

    const headerToken = req.headers.get(this.HEADER_NAME);
    const cookieToken = this.extractTokenFromCookies(req);

    if (!headerToken || !cookieToken) {
      return false;
    }

    // Use timing-safe comparison
    return this.safeCompare(headerToken, cookieToken);
  }

  /**
   * Extract CSRF token from cookies
   */
  private static extractTokenFromCookies(req: NextRequest): string | null {
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    return cookies[this.COOKIE_NAME] || null;
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private static safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Middleware wrapper for CSRF protection
   */
  static middleware(handler: (req: NextRequest) => Promise<Response>) {
    return async (req: NextRequest): Promise<Response> => {
      if (!this.validateToken(req)) {
        return new Response(
          JSON.stringify({ error: 'Invalid CSRF token' }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      return handler(req);
    };
  }
}

// Utility function for API routes
export function withCSRF<T extends any[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    const req = args[0] as NextRequest;
    
    if (!CSRFProtection.validateToken(req)) {
      return new Response(
        JSON.stringify({ error: 'CSRF token validation failed' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return handler(...args);
  };
}
