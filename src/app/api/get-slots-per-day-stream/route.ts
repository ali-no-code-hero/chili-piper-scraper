import { NextRequest, NextResponse } from 'next/server';
import { ChiliPiperScraper } from '@/lib/scraper';
import { SecurityMiddleware, ValidationSchemas } from '@/lib/security-middleware';

const security = new SecurityMiddleware();

export async function POST(request: NextRequest) {
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
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: 'Security check failed',
          message: 'Request blocked by security middleware'
        }),
        { 
          status: securityResult.response?.status || 400,
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
        const initialResponse = {
          success: true,
          streaming: true,
          message: "Starting slot collection...",
          data: {
            total_slots: 0,
            total_days: 0,
            slots: [],
            note: "Streaming results per day as they become available"
          }
        };
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialResponse)}\n\n`));
        
        try {
          // Create scraper with streaming callback
          const scraper = new ChiliPiperScraper();
          
          // Define the streaming callback
          // Note: dayData.date is already formatted as YYYY-MM-DD by the scraper's formatDate() method
          const streamingCallback = (dayData: { date: string; slots: string[]; totalDays: number; totalSlots: number }) => {
            const daySlots = dayData.slots.map(slot => ({
              date: dayData.date, // Already formatted as YYYY-MM-DD
              time: slot,
              gmt: "GMT-05:00 America/Chicago (CDT)"
            }));
            
            const streamingResponse = {
              success: true,
              streaming: true,
              message: `Found ${dayData.slots.length} slots for ${dayData.date}`,
              data: {
                total_slots: dayData.totalSlots,
                total_days: dayData.totalDays,
                slots: daySlots,
                note: `Streaming: ${dayData.totalDays}/7 days collected`
              }
            };
            
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
            
            const errorResponse = {
              success: false,
              streaming: false,
              error: 'Scraping failed',
              message: result.error || 'Unknown scraping error'
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorResponse)}\n\n`));
            controller.close();
            return;
          }

          // Final response after all chunks are sent
          const finalResponse = {
            success: true,
            streaming: false,
            message: "Slot collection completed",
            data: {
              total_slots: result.data?.total_slots || 0,
              total_days: result.data?.total_days || 0,
              note: `Found ${result.data?.total_days || 0} days with ${result.data?.total_slots || 0} total booking slots`,
              slots: result.data?.slots || [] // Send all slots in the final response
            }
          };
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
          
          const errorResponse = {
            success: false,
            streaming: false,
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : 'Unknown error occurred'
          };
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
    
    security.logSecurityEvent('STREAMING_API_ERROR', {
      endpoint: '/api/get-slots-per-day-stream',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, request.headers.get('x-forwarded-for') || 'unknown');
    
    return new NextResponse(
      JSON.stringify({
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      }),
      { 
        status: 500,
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