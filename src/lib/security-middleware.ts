import { NextRequest, NextResponse } from 'next/server';
import { ApiKeyManager } from '@/lib/api-key-manager';

// Use persistent manager (SQLite in prod, in-memory fallback in dev)
const apiKeyManager = new ApiKeyManager(process.env.DATABASE_URL);

export interface SecurityConfig {
  maxRequests?: number;
  windowMs?: number;
  skipSuccessfulRequests?: boolean;
}

export class SecurityMiddleware {
  // Rate limiting store (simple in-memory for local testing)
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  // Rate limiting middleware
  checkRateLimit(ip: string, config: SecurityConfig = {}): boolean {
    const maxRequests = config.maxRequests || 100; // Default: 100 requests
    const windowMs = config.windowMs || 15 * 60 * 1000; // Default: 15 minutes
    
    const now = Date.now();
    const limit = this.rateLimitMap.get(ip);
    
    if (!limit || now > limit.resetTime) {
      this.rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
      return true;
    }
    
    if (limit.count >= maxRequests) {
      return false;
    }
    
    limit.count++;
    return true;
  }

  // Input validation and sanitization
  validateInput(data: any, schema: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];
      const typedRules = rules as any;
      
      if (typedRules.required && (!value || value.toString().trim() === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value) {
        // String validation
        if (typedRules.type === 'string') {
          if (typeof value !== 'string') {
            errors.push(`${field} must be a string`);
            continue;
          }
          
          if (typedRules.minLength && value.length < typedRules.minLength) {
            errors.push(`${field} must be at least ${typedRules.minLength} characters`);
          }
          
          if (typedRules.maxLength && value.length > typedRules.maxLength) {
            errors.push(`${field} must be no more than ${typedRules.maxLength} characters`);
          }
          
          if (typedRules.pattern && !typedRules.pattern.test(value)) {
            errors.push(`${field} format is invalid`);
          }
        }

        // Email validation
        if (typedRules.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push(`${field} must be a valid email address`);
          }
        }

        // Phone validation
        if (typedRules.type === 'phone') {
          const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
          if (!phoneRegex.test(value.replace(/[\s\-\(\)]/g, ''))) {
            errors.push(`${field} must be a valid phone number`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Sanitize input data
  sanitizeInput(data: any): any {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters
        sanitized[key] = value
          .replace(/[<>]/g, '') // Remove < and >
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/on\w+=/gi, '') // Remove event handlers
          .trim();
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  // API key validation
  validateApiKey(authHeader: string): { valid: boolean; apiKey?: any } {
    if (!authHeader.startsWith('Bearer ')) {
      return { valid: false };
    }
    
    const token = authHeader.substring(7);
    const ok = apiKeyManager.validateApiKey(token);
    return { valid: !!ok, apiKey: ok ? { key: token } : undefined };
  }

  // Security headers middleware
  addSecurityHeaders(response: NextResponse): NextResponse {
    // Prevent XSS attacks
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    
    // Prevent MIME type sniffing
    response.headers.set('Content-Security-Policy', "default-src 'self'");
    
    // Remove server information
    response.headers.delete('X-Powered-By');
    
    return response;
  }

  // CORS configuration
  configureCORS(response: NextResponse, allowedOrigins: string[] = ['*']): NextResponse {
    const origin = process.env.NODE_ENV === 'production' ? 
      allowedOrigins.join(', ') : '*';
    
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Max-Age', '86400');
    
    return response;
  }

  // Log security events
  logSecurityEvent(event: string, details: any, ip: string): void {
    const timestamp = new Date().toISOString();
    console.log(`[SECURITY] ${timestamp} - ${event}`, {
      ip,
      userAgent: details.userAgent,
      endpoint: details.endpoint,
      ...details
    });
  }

  // Main security middleware
  async secureRequest(
    request: NextRequest,
    config: {
      requireAuth?: boolean;
      rateLimit?: SecurityConfig;
      inputSchema?: any;
      allowedMethods?: string[];
    } = {}
  ): Promise<{ 
    allowed: boolean; 
    response?: NextResponse; 
    sanitizedData?: any;
    apiKey?: any;
  }> {
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const method = request.method;

    // Check allowed methods
    if (config.allowedMethods && !config.allowedMethods.includes(method)) {
      this.logSecurityEvent('METHOD_NOT_ALLOWED', { method, endpoint: request.url }, clientIP);
      return {
        allowed: false,
        response: new NextResponse('Method Not Allowed', { status: 405 })
      };
    }

    // Rate limiting
    if (config.rateLimit && !this.checkRateLimit(clientIP, config.rateLimit)) {
      this.logSecurityEvent('RATE_LIMIT_EXCEEDED', { 
        endpoint: request.url,
        userAgent 
      }, clientIP);
      
      return {
        allowed: false,
        response: new NextResponse('Too Many Requests', { 
          status: 429,
          headers: { 'Retry-After': '900' } // 15 minutes
        })
      };
    }

    // Authentication check
    if (config.requireAuth) {
      const authHeader = request.headers.get('Authorization') || '';
      const authResult = this.validateApiKey(authHeader);
      
      if (!authResult.valid) {
        this.logSecurityEvent('AUTH_FAILED', { 
          endpoint: request.url,
          userAgent 
        }, clientIP);
        
        return {
          allowed: false,
          response: new NextResponse(JSON.stringify({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid or missing API key'
          }), { 
            status: 401,
            headers: { 'Content-Type': 'application/json' }
          })
        };
      }
    }

    // Input validation for POST requests
    let sanitizedData = null;
    if (method === 'POST' && config.inputSchema) {
      try {
        const body = await request.json();
        const sanitized = this.sanitizeInput(body);
        const validation = this.validateInput(sanitized, config.inputSchema);
        
        if (!validation.valid) {
          this.logSecurityEvent('VALIDATION_FAILED', { 
            endpoint: request.url,
            errors: validation.errors,
            userAgent 
          }, clientIP);
          
          return {
            allowed: false,
            response: new NextResponse(JSON.stringify({
              success: false,
              error: 'Validation Error',
              message: validation.errors.join(', ')
            }), { 
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            })
          };
        }
        
        sanitizedData = sanitized;
      } catch (error) {
        this.logSecurityEvent('INVALID_JSON', { 
          endpoint: request.url,
          userAgent 
        }, clientIP);
        
        return {
          allowed: false,
          response: new NextResponse(JSON.stringify({
            success: false,
            error: 'Invalid JSON',
            message: 'Request body must be valid JSON'
          }), { 
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        };
      }
    }

    return { allowed: true, sanitizedData };
  }
}

// Input validation schemas
export const ValidationSchemas = {
  scrapeRequest: {
    first_name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    last_name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    email: { type: 'email', required: true, maxLength: 255 },
    phone: { type: 'phone', required: true, minLength: 10, maxLength: 20 }
  },
  
  adminLogin: {
    username: { type: 'string', required: true, minLength: 3, maxLength: 50 },
    password: { type: 'string', required: true, minLength: 8, maxLength: 128 }
  },
  
  apiKeyCreate: {
    name: { type: 'string', required: true, minLength: 1, maxLength: 100 },
    description: { type: 'string', required: false, maxLength: 500 },
    customKey: { type: 'string', required: false, maxLength: 200 }
  }
};