import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Simple test endpoint working!',
    timestamp: new Date().toISOString(),
    method: 'GET'
  });
}

export async function POST(request: NextRequest) {
  try {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({
      message: 'Simple test endpoint working!',
      timestamp: new Date().toISOString(),
      method: 'POST',
      receivedData: body,
      headers,
      xApiKey: request.headers.get('x-api-key') || request.headers.get('X-API-Key') || 'NOT FOUND',
      authorization: request.headers.get('authorization') || 'NOT FOUND'
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Invalid JSON',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 400 });
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
