import { NextRequest, NextResponse } from 'next/server';

export interface SecurityHeadersConfig {
  contentSecurityPolicy?: string;
  hsts?: {
    maxAge: number;
    includeSubDomains: boolean;
    preload: boolean;
  };
  referrerPolicy?: string;
  permissionsPolicy?: string[];
  crossOriginEmbedderPolicy?: string;
  crossOriginOpenerPolicy?: string;
  crossOriginResourcePolicy?: string;
}

export class SecurityHeaders {
  private static readonly DEFAULT_CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com",
    "frame-src 'self' https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; ');

  static apply(
    response: NextResponse,
    config: SecurityHeadersConfig = {}
  ): NextResponse {
    const {
      contentSecurityPolicy = this.DEFAULT_CSP,
      hsts = {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      },
      referrerPolicy = 'strict-origin-when-cross-origin',
      permissionsPolicy = [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
        'magnetometer=()',
        'accelerometer=()',
        'gyroscope=()'
      ],
      crossOriginEmbedderPolicy = 'require-corp',
      crossOriginOpenerPolicy = 'same-origin',
      crossOriginResourcePolicy = 'same-origin'
    } = config;

    // Content Security Policy
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);

    // HTTP Strict Transport Security
    const hstsValue = `max-age=${hsts.maxAge}${
      hsts.includeSubDomains ? '; includeSubDomains' : ''
    }${hsts.preload ? '; preload' : ''}`;
    response.headers.set('Strict-Transport-Security', hstsValue);

    // X-Frame-Options (legacy support)
    response.headers.set('X-Frame-Options', 'DENY');

    // X-Content-Type-Options
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // Referrer Policy
    response.headers.set('Referrer-Policy', referrerPolicy);

    // X-XSS-Protection (legacy support)
    response.headers.set('X-XSS-Protection', '1; mode=block');

    // Permissions Policy
    if (permissionsPolicy.length > 0) {
      response.headers.set('Permissions-Policy', permissionsPolicy.join(', '));
    }

    // Cross-Origin Policies
    response.headers.set('Cross-Origin-Embedder-Policy', crossOriginEmbedderPolicy);
    response.headers.set('Cross-Origin-Opener-Policy', crossOriginOpenerPolicy);
    response.headers.set('Cross-Origin-Resource-Policy', crossOriginResourcePolicy);

    // Remove server fingerprinting
    response.headers.delete('X-Powered-By');
    response.headers.delete('Server');

    return response;
  }

  /**
   * Middleware for applying security headers to all responses
   */
  static middleware(config?: SecurityHeadersConfig) {
    return (response: NextResponse): NextResponse => {
      return this.apply(response, config);
    };
  }

  /**
   * Get CSP nonce for inline scripts/styles
   */
  static generateNonce(): string {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  }

  /**
   * Create CSP with nonce support
   */
  static createCSPWithNonce(nonce: string): string {
    return [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com",
      "frame-src 'self' https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ].join('; ');
  }
}

// Utility function for API routes
export function withSecurityHeaders<T extends any[]>(
  handler: (...args: T) => Promise<Response>,
  config?: SecurityHeadersConfig
) {
  return async (...args: T): Promise<Response> => {
    const response = await handler(...args);
    const nextResponse = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
    
    return SecurityHeaders.apply(nextResponse, config);
  };
}
