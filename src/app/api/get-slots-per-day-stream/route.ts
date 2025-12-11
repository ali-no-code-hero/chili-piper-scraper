import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware, ValidationSchemas } from '@/lib/security-middleware';
import { ErrorHandler, ErrorCode, SuccessCode } from '@/lib/error-handler';
// Dynamic import to avoid bundling Playwright during build

const security = new SecurityMiddleware();

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now(); // Start timing from the very beginning
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log('🔍 Get-Slots Per-Day Streaming API - Request received');
    
    // Apply security middleware
    const securityResult = await security.secureRequest(request, {
      requireAuth: true,
      rateLimit: { maxRequests: 30, windowMs: 15 * 60 * 1000 }, // 30 requests per 15 minutes (streaming is more resource intensive)
      inputSchema: ValidationSchemas.scrapeRequest,
      allowedMethods: ['POST']
    });

    if (!securityResult.allowed) {
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.createError(
        ErrorCode.UNAUTHORIZED,
        'Request blocked by security middleware',
        securityResult.response?.statusText || 'Authentication or validation failed',
        undefined,
        requestId,
        responseTime
      );
      return new NextResponse(
        JSON.stringify(errorResponse),
        { 
          status: ErrorHandler.getStatusCode(errorResponse.code),
          headers: {
            'Content-Type': 'application/json',
            ...security.addSecurityHeaders(new NextResponse()).headers
          }
        }
      );
    }

    const body = securityResult.sanitizedData!;
    console.log(`✅ Parsed and validated data:`, body);
    
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    console.log('🔍 Starting per-day streaming scraping process...');

    const encoder = new TextEncoder();
    
    const readableStream = new ReadableStream({
      async start(controller) {
        const initialResponseTime = Date.now() - requestStartTime;
        const initialResponse = ErrorHandler.createSuccess(
          SuccessCode.REQUEST_PROCESSED,
          {
            streaming: true,
            message: "Starting slot collection...",
            total_slots: 0,
            total_days: 0,
            slots: [],
            note: "Streaming results per day as they become available"
          },
          requestId,
          initialResponseTime
        );
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialResponse)}\n\n`));
        
        try {
          // Create scraper with streaming callback
          // Dynamic import to avoid bundling Playwright during build
          const { ChiliPiperScraper } = await import('@/lib/scraper');
          const scraper = new ChiliPiperScraper();
          
          // Define the streaming callback
          // Note: dayData.date is already formatted as YYYY-MM-DD by the scraper's formatDate() method
          const streamingCallback = (dayData: { date: string; slots: string[]; totalDays: number; totalSlots: number }) => {
            const daySlots = dayData.slots.map(slot => ({
              date: dayData.date, // Already formatted as YYYY-MM-DD
              time: slot,
              gmt: "GMT-05:00 America/Chicago (CDT)"
            }));
            
            const responseTime = Date.now() - requestStartTime;
            const streamingResponse = ErrorHandler.createSuccess(
              SuccessCode.REQUEST_PROCESSED,
              {
                streaming: true,
                message: `Found ${dayData.slots.length} slots for ${dayData.date}`,
                total_slots: dayData.totalSlots,
                total_days: dayData.totalDays,
                slots: daySlots,
                note: `Streaming: ${dayData.totalDays}/7 days collected`
              },
              requestId,
              responseTime
            );
            
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamingResponse)}\n\n`));
          };
          
          // Run the scraping with streaming callback
          const result = await scraper.scrapeSlots(
            body.first_name,
            body.last_name,
            body.email,
            body.phone,
            streamingCallback
          );
          
          if (!result.success) {
            console.log(`❌ Scraping failed: ${result.error}`);
            security.logSecurityEvent('STREAMING_SCRAPING_FAILED', {
              endpoint: '/api/get-slots-per-day-stream',
              userAgent,
              error: result.error
            }, clientIP);
            
            const responseTime = Date.now() - requestStartTime;
            const errorResponse = ErrorHandler.parseError(result.error, requestId, responseTime);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
            controller.close();
            return;
          }

          // Final response after all chunks are sent
          const finalResponseTime = Date.now() - requestStartTime;
          const finalResponse = ErrorHandler.createSuccess(
            SuccessCode.SCRAPING_SUCCESS,
            {
              streaming: false,
              message: "Slot collection completed",
              total_slots: result.data?.total_slots || 0,
              total_days: result.data?.total_days || 0,
              note: `Found ${result.data?.total_days || 0} days with ${result.data?.total_slots || 0} total booking slots`,
              slots: result.data?.slots || [] // Send all slots in the final response
            },
            requestId,
            finalResponseTime
          );
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalResponse)}\n\n`));
          controller.close();

          // Log successful streaming
          security.logSecurityEvent('STREAMING_SUCCESS', {
            endpoint: '/api/get-slots-per-day-stream',
            userAgent,
            daysFound: result.data?.total_days,
            slotsFound: result.data?.total_slots
          }, clientIP);

        } catch (error) {
          console.error('❌ Streaming API error during scraping:', error);
          security.logSecurityEvent('STREAMING_ERROR', {
            endpoint: '/api/get-slots-per-day-stream',
            userAgent,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, clientIP);
          
          const responseTime = Date.now() - requestStartTime;
          const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
          controller.close();
        }
      },
      cancel() {
        console.log('Client disconnected from streaming API.');
        security.logSecurityEvent('STREAMING_DISCONNECTED', {
          endpoint: '/api/get-slots-per-day-stream',
          userAgent
        }, clientIP);
      },
    });

    const response = new NextResponse(readableStream, {
      status: ErrorHandler.getSuccessStatusCode(),
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        ...security.addSecurityHeaders(new NextResponse()).headers
      },
    });

    return security.configureCORS(response);
    
  } catch (error) {
    console.error('❌ API error:', error);
    
    const responseTime = Date.now() - requestStartTime;
    
    security.logSecurityEvent('STREAMING_API_ERROR', {
      endpoint: '/api/get-slots-per-day-stream',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, request.headers.get('x-forwarded-for') || 'unknown');
    
    const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
    return new NextResponse(
      JSON.stringify(errorResponse),
      { 
        status: ErrorHandler.getStatusCode(errorResponse.error.code),
        headers: {
          'Content-Type': 'application/json',
          ...security.addSecurityHeaders(new NextResponse()).headers
        }
      }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return security.configureCORS(response);
}