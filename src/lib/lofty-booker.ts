import { browserPool } from '@/lib/browser-pool';
import type { Route } from 'playwright';

const CAMPAIGN_URL = 'https://lofty.schedulehero.io/campaign/agent-advice-l1';
const CAMPAIGN_URL_L2 = 'https://lofty.schedulehero.io/campaign/agent-advice-l2';
const CAMPAIGN_MEETINGS_URL = 'https://lofty.schedulehero.io/api/campaign_meetings?include=user&fields%5Buser%5D=email%2Cname%2Cimage_url%2Cintegrations';
const TIMEZONE = 'America/Chicago';
const CAPTURE_TIMEOUT_MS = 45000;
const WAIT_FOR_SLOTS_MS = 35000;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Agent-advice question IDs (from Schedule Hero campaign). Company Name and Role no longer sent. */
const QUESTION_IDS = {
  firstName: '66272',
  lastName: '2255',
  email: '2254',
  phone: '66273',
} as const;

export type BookLoftySlotParams = {
  date: string;
  time: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
};

export type BookLoftySlotResult =
  | { success: true; meetingTime: string }
  | { success: false; error: string };

/**
 * Normalize time to "H:MMam" or "HH:MMpm" for parsing (same as Calendly).
 */
function normalizeTime(time: string): string {
  const cleaned = time.trim().replace(/\s+/g, '').toLowerCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (match) {
    const [, hour, min, ampm] = match;
    return `${hour}:${min}${ampm}`;
  }
  if (/^\d{1,2}:\d{2}(am|pm)$/.test(cleaned)) return cleaned;
  return time.replace(/\s+/g, '').toLowerCase();
}

/**
 * Return offset string for America/Chicago on the given date (YYYY-MM-DD).
 * DST: 2nd Sunday March - 1st Sunday November -> -05:00, else -06:00.
 */
function getCentralOffsetForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const year = y!;
  const month = m!;
  const day = d!;

  const isDST = (): boolean => {
    if (month < 3 || month > 11) return false;
    if (month > 3 && month < 11) return true;
    if (month === 3) {
      let sundays = 0;
      for (let i = 1; i <= 31; i++) {
        const date = new Date(year, 2, i);
        if (date.getDay() === 0) {
          sundays++;
          if (sundays === 2) return day >= i;
        }
      }
      return false;
    }
    if (month === 11) {
      let sundays = 0;
      for (let i = 1; i <= 30; i++) {
        const date = new Date(year, 10, i);
        if (date.getDay() === 0) {
          sundays++;
          if (sundays === 1) return day < i;
        }
      }
      return true;
    }
    return false;
  };
  return isDST() ? '-05:00' : '-06:00';
}

/**
 * Build meeting_time ISO string for Schedule Hero: "YYYY-MM-DDTHH:mm:00.000±HH:MM".
 * date: YYYY-MM-DD, time: e.g. "11:30am".
 */
export function buildMeetingTime(date: string, time: string): string {
  const normalized = normalizeTime(time);
  const match = normalized.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (!match) {
    throw new Error(`Invalid time format: ${time}. Use e.g. 11:30am`);
  }
  const [, hourStr, minStr, ampm] = match;
  let hour = parseInt(hourStr!, 10);
  const min = parseInt(minStr!, 10);
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  const hour24 = hour < 10 ? `0${hour}` : `${hour}`;
  const minPadded = min < 10 ? `0${min}` : `${min}`;
  const offset = getCentralOffsetForDate(date);
  return `${date}T${hour24}:${minPadded}:00.000${offset}`;
}

/**
 * Navigate to the Lofty campaign page and capture session_id from campaign_time_slots request or fallbacks.
 * @param campaignUrl - Campaign page URL (default: L1 agent-advice-l1). Use CAMPAIGN_URL_L2 for L2.
 */
