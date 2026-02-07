import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Page, Request, Response } from 'playwright';
import { browserPool } from './browser-pool';

const CALENDLY_VIDEO_DIR = process.env.CALENDLY_VIDEO_DIR || path.join(process.cwd(), '.calendly-videos');
const CALENDLY_VIDEO_ENABLED = process.env.CALENDLY_VIDEO_ENABLED !== '0' && process.env.CALENDLY_VIDEO_ENABLED !== 'false';

const CALENDLY_BASE_URL = 'https://calendly.com/agentfire-demo/30-minute-demo';

/** Realistic Chrome UA to reduce bot detection (Calendly context only). */
const CALENDLY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Small random delay (ms) for more human-like behavior. */
function humanDelay(baseMs: number, jitterMs: number = 80): Promise<void> {
  const ms = Math.max(0, baseMs + (Math.random() * 2 - 1) * jitterMs);
  return new Promise((r) => setTimeout(r, ms));
}

/** Label-based keys for answers; maps to question_0 .. question_9 */
export const CALENDLY_QUESTION_LABEL_TO_NAME: Record<string, string> = {
  'Phone Number': 'question_0',
  'To help us prepare for your demo, please share a bit about yourself and what you\'re looking for with an AgentFire website.': 'question_1',
  'Which of the following best describes you:': 'question_2',
  'Which of the following options best describe your goals with an AgentFire website? (Please select all that apply)': 'question_3',
  'Current Website URL:': 'question_4',
  'What best describes the type of website design you\'re looking for?': 'question_5',
  'MLS Board(s) you belong to:': 'question_6',
  'How\'d you hear about AgentFire? (i.e. Received an Email, Google Search, Facebook Ad, Instagram Ad, Partner / Referral, etc.)': 'question_7',
  'If something comes up and you need to reschedule, will you let us know ahead of your demo so that we can free up that time for someone else?': 'question_8',
  'Your Location': 'question_9',
};

/** Resolve answer key (label or question_N) to form field name */
export function resolveAnswerKey(key: string): string {
  if (/^question_\d+$/.test(key)) return key;
  const resolved = CALENDLY_QUESTION_LABEL_TO_NAME[key];
  if (resolved) return resolved;
  return key;
}

/**
 * Default form answers for all non-dynamic fields (same selections every time).
 * Dynamic fields: First Name, Last Name, Email, Phone Number (question_0).
 */
export const DEFAULT_CALENDLY_ANSWERS: Record<string, string | string[]> = {
  question_1: 'AgentAdvice booking',
  question_2: 'Agent',
  question_3: ['Build and strengthen my online brand'],
  question_4: 'www.test.com',
  question_5: "A 'themed' website design that can be launched quickly",
  question_6: 'N/A',
  question_7: 'AGENTADVICE',
  question_8: ['Yes of course! '],
  question_9: 'United States',
};

export interface BookCalendlySlotOptions {
  date: string; // YYYY-MM-DD
  time: string; // e.g. "9:30am" or "9:30 AM"
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** Optional. If omitted, defaults are used for all questions; phone from options. */
  answers?: Record<string, string | string[]>;
}

export interface BookCalendlySlotResult {
  success: boolean;
  date?: string;
  time?: string;
  error?: string;
  /** Field names or labels that Calendly indicated are missing or invalid (e.g. question_0, first_name). */
  missingFields?: string[];
  /** Error/validation messages shown on the page after submit failed. */
  validationMessages?: string[];
  /** Path to recorded video of the session (only set when booking failed and recording is enabled). */
  videoPath?: string;
}

/**
 * Normalize time to Calendly format for data-start-time (e.g. "9:30am", "12:00pm").
 */
export function normalizeTimeForCalendly(time: string): string {
  const cleaned = time.trim().replace(/\s+/g, '').toLowerCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/);
  if (match) {
    const [, hour, min, ampm] = match;
    return `${hour}:${min}${ampm}`;
  }
  if (/^\d{1,2}:\d{2}(am|pm)$/.test(cleaned)) return cleaned;
  return time.replace(/\s+/g, '').toLowerCase();
}

const LOG_PREFIX = '[Calendly]';

const NETWORK_LOG_PREFIX = '[Calendly API]';

