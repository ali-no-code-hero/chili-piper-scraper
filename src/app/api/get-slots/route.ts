import { NextRequest, NextResponse } from 'next/server';
import { ChiliPiperScraper } from '@/lib/scraper';
import { SecurityMiddleware, ValidationSchemas } from '@/lib/security-middleware';

const security = new SecurityMiddleware();

export async function POST(request: NextRequest) {
  try {
    console.log('🔍 Get-Slots API Debug - Request received');
    
    // Apply security middleware
    const securityResult = await security.secureRequest(request, {
      requireAuth: true,
      rateLimit: { maxRequests: 50, windowMs: 15 * 60 * 1000 }, // 50 requests per 15 minutes
      inputSchema: ValidationSchemas.scrapeRequest,
      allowedMethods: ['POST']
    });

    if (!securityResult.allowed) {
      return security.addSecurityHeaders(securityResult.response!);
    }

    const body = securityResult.sanitizedData!;
    console.log(`✅ Parsed and validated data:`, body);
    
    // Record API usage
    const startTime = Date.now();
    const clientIP = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
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
