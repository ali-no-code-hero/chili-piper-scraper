import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Load environment variables
if (typeof window === 'undefined') {
  require('dotenv').config();
}

// Mock API key manager for local testing (no database)
class MockApiKeyManager {
  private apiKeys = new Map<string, any>();

  constructor() {
    // Add a default API key for testing
    this.apiKeys.set('cp_live_demo_client_key_2024_secure_987654321fedcba', {
      id: 1,
      key: 'cp_live_demo_client_key_2024_secure_987654321fedcba',
      name: 'Demo Client',
      description: 'Demo API key for testing',
      isActive: true,
      createdAt: new Date().toISOString(),
      usageCount: 0
    });
  }

  validateApiKey(key: string): any {
    return this.apiKeys.get(key) || null;
  }

  createApiKey(name: string, description?: string, customKey?: string): any {
    const key = customKey || `cp_live_${Math.random().toString(36).substring(2, 15)}`;
    const apiKey = {
      id: Date.now(),
      key,
      name,
      description: description || '',
      isActive: true,
      createdAt: new Date().toISOString(),
      usageCount: 0
    };
    this.apiKeys.set(key, apiKey);
    return apiKey;
  }

  getAllApiKeys(): any[] {
    return Array.from(this.apiKeys.values());
  }

  updateApiKey(id: number, updates: any): any {
    for (const [key, apiKey] of Array.from(this.apiKeys.entries())) {
      if (apiKey.id === id) {
        const updated = { ...apiKey, ...updates };
        this.apiKeys.set(key, updated);
        return updated;
      }
    }
    return null;
  }

  deleteApiKey(id: number): boolean {
    for (const [key, apiKey] of Array.from(this.apiKeys.entries())) {
      if (apiKey.id === id) {
        this.apiKeys.delete(key);
        return true;
      }
    }
    return false;
  }

  getApiKeyById(id: number): any {
    for (const apiKey of Array.from(this.apiKeys.values())) {
      if (apiKey.id === id) {
        return apiKey;
      }
    }
    return null;
  }

  getUsageStats(): any[] {
    return Array.from(this.apiKeys.values()).map(key => ({
      name: key.name,
      key: key.key.substring(0, 20) + '...',
      total_requests: key.usageCount,
      avg_response_time: 0,
      successful_requests: key.usageCount,
      last_request: null
    }));
  }
}

const apiKeyManager = new MockApiKeyManager();

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
    rateLimitMap.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 }); // 15 minutes
    return true;
  }
  
  if (limit.count >= 5) { // 5 attempts per 15 minutes
    return false;
  }
  
  limit.count++;
  return true;
}

function validateAdminToken(request: NextRequest): boolean {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  try {
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
      // Validate credentials
      if (username !== ADMIN_USERNAME) {
        return NextResponse.json(
          { success: false, error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const isValidPassword = bcrypt.compareSync(password, ADMIN_PASSWORD_HASH);
      if (!isValidPassword) {
        return NextResponse.json(
          { success: false, error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Generate admin token
      const adminToken = jwt.sign(
        { 
          role: 'admin', 
          username: ADMIN_USERNAME,
          timestamp: Date.now() 
        },
        JWT_SECRET,
        { expiresIn: '1h' } // 1 hour expiration
      );

      console.log(`Admin login successful from IP: ${clientIP}`);

      return NextResponse.json({
        success: true,
        adminToken,
        message: 'Login successful'
      });
    }

    // Validate admin token for other actions
    if (!validateAdminToken(request)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { action: apiAction, ...data } = body;

    switch (apiAction) {
      case 'create':
        const newKey = apiKeyManager.createApiKey(data.name, data.description, data.customKey);
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
          apiKeys: keys.map(key => ({
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
    if (!validateAdminToken(request)) {
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
          apiKeys: keys.map(key => ({
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