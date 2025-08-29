import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  message?: string;
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (use Redis in production)
const store: RateLimitStore = {};

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(key => {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  });
}, 5 * 60 * 1000);

export function createRateLimit(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => req.ip || 'anonymous',
    skipSuccessfulRequests = false,
    message = 'Too many requests, please try again later.'
  } = config;

  return async function rateLimitMiddleware(
    req: NextRequest,
    handler: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowStart = now - windowMs;

    // Initialize or reset if window expired
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime: now + windowMs
      };
    }

    // Check if limit exceeded
    if (store[key].count >= maxRequests) {
      return NextResponse.json(
        { error: message, retryAfter: Math.ceil((store[key].resetTime - now) / 1000) },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(store[key].resetTime).toISOString(),
            'Retry-After': Math.ceil((store[key].resetTime - now) / 1000).toString()
          }
        }
      );
    }

    // Increment counter
    store[key].count++;

    try {
      const response = await handler();
      
      // Skip counting successful requests if configured
      if (skipSuccessfulRequests && response.status < 400) {
        store[key].count--;
      }

      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', (maxRequests - store[key].count).toString());
      response.headers.set('X-RateLimit-Reset', new Date(store[key].resetTime).toISOString());

      return response;
    } catch (error) {
      // Decrement on error to prevent penalty for server errors
      store[key].count--;
      throw error;
    }
  };
}

// Pre-configured rate limiters
export const authRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts per window
  keyGenerator: (req) => `auth:${req.ip || 'anonymous'}`,
  message: 'Too many authentication attempts. Please try again in 15 minutes.'
});

export const apiRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  skipSuccessfulRequests: true,
  message: 'API rate limit exceeded. Please slow down your requests.'
});

export const strictRateLimit = createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute
  message: 'Rate limit exceeded for this sensitive operation.'
});
