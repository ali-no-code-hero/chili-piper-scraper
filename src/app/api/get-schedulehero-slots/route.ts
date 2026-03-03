import { NextRequest, NextResponse } from 'next/server';
import { SecurityMiddleware } from '@/lib/security-middleware';
import { concurrencyManager } from '@/lib/concurrency-manager';
import { ErrorHandler, ErrorCode, SuccessCode } from '@/lib/error-handler';
import { normalizeScheduleHeroSlots } from '@/lib/schedulehero-slots';
import type { ScheduleHeroSlotPayload } from '@/lib/schedulehero-slots';
import { browserPool } from '@/lib/browser-pool';

const CAMPAIGN_URL = 'https://lofty.schedulehero.io/campaign/agent-advice-l1';
const CAPTURE_TIMEOUT_MS = 35000;
const CONCURRENCY_TIMEOUT_MS = 60000;
const WAIT_FOR_SLOTS_RESPONSE_MS = 25000;
const TARGET_DAYS = 5;
const NEXT_CLICK_WAIT_MS = 3000;

const security = new SecurityMiddleware();

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}

async function handleRequest(request: NextRequest) {
  const requestStartTime = Date.now();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const securityResult = await security.secureRequest(request, {
      requireAuth: true,
      rateLimit: { maxRequests: 30, windowMs: 15 * 60 * 1000 },
      allowedMethods: ['GET', 'POST']
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
      const response = NextResponse.json(
        errorResponse,
        { status: ErrorHandler.getStatusCode(errorResponse.code) }
      );
      return security.addSecurityHeaders(response);
    }

    const result = await concurrencyManager.execute(
      () => fetchScheduleHeroSlots(),
      CONCURRENCY_TIMEOUT_MS
    );

    if (!result.success) {
      const responseTime = Date.now() - requestStartTime;
      const errorResponse = ErrorHandler.parseError(result.error, requestId, responseTime);
      const response = NextResponse.json(
        errorResponse,
        { status: ErrorHandler.getStatusCode(errorResponse.code) }
      );
      return security.addSecurityHeaders(response);
    }

    const responseTime = Date.now() - requestStartTime;
    const successResponse = ErrorHandler.createSuccess(
      SuccessCode.SCRAPING_SUCCESS,
      result.data,
      requestId,
      responseTime
    );
    const response = NextResponse.json(
      successResponse,
      { status: ErrorHandler.getSuccessStatusCode() }
    );
    return security.addSecurityHeaders(response);
  } catch (error: unknown) {
    const responseTime = Date.now() - requestStartTime;
    const errorResponse = ErrorHandler.parseError(error, requestId, responseTime);
    const response = NextResponse.json(
      errorResponse,
      { status: ErrorHandler.getStatusCode(errorResponse.code) }
    );
    return security.addSecurityHeaders(response);
  }
}

async function fetchScheduleHeroSlots(): Promise<
  | { success: true; data: { slots: Array<{ date: string; time: string; timeZone: string }>; total_slots: number; total_days: number; note: string } }
  | { success: false; error: string }