/** Start logging API requests/responses after Schedule Event click. Returns cleanup to remove listeners. */
function startScheduleEventNetworkLogging(page: Page): () => void {
  const onRequest = (request: Request) => {
    const type = request.resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    console.log(`${NETWORK_LOG_PREFIX} REQ ${request.method()} ${request.url()}`);
  };
  const onResponse = (response: Response) => {
    const type = response.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    const status = response.status();
    const url = response.url();
    console.log(`${NETWORK_LOG_PREFIX} RES ${status} ${url}`);
    if (!response.ok()) {
      response.text().then((body) => {
        const truncated = body.length > 500 ? body.slice(0, 500) + '...' : body;
        console.log(`${NETWORK_LOG_PREFIX} FAILED RESPONSE BODY: ${truncated}`);
      }).catch((e) => console.log(`${NETWORK_LOG_PREFIX} Could not read failed response body: ${(e as Error)?.message}`));
    }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  return () => {
    page.off('request', onRequest);
    page.off('response', onResponse);
  };
}

/**
 * Build query params for Calendly URL prefill: first_name, last_name, email, a1=phone, a2..a10.
 * Note: Calendly does not prefill radio/checkbox/combobox from URL (a3,a4,a6,a9,a10); we always
 * fill question_2, question_3, question_5, question_8, question_9 manually in fillFormAndSubmit.
 */
function buildCalendlyPrefillParams(
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>
): string {
  const params = new URLSearchParams();
  params.set('first_name', opts.firstName);
  params.set('last_name', opts.lastName);
  params.set('email', opts.email);
  const a1 = opts.phone ?? (normalizedAnswers['question_0'] as string | undefined);
  if (a1 != null && a1 !== '') {
    params.set('a1', typeof a1 === 'string' ? a1 : (a1 as string[])[0] ?? '');
  }
  const q1 = normalizedAnswers['question_1'];
  if (q1 != null) params.set('a2', Array.isArray(q1) ? q1[0] ?? '' : q1);
  params.set('a3', '1'); // question_2 (radio) – URL not applied by Calendly; filled in form
  params.set('a4', '1'); // question_3 (checkboxes) – URL not applied; filled in form
  const q4 = normalizedAnswers['question_4'];
  if (q4 != null) params.set('a5', Array.isArray(q4) ? q4[0] ?? '' : q4);
  params.set('a6', '1'); // question_5 (radio) – URL not applied; filled in form
  const q6 = normalizedAnswers['question_6'];
  if (q6 != null) params.set('a7', Array.isArray(q6) ? q6[0] ?? '' : q6);
  const q7 = normalizedAnswers['question_7'];
  if (q7 != null) params.set('a8', Array.isArray(q7) ? q7[0] ?? '' : q7);
  params.set('a9', '1'); // question_8 (checkbox) – URL not applied; filled in form
  params.set('a10', '1'); // question_9 (location) – URL not applied; filled in form
  return params.toString();
}

/** Build direct Calendly URL to the booking form for a given date/time (skips calendar and time picker). Includes prefill params. */
function buildDirectCalendlyUrl(
  date: string,
  normalizedTime: string,
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>
): string {
  const match = normalizedTime.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  let hour = 0;
  let min = 0;
  if (match) {
    hour = parseInt(match[1], 10);
    const isPm = match[3] === 'pm';
    if (isPm && hour !== 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
    min = parseInt(match[2], 10);
  }
  const hourStr = String(hour).padStart(2, '0');
  const minStr = String(min).padStart(2, '0');
  const tzOffset = '-06:00'; // America/Chicago (CST)
  const isoDateTime = `${date}T${hourStr}:${minStr}:00${tzOffset}`;
  const month = date.slice(0, 7);
  const baseQuery = `month=${month}&date=${date}`;
  const prefill = buildCalendlyPrefillParams(opts, normalizedAnswers);
  return `${CALENDLY_BASE_URL}/${isoDateTime}?${baseQuery}&${prefill}`;
}

/**
 * Create a new browser session for a single Calendly booking. Caller must call cleanup(outcome) when done.
 * When outcome is 'failure', cleanup saves the recorded video and returns its path.
 */
async function createNewBookingPage(calendlyUrl: string): Promise<{
  page: Page;
  cleanup: (outcome: 'success' | 'failure') => Promise<string | null>;
}> {
  let browser: any = null;
  let context: any = null;
  let page: any = null;
  let releaseLock: (() => void) | null = null;

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let videoDir: string | null = null;
  if (CALENDLY_VIDEO_ENABLED) {
    // Use OS temp dir for recording so it works on read-only app dirs (e.g. Railway).
    const recordDir = path.join(os.tmpdir(), 'calendly-videos', sessionId);
    try {
      fs.mkdirSync(recordDir, { recursive: true });
      videoDir = recordDir;
      console.log(`${LOG_PREFIX} Recording enabled: ${videoDir}`);
    } catch (e) {
      console.warn(`${LOG_PREFIX} Recording disabled (mkdir failed):`, (e as Error)?.message);
      videoDir = null;
    }
  }

  browser = await browserPool.getBrowser();
  releaseLock = await browserPool.acquireContextLock(browser);

  const contextOptions: {
    timezoneId: string;
    locale: string;
    userAgent: string;
    viewport: { width: number; height: number };
    recordVideo?: { dir: string; size: { width: number; height: number } };
  } = {
    timezoneId: 'America/Chicago',
    locale: 'en-US',
    userAgent: CALENDLY_USER_AGENT,
    viewport: { width: 1280, height: 720 },
  };
  if (videoDir) contextOptions.recordVideo = { dir: videoDir, size: { width: 1280, height: 720 } };

  let retries = 3;
  while (retries > 0) {
    try {
      if (!browser.isConnected()) {
        if (releaseLock) releaseLock();
        browserPool.releaseBrowser(browser);
        browser = await browserPool.getBrowser();
        releaseLock = await browserPool.acquireContextLock(browser);
      }
      context = await browser.newContext(contextOptions);
      page = await context.newPage();
      break;
    } catch (error: any) {
      retries--;
      if (error.message?.includes('has been closed') && retries > 0) {
        if (releaseLock) releaseLock();
        browserPool.releaseBrowser(browser);
        browser = await browserPool.getBrowser();
        releaseLock = await browserPool.acquireContextLock(browser);
        await new Promise((r) => setTimeout(r, 100));
      } else {
        if (releaseLock) releaseLock();
        browserPool.releaseBrowser(browser);
        throw error;
      }
    }
  }

  if (releaseLock) {
    releaseLock();
  }
  if (!page) {
    if (browser) browserPool.releaseBrowser(browser);
    throw new Error('Failed to create browser context');
  }

  page.setDefaultNavigationTimeout(15000);
  // Only block tracking/ads so the page loads normally (reduces bot detection; full CSS/images look like real user).
  await page.route('**/*', (route: any) => {
    const url = route.request().url();
    if (
      url.includes('google-analytics') ||
      url.includes('googletagmanager') ||
      url.includes('facebook.net') ||
      url.includes('doubleclick') ||
      url.includes('/ads/') ||
      url.includes('tracking') ||
      url.includes('pixel') ||
      url.includes('beacon')
    ) {
      route.abort();
      return;
    }
    route.continue();
  });

  console.log(`${LOG_PREFIX} Navigating to ${calendlyUrl}`);
  await page.goto(calendlyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  const finalUrl = page.url();
  console.log(`${LOG_PREFIX} Page loaded: ${finalUrl}`);

  let cleaned = false;
  const cleanup = async (outcome: 'success' | 'failure'): Promise<string | null> => {
    if (cleaned) return null;
    cleaned = true;
    let savedVideoPath: string | null = null;
    try {
      // Get video promise before closing (Playwright: use page.video() when recordVideo is set on context).
      const videoPromise = page?.video?.() ?? context?.video?.() ?? null;
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (context) await context.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
      if (outcome === 'failure') {
        if (!videoPromise) {
          console.warn(`${LOG_PREFIX} No video promise (recording not active for this context)`);
        } else {
          try {
            const video = await videoPromise;
            if (!video) {
              console.warn(`${LOG_PREFIX} Video promise resolved to null`);
            } else {
              const srcPath = await video.path();
              if (!srcPath) {
                console.warn(`${LOG_PREFIX} Video path is empty`);
              } else if (!fs.existsSync(srcPath)) {
                console.warn(`${LOG_PREFIX} Video file missing at: ${srcPath}`);
              } else {
                const failedDir = path.join(CALENDLY_VIDEO_DIR, 'failed');
                try {
                  fs.mkdirSync(failedDir, { recursive: true });
                  const destName = `calendly-${sessionId}.webm`;
                  const destPath = path.join(failedDir, destName);
                  fs.copyFileSync(srcPath, destPath);
                  savedVideoPath = destPath;
                  console.log(`${LOG_PREFIX} Saved failure video: ${destPath}`);
                } catch (copyErr) {
                  console.warn(`${LOG_PREFIX} Could not copy video to ${failedDir}:`, (copyErr as Error)?.message);
                  savedVideoPath = srcPath;
                  console.log(`${LOG_PREFIX} Using temp video path: ${srcPath}`);
                }
              }
            }
          } catch (e) {
            console.warn(`${LOG_PREFIX} Could not save video:`, (e as Error)?.message);
          }
        }
      }
      if (outcome === 'success' && videoDir) {
        try {
          fs.rmSync(videoDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    } finally {
      if (browser) browserPool.releaseBrowser(browser);
    }
    return savedVideoPath;
  };

  return { page, cleanup };
}

/**
 * When a booking fails after clicking Schedule Event, Calendly often leaves validation errors on the page.
 * Waits briefly for client-side validation UI to render, then captures visible error messages and field names.
 */
async function captureCalendlyValidationErrors(page: Page): Promise<{
  missingFields: string[];
  validationMessages: string[];
}> {
  const empty = { missingFields: [] as string[], validationMessages: [] as string[] };
  try {
    if (page.isClosed()) return empty;
    // Give Calendly's client-side validation time to render (errors often appear after submit).
    await page.waitForTimeout(1500);
    if (page.isClosed()) return empty;

    const result = await page.evaluate(() => {
      const messages: string[] = [];
      const fieldNames = new Set<string>();

      // 1. Visible error/alert text (role=alert, common error classes, and Calendly-specific)
      const errorSelectors = [
        '[role="alert"]',
        '.calendly-inline-error',
        '[data-error]',
        '.error-message',
        '[class*="error"]',
        '[class*="invalid"]',
        '[class*="Error"]',
        '[class*="Invalid"]',
        '.field-error',
      ];
      const seen = new Set<string>();
      for (const sel of errorSelectors) {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            const text = (el as HTMLElement).innerText?.trim() || (el as HTMLElement).textContent?.trim() || '';
            if (text && text.length < 500 && text.length > 0 && !seen.has(text)) {
              seen.add(text);
              messages.push(text);
            }
          });
        } catch (_) {}
      }

      // 2. Form controls that are required and empty, aria-invalid, or inside a container with error class
      const controls = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input, select, textarea'
      );
      controls.forEach((el) => {
        const name = el.getAttribute('name');
        if (!name) return;
        const isEmpty =
          el.tagName === 'SELECT'
            ? !(el as HTMLSelectElement).value
            : !String((el as HTMLInputElement).value || '').trim();
        const isInvalid = el.getAttribute('aria-invalid') === 'true';
        const isRequired = el.hasAttribute('required');
        const parentWithError = el.closest('[class*="error"], [class*="invalid"], [class*="Error"]');
        if (isInvalid || (isRequired && isEmpty) || (parentWithError && isEmpty)) fieldNames.add(name);
      });

      // 3. Known Calendly form field names that are empty (first_name, last_name, email, question_0..9)
      const knownFields = /^(first_name|last_name|email|question_\d+)$/;
      controls.forEach((el) => {
        const name = el.getAttribute('name');
        if (!name || !knownFields.test(name) || fieldNames.has(name)) return;
        const isEmpty =
          el.tagName === 'SELECT'
            ? !(el as HTMLSelectElement).value
            : !String((el as HTMLInputElement).value || '').trim();
        if (isEmpty && (el as HTMLInputElement).type !== 'hidden') fieldNames.add(name);
      });

      return {
        validationMessages: messages,
        missingFields: Array.from(fieldNames),
      };
    });

    const hasAny = result.validationMessages.length > 0 || result.missingFields.length > 0;
    console.log(
      `${LOG_PREFIX} Captured validation: missingFields=[${result.missingFields.join(', ') || 'none'}], messages=[${result.validationMessages.slice(0, 3).join('; ') || 'none'}]`
    );
    return result;
  } catch (e) {
    console.log(`${LOG_PREFIX} Validation capture failed (page may have navigated): ${(e as Error)?.message || ''}`);
    return empty;
  }
}

async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    // OneTrust banner ("We use cookies and similar technologies...") often loads after DOM – wait for it
    const bannerSelector = '#onetrust-consent-sdk';
    try {
      await page.waitForSelector(bannerSelector, { state: 'visible', timeout: 6000 });
    } catch {
      // Banner may not appear or already dismissed
    }
    await humanDelay(500);
    const clickOpts = { timeout: 4000, force: true } as const;

    // OneTrust: try known accept button IDs first (inside or outside banner)
    const acceptBtn = await page.$('#accept-recommended-btn-handler');
    if (acceptBtn) {
      console.log(`${LOG_PREFIX} Dismissing cookie consent (Allow All)`);
      await acceptBtn.click(clickOpts);
      await humanDelay(400);
      return;
    }
    const oneTrustAccept = await page.$('#onetrust-accept-btn-handler');
    if (oneTrustAccept) {
      console.log(`${LOG_PREFIX} Dismissing cookie consent (OneTrust accept)`);
      await oneTrustAccept.click(clickOpts);
      await humanDelay(400);
      return;
    }
    // Button/link with "I Understand" or "Accept" (banner text: "cookies and similar technologies")
    const byRole = page.getByRole('button', { name: /I\s*understand|Accept\s*all|Allow\s*all/i }).first();
    if ((await byRole.count()) > 0) {
      await byRole.click(clickOpts);
      console.log(`${LOG_PREFIX} Dismissing cookie consent (I understand / Accept)`);
      await humanDelay(400);
      return;
    }
    const byText = page.locator('#onetrust-consent-sdk a, #onetrust-consent-sdk button, [id*="onetrust"] button, [id*="onetrust"] a').filter({ hasText: /I\s*understand|Accept|Allow\s*all/i }).first();
    if ((await byText.count()) > 0) {
      await byText.click(clickOpts);
      console.log(`${LOG_PREFIX} Dismissing cookie consent (OneTrust by text)`);
      await humanDelay(400);
      return;
    }
    const anyAccept = page.locator('a, button').filter({ hasText: /I\s*understand/i }).first();
    if ((await anyAccept.count()) > 0) {
      await anyAccept.click(clickOpts);
      console.log(`${LOG_PREFIX} Dismissing cookie consent (I understand, any)`);
      await humanDelay(400);
      return;
    }
    // Fallback: OneTrust JS API if exposed (AllowAll or Close dismisses banner)
    const dismissed = await page.evaluate(() => {
      const w = window as unknown as { OneTrust?: { AllowAll?: () => void; Close?: () => void } };
      if (typeof w.OneTrust?.AllowAll === 'function') {
        w.OneTrust.AllowAll();
        return true;
      }
      if (typeof w.OneTrust?.Close === 'function') {
        w.OneTrust.Close();
        return true;
      }
      return false;
    });
    if (dismissed) {
      console.log(`${LOG_PREFIX} Dismissing cookie consent (OneTrust JS)`);
      await humanDelay(500);
      return;
    }
    console.log(`${LOG_PREFIX} No cookie consent banner found`);
  } catch (e) {
    console.log(`${LOG_PREFIX} Cookie consent dismiss skipped: ${(e as Error)?.message || ''}`);
  }
}

