import { NextRequest, NextResponse } from 'next/server';
import { concurrencyManager } from '@/lib/concurrency-manager';
import { browserPool } from '@/lib/browser-pool';
import { SecurityMiddleware } from '@/lib/security-middleware';

const security = new SecurityMiddleware();

export async function GET(request: NextRequest) {
  try {
    const concurrencyStatus = concurrencyManager.getStatus();
    const browserStatus = browserPool.getStatus();

    const status = {
      concurrency: {
        active: concurrencyStatus.active,
        queued: concurrencyStatus.queued,
        capacity: concurrencyStatus.capacity,
        queueSize: concurrencyStatus.queueSize,
        utilization: `${((concurrencyStatus.active / concurrencyStatus.capacity) * 100).toFixed(1)}%`,
      },
      browsers: {
        active: browserStatus.active,
        max: browserStatus.max,
        utilization: `${((browserStatus.active / browserStatus.max) * 100).toFixed(1)}%`,
      },
      timestamp: new Date().toISOString(),
    };

    const response = NextResponse.json({
      success: true,
      data: status,
    });

    return security.addSecurityHeaders(response);
  } catch (error) {
    console.error('❌ Status API error:', error);
    
    const response = NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
        message: 'Failed to retrieve status'
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

