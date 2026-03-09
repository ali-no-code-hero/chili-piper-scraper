import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecurityMiddleware } from '@/lib/security-middleware';
import { concurrencyManager } from '@/lib/concurrency-manager';
import { ErrorHandler, ErrorCode, SuccessCode } from '@/lib/error-handler';
import { normalizeScheduleHeroSlots } from '@/lib/schedulehero-slots';
import type { ScheduleHeroSlotPayload } from '@/lib/schedulehero-slots';
import { browserPool } from '@/lib/browser-pool';

const SCHEDULEHERO_VIDEO_DIR = process.env.SCHEDULEHERO_VIDEO_DIR || path.join(process.cwd(), '.schedulehero-videos');
const SCHEDULEHERO_VIDEO_ENABLED = process.env.SCHEDULEHERO_VIDEO_ENABLED !== '0' && process.env.SCHEDULEHERO_VIDEO_ENABLED !== 'false';

/** Save ScheduleHero failure video before context/page are closed. */
async function saveScheduleHeroFailureVideo(
  context: unknown,
  page: unknown,
  videoDir: string,
  sessionId: string
): Promise<string | null> {
  let savedPath: string | null = null;
  try {
    const getVideoFrom = (obj: unknown): Promise<{ path: () => Promise<string> } | null> | null => {
      if (!obj || typeof (obj as { video?: () => unknown }).video !== 'function') return null;
      const result = (obj as { video: () => Promise<{ path: () => Promise<string> } | null> }).video();
      return result && typeof result.then === 'function' ? result : null;
    };
    const videoPromise = getVideoFrom(page) ?? getVideoFrom(context);
    if (videoPromise) {
      const video = await videoPromise;
      if (video) {
        const srcPath = await video.path();
        if (srcPath && fs.existsSync(srcPath)) {
          const failedDir = path.join(SCHEDULEHERO_VIDEO_DIR, 'failed');
          fs.mkdirSync(failedDir, { recursive: true });
          const destName = `schedulehero-${sessionId}.webm`;
          const destPath = path.join(failedDir, destName);
          fs.copyFileSync(srcPath, destPath);
          savedPath = destPath;
          console.log('[ScheduleHero] Saved failure video:', destPath);
        }
      }
    }
  } catch (e) {
    console.warn('[ScheduleHero] Could not save failure video:', (e as Error)?.message);
  }
  return savedPath;
}

const CAMPAIGN_URL = 'https://lofty.schedulehero.io/campaign/agent-advice-l1';
const API_BASE = 'https://lofty.schedulehero.io/api/campaign_time_slots';
const CAPTURE_TIMEOUT_MS = 35000;
const CONCURRENCY_TIMEOUT_MS = 60000;
const WAIT_FOR_SLOTS_RESPONSE_MS = 25000;
const TARGET_BUSINESS_DAYS = 5;
const TIMEZONE = 'America/Chicago';

const FIELDS_QUERY =
  'fields%5Bcampaign_session%5D=session_id%2Cmeeting_slots%2Cbooking_date%2Ctime_zone%2Cnext_available_dates%2Clocale%2Clocation' +
  '&fields%5Bmeeting_type%5D=duration%2Cgreeting_text%2Cdescription%2Cbooking_days_limit%2Cday_visibility%2Cshow_weekends%2Cconference_allowed%2Ccustom_location%2Cwidget_hour12_format%2Clocation_position%2Clocation_greeting_text%2Clocation_mode' +
  '&fields%5Baccount%5D=company%2Cemail_domain%2Ccustom_domain%2Csubdomain%2Cimage_url%2Cscheduler_colors%2Cwhitelabel%2Cwidget_redirect_timeout%2Ccustom_code%2Ccsp_config%2Ctrusted_origins%2Cwidget_hour12_format%2Cfavicon_url' +
  '&include=account%2Ccampaign_router.meeting_type.locations' +
  '&fields%5Bcampaign_router%5D=';

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

/**
 * 1) Navigate to campaign page and capture the first campaign_time_slots request URL (session_id) and response (today's slots).
 * 2) Fetch the API directly for the next 5 business days using session_id + booking_date + time_zone.
 */
async function fetchScheduleHeroSlots(): Promise<
  | { success: true; data: { slots: Array<{ date: string; time: string; timeZone: string }>; total_slots: number; total_days: number; note: string } }
  | { success: false; error: string }
