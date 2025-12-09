import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware, ValidationSchemas } from '@/lib/security-middleware';
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
    
    // Run the scraping (dynamic import to avoid bundling Playwright)
    const { ChiliPiperScraper } = await import('@/lib/scraper');
    const scraper = new ChiliPiperScraper();
    const result = await scraper.scrapeSlots(
      body.first_name,
      body.last_name,
      body.email,
      body.phone,
      undefined, // onDayComplete callback
      requestedDays // maxDays parameter
    );
    
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
    
  } catch (error) {
    console.error('❌ API error:', error);
    
    const response = NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
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