export async function getLoftySessionId(campaignUrl: string = CAMPAIGN_URL): Promise<string | null> {
  let sessionId: string | null = null;
  let browser: Awaited<ReturnType<typeof browserPool.getBrowser>> | null = null;
  let context: Awaited<ReturnType<Awaited<ReturnType<typeof browserPool.getBrowser>>['newContext']>> | null = null;
  let page: Awaited<ReturnType<NonNullable<typeof context>['newPage']>> | null = null;

  try {
    browser = await browserPool.getBrowser();
    context = await browser.newContext({
      timezoneId: TIMEZONE,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    page = await context.newPage();
    page.setDefaultNavigationTimeout(CAPTURE_TIMEOUT_MS);
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.route('**/api/campaign_time_slots*', (route: Route) => {
      try {
        const url = route.request().url();
        const parsed = new URL(url);
        const id = parsed.searchParams.get('session_id');
        if (id) sessionId = id;
      } catch {
        // ignore
      }
      void route.continue();
    });

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

    const slotsResponsePromise = page
      .waitForResponse(
        (r: { url: () => string }) => r.url().includes('campaign_time_slots'),
        { timeout: WAIT_FOR_SLOTS_MS }
      )
      .catch(() => null);

    page.on('request', onRequest);

    try {
      await page.goto(campaignUrl, { waitUntil: 'networkidle' });
    } catch {
      try {
        await page.goto(campaignUrl, { waitUntil: 'load' });
      } catch {
        // continue without navigation
      }
    }

    await page.waitForTimeout(2000).catch(() => {});

    if (!sessionId) {
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
      }).catch(() => null);
      if (scraped && typeof scraped === 'string') sessionId = scraped;
    }

    if (!sessionId) {
      await page.waitForTimeout(1500).catch(() => {});
      const fromWindow = await page.evaluate(() => {
        const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
        const sources: unknown[] = [
          (window as unknown as { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__,
          (window as unknown as { __DATA__?: unknown }).__DATA__,
          (window as unknown as { session_id?: string }).session_id,
        ];
        for (const s of sources) {
          if (!s) continue;
          const str = typeof s === 'string' ? s : JSON.stringify(s);
          const m = str.match(uuidRe);
          if (m?.[0]) return m[0];
        }
        return null;
      }).catch(() => null);
      if (fromWindow && typeof fromWindow === 'string') sessionId = fromWindow;
    }

    try {
      const firstResponse = await slotsResponsePromise;
      if (firstResponse && !sessionId) {
        const u = new URL(firstResponse.request().url());
        sessionId = u.searchParams.get('session_id');
      }
    } catch {
      // ignore
    }

    return sessionId;
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

/** Fallback: fetch campaign page HTML and try to extract session_id (e.g. when Playwright fails or is unavailable). */
async function tryGetSessionFromPageFetch(campaignUrl: string = CAMPAIGN_URL): Promise<string | null> {
  try {
    const res = await fetch(campaignUrl, {
      headers: { 'User-Agent': BROWSER_UA, Referer: campaignUrl },
    });
    const html = await res.text();
    const uuidMatch = html.match(/session_id["\s:=]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch?.[1]) return uuidMatch[1];
    const urlMatch = html.match(/campaign_time_slots\?[^"'\s]*session_id=([0-9a-f-]{36})/i);
    if (urlMatch?.[1]) return urlMatch[1];
    const jsonMatch = html.match(/"session_id"\s*:\s*"([0-9a-f-]{36})"/i);
    if (jsonMatch?.[1]) return jsonMatch[1];
  } catch {
    // ignore
  }
  return null;
}

/**
 * Book a Lofty (Schedule Hero) slot: get session from campaign page, then POST campaign_meetings.
 */
export async function bookLoftySlot(params: BookLoftySlotParams): Promise<BookLoftySlotResult> {
  const { date, time, firstName, lastName, email, phone } = params;
  const bookerName = `${firstName} ${lastName}`.trim() || 'Guest';
  const phoneFormatted = phone?.trim() ? (phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '').slice(-10)}`) : '';

  let meetingTime: string;
  try {
    meetingTime = buildMeetingTime(date, time);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }

  let sessionId = await getLoftySessionId(CAMPAIGN_URL);
  if (!sessionId) {
    const fallback = await tryGetSessionFromPageFetch(CAMPAIGN_URL);
    if (!fallback) {
      return {
        success: false,
        error: 'Could not get session_id from Lofty campaign page. The page may not have loaded or the API may have changed.',
      };
    }
    sessionId = fallback;
  }

  const submittedValues = [
    { answer: firstName, question: 'First Name', question_id: QUESTION_IDS.firstName, question_type: 'TextQuestionPage' },
    { answer: lastName, question: 'Last Name', question_id: QUESTION_IDS.lastName, question_type: 'TextQuestionPage' },
    { answer: email, question: 'Email', question_id: QUESTION_IDS.email, question_type: 'TextQuestionPage' },
    { answer: phoneFormatted || '', question: 'Phone Number', question_id: QUESTION_IDS.phone, question_type: 'TextQuestionPage' },
  ];

  const body = {
    meeting: {
      meeting_time: meetingTime,
      booker_email: email,
      booker_name: bookerName,
      session: {
        submitted_values: submittedValues,
        consent: false,
      },
      locale: 'en-US',
    },
    session_id: sessionId,
  };

  try {
    const res = await fetch(CAMPAIGN_MEETINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://lofty.schedulehero.io',
        Referer: CAMPAIGN_URL,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as { errors?: unknown; data?: unknown };
    if (!res.ok) {
      const message = Array.isArray(json.errors)
        ? json.errors.map((e: unknown) => (typeof e === 'object' && e !== null && 'detail' in e ? (e as { detail: string }).detail : String(e))).join('; ')
        : (json as { error?: string }).error || res.statusText || `HTTP ${res.status}`;
      return { success: false, error: message };
    }

    return { success: true, meetingTime };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}

/**
 * Book a Lofty L2 (Schedule Hero agent-advice-l2) slot: navigate to L2 campaign to get session_id, then POST campaign_meetings.
 * Used for vendors lofty-5-9, lofty-10-24, lofty-25.
 */
export async function bookLoftySlotL2(params: BookLoftySlotParams): Promise<BookLoftySlotResult> {
  const { date, time, firstName, lastName, email, phone } = params;
  const bookerName = `${firstName} ${lastName}`.trim() || 'Guest';
  const phoneFormatted = phone?.trim() ? (phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '').slice(-10)}`) : '';

  let meetingTime: string;
  try {
    meetingTime = buildMeetingTime(date, time);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: msg };
  }

  let sessionId = await getLoftySessionId(CAMPAIGN_URL_L2);
  if (!sessionId) {
    const fallback = await tryGetSessionFromPageFetch(CAMPAIGN_URL_L2);
    if (!fallback) {
      return {
        success: false,
        error: 'Could not get session_id from Lofty L2 campaign page. The page may not have loaded or the API may have changed.',
      };
    }
    sessionId = fallback;
  }

  const submittedValues = [
    { answer: firstName, question: 'First Name', question_id: QUESTION_IDS.firstName, question_type: 'TextQuestionPage' },
    { answer: lastName, question: 'Last Name', question_id: QUESTION_IDS.lastName, question_type: 'TextQuestionPage' },
    { answer: email, question: 'Email', question_id: QUESTION_IDS.email, question_type: 'TextQuestionPage' },
    { answer: phoneFormatted || '', question: 'Phone Number', question_id: QUESTION_IDS.phone, question_type: 'TextQuestionPage' },
  ];

  const body = {
    meeting: {
      meeting_time: meetingTime,
      booker_email: email,
      booker_name: bookerName,
      session: {
        submitted_values: submittedValues,
        consent: false,
      },
      locale: 'en-US',
    },
    session_id: sessionId,
  };

  try {
    const res = await fetch(CAMPAIGN_MEETINGS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'https://lofty.schedulehero.io',
        Referer: CAMPAIGN_URL_L2,
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as { errors?: unknown; data?: unknown };
    if (!res.ok) {
      const message = Array.isArray(json.errors)
        ? json.errors.map((e: unknown) => (typeof e === 'object' && e !== null && 'detail' in e ? (e as { detail: string }).detail : String(e))).join('; ')
        : (json as { error?: string }).error || res.statusText || `HTTP ${res.status}`;
      return { success: false, error: message };
    }

    return { success: true, meetingTime };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
