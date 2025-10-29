import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware } from '@/lib/security-middleware';

const security = new SecurityMiddleware();

export async function GET(request: NextRequest) {
  try {
    const response = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Chili Piper Slot Scraper (Next.js)',
      debug: {
        node_version: process.version,
        request_method: request.method,
        request_url: request.url
      }
    };

    const nextResponse = NextResponse.json(response);
    return security.addSecurityHeaders(nextResponse);
  } catch (error) {
    console.error('Health check error:', error);
    const nextResponse = NextResponse.json(
      { 
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
    return security.addSecurityHeaders(nextResponse);
  }
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return security.configureCORS(response);
}
