import { NextRequest, NextResponse } from 'next/server';
// jsonwebtoken and bcryptjs are loaded dynamically to avoid bundling issues

// Load environment variables
if (typeof window === 'undefined') {
  require('dotenv').config();
}

// Simple in-memory API key storage (replacement for ApiKeyManager)
const apiKeys = new Map<string, { id: string; name: string; createdAt: number; lastUsed?: number }>();
let keyCounter = 1;

// Simple API key manager stub
const apiKeyManager = {
  createApiKey: (name: string, customKey?: string) => {
    const id = String(keyCounter++);
    const key = customKey || `cp_live_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    apiKeys.set(key, { id, name, createdAt: Date.now() });
    return { id, key, name, createdAt: new Date().toISOString() };
  },
  getAllApiKeys: () => Array.from(apiKeys.entries()).map(([key, data]) => ({ ...data, key })),
  updateApiKey: (id: string, updates: any) => {
    const entry = Array.from(apiKeys.entries()).find(([_, data]) => data.id === id);
    if (entry) {
      Object.assign(entry[1], updates);
      return { ...entry[1], key: entry[0] };
    }
    return null;
  },
  deleteApiKey: (id: string) => {
    const entry = Array.from(apiKeys.entries()).find(([_, data]) => data.id === id);
    if (entry) {
      apiKeys.delete(entry[0]);
      return true;
    }
    return false;
  },
  getUsageStats: () => ({ total: apiKeys.size, active: apiKeys.size }),
  getApiKeyById: (id: string) => {
    const entry = Array.from(apiKeys.entries()).find(([_, data]) => data.id === id);
    return entry ? { ...entry[1], key: entry[0] } : null;
  },
  validateApiKey: (key: string) => {
    const entry = apiKeys.get(key);
    if (entry) {
      entry.lastUsed = Date.now();
      return true;
    }
    return false;
  }
};

// Admin credentials (for local testing)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '$2a$10$8/0PUitA5JirayZ.yaRQ0eITj6puAdr/sSvGJ0B6qPImIR3u9.VQO'; // password: AdminPass123!
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Debug logging
console.log('🔐 Admin credentials loaded:');
console.log('  ADMIN_USERNAME:', ADMIN_USERNAME);
console.log('  ADMIN_PASSWORD_HASH:', ADMIN_PASSWORD_HASH ? 'SET' : 'NOT SET');
console.log('  JWT_SECRET:', JWT_SECRET ? 'SET' : 'NOT SET');

// Rate limiting (simple in-memory store)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);
  
  if (!limit || now > limit.resetTime) {
    // Reset window: 2 minutes
    rateLimitMap.set(ip, { count: 1, resetTime: now + 2 * 60 * 1000 });
    return true;
  }
  
  // Allow up to 10 attempts per 2 minutes
  if (limit.count >= 10) {
    return false;
  }
  
  limit.count++;
  return true;
}

async function validateAdminToken(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return decoded.role === 'admin' && decoded.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

// Admin login endpoint
export async function POST(request: NextRequest) {
  try {
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    
    // Check rate limiting
    if (!checkRateLimit(clientIP)) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { action, username, password } = body;

    if (action === 'login') {
      console.log('🔍 Login attempt:', { username, password: password ? 'PROVIDED' : 'MISSING', adminUsername: ADMIN_USERNAME });
      
      // Validate credentials
      if (username !== ADMIN_USERNAME) {
        console.log('❌ Username mismatch:', { provided: username, expected: ADMIN_USERNAME });
        return NextResponse.json(
          { success: false, error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      console.log('✅ Username matches, checking password (hardcoded override)...');
      // TEMPORARY: Hardcoded password override per user request
      const HARDCODED_ADMIN_PASSWORD = '3fkG4q4_bYZH9bUAiQQG';
      const isValidPassword = password === HARDCODED_ADMIN_PASSWORD;
      console.log('🔐 Password check result (hardcoded):', isValidPassword);

      if (!isValidPassword) {
        console.log('❌ Password mismatch');
        return NextResponse.json(
          { success: false, error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Generate admin token (dynamic import to avoid bundling issues)
      const jwt = await import('jsonwebtoken');
      const adminToken = jwt.default.sign(
        { 
          role: 'admin', 
          username: ADMIN_USERNAME,
          timestamp: Date.now() 
        },
        JWT_SECRET,
        { expiresIn: '1h' } // 1 hour expiration
      );

      // Reset rate limit on successful login
      try { rateLimitMap.delete(clientIP); } catch {}

      console.log(`Admin login successful from IP: ${clientIP}`);

      return NextResponse.json({
        success: true,
        adminToken,
        message: 'Login successful'
      });
    }

    // Validate admin token for other actions
    if (!(await validateAdminToken(request))) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { action: apiAction, ...data } = body;

    switch (apiAction) {
      case 'create':
        // Create API key; second arg is custom key if provided
        const newKey = apiKeyManager.createApiKey(data.name, data.customKey);
        return NextResponse.json({
          success: true,
          apiKey: {
            ...newKey,
            key: newKey.key.substring(0, 20) + '...' // Mask the key
          },
          message: 'API key created successfully'
        });

      case 'list':
        const keys = apiKeyManager.getAllApiKeys();
        return NextResponse.json({
          success: true,
          apiKeys: (keys as any[]).map((key: any) => ({
            ...key,
            key: key.key.substring(0, 20) + '...' // Mask the key
          }))
        });

      case 'update':
        const updatedKey = apiKeyManager.updateApiKey(data.id, data.updates);
        if (!updatedKey) {
          return NextResponse.json(
            { success: false, error: 'API key not found or invalid updates' },
            { status: 404 }
          );
        }
        return NextResponse.json({
          success: true,
          apiKey: {
            ...updatedKey,
            key: updatedKey.key.substring(0, 20) + '...' // Mask the key
          },
          message: 'API key updated successfully'
        });

      case 'delete':
        const deleted = apiKeyManager.deleteApiKey(data.id);
        if (!deleted) {
          return NextResponse.json(
            { success: false, error: 'API key not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({
          success: true,
          message: 'API key deleted successfully'
        });

      case 'stats':
        const stats = apiKeyManager.getUsageStats();
        return NextResponse.json({
          success: true,
          stats
        });

      case 'get-full-key':
        // Only allow getting full key for specific key ID
        const fullKey = apiKeyManager.getApiKeyById(data.id);
        if (!fullKey) {
          return NextResponse.json(
            { success: false, error: 'API key not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({
          success: true,
          fullKey: fullKey.key
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Admin API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!(await validateAdminToken(request))) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    switch (action) {
      case 'list':
        const keys = apiKeyManager.getAllApiKeys();
        return NextResponse.json({
          success: true,
          apiKeys: (keys as any[]).map((key: any) => ({
            ...key,
            key: key.key.substring(0, 20) + '...' // Mask the key
          }))
        });

      case 'stats':
        const stats = apiKeyManager.getUsageStats();
        return NextResponse.json({
          success: true,
          stats
        });

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Admin API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}