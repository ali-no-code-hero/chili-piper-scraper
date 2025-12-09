import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware, ValidationSchemas } from '@/lib/security-middleware';
import { concurrencyManager } from '@/lib/concurrency-manager';
// Dynamic import to avoid bundling Playwright during build

const security = new SecurityMiddleware();

export async function POST(request: NextRequest) {
  try {
    // Log all headers for debugging
    const allHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });
    console.error('📋 Get-Slots API - All headers:', JSON.stringify(allHeaders));
    console.error('📋 Get-Slots API - X-API-Key header:', request.headers.get('x-api-key') || request.headers.get('X-API-Key') || 'NOT FOUND');
    
    console.log('🔍 Get-Slots API Debug - Request received');
    
    // Apply security middleware
    const securityResult = await security.secureRequest(request, {
      requireAuth: true,
      rateLimit: { maxRequests: 50, windowMs: 15 * 60 * 1000 }, // 50 requests per 15 minutes
      inputSchema: ValidationSchemas.scrapeRequest,
      allowedMethods: ['POST']
    });

    if (!securityResult.allowed) {
      console.error('❌ Security check failed:', securityResult.response);
      return security.addSecurityHeaders(securityResult.response!);
    }

    const body = securityResult.sanitizedData!;
    console.log(`✅ Parsed and validated data:`, body);
    
    // Record API usage
    const startTime = Date.now();
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Extract days parameter if provided
    const requestedDays = body.days ? parseInt(body.days.toString(), 10) : undefined;
    if (requestedDays && (requestedDays < 1 || requestedDays > 30)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation Error',
          message: 'days parameter must be between 1 and 30'
        },
        { status: 400 }
      );
    }
    
    console.log('🔍 Starting scraping process...');
    if (requestedDays) {
      console.log(`📅 Requested ${requestedDays} days`);
    }

    // Get concurrency status for logging
    const concurrencyStatus = concurrencyManager.getStatus();
    console.log(`🚦 Concurrency status: ${concurrencyStatus.active}/${concurrencyStatus.capacity} active, ${concurrencyStatus.queued} queued`);
    
    // Run the scraping through concurrency manager (dynamic import to avoid bundling Playwright)
    const result = await concurrencyManager.execute(async () => {
      const { ChiliPiperScraper } = await import('@/lib/scraper');
      const scraper = new ChiliPiperScraper();
      return await scraper.scrapeSlots(
        body.first_name,
        body.last_name,
        body.email,
        body.phone,
        undefined, // onDayComplete callback
        requestedDays // maxDays parameter
      );
    }, 60000); // 60 second timeout for scraping operation
    
    if (!result.success) {
      console.log(`❌ Scraping failed: ${result.error}`);
      
      // Record failed usage
      const responseTime = Date.now() - startTime;
      security.logSecurityEvent('SCRAPING_FAILED', {
        endpoint: '/api/get-slots',
        userAgent,
        responseTime,
        error: result.error
      }, clientIP);
      
      const response = NextResponse.json(
        {
          success: false,
          error: 'Scraping failed',
          message: result.error
        },
        { status: 500 }
      );
      
      return security.addSecurityHeaders(response);
    }
    
    console.log('✅ Scraping completed successfully');
    console.log(`📊 Result: ${result.data?.total_days} days, ${result.data?.total_slots} slots`);
    
    // Record successful usage
    const responseTime = Date.now() - startTime;
    security.logSecurityEvent('SCRAPING_SUCCESS', {
      endpoint: '/api/get-slots',
      userAgent,
      responseTime,
      daysFound: result.data?.total_days,
      slotsFound: result.data?.total_slots
    }, clientIP);
    
    const response = NextResponse.json(result);
    return security.addSecurityHeaders(response);
    
  } catch (error: any) {
    console.error('❌ API error:', error);
    
    // Handle queue timeout errors
    if (error.message && error.message.includes('timeout')) {
      const response = NextResponse.json(
        {
          success: false,
          error: 'Request Timeout',
          message: 'Request timed out while waiting in queue or during execution. Please try again.',
          queueStatus: concurrencyManager.getStatus()
        },
        { status: 504 }
      );
      return security.addSecurityHeaders(response);
    }

    // Handle queue full errors
    if (error.message && error.message.includes('queue is full')) {
      const response = NextResponse.json(
        {
          success: false,
          error: 'Service Unavailable',
          message: 'Request queue is full. Please try again later.',
          queueStatus: concurrencyManager.getStatus()
        },
        { status: 503 }
      );
      return security.addSecurityHeaders(response);
    }
    
    const response = NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: error.message || 'An unexpected error occurred'
      },
      { status: 500 }
    );
    
    return security.addSecurityHeaders(response);
  }
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return security.configureCORS(response);
}
