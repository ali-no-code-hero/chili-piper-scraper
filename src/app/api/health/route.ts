import { NextRequest, NextResponse } from 'next/server';

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

    return NextResponse.json(response);
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { 
        error: 'Internal Server Error',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
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
