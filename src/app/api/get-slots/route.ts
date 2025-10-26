import { NextRequest, NextResponse } from 'next/server';
import { ChiliPiperScraper } from '@/lib/scraper';

// Production API keys for Chili Piper Slot Scraper
const VALID_API_KEYS = [
  'cp_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567',  // vendor_1
  'cp_live_xyz789uvw456rst123qpo098nml765kji432hgf109edc876bca543',  // vendor_2  
  'cp_live_internal_team_key_2024_secure_123456789abcdef',           // internal_team
  'cp_live_demo_client_key_2024_secure_987654321fedcba'              // demo_client
];

function validateApiKey(authHeader: string): boolean {
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  return VALID_API_KEYS.includes(token);
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Get-Slots API Debug - Request received');
    
    // Check authentication
    const authHeader = request.headers.get('Authorization') || '';
    console.log(`🔍 Auth header: ${authHeader.substring(0, 20)}...`);
    
    if (!validateApiKey(authHeader)) {
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
    
        console.log('🔍 Starting scraping process...');
        
        // Run the scraping
        const scraper = new ChiliPiperScraper();
        const result = await scraper.scrapeSlots(
          body.first_name,
          body.last_name,
          body.email,
          body.phone
        );
        
        if (!result.success) {
          console.log(`❌ Scraping failed: ${result.error}`);
          return NextResponse.json(
            {
              success: false,
              error: 'Scraping failed',
              message: result.error
            },
            { status: 500 }
          );
        }
        
        console.log('✅ Scraping completed successfully');
        console.log(`📊 Result: ${result.data?.total_days} days, ${result.data?.total_slots} slots`);
        
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