> {
  const captured: ScheduleHeroSlotPayload[] = [];
  let capturedRequestUrl: string | null = null;
  let browser: Awaited<ReturnType<typeof browserPool.getBrowser>> | null = null;
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof browserPool.getBrowser>>['newContext']>> | null = null;
  let page: Awaited<ReturnType<NonNullable<typeof context>['newPage']>> | null = null;

  try {
    browser = await browserPool.getBrowser();

    context = await browser.newContext({
      timezoneId: 'America/Chicago',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    page = await context.newPage();
    page.setDefaultNavigationTimeout(CAPTURE_TIMEOUT_MS);

    const onRequest = (request: { url: () => string }) => {
      const url = request.url();
      if (url.includes('campaign_time_slots')) capturedRequestUrl = url;
    };

    const onResponse = async (response: { url: () => string; ok: () => boolean; json: () => Promise<unknown> }) => {
      const url = response.url();
      if (!url.includes('campaign_time_slots') || !response.ok()) return;
      try {
        const json = await response.json() as { data?: { attributes?: ScheduleHeroSlotPayload } };
        const attrs = json?.data?.attributes;
        if (attrs && Array.isArray(attrs.meeting_slots) && attrs.booking_date) {
          captured.push({
            booking_date: attrs.booking_date,
            meeting_slots: attrs.meeting_slots,
            time_zone: attrs.time_zone
          });
        }
      } catch {
        // ignore parse errors
      }
    };

    page.on('request', onRequest);
    page.on('response', onResponse);

    const slotsResponsePromise = page.waitForResponse(
      (r) => r.url().includes('campaign_time_slots') && r.ok(),
      { timeout: WAIT_FOR_SLOTS_RESPONSE_MS }
    );

    try {
      await page.goto(CAMPAIGN_URL, { waitUntil: 'load' });
    } catch {
      // timeout or navigation error
    }

    try {
      const firstResponse = await slotsResponsePromise;
      capturedRequestUrl = firstResponse.request().url();
      const json = (await firstResponse.json()) as { data?: { attributes?: ScheduleHeroSlotPayload } };
      const attrs = json?.data?.attributes;
      if (attrs && Array.isArray(attrs.meeting_slots) && attrs.booking_date) {
        captured.push({
          booking_date: attrs.booking_date,
          meeting_slots: attrs.meeting_slots,
          time_zone: attrs.time_zone
        });
      }
    } catch {
      // waitForResponse timed out or parse failed - continue; we may have capturedRequestUrl from onRequest
    }

    const seenDates = new Set(captured.map((p) => p.booking_date));

    if (capturedRequestUrl && seenDates.size < TARGET_DAYS) {
      const baseUrl = new URL(capturedRequestUrl);
      if (captured.length === 0) {
        try {
          const res = await fetch(capturedRequestUrl, { headers: { Accept: 'application/json' } });
          if (res.ok) {
            const json = (await res.json()) as { data?: { attributes?: ScheduleHeroSlotPayload } };
            const attrs = json?.data?.attributes;
            if (attrs && Array.isArray(attrs.meeting_slots) && attrs.booking_date) {
              captured.push({
                booking_date: attrs.booking_date,
                meeting_slots: attrs.meeting_slots,
                time_zone: attrs.time_zone
              });
              seenDates.add(attrs.booking_date);
            }
          }
        } catch {
          // skip
        }
      }
      const dates = getNextFiveDatesInCentral();
      for (const dateStr of dates) {
        if (seenDates.size >= TARGET_DAYS) break;
        if (seenDates.has(dateStr)) continue;
        baseUrl.searchParams.set('booking_date', dateStr);
        try {
          const res = await fetch(baseUrl.toString(), { headers: { Accept: 'application/json' } });
          if (!res.ok) continue;
          const json = (await res.json()) as { data?: { attributes?: ScheduleHeroSlotPayload } };
          const attrs = json?.data?.attributes;
          if (attrs && Array.isArray(attrs.meeting_slots) && attrs.booking_date) {
            captured.push({
              booking_date: attrs.booking_date,
              meeting_slots: attrs.meeting_slots,
              time_zone: attrs.time_zone
            });
            seenDates.add(attrs.booking_date);
          }
        } catch {
          // skip this date
        }
      }
    }

    while (seenDates.size < TARGET_DAYS) {
      const countBefore = seenDates.size;
      try {
        await page.getByRole('button', { name: /^Next$/i }).click({ timeout: 2000 });
        await new Promise((r) => setTimeout(r, NEXT_CLICK_WAIT_MS));
        for (const p of captured) seenDates.add(p.booking_date);
        if (seenDates.size <= countBefore) break;
      } catch {
        break;
      }
    }

    if (captured.length === 0) {
      return {
        success: false,
        error:
          'No campaign_time_slots response captured. The page may not have loaded or the API may have changed.'
      };
    }

    const { slots, total_slots, total_days } = normalizeScheduleHeroSlots(captured);

    return {
      success: true,
      data: {
        slots,
        total_slots,
        total_days,
        note: `Found ${total_days} day(s) with ${total_slots} total slots in America/Chicago (target ${TARGET_DAYS} days)`
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  } finally {
    try {
      if (page && !page.isClosed()) await page.close();
      if (context) await context.close();
      if (browser) browserPool.releaseBrowser(browser);
    } catch {
      // ignore cleanup errors
    }
  }
}

function getNextFiveDatesInCentral(): string[] {
  const dates: string[] = [];
  const tz = 'America/Chicago';
  for (let i = 0; i < TARGET_DAYS; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const str = d.toLocaleDateString('en-CA', { timeZone: tz });
    dates.push(str);
  }
  return dates;
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return security.configureCORS(response);
}
