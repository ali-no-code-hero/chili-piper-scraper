import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware } from '@/lib/security-middleware';
import { concurrencyManager } from '@/lib/concurrency-manager';
import { ErrorHandler, ErrorCode, SuccessCode } from '@/lib/error-handler';
import { bookCalendlySlot, normalizeTimeForCalendly } from '@/lib/calendly-booker';

const security = new SecurityMiddleware();

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export async function POST(request: NextRequest) {
  const requestStartTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const securityResult = await security.secureRequest(request, {
      requireAuth: true,
      rateLimit: { maxRequests: 100, windowMs: 15 * 60 * 1000 },
      inputSchema: {
        date: { type: 'string', required: true },
        time: { type: 'string', required: true },
        firstName: { type: 'string', required: true, minLength: 1, maxLength: 155 },
        lastName: { type: 'string', required: true, minLength: 1, maxLength: 155 },
        email: { type: 'email', required: true, maxLength: 255 },
        phone: { type: 'string', required: false, maxLength: 30 },
        answers: { type: 'object', required: false },
      },
      allowedMethods: ['POST'],
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
      const response = NextResponse.json(errorResponse, {
        status: ErrorHandler.getStatusCode(errorResponse.code),
      });
      return security.addSecurityHeaders(response);
    }

    const body = securityResult.sanitizedData!;
    const { date, time, firstName, lastName, email, answers } = body;
    const phone = body.phone as string | undefined;

    if (!isValidDate(date)) {
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.createError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid date',
        'date must be YYYY-MM-DD',
        { providedValue: date },
        requestId,
        responseTime
      );
      return security.addSecurityHeaders(NextResponse.json(errorResponse, { status: 400 }));
    }

    const normalizedTime = normalizeTimeForCalendly(time);
    if (!normalizedTime || !/^\d{1,2}:\d{2}(am|pm)$/.test(normalizedTime)) {
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.createError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid time',
        'time must be like 9:30am or 2:00 PM',
        { providedValue: time },
        requestId,
        responseTime
      );
      return security.addSecurityHeaders(NextResponse.json(errorResponse, { status: 400 }));
    }

    let answersRecord: Record<string, string | string[]> = {};
    if (answers != null) {
      if (typeof answers !== 'object' || Array.isArray(answers)) {
        const responseTime = Date.now() - requestStartTime;
        const errorResponse = ErrorHandler.createError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid answers',
          'answers must be an object mapping question keys to values',
          undefined,
          requestId,
          responseTime
        );
        return security.addSecurityHeaders(NextResponse.json(errorResponse, { status: 400 }));
      }
      for (const [k, v] of Object.entries(answers)) {
        if (typeof v === 'string') answersRecord[k] = v;
        else if (Array.isArray(v)) answersRecord[k] = v.filter((x): x is string => typeof x === 'string');
        else if (v != null) answersRecord[k] = String(v);
      }
    }

    const result = await concurrencyManager.execute(
      () =>
        bookCalendlySlot({
          date,
          time,
          firstName,
          lastName,
          email,
          phone,
          answers: Object.keys(answersRecord).length > 0 ? answersRecord : undefined,
        }),
      45000
    );

    const responseTime = Date.now() - requestStartTime;

    if (!result.success) {
      const isSlot = result.error?.toLowerCase().includes('slot') || result.error?.toLowerCase().includes('time');
      const isDay = result.error?.toLowerCase().includes('day') || result.error?.toLowerCase().includes('month');
      const code = isSlot ? ErrorCode.SLOT_NOT_FOUND : isDay ? ErrorCode.DAY_BUTTON_NOT_FOUND : ErrorCode.SCRAPING_FAILED;
      const metadata: Record<string, unknown> = { originalError: result.error };
      if (result.failedAfterStep) metadata.failedAfterStep = result.failedAfterStep;
      if (result.missingFields?.length) metadata.missingFields = result.missingFields;
      if (result.validationMessages?.length) metadata.validationMessages = result.validationMessages;
      if (result.videoPath) metadata.videoPath = result.videoPath;
      const errorResponse = ErrorHandler.createError(
        code,
        result.error || 'Booking failed',
        result.error || 'Calendly booking failed',
        metadata,
        requestId,
        responseTime
      );
      const errRes = NextResponse.json(errorResponse, {
        status: ErrorHandler.getStatusCode(code),
      });
      return security.addSecurityHeaders(errRes);
    }

    const successResponse = ErrorHandler.createSuccess(
      SuccessCode.OPERATION_SUCCESS,
      {
        message: 'Calendly slot booked successfully',
        date: result.date,
        time: result.time,
      },
      requestId,
      responseTime
    );
    const successRes = NextResponse.json(successResponse, {
      status: ErrorHandler.getSuccessStatusCode(),
    });
    return security.addSecurityHeaders(successRes);
  } catch (error: any) {
    console.error('Book Calendly API error:', error);
    const responseTime = Date.now() - requestStartTime;

    if (error.message?.includes('timeout')) {
      const errorResponse = ErrorHandler.createError(
        ErrorCode.REQUEST_TIMEOUT,
        'Booking timed out',
        'Request timed out. Please try again.',
        { originalError: error.message },
        requestId,
        responseTime
      );
      return security.addSecurityHeaders(NextResponse.json(errorResponse, { status: 504 }));
    }
    if (error.message?.includes('queue is full')) {
      const errorResponse = ErrorHandler.createError(
        ErrorCode.QUEUE_FULL,
        'Request queue is full',
        'Too many requests. Please try again later.',
        undefined,
        requestId,
        responseTime
      );
      return security.addSecurityHeaders(NextResponse.json(errorResponse, { status: 503 }));
    }

    const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
    return security.addSecurityHeaders(
      NextResponse.json(errorResponse, {
        status: ErrorHandler.getStatusCode(errorResponse.code),
      })
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return security.configureCORS(new NextResponse(null, { status: 200 }));
}
