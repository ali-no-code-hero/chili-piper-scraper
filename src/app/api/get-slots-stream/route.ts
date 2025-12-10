import { NextRequest } from 'next/server';
import { ErrorHandler, ErrorCode, SuccessCode } from '@/lib/error-handler';
// Dynamic import to avoid bundling Playwright during build

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
  const requestStartTime = Date.now(); // Start timing from the very beginning
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log('🔍 Get-Slots Streaming API - Request received');
    
    // Check authentication
    const authHeader = request.headers.get('Authorization') || '';
    console.log(`🔍 Auth header: ${authHeader.substring(0, 20)}...`);
    
    if (!validateApiKey(authHeader)) {
      console.log('❌ Authentication failed');
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.createError(
        ErrorCode.INVALID_API_KEY,
        'Invalid or missing API key',
        'Please provide a valid Bearer token in the Authorization header.',
        { 
          usage: {
            example: 'Authorization: Bearer your-api-key-here'
          }
        },
        requestId,
        responseTime
      );
      return new Response(
        JSON.stringify(errorResponse),
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
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.createError(
        ErrorCode.MISSING_FIELDS,
        'Missing required fields',
        `The following fields are required: ${missingFields.join(', ')}`,
        { missingFields },
        requestId,
        responseTime
      );
      return new Response(
        JSON.stringify(errorResponse),
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
          const initialResponseTime = Date.now() - requestStartTime;
          const initialResponse = ErrorHandler.createSuccess(
            SuccessCode.REQUEST_PROCESSED,
            {
              streaming: true,
              message: 'Starting slot collection...',
              total_slots: 0,
              total_days: 0,
              slots: [],
              note: 'Streaming results as they become available'
            },
            requestId,
            initialResponseTime
          );
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialResponse)}\n\n`));
          
          // Run the scraping (dynamic import to avoid bundling Playwright)
          const { ChiliPiperScraper } = await import('@/lib/scraper');
          const scraper = new ChiliPiperScraper();
          const result = await scraper.scrapeSlots(
            body.first_name,
            body.last_name,
            body.email,
            body.phone
          );
          
          if (!result.success) {
            console.log(`❌ Scraping failed: ${result.error}`);
            const responseTime = Date.now() - requestStartTime;
            const errorResponse = ErrorHandler.parseError(result.error, requestId, responseTime);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
            controller.close();
            return;
          }
          
          // Stream the results in chunks for better UX
          // Note: All dates in slots are already formatted as YYYY-MM-DD by the scraper
          const allSlots = result.data?.slots || [];
          const chunkSize = 20; // Stream 20 slots at a time
          
          for (let i = 0; i < allSlots.length; i += chunkSize) {
            const chunk = allSlots.slice(i, i + chunkSize);
            const progress = Math.round((i + chunk.length) / allSlots.length * 100);
            const responseTime = Date.now() - requestStartTime;
            
            const streamingResponse = ErrorHandler.createSuccess(
              SuccessCode.REQUEST_PROCESSED,
              {
                streaming: true,
                message: `Streaming slots... ${progress}% complete`,
                total_slots: allSlots.length,
                total_days: result.data?.total_days || 0,
                slots: chunk,
                note: `Streaming: ${i + chunk.length}/${allSlots.length} slots (${progress}%)`
              },
              requestId,
              responseTime
            );
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamingResponse)}\n\n`));
            
            // Small delay to make streaming visible
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Send final completion response
          const finalResponseTime = Date.now() - requestStartTime;
          const finalResponse = ErrorHandler.createSuccess(
            SuccessCode.SCRAPING_SUCCESS,
            {
              streaming: false,
              message: 'Slot collection completed',
              ...result.data
            },
            requestId,
            finalResponseTime
          );
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalResponse)}\n\n`));
          controller.close();
          
        } catch (error) {
          console.error('❌ Streaming error:', error);
          const responseTime = Date.now() - requestStartTime;
          const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
          controller.close();
        }
      }
    });
    
    return new Response(stream, {
      status: ErrorHandler.getSuccessStatusCode(),
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
    
    const responseTime = Date.now() - requestStartTime;
    
    if (error instanceof SyntaxError) {
      const errorResponse = ErrorHandler.createError(
        ErrorCode.INVALID_INPUT,
        'Invalid JSON',
        'Request body must be valid JSON',
        { originalError: error.message },
        requestId,
        responseTime
      );
      return new Response(
        JSON.stringify(errorResponse),
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
    
    const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
    return new Response(
      JSON.stringify(errorResponse),
      { 
        status: ErrorHandler.getStatusCode(errorResponse.error.code),
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