async function selectDay(page: Page, date: string): Promise<void> {
  const [year, monthStr, dayStr] = date.split('-');
  const targetDay = parseInt(dayStr, 10);
  const targetMonth = parseInt(monthStr, 10);
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const targetMonthName = monthNames[targetMonth - 1];

  console.log(`${LOG_PREFIX} Selecting day: ${date} (${targetMonthName} ${targetDay}, ${year})`);
  await page.waitForSelector('[data-testid="calendar"]', { timeout: 10000 });
  console.log(`${LOG_PREFIX} Calendar visible`);
  await page.waitForTimeout(500);

  for (let attempt = 0; attempt < 12; attempt++) {
    const titleEl = await page.$('[data-testid="title"]');
    const currentTitle = titleEl ? (await titleEl.textContent())?.trim() || '' : '';
    if (currentTitle.includes(targetMonthName) && currentTitle.includes(year)) {
      console.log(`${LOG_PREFIX} Calendar month matches: "${currentTitle}"`);
      break;
    }
    const nextBtn = await page.$('button[aria-label="Go to next month"]');
    if (!nextBtn) {
      const prevBtn = await page.$('button[aria-label="Go to previous month"]');
      if (prevBtn && targetMonth < new Date().getMonth() + 1) {
        await prevBtn.click();
        await page.waitForTimeout(300);
        continue;
      }
      throw new Error(`Month ${targetMonthName} ${year} not found on calendar`);
    }
    const disabled = await nextBtn.getAttribute('disabled');
    if (disabled !== null && disabled !== undefined) {
      throw new Error(`Day ${date} not available (month navigation disabled)`);
    }
    await nextBtn.click();
    await page.waitForTimeout(300);
  }

  // In headless/server environments (e.g. Railway), Calendly often shows all days as "No times available"
  // (disabled), so no element has the bookable class. We first try bookable buttons, then fall back to
  // finding the exact day by aria-label ("MonthName Day -") or by button text, and force-click so the
  // time panel may still load. If the time panel stays empty, Calendly may be withholding slots in that context.
  let dayButton: any = null;
  const bookableSelector = 'tbody[data-testid="calendar-table"] button.booking-kit_button-bookable_80ba95eb';
  const dayButtons = await page.$$(bookableSelector);
  console.log(`${LOG_PREFIX} Found ${dayButtons.length} bookable day button(s)`);
  for (const btn of dayButtons) {
    const text = (await btn.textContent())?.trim() || '';
    const dayNum = text.replace(/\D/g, '') || text;
    if (dayNum === String(targetDay)) {
      dayButton = btn;
      break;
    }
  }
  if (!dayButton) {
    // Fallback: in headless/server environments Calendly may show all days as "No times available"
    // (disabled). Find the exact day by aria-label. Use "February 5 -" pattern to avoid matching 15/25.
    console.log(`${LOG_PREFIX} No bookable day match; trying fallback by aria-label (${targetMonthName}, ${targetDay})`);
    const exactAriaPattern = `${targetMonthName} ${targetDay} -`;
    const byAria = await page.$(
      `tbody[data-testid="calendar-table"] button[aria-label*="${targetMonthName} ${targetDay} -"]`
    );
    if (byAria) {
      dayButton = byAria;
      console.log(`${LOG_PREFIX} Using fallback day button (aria-label contains "${exactAriaPattern}")`);
    }
    // Second fallback: match by button text (exact day number) in case aria-label format differs
    if (!dayButton) {
      const allDayButtons = await page.$$('tbody[data-testid="calendar-table"] button[aria-label]');
      for (const btn of allDayButtons) {
        const text = (await btn.textContent())?.trim().replace(/\D/g, '') || '';
        if (text === String(targetDay)) {
          dayButton = btn;
          console.log(`${LOG_PREFIX} Using fallback day button (matched by day number text)`);
          break;
        }
      }
    }
  }
  if (!dayButton) {
    const allDays = await page.$$eval(
      'tbody[data-testid="calendar-table"] button[aria-label]',
      (buttons: Element[]) =>
        (buttons as HTMLButtonElement[]).map((b) => b.getAttribute('aria-label') || b.textContent?.trim())
    );
    throw new Error(
      `Bookable day ${targetDay} not found for ${targetMonthName} ${year}. Available: ${allDays?.slice(0, 5).join(', ') || 'none'}`
    );
  }
  // Click using a locator so the element is re-resolved at click time (avoids "Element is not attached to the DOM"
  // when the calendar re-renders between finding the button and clicking).
  const dayClickSelector = `tbody[data-testid="calendar-table"] button[aria-label*="${targetMonthName} ${targetDay} -"]`;
  console.log(`${LOG_PREFIX} Clicking day ${targetDay}`);
  await page.locator(dayClickSelector).first().click({ force: true });
  // Allow time for slot list to load after day selection
  await page.waitForTimeout(1200);
  console.log(`${LOG_PREFIX} Day clicked; waiting for time panel`);
}

