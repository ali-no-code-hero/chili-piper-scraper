import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware } from '@/lib/security-middleware';

const security = new SecurityMiddleware();

function validateApiKey(authHeader: string, xApiKey?: string): boolean {
  const result = security.validateApiKey(authHeader || '', xApiKey);
  console.log('[MOCK] validateApiKey result:', result.valid);
  return result.valid;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Get-Slots API Debug (No Playwright) - Request received');
    
    // Check authentication
    const authHeader = request.headers.get('Authorization') || '';
    const xApiKey = request.headers.get('X-API-Key') || undefined;
    console.log(`🔍 Auth header: ${authHeader.substring(0, 20)}...`);
    
    if (!validateApiKey(authHeader, xApiKey)) {
      console.log('❌ Authentication failed');
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing API key. Please provide a valid Bearer token.',
          usage: {
            example: 'Authorization: Bearer your-api-key-here'
          }
        },
        { status: 401 }
      );
    }
    
    console.log('✅ Authentication successful');
    
    // Parse request body
    const body = await request.json();
    console.log(`✅ Parsed data:`, body);
    
    // Validate required fields
    const requiredFields = ['first_name', 'last_name', 'email', 'phone'];
    const missingFields = requiredFields.filter(field => !body[field]);
    
    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
          message: `The following fields are required: ${missingFields.join(', ')}`
        },
        { status: 400 }
      );
    }
    
    console.log('🔍 Simulating scraping process...');
    
    // Simulate scraping with mock data
    const mockSlots = [
      { date: '2025-10-28', time: '8:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-28', time: '8:35 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-28', time: '9:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-29', time: '8:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-29', time: '8:35 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' },
      { date: '2025-10-30', time: '9:00 AM', gmt: 'GMT-05:00 America/Chicago (CDT)' }
    ];
    
    const result = {
      success: true,
      data: {
        total_slots: mockSlots.length,
        total_days: 3,
        note: 'Mock data - Playwright not available in serverless environment',
        slots: mockSlots
      }
    };
    
    console.log('✅ Mock scraping completed successfully');
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('❌ API error:', error);
    
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        },
        { status: 400 }
      );
    }
    
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

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
