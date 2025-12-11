import { NextRequest, NextResponse } from 'next/server';
import { concurrencyManager } from '@/lib/concurrency-manager';
import { browserPool } from '@/lib/browser-pool';
import { SecurityMiddleware } from '@/lib/security-middleware';
import { ErrorHandler, SuccessCode, ErrorCode } from '@/lib/error-handler';

const security = new SecurityMiddleware();

export async function GET(request: NextRequest) {
  const requestStartTime = Date.now(); // Start timing from the very beginning
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
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
        totalContexts: browserStatus.totalContexts,
        utilization: `${((browserStatus.active / browserStatus.max) * 100).toFixed(1)}%`,
      },
      timestamp: new Date().toISOString(),
    };

    const responseTime = Date.now() - requestStartTime;
    const successResponse = ErrorHandler.createSuccess(
      SuccessCode.OPERATION_SUCCESS,
      status,
      requestId,
      responseTime
    );

    const response = NextResponse.json(
      successResponse,
      { status: ErrorHandler.getSuccessStatusCode() }
    );
    return security.addSecurityHeaders(response);
  } catch (error) {
    console.error('❌ Status API error:', error);
    
    const responseTime = Date.now() - requestStartTime;
    const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
    const response = NextResponse.json(
      errorResponse,
      { status: ErrorHandler.getStatusCode(errorResponse.code) }
    );
    
    return security.addSecurityHeaders(response);
  }
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return security.configureCORS(response);
}