/** Normalize for comparison: "6:00am" and "6:00 am" both become "6:00am" */
function normalizeTimeForMatch(t: string): string {
  return (t || '').trim().toLowerCase().replace(/\s+/g, '');
}

async function selectTimeSlot(page: Page, normalizedTime: string): Promise<void> {
  console.log(`${LOG_PREFIX} Waiting for time panel (spotpicker-times-list)...`);
  // Wait for time panel container (attached is enough; it may be empty if no slots)
  await page.waitForSelector('[data-component="spotpicker-times-list"]', { timeout: 20000, state: 'attached' }).catch(() => {
    throw new Error(
      'Time panel did not load for the selected day. Calendly may show no availability in this context (server/headless). Try a different date or run from a client with a browser.'
    );
  });
  console.log(`${LOG_PREFIX} Time panel attached; waiting for slot buttons...`);
  // Wait until at least one time button is present (slots loaded); allow 10s after panel appears
  const hasSlots = await page.waitForSelector('button[data-container="time-button"]', { timeout: 10000, state: 'visible' }).catch(() => null);
  if (!hasSlots) {
    const count = await page.$$eval('button[data-container="time-button"]', (nodes) => nodes.length).catch(() => 0);
    console.log(`${LOG_PREFIX} Time buttons visible: ${count}`);
    if (count === 0) {
      throw new Error(
        'No time slots available for the selected day. Calendly may show no availability in this context (server/headless or region). Try a different date.'
      );
    }
  } else {
    const count = await page.$$eval('button[data-container="time-button"]', (nodes) => nodes.length).catch(() => 0);
    console.log(`${LOG_PREFIX} Found ${count} time slot(s); looking for "${normalizedTime}"`);
  }
  await page.waitForTimeout(500);

  const targetNorm = normalizeTimeForMatch(normalizedTime);
  const slotButton = await page.$(
    `button[data-container="time-button"][data-start-time="${normalizedTime}"]`
  );
  if (slotButton) {
    console.log(`${LOG_PREFIX} Clicking time slot: ${normalizedTime}`);
    await slotButton.click();
    await page.waitForTimeout(500);
    return;
  }
  const timeButtons = await page.$$('button[data-container="time-button"]');
  const displayTime = normalizedTime.replace(/(\d+):(\d+)(am|pm)/i, '$1:$2 $3');
  for (const btn of timeButtons) {
    const startTime = await btn.getAttribute('data-start-time');
    const text = (await btn.textContent())?.trim() || '';
    const startNorm = normalizeTimeForMatch(startTime || '');
    const textNorm = normalizeTimeForMatch(text || '');
    if (
      startNorm === targetNorm ||
      textNorm === targetNorm ||
      startTime === normalizedTime ||
      text === displayTime
    ) {
      console.log(`${LOG_PREFIX} Clicking time slot (matched): ${startTime || text}`);
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  const available = await page.$$eval(
    'button[data-container="time-button"]',
    (nodes: Element[]) =>
      (nodes as HTMLElement[]).map((n) => n.getAttribute('data-start-time') || n.textContent?.trim() || '').filter(Boolean).slice(0, 10)
  );
  const count = await page.$$eval('button[data-container="time-button"]', (nodes) => nodes.length);
  throw new Error(
    `Time slot "${normalizedTime}" not found. Buttons found: ${count}. Available (sample): ${available.join(', ') || 'none'}`
  );
}

async function clickNextButton(page: Page, normalizedTime: string): Promise<void> {
  console.log(`${LOG_PREFIX} Looking for Next button...`);
  const nextBtn = await page.$(`button[aria-label="Next ${normalizedTime}"]`);
  if (nextBtn) {
    console.log(`${LOG_PREFIX} Clicking Next (aria-label match)`);
    await nextBtn.click();
    await page.waitForTimeout(800);
    return;
  }
  const confirmBtn = await page.$('button.booking-kit_confirm-button-selected_87095647');
  if (confirmBtn) {
    console.log(`${LOG_PREFIX} Clicking Next (confirm button)`);
    await confirmBtn.click();
    await page.waitForTimeout(800);
    return;
  }
  const allButtons = await page.$$('button');
  for (const btn of allButtons) {
    const text = (await btn.textContent())?.trim() || '';
    if (text === 'Next') {
      console.log(`${LOG_PREFIX} Clicking Next (text match)`);
      await btn.click();
      await page.waitForTimeout(800);
      return;
    }
  }
  throw new Error('Next button not found after selecting time slot');
}

async function fillFormAndSubmit(
  page: Page,
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>
): Promise<void> {
  console.log(`${LOG_PREFIX} Waiting for questionnaire form...`);
  await page.waitForSelector('input[name="first_name"]', { timeout: 10000 });
  console.log(`${LOG_PREFIX} Form visible; filling radio/checkbox/combobox only (text fields prefilled via URL)`);
  await humanDelay(300);

  const logFill = (field: string, value: string | string[], ok: boolean, detail?: string) => {
    const v = Array.isArray(value) ? value.join(', ') : value;
    const status = ok ? 'filled' : 'MISSING';
    console.log(`${LOG_PREFIX} Form field ${field}: ${status} ${detail || ''} value="${(v || '').slice(0, 50)}${(v && v.length > 50 ? '...' : '')}"`);
  };

  // first_name, last_name, email, question_0 (phone), question_1, question_4, question_6, question_7 are prefilled via URL – do not fill again (avoids detached DOM).
  const urlPrefilledFields = new Set(['question_0', 'question_1', 'question_4', 'question_6', 'question_7']);

  // Use locators instead of element handles so elements are re-resolved at click/fill time (avoids "Element is not attached to the DOM" when Calendly re-renders).
  for (const [fieldName, value] of Object.entries(normalizedAnswers)) {
    if (urlPrefilledFields.has(fieldName)) {
      logFill(fieldName, value, true, '(prefilled via URL, skipped)');
      continue;
    }
    const raw = value;
    const isArray = Array.isArray(raw);
    const values = isArray ? (raw as string[]) : [raw as string];

    if (fieldName === 'question_2') {
      const radioLoc = page.locator(`input[name="question_2"][type="radio"][value="${values[0]}"]`).first();
      const byTestIdLoc = page.locator(`[data-testid="${values[0]}"]`).first();
      const firstRadioLoc = page.locator('input[name="question_2"][type="radio"]').first();
      if ((await radioLoc.count()) > 0) {
        await radioLoc.click();
        logFill(fieldName, values[0] || '', true, '(radio clicked)');
      } else if ((await byTestIdLoc.count()) > 0) {
        await byTestIdLoc.click();
        logFill(fieldName, values[0] || '', true, '(by testid)');
      } else if ((await firstRadioLoc.count()) > 0) {
        await firstRadioLoc.click();
        logFill(fieldName, values[0] || '', true, '(first radio selected)');
      } else {
        logFill(fieldName, values[0] || '', false, '(no radios found)');
      }
      continue;
    }
    if (fieldName === 'question_3') {
      await page.waitForTimeout(250);
      let anyFilled = false;
      const clickOpt = { force: true } as const;
      for (const v of values) {
        if (!v) continue;
        if (v === 'Other' || v.toLowerCase().includes('other')) {
          const otherInputLoc = page.locator('input[name="question_3"][placeholder="Other"]').first();
          if ((await otherInputLoc.count()) > 0) await otherInputLoc.fill(values[values.length - 1] || v);
          const otherCheckboxLoc = page.locator('input[name="question_3"][aria-label="Other"]').first();
          if ((await otherCheckboxLoc.count()) > 0 && !(await otherCheckboxLoc.isChecked())) await otherCheckboxLoc.click(clickOpt);
          anyFilled = true;
          continue;
        }
        const divLoc = page.locator(`div[value="${v}"]`).first();
        if ((await divLoc.count()) > 0) {
          await divLoc.click(clickOpt);
          anyFilled = true;
        } else {
          const labelLoc = page.locator('label').filter({ hasText: v }).first();
          if ((await labelLoc.count()) > 0) {
            await labelLoc.click(clickOpt);
            anyFilled = true;
            break;
          }
        }
      }
      if (!anyFilled) {
        const firstCheckboxLoc = page.locator('input[name="question_3"][type="checkbox"]').first();
        if ((await firstCheckboxLoc.count()) > 0 && !(await firstCheckboxLoc.isChecked())) {
          await firstCheckboxLoc.click(clickOpt);
          anyFilled = true;
        } else {
          const firstDivLoc = page.locator('div[value]').first();
          if ((await firstDivLoc.count()) > 0) {
            await firstDivLoc.click(clickOpt);
            anyFilled = true;
          }
        }
      }
      logFill(fieldName, values, anyFilled, anyFilled ? '(checkbox/label or first option)' : '(no match found)');
      continue;
    }
    if (fieldName === 'question_5') {
      const radioLoc = page.locator(`input[name="question_5"][type="radio"][value="${values[0]}"]`).first();
      const byTestIdLoc = page.locator(`[data-testid="${values[0]}"]`).first();
      const firstRadioLoc = page.locator('input[name="question_5"][type="radio"]').first();
      if ((await radioLoc.count()) > 0) {
        await radioLoc.click();
        logFill(fieldName, values[0] || '', true, '(radio clicked)');
      } else if ((await byTestIdLoc.count()) > 0) {
        await byTestIdLoc.click();
        logFill(fieldName, values[0] || '', true, '(by testid)');
      } else if ((await firstRadioLoc.count()) > 0) {
        await firstRadioLoc.click();
        logFill(fieldName, values[0] || '', true, '(first radio selected)');
      } else {
        logFill(fieldName, values[0] || '', false, '(no radios found)');
      }
      continue;
    }
    if (fieldName === 'question_8') {
      const checkboxLoc = page.locator('input[name="question_8"][type="checkbox"]').first();
      if ((await checkboxLoc.count()) > 0) {
        if (!(await checkboxLoc.isChecked())) await checkboxLoc.click();
        logFill(fieldName, values, true, '(checkbox)');
      } else {
        logFill(fieldName, values, false, '(checkbox not found)');
      }
      continue;
    }
    if (fieldName === 'question_9') {
      const comboboxLoc = page.locator('[name="question_9"][role="combobox"]').first();
      if ((await comboboxLoc.count()) > 0) {
        await comboboxLoc.click();
        await humanDelay(300);
        const optsLoc = page.locator('[role="option"]');
        const count = await optsLoc.count();
        if (count > 0) {
          await optsLoc.first().click();
          logFill(fieldName, values[0] || '', true, '(first option selected)');
        } else {
          logFill(fieldName, values[0] || '', false, '(no options found)');
        }
      } else {
        logFill(fieldName, values[0] || '', false, '(combobox not found)');
      }
      continue;
    }

    const inputLoc = page.locator(`input[name="${fieldName}"], textarea[name="${fieldName}"]`).first();
    if ((await inputLoc.count()) > 0) {
      await inputLoc.fill(values[0] || '');
      logFill(fieldName, values[0] || '', true);
    } else {
      logFill(fieldName, values[0] || '', false, '(input/textarea not found)');
    }
  }

  console.log(`${LOG_PREFIX} Form fill complete; looking for Schedule Event button`);
  const submitLoc = page.locator('button[type="submit"]').filter({ hasText: 'Schedule Event' }).first();
  if ((await submitLoc.count()) === 0) {
    throw new Error('Schedule Event button not found');
  }

  await humanDelay(400); // Brief pause before submit (more human-like)
  const stopNetworkLogging = startScheduleEventNetworkLogging(page);
  console.log(`${LOG_PREFIX} Clicking Schedule Event (API requests/responses will be logged)`);
  await submitLoc.click();

  // After submit, a "Confirmed / You are scheduled with ..." popup may appear, then redirect to agentfire.com/thanks-for-booking/
  // Only consider the booking complete when we reach the thank-you page.
  const confirmationTimeout = 25000;
  try {
    try {
      await page.waitForURL(/agentfire\.com\/thanks-for-booking/, { timeout: confirmationTimeout });
    } catch {
      const stillOnForm = await page.$('input[name="first_name"]').then((el) => !!el);
      let hint = '';
      try {
        const alert = await page.$('[role="alert"], .calendly-inline-error, [data-error], .error-message');
        if (alert) {
          const text = (await alert.textContent())?.trim() || '';
          if (text.length > 0 && text.length < 300) hint = ` Page message: "${text}".`;
        }
        if (!hint) {
          const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '');
          if (/no longer available|no longer open|already taken|slot.*taken/i.test(bodyText))
            hint = ' Slot may no longer be available.';
          else if (/required|please (enter|fill|select)/i.test(bodyText))
            hint = ' A required field may be missing or invalid.';
        }
      } catch {
        /* ignore when gathering hint */
      }
      if (stillOnForm) {
        throw new Error(
          `Confirmation page did not load after submitting. The booking may have failed (validation error or slot no longer available).${hint}`
        );
      }
      throw new Error(
        `Did not reach the booking confirmation page (agentfire.com/thanks-for-booking). The booking may have failed.${hint}`
      );
    }
    console.log(`${LOG_PREFIX} Reached thanks-for-booking page; booking complete`);
  } finally {
    stopNetworkLogging();
  }
}

/**
 * Build merged answers: defaults + optional overrides. Phone (question_0) from opts.phone or answers.
 */
function buildMergedAnswers(opts: BookCalendlySlotOptions): Record<string, string | string[]> {
  const merged: Record<string, string | string[]> = { ...DEFAULT_CALENDLY_ANSWERS };
  if (opts.answers) {
    for (const [key, value] of Object.entries(opts.answers)) {
      const fieldName = resolveAnswerKey(key);
      merged[fieldName] = value;
    }
  }
  const phoneValue = opts.phone ?? (merged['question_0'] as string | undefined);
  if (phoneValue != null && phoneValue !== '') {
    merged['question_0'] = typeof phoneValue === 'string' ? phoneValue : (phoneValue as string[])[0] ?? '';
  }
  return merged;
}

/**
 * Book a Calendly AgentFire demo slot. Each request uses a new browser session (no instance reuse).
 * Strategy: navigate directly to the slot URL (e.g. .../2026-02-05T06:00:00-06:00?month=2026-02&date=2026-02-05)
 * to land on the "Enter Details" form, skipping calendar and time picker.
 * Dynamic fields: firstName, lastName, email, phone (question_0). All other answers use defaults unless overridden in options.answers.
 */
export async function bookCalendlySlot(opts: BookCalendlySlotOptions): Promise<BookCalendlySlotResult> {
  const normalizedTime = normalizeTimeForCalendly(opts.time);
  const normalizedAnswers = buildMergedAnswers(opts);
  const directUrl = buildDirectCalendlyUrl(opts.date, normalizedTime, opts, normalizedAnswers);

  console.log(`${LOG_PREFIX} Starting booking: date=${opts.date} time=${opts.time} (normalized: ${normalizedTime}) email=${opts.email}`);
  console.log(`${LOG_PREFIX} Using direct form URL (skip calendar/time picker)`);

  const { page, cleanup } = await createNewBookingPage(directUrl);
  let succeeded = false;
  try {
    await dismissCookieConsent(page);
    await fillFormAndSubmit(page, opts, normalizedAnswers);

    console.log(`${LOG_PREFIX} Booking success: ${opts.date} ${opts.time}`);
    succeeded = true;
    return {
      success: true,
      date: opts.date,
      time: opts.time,
    };
  } catch (error: any) {
    let message = error?.message || String(error);
    console.error('Calendly booking error:', message);
    let missingFields: string[] | undefined;
    let validationMessages: string[] | undefined;
    try {
      const captured = await captureCalendlyValidationErrors(page);
      if (captured.missingFields.length > 0 || captured.validationMessages.length > 0) {
        missingFields = captured.missingFields;
        validationMessages = captured.validationMessages;
        if (missingFields?.length)
          message += ` Missing/invalid fields: ${missingFields.join(', ')}.`;
        if (validationMessages?.length)
          message += ` Calendly: ${validationMessages.slice(0, 2).join('; ')}.`;
      }
    } catch (_) {
      /* ignore capture errors */
    }
    const videoPath = await cleanup('failure');
    return {
      success: false,
      error: message,
      ...(missingFields?.length ? { missingFields } : {}),
      ...(validationMessages?.length ? { validationMessages } : {}),
      ...(videoPath ? { videoPath } : {}),
    };
  } finally {
    if (succeeded) await cleanup('success');
  }
}
