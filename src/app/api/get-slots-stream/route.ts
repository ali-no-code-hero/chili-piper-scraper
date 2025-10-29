import { NextRequest } from 'next/server';
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
    console.log('🔍 Get-Slots Streaming API - Request received');
    
    // Check authentication
    const authHeader = request.headers.get('Authorization') || '';
    console.log(`🔍 Auth header: ${authHeader.substring(0, 20)}...`);
    
    if (!validateApiKey(authHeader)) {
      console.log('❌ Authentication failed');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
          message: 'Invalid or missing API key. Please provide a valid Bearer token.',
          usage: {
            example: 'Authorization: Bearer your-api-key-here'
          }
        }),
        { 
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
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
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields',
          message: `The following fields are required: ${missingFields.join(', ')}`
        }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }
    
    console.log('🔍 Starting streaming scraping process...');
    
    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        try {
          // Send initial response
          const initialResponse = {
            success: true,
            streaming: true,
            message: 'Starting slot collection...',
            data: {
              total_slots: 0,
              total_days: 0,
              slots: [],
              note: 'Streaming results as they become available'
            }
          };
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialResponse)}\n\n`));
          
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
            const errorResponse = {
              success: false,
              error: 'Scraping failed',
              message: result.error
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
            controller.close();
            return;
          }
          
          // Stream the results in chunks for better UX
          const allSlots = result.data?.slots || [];
          const chunkSize = 20; // Stream 20 slots at a time
          
          for (let i = 0; i < allSlots.length; i += chunkSize) {
            const chunk = allSlots.slice(i, i + chunkSize);
            const progress = Math.round((i + chunk.length) / allSlots.length * 100);
            
            const streamingResponse = {
              success: true,
              streaming: true,
              message: `Streaming slots... ${progress}% complete`,
              data: {
                total_slots: allSlots.length,
                total_days: result.data?.total_days || 0,
                slots: chunk,
                note: `Streaming: ${i + chunk.length}/${allSlots.length} slots (${progress}%)`
              }
            };
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamingResponse)}\n\n`));
            
            // Small delay to make streaming visible
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Send final completion response
          const finalResponse = {
            success: true,
            streaming: false,
            message: 'Slot collection completed',
            data: result.data
          };
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalResponse)}\n\n`));
          controller.close();
          
        } catch (error) {
          console.error('❌ Streaming error:', error);
          const errorResponse = {
            success: false,
            error: 'Streaming failed',
            message: error instanceof Error ? error.message : 'Unknown error occurred'
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
          controller.close();
        }
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
    
  } catch (error) {
    console.error('❌ API error:', error);
    
    if (error instanceof SyntaxError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid JSON',
          message: 'Request body must be valid JSON'
        }),
        { 
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          }
        }
      );
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}