// Lightweight, framework-agnostic helpers for security

// Simple in-memory API key list (for local/dev). Replace with your own store if needed.
const DEFAULT_KEYS = new Set<string>([
  process.env.DEFAULT_API_KEY || 'default-key-12345',
  'cp_live_s24p7wp7vqao1b3r', // Add your API key here
  ...(process.env.API_KEYS ? process.env.API_KEYS.split(',') : [])
]);

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

  // API key validation (supports both Authorization: Bearer and X-API-Key headers)
  validateApiKey(authHeader: string, xApiKey?: string): { valid: boolean; apiKey?: any } {
    let token: string | null = null;
    
    // Try Authorization header first (Bearer token)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    // Fallback to X-API-Key header
    else if (xApiKey) {
      token = xApiKey;
    }
    
    if (!token) {
      return { valid: false };
    }
    
    const ok = DEFAULT_KEYS.has(token);
    return { valid: ok, apiKey: ok ? { key: token } : undefined };
  }

  // Security headers helper (works with Node/HTTP response-like objects and Next.js Response)
  addSecurityHeaders(res: any): any {
    // Check if it's a Next.js Response object
    if (res instanceof Response || res.headers) {
      const headers = new Headers(res.headers);
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      headers.set('X-XSS-Protection', '1; mode=block');
      headers.set('Content-Security-Policy', "default-src 'self'");
      
      // Return new Response with headers if it's a Response object
      if (res instanceof Response) {
        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: headers
        });
      }
      
      // For NextResponse, update headers
      res.headers = headers;
      return res;
    }
    
    // For Node.js HTTP response objects
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    // Remove server information
    try { res.removeHeader && res.removeHeader('X-Powered-By'); } catch {}
    return res;
  }

  // CORS configuration helper
  configureCORS(res: any, allowedOrigins: string[] = ['*']): void {
    const origin = process.env.NODE_ENV === 'production' ? 
      allowedOrigins.join(', ') : '*';
    
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
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

  // Framework-agnostic middleware factory (kept for compatibility; not used in Fastify path)
  secureRequestMiddleware(config: {
    requireAuth?: boolean;
    rateLimit?: SecurityConfig;
    inputSchema?: any;
    allowedMethods?: string[];
  } = {}) {
    return async (req: any, res: any, next: () => void) => {
      const clientIP = req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                      req.headers['x-real-ip']?.toString() || 
                      req.ip ||
                      'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const method = req.method;

      // Check allowed methods
      if (config.allowedMethods && !config.allowedMethods.includes(method)) {
        this.logSecurityEvent('METHOD_NOT_ALLOWED', { method, endpoint: req.url }, clientIP);
        res.status(405).json({ success: false, error: 'Method Not Allowed' });
        return;
      }

      // Rate limiting
      if (config.rateLimit && !this.checkRateLimit(clientIP, config.rateLimit)) {
        this.logSecurityEvent('RATE_LIMIT_EXCEEDED', { 
          endpoint: req.url,
          userAgent 
        }, clientIP);
        
        res.status(429)
          .setHeader('Retry-After', '900')
          .json({ success: false, error: 'Too Many Requests' });
        return;
      }

      // Authentication check
      if (config.requireAuth) {
        const authHeader = req.headers.authorization || '';
        const xApiKey = req.headers['x-api-key'] || '';
        const authResult = this.validateApiKey(authHeader, xApiKey);
        
        if (!authResult.valid) {
          this.logSecurityEvent('AUTH_FAILED', { 
            endpoint: req.url,
            userAgent 
          }, clientIP);
          
          res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid or missing API key. Use Authorization: Bearer <key> or X-API-Key: <key> header'
          });
          return;
        }
        
        // Attach API key to request for later use
        (req as any).apiKey = authResult.apiKey;
      }

      // Input validation for POST requests
      if (method === 'POST' && config.inputSchema) {
        const sanitized = this.sanitizeInput(req.body);
        const validation = this.validateInput(sanitized, config.inputSchema);
        
        if (!validation.valid) {
          this.logSecurityEvent('VALIDATION_FAILED', { 
            endpoint: req.url,
            errors: validation.errors,
            userAgent 
          }, clientIP);
          
          res.status(400).json({
            success: false,
            error: 'Validation Error',
            message: validation.errors.join(', ')
          });
          return;
        }
        
        // Replace body with sanitized data
        req.body = sanitized;
      }

      // Add security headers
      this.addSecurityHeaders(res);
      this.configureCORS(res);

      next();
    };
  }

  // Next.js-specific secureRequest method
  async secureRequest(
    request: any,
    config: {
      requireAuth?: boolean;
      rateLimit?: SecurityConfig;
      inputSchema?: any;
      allowedMethods?: string[];
    } = {}
  ): Promise<{
    allowed: boolean;
    response?: any;
    sanitizedData?: any;
  }> {
    // Import NextResponse dynamically to avoid issues if not available
    const { NextResponse } = await import('next/server');
    
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    const method = request.method;

    // Check allowed methods
    if (config.allowedMethods && !config.allowedMethods.includes(method)) {
      this.logSecurityEvent('METHOD_NOT_ALLOWED', { method, endpoint: request.url }, clientIP);
      const response = NextResponse.json(
        { success: false, error: 'Method Not Allowed' },
        { status: 405 }
      );
      this.addSecurityHeaders(response);
      return { allowed: false, response };
    }

    // Rate limiting
    if (config.rateLimit && !this.checkRateLimit(clientIP, config.rateLimit)) {
      this.logSecurityEvent('RATE_LIMIT_EXCEEDED', { 
        endpoint: request.url,
        userAgent 
      }, clientIP);
      
      const response = NextResponse.json(
        { success: false, error: 'Too Many Requests' },
        { 
          status: 429,
          headers: { 'Retry-After': '900' }
        }
      );
      this.addSecurityHeaders(response);
      return { allowed: false, response };
    }

    // Authentication check
    if (config.requireAuth) {
      // Try multiple header name variations (case-insensitive)
      const authHeader = request.headers.get('authorization') || 
                        request.headers.get('Authorization') || '';
      const xApiKey = request.headers.get('x-api-key') || 
                     request.headers.get('X-API-Key') || 
                     request.headers.get('x-api-key') || '';
      
      // Debug logging
      const allHeaders = Array.from(request.headers.entries());
      const relevantHeaders = allHeaders.filter(([k, v]) => 
        k.toLowerCase().includes('api') || k.toLowerCase().includes('auth')
      );
      console.log('🔐 Auth check:', {
        hasAuthHeader: !!authHeader,
        authHeaderPrefix: authHeader.substring(0, 20),
        hasXApiKey: !!xApiKey,
        xApiKeyPrefix: xApiKey.substring(0, 20),
        relevantHeaders
      });
      
      const authResult = this.validateApiKey(authHeader, xApiKey);
      
      console.log('🔐 Auth result:', { valid: authResult.valid });
      
      if (!authResult.valid) {
        this.logSecurityEvent('AUTH_FAILED', { 
          endpoint: request.url,
          userAgent 
        }, clientIP);
        
        const response = NextResponse.json(
          {
            success: false,
            error: 'Unauthorized',
            message: 'Invalid or missing API key. Use Authorization: Bearer <key> or X-API-Key: <key> header'
          },
          { status: 401 }
        );
        this.addSecurityHeaders(response);
        return { allowed: false, response };
      }
    }

    // Parse and validate input for POST requests
    let sanitizedData: any = null;
    if (method === 'POST' && config.inputSchema) {
      try {
        const body = await request.json();
        sanitizedData = this.sanitizeInput(body);
        const validation = this.validateInput(sanitizedData, config.inputSchema);
        
        if (!validation.valid) {
          this.logSecurityEvent('VALIDATION_FAILED', { 
            endpoint: request.url,
            errors: validation.errors,
            userAgent 
          }, clientIP);
          
          const response = NextResponse.json(
            {
              success: false,
              error: 'Validation Error',
              message: validation.errors.join(', ')
            },
            { status: 400 }
          );
          this.addSecurityHeaders(response);
          return { allowed: false, response };
        }
      } catch (error) {
        const response = NextResponse.json(
          {
            success: false,
            error: 'Invalid JSON',
            message: 'Request body must be valid JSON'
          },
          { status: 400 }
        );
        this.addSecurityHeaders(response);
        return { allowed: false, response };
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
