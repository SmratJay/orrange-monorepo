import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Security middleware imports (commented for future use when modules are stable)
// import { authRateLimit, apiRateLimit } from './rateLimit';
// import { withSecurityHeaders } from './headers';
// import { withSanitization } from './sanitization';
// import { CSRFProtection } from './csrf';

/**
 * Security middleware composition utilities
 * These will be progressively enabled as the system stabilizes
 */
export class SecurityMiddleware {
  
  /**
   * Basic input validation and sanitization
   */
  static validateInput<T>(schema: z.ZodSchema<T>) {
    return async (request: NextRequest): Promise<{ isValid: boolean; data?: T; error?: string }> => {
      try {
        const body = await request.json();
        const result = schema.safeParse(body);
        
        if (!result.success) {
          return {
            isValid: false,
            error: result.error.errors[0].message
          };
        }
        
        return {
          isValid: true,
          data: result.data
        };
      } catch (error) {
        return {
          isValid: false,
          error: 'Invalid request body'
        };
      }
    };
  }

  /**
   * Basic rate limiting (simplified in-memory version)
   */
  private static rateLimitStore: Map<string, { count: number; resetTime: number }> = new Map();

  static simpleRateLimit(maxRequests: number, windowMs: number) {
    return (request: NextRequest): boolean => {
      const key = this.getRateLimitKey(request);
      const now = Date.now();
      const entry = this.rateLimitStore.get(key);

      if (!entry || entry.resetTime < now) {
        this.rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
        return true;
      }

      if (entry.count >= maxRequests) {
        return false;
      }

      entry.count++;
      return true;
    };
  }

  private static getRateLimitKey(request: NextRequest): string {
    // Use IP address or fallback to a default key
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : 'anonymous';
    return `rate_limit:${ip}`;
  }

  /**
   * Security headers application
   */
  static applySecurityHeaders(response: NextResponse): NextResponse {
    // Basic security headers
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Remove server fingerprinting
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');
    
    return response;
  }

  /**
   * Composite security wrapper for API routes
   */
  static secure<T extends any[]>(
    handler: (...args: T) => Promise<NextResponse>,
    options: {
      rateLimit?: { maxRequests: number; windowMs: number };
      validation?: z.ZodSchema;
      requireAuth?: boolean;
    } = {}
  ) {
    return async (...args: T): Promise<NextResponse> => {
      const request = args[0] as NextRequest;

      try {
        // Rate limiting
        if (options.rateLimit) {
          const rateLimiter = this.simpleRateLimit(
            options.rateLimit.maxRequests,
            options.rateLimit.windowMs
          );
          
          if (!rateLimiter(request)) {
            return NextResponse.json(
              { error: 'Rate limit exceeded' },
              { status: 429 }
            );
          }
        }

        // Input validation
        if (options.validation && request.method !== 'GET') {
          const validator = this.validateInput(options.validation);
          const validation = await validator(request);
          
          if (!validation.isValid) {
            return NextResponse.json(
              { error: validation.error },
              { status: 400 }
            );
          }
        }

        // Execute handler
        const response = await handler(...args);

        // Apply security headers
        return this.applySecurityHeaders(response);

      } catch (error) {
        console.error('Security middleware error:', error);
        const errorResponse = NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        );
        
        return this.applySecurityHeaders(errorResponse);
      }
    };
  }

  /**
   * Authentication-specific security wrapper
   */
  static secureAuth<T extends any[]>(
    handler: (...args: T) => Promise<NextResponse>,
    schema: z.ZodSchema
  ) {
    return this.secure(handler, {
      rateLimit: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 attempts per 15 minutes
      validation: schema
    });
  }

  /**
   * API endpoint security wrapper
   */
  static secureAPI<T extends any[]>(
    handler: (...args: T) => Promise<NextResponse>
  ) {
    return this.secure(handler, {
      rateLimit: { maxRequests: 100, windowMs: 60 * 1000 }, // 100 requests per minute
      requireAuth: true
    });
  }
}

// Export convenience functions
export const secureAuth = SecurityMiddleware.secureAuth.bind(SecurityMiddleware);
export const secureAPI = SecurityMiddleware.secureAPI.bind(SecurityMiddleware);
export const secure = SecurityMiddleware.secure.bind(SecurityMiddleware);