> {
  let sessionId: string | null = null;
  const captured: ScheduleHeroSlotPayload[] = [];
  let browser: Awaited<ReturnType<typeof browserPool.getBrowser>> | null = null;
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof browserPool.getBrowser>>['newContext']>> | null = null;
  let page: Awaited<ReturnType<NonNullable<typeof context>['newPage']>> | null = null;

  const sessionIdForVideo = `sh_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  let videoDir: string | null = null;
  if (SCHEDULEHERO_VIDEO_ENABLED) {
    try {
      const recordDir = path.join(os.tmpdir(), 'schedulehero-videos', sessionIdForVideo);
      fs.mkdirSync(recordDir, { recursive: true });
      videoDir = recordDir;
      console.log('[ScheduleHero] Recording enabled:', videoDir);
    } catch (e) {
      console.warn('[ScheduleHero] Video disabled (mkdir failed):', (e as Error)?.message);
    }
  }

  try {
    browser = await browserPool.getBrowser();
    const contextOptions: { timezoneId: string; userAgent: string; recordVideo?: { dir: string; size: { width: number; height: number } } } = {
      timezoneId: TIMEZONE,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (videoDir) {
      contextOptions.recordVideo = { dir: videoDir, size: { width: 1280, height: 720 } };
    }
    context = await browser.newContext(contextOptions);
    page = await context.newPage();
    page.setDefaultNavigationTimeout(CAPTURE_TIMEOUT_MS);

    // Use a real viewport so the page renders fully (some sites behave differently in headless)
    await page.setViewportSize({ width: 1280, height: 720 });

    const onRequest = (req: { url: () => string }) => {
      const url = req.url();
      if (!url.includes('campaign_time_slots')) return;
      try {
        const parsed = new URL(url);
        const id = parsed.searchParams.get('session_id');
        if (id) sessionId = id;
      } catch {
        // ignore
      }
    };

    const slotsResponsePromise = page.waitForResponse(
      (r: { url: () => string; ok: () => boolean }) =>
        r.url().includes('campaign_time_slots') && r.ok(),
      { timeout: WAIT_FOR_SLOTS_RESPONSE_MS }
    );

    page.on('request', onRequest);

    try {
      // Load the full page: wait for network idle so JS has run and campaign_time_slots can fire
      await page.goto(CAMPAIGN_URL, { waitUntil: 'networkidle' });
    } catch {
      // networkidle can timeout on busy pages; fallback to load event
      try {
        await page.goto(CAMPAIGN_URL, { waitUntil: 'load' });
      } catch {
        // navigation timeout/error
      }
    }

    // Give the page a moment and dismiss any cookie/consent banner so API requests aren't blocked
    try {
      await page.waitForTimeout(2000);
      const consentSelectors = [
        'button:has-text("Accept")',
        'button:has-text("Accept All")',
        'button:has-text("Allow")',
        'button:has-text("Allow All")',
        'button:has-text("I agree")',
        'button:has-text("OK")',
        'a:has-text("Accept")',
        '[data-testid*="accept"]',
        '[aria-label*="Accept"]',
        '.cookie-accept',
        '#cookie-accept'
      ];
      for (const selector of consentSelectors) {
        try {
          const btn = page.locator(selector).first();
          if ((await btn.count()) > 0 && (await btn.isVisible())) {
            await btn.click();
            await page.waitForTimeout(1000);
            break;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }

    // Fallback: scrape session_id from page's own network (performance entries) if we didn't get it from request listener
    if (!sessionId) {
      try {
        const scraped = await page.evaluate(() => {
          const entries = performance.getEntriesByType('resource') || [];
          const campaign = entries.find((e: { name: string }) => (e.name || '').includes('campaign_time_slots'));
          if (!campaign?.name) return null;
          try {
            const u = new URL(campaign.name);
            return u.searchParams.get('session_id');
          } catch {
            return null;
          }
        });
        if (scraped && typeof scraped === 'string') sessionId = scraped;
      } catch {
        // ignore
      }
    }

    try {
      const firstResponse = await slotsResponsePromise;
      if (!sessionId) {
        const u = new URL(firstResponse.request().url());
        sessionId = u.searchParams.get('session_id');
      }
      const json = (await firstResponse.json()) as { data?: { attributes?: ScheduleHeroSlotPayload } };
      const attrs = json?.data?.attributes;
      if (attrs && Array.isArray(attrs.meeting_slots) && attrs.booking_date) {
        captured.push({
          booking_date: attrs.booking_date,
          meeting_slots: attrs.meeting_slots,
          time_zone: attrs.time_zone || TIMEZONE
        });
      }
    } catch {
      // waitForResponse timed out or parse failed
    } finally {
      try {
        if (!sessionId && context && videoDir) {
          await saveScheduleHeroFailureVideo(context, page, videoDir, sessionIdForVideo);
        }
      } catch {
        // ignore
      }
      try {
        if (page && !page.isClosed()) await page.close();
      } catch {
        // ignore
      }
      page = null;
      // Only close context and release browser when we got sessionId (success path for capture phase).
      // When sessionId is null we keep context/browser so we can save failure video after fallback.
      if (sessionId) {
        if (videoDir) {
          try { fs.rmSync(videoDir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
        try {
          if (context) await context.close();
          if (browser) browserPool.releaseBrowser(browser);
        } catch { /* ignore */ }
        browser = null;
        context = null;
      }
    }

    if (!sessionId) {
      const fallback = await tryGetSessionFromApiDirect(captured);
      sessionId = fallback.sessionId;
      if (fallback.initialPayload) captured.push(fallback.initialPayload);
      if (!sessionId) {
        if (context && videoDir) {
          await saveScheduleHeroFailureVideo(context, null, videoDir, sessionIdForVideo);
        }
        try {
          if (context) await context.close();
          if (browser) browserPool.releaseBrowser(browser);
        } catch { /* ignore */ }
        return {
          success: false,
          error: 'Could not get session_id from campaign page or API. The page may not have loaded or the API may have changed.'
        };
      }
      // Got sessionId from fallback; close context and release (we left them open).
      try {
        if (videoDir) { try { fs.rmSync(videoDir, { recursive: true, force: true }); } catch { /* ignore */ } }
        if (context) await context.close();
        if (browser) browserPool.releaseBrowser(browser);
      } catch { /* ignore */ }
      browser = null;
      context = null;
    }

    const seenDates = new Set(captured.map((p) => p.booking_date));
    const businessDays = getNextFiveBusinessDaysInCentral();

    for (const dateStr of businessDays) {
      if (seenDates.size >= TARGET_BUSINESS_DAYS) break;
      if (seenDates.has(dateStr)) continue;
      const url = `${API_BASE}?session_id=${encodeURIComponent(sessionId)}&${FIELDS_QUERY}&booking_date=${dateStr}&time_zone=${encodeURIComponent(TIMEZONE)}`;
      try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) continue;
        const json = (await res.json()) as { data?: { attributes?: ScheduleHeroSlotPayload } };
        const attrs = json?.data?.attributes;
        if (attrs && Array.isArray(attrs.meeting_slots) && attrs.booking_date) {
          captured.push({
            booking_date: attrs.booking_date,
            meeting_slots: attrs.meeting_slots,
            time_zone: attrs.time_zone || TIMEZONE
          });
          seenDates.add(attrs.booking_date);
        }
      } catch {
        // skip this date
      }
    }

    if (captured.length === 0) {
      return {
        success: false,
        error: 'No slots returned from campaign_time_slots API for the requested days.'
      };
    }

    const { slots, total_slots, total_days } = normalizeScheduleHeroSlots(captured);

    return {
      success: true,
      data: {
        slots,
        total_slots,
        total_days,
        note: `Found ${total_days} business day(s) with ${total_slots} total slots in ${TIMEZONE}`
      }
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (context && videoDir) {
      await saveScheduleHeroFailureVideo(context, page, videoDir, sessionIdForVideo);
    }
    return { success: false, error: message };
  } finally {
    try {
      if (page && !page.isClosed()) await page.close();
      if (context) await context.close();
      if (browser) browserPool.releaseBrowser(browser);
    } catch {
      // ignore
    }
  }
}

/** Next 5 business days (Mon–Fri) in America/Chicago, YYYY-MM-DD, starting from today. */
function getNextFiveBusinessDaysInCentral(): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();
  const tz = TIMEZONE;
  for (let i = 0; dates.length < TARGET_BUSINESS_DAYS; i++) {
    const d = new Date(Date.now() + i * 24 * 60 * 60 * 1000);
    const weekday = d.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short' });
    if (weekday !== 'Sat' && weekday !== 'Sun') {
      const str = d.toLocaleDateString('en-CA', { timeZone: tz });
      if (!seen.has(str)) {
        seen.add(str);
        dates.push(str);
      }
    }
  }
  return dates;
}

/**
 * Fallback when Playwright does not capture session_id (e.g. on Railway).
 * 1) Try calling the API without session_id - some APIs create and return session on first request.
 * 2) Fetch campaign page HTML and look for session_id or campaign_time_slots URL in script/JSON.
 */
async function tryGetSessionFromApiDirect(
  captured: ScheduleHeroSlotPayload[]
): Promise<{ sessionId: string | null; initialPayload?: ScheduleHeroSlotPayload }> {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const urlWithoutSession = `${API_BASE}?${FIELDS_QUERY}&booking_date=${today}&time_zone=${encodeURIComponent(TIMEZONE)}`;
  try {
    const res = await fetch(urlWithoutSession, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; ScheduleHeroSlots/1)' }
    });
    if (!res.ok) return { sessionId: null };
    const json = (await res.json()) as { data?: { attributes?: { session_id?: string } & ScheduleHeroSlotPayload } };
    const attrs = json?.data?.attributes;
    const sid = attrs?.session_id;
    if (sid && typeof sid === 'string') {
      if (attrs && Array.isArray(attrs.meeting_slots) && attrs.booking_date) {
        return {
          sessionId: sid,
          initialPayload: {
            booking_date: attrs.booking_date,
            meeting_slots: attrs.meeting_slots,
            time_zone: attrs.time_zone || TIMEZONE
          }
        };
      }
      return { sessionId: sid };
    }
  } catch {
    // ignore
  }

  try {
    const res = await fetch(CAMPAIGN_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScheduleHeroSlots/1)' }
    });
    const html = await res.text();
    const uuidMatch = html.match(/session_id["\s:=]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch?.[1]) return { sessionId: uuidMatch[1] };
    const urlMatch = html.match(/campaign_time_slots\?[^"'\s]*session_id=([0-9a-f-]{36})/i);
    if (urlMatch?.[1]) return { sessionId: urlMatch[1] };
  } catch {
    // ignore
  }
  return { sessionId: null };
}

export async function OPTIONS(request: NextRequest) {
  const response = new NextResponse(null, { status: 200 });
  return security.configureCORS(response);
}
