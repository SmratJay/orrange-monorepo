import { z } from 'zod';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitizes user input to prevent injection attacks
 * @param input The input string to sanitize
 * @returns Sanitized input string
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.trim();
}

/**
 * Comprehensive input sanitization and validation utilities
 */
export class InputSanitizer {
  
  /**
   * Sanitize HTML content to prevent XSS attacks
   */
  static sanitizeHtml(input: string, allowedTags: string[] = []): string {
    if (!input || typeof input !== 'string') return '';
    
    const config = allowedTags.length > 0 
      ? { ALLOWED_TAGS: allowedTags, ALLOWED_ATTR: [] }
      : { ALLOWED_TAGS: [], ALLOWED_ATTR: [] };
    
    return DOMPurify.sanitize(input, config);
  }

  /**
   * Sanitize and validate email addresses
   */
  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') return '';
    
    // Remove potentially dangerous characters
    const sanitized = email
      .toLowerCase()
      .trim()
      .replace(/[<>'"&]/g, '');
    
    // Validate format
    const emailSchema = z.string().email();
    try {
      return emailSchema.parse(sanitized);
    } catch {
      throw new Error('Invalid email format');
    }
  }

  /**
   * Sanitize names and text fields
   */
  static sanitizeName(name: string, maxLength: number = 100): string {
    if (!name || typeof name !== 'string') return '';
    
    // Remove HTML tags and dangerous characters
    const sanitized = this.sanitizeHtml(name)
      .replace(/[<>'"&\x00-\x1f\x7f-\x9f]/g, '')
      .trim()
      .substring(0, maxLength);
    
    // Validate contains only allowed characters
    if (!/^[a-zA-Z\s\-'\.]+$/.test(sanitized)) {
      throw new Error('Name contains invalid characters');
    }
    
    return sanitized;
  }

  /**
   * Sanitize and validate phone numbers
   */
  static sanitizePhone(phone: string): string {
    if (!phone || typeof phone !== 'string') return '';
    
    // Remove all non-numeric characters except +
    const sanitized = phone.replace(/[^\d+]/g, '');
    
    // Validate format (basic international format)
    if (!/^\+?[\d\s\-\(\)]{7,15}$/.test(sanitized)) {
      throw new Error('Invalid phone number format');
    }
    
    return sanitized;
  }

  /**
   * Sanitize URLs and validate against whitelist
   */
  static sanitizeUrl(url: string, allowedDomains: string[] = []): string {
    if (!url || typeof url !== 'string') return '';
    
    try {
      const urlObj = new URL(url);
      
      // Only allow HTTP/HTTPS protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Invalid URL protocol');
      }
      
      // Check against domain whitelist if provided
      if (allowedDomains.length > 0) {
        const domain = urlObj.hostname.toLowerCase();
        if (!allowedDomains.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`))) {
          throw new Error('Domain not in whitelist');
        }
      }
      
      return urlObj.toString();
    } catch {
      throw new Error('Invalid URL format');
    }
  }

  /**
   * Sanitize file names
   */
  static sanitizeFileName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return '';
    
    // Remove dangerous characters and normalize
    const sanitized = fileName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
      .replace(/^\.+/, '') // Remove leading dots
      .substring(0, 255) // Limit length
      .trim();
    
    if (!sanitized) {
      throw new Error('Invalid file name');
    }
    
    return sanitized;
  }

  /**
   * Sanitize SQL-like inputs (for additional protection)
   */
  static sanitizeSqlInput(input: string): string {
    if (!input || typeof input !== 'string') return '';
    
    // Remove or escape SQL injection patterns
    const sqlPatterns = [
      /('|(\\'))+/gi,
      /(;|\||&|\$|>|<|`|!)/gi,
      /(select|insert|update|delete|drop|create|alter|exec|union|script)/gi
    ];
    
    let sanitized = input;
    sqlPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });
    
    return sanitized.trim();
  }

  /**
   * Comprehensive request body sanitization
   */
  static sanitizeRequestBody(body: any, schema?: z.ZodSchema): any {
    if (!body || typeof body !== 'object') {
      return body;
    }
    
    const sanitized = this.deepSanitizeObject(body);
    
    // Apply Zod validation if schema provided
    if (schema) {
      try {
        return schema.parse(sanitized);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
        }
        throw error;
      }
    }
    
    return sanitized;
  }

  /**
   * Deep sanitize object recursively
   */
  private static deepSanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      return this.sanitizeHtml(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepSanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: any = {};
      Object.keys(obj).forEach(key => {
        // Sanitize key name
        const sanitizedKey = this.sanitizeHtml(key);
        sanitized[sanitizedKey] = this.deepSanitizeObject(obj[key]);
      });
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Rate limiting key sanitization
   */
  static sanitizeRateLimitKey(key: string): string {
    if (!key || typeof key !== 'string') return 'anonymous';
    
    return key
      .replace(/[^a-zA-Z0-9\-_:]/g, '')
      .substring(0, 100)
      .toLowerCase();
  }
}

// Pre-configured validation schemas
export const AuthSchemas = {
  register: z.object({
    name: z.string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name must be less than 100 characters')
      .regex(/^[a-zA-Z\s\-'\.]+$/, 'Name contains invalid characters'),
    email: z.string()
      .email('Invalid email format')
      .max(254, 'Email too long'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password too long')
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain lowercase, uppercase, and number')
  }),
  
  login: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
  })
};

// Utility function for API route sanitization
export function withSanitization<T extends any[]>(
  handler: (...args: T) => Promise<Response>,
  schema?: z.ZodSchema
) {
  return async (...args: T): Promise<Response> => {
    try {
      const request = args[0] as Request;
      
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const body = await request.json();
        const sanitizedBody = InputSanitizer.sanitizeRequestBody(body, schema);
        
        // Replace request with sanitized version
        const sanitizedRequest = new Request(request, {
          body: JSON.stringify(sanitizedBody)
        });
        
        args[0] = sanitizedRequest as T[0];
      }
      
      return handler(...args);
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Invalid request data' 
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  };
}
