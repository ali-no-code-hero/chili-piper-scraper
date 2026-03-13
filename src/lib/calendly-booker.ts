import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { Page, Request, Response } from 'playwright';
import type { Locator } from 'playwright';
import { browserPool } from './browser-pool';
import { getCentralOffsetForDate } from './central-timezone';
import {
  solveRecaptchaV3Enterprise,
  type CapSolverProxyOptions,
} from './capsolver';

const CALENDLY_VIDEO_DIR = process.env.CALENDLY_VIDEO_DIR || path.join(process.cwd(), '.calendly-videos');
const CALENDLY_VIDEO_ENABLED = process.env.CALENDLY_VIDEO_ENABLED !== '0' && process.env.CALENDLY_VIDEO_ENABLED !== 'false';

const CALENDLY_BASE_URL_DEFAULT = 'https://calendly.com/agentfire-demo/30-minute-demo';
const CALENDLY_PAYPERCLOSE_BASE_URL = 'https://calendly.com/pay-per-closing/exclusive-referral-program-agent-advice';

function getCalendlyBaseUrl(): string {
  return process.env.CALENDLY_BASE_URL || CALENDLY_BASE_URL_DEFAULT;
}

function isSimpleFormMode(): boolean {
  const explicit = process.env.CALENDLY_SIMPLE_FORM;
  if (explicit === '1' || explicit === 'true') return true;
  if (explicit === '0' || explicit === 'false') return false;
  const base = getCalendlyBaseUrl();
  return base.includes('exclusive-referral-program-agent-advice');
}

function getConfirmationUrlRegex(): RegExp | null {
  const raw = process.env.CALENDLY_CONFIRMATION_URL_REGEX;
  if (!raw || raw.trim() === '') return null;
  try {
    return new RegExp(raw.trim());
  } catch {
    return null;
  }
}

/** Realistic Chrome UA to reduce bot detection (Calendly context only). */
const CALENDLY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Small random delay (ms) for more human-like behavior. */
function humanDelay(baseMs: number, jitterMs: number = 80): Promise<void> {
  const ms = Math.max(0, baseMs + (Math.random() * 2 - 1) * jitterMs);
  return new Promise((r) => setTimeout(r, ms));
}

/** Simulate human-like mouse movement and optional scroll to reduce bot detection. */
async function simulateHumanMovement(page: Page): Promise<void> {
  const vw = page.viewportSize()?.width ?? 1280;
  const vh = page.viewportSize()?.height ?? 720;
  const steps = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < steps; i++) {
    const x = Math.max(50, Math.min(vw - 50, 200 + Math.random() * (vw - 400)));
    const y = Math.max(50, Math.min(vh - 50, 150 + Math.random() * (vh - 300)));
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 8) });
    await humanDelay(80, 60);
  }
  const scrollAmount = Math.floor((Math.random() * 2 - 0.5) * 60);
  if (scrollAmount !== 0) {
    await page.mouse.wheel(0, scrollAmount);
    await humanDelay(100, 50);
  }
}

/** Focus field, clear it, and type text with variable per-key delay (more human-like). */
async function typeLikeHuman(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await humanDelay(150, 80);
  await locator.click();
  await humanDelay(120, 80);
  await locator.clear();
  await humanDelay(500, 200); // pause so empty field is visible in recording
  const baseDelay = 60 + Math.floor(Math.random() * 80);
  await page.keyboard.type(text, { delay: baseDelay });
  await humanDelay(80, 40);
}

/** Find name field(s) in main frame or any iframe (Calendly often embeds form in iframe). */
async function findNameFieldInPageOrFrames(page: Page): Promise<
  | { type: 'single'; locator: Locator }
  | { type: 'split'; first: Locator; last: Locator }
  | null
> {
  const tryInFrame = async (ctx: { locator(selector: string): Locator }): Promise<
    { type: 'single'; locator: Locator } | { type: 'split'; first: Locator; last: Locator } | null
  > => {
    // Calendly pay-per-close uses full_name (id=full_name_input); other flows use name or first_name/last_name
    const fullNameInput = ctx.locator('input[name="full_name"], #full_name_input').first();
    if ((await fullNameInput.count()) > 0) return { type: 'single', locator: fullNameInput };
    const nameOne = ctx.locator('input[name="name"]').first();
    if ((await nameOne.count()) > 0) return { type: 'single', locator: nameOne };
    const first = ctx.locator('input[name="first_name"]').first();
    const last = ctx.locator('input[name="last_name"]').first();
    if ((await first.count()) > 0 && (await last.count()) > 0) return { type: 'split', first, last };
    return null;
  };
  const fromMain = await tryInFrame(page);
  if (fromMain) return fromMain;
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const fromFrame = await tryInFrame(frame);
    if (fromFrame) return fromFrame;
  }
  return null;
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
  /** When set, overrides env: agentfire = full form / AgentFire URL, payperclose = simple form / pay-per-closing URL. */
  calendlyType?: 'agentfire' | 'payperclose';
}

export interface BookCalendlySlotResult {
  success: boolean;
  date?: string;
  time?: string;
  error?: string;
  /** Last step reached before failure (for debugging). */
  failedAfterStep?: string;
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
  const isExtensionUrl = (url: string) => url.startsWith('chrome-extension://');
  const onRequest = (request: Request) => {
    const type = request.resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    const url = request.url();
    if (isExtensionUrl(url)) return;
    console.log(`${NETWORK_LOG_PREFIX} REQ ${request.method()} ${url}`);
  };
  const onResponse = (response: Response) => {
    const type = response.request().resourceType();
    if (type !== 'xhr' && type !== 'fetch') return;
    const url = response.url();
    if (isExtensionUrl(url)) return;
    const status = response.status();
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

/** Simple form: only name (full), email, a1 (phone). */
function buildSimplePrefillParams(opts: BookCalendlySlotOptions): string {
  const params = new URLSearchParams();
  params.set('name', `${opts.firstName} ${opts.lastName}`.trim());
  params.set('email', opts.email);
  if (opts.phone != null && opts.phone !== '') {
    params.set('a1', opts.phone);
  }
  return params.toString();
}

/** Build direct Calendly URL to the booking form for a given date/time (skips calendar and time picker). Includes prefill params. */
function buildDirectCalendlyUrl(
  date: string,
  normalizedTime: string,
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>,
  baseUrl: string,
  simpleForm: boolean
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
  const tzOffset = getCentralOffsetForDate(date);
  const isoDateTime = `${date}T${hourStr}:${minStr}:00${tzOffset}`;
  const month = date.slice(0, 7);
  const baseQuery = `month=${month}&date=${date}`;
  const prefill = simpleForm ? buildSimplePrefillParams(opts) : buildCalendlyPrefillParams(opts, normalizedAnswers);
  return `${baseUrl}/${isoDateTime}?${baseQuery}&${prefill}`;
}

/** Optional proxy for the booking context (e.g. Smartproxy for housejet-ppc IP rotation). */
export interface CreateBookingPageProxyOptions {
  server: string;
  username?: string;
  password?: string;
}

/** Log server's outbound IP (no proxy) via Node fetch – so we can compare with proxy IP later. */
async function logServerOutboundIp(): Promise<void> {
  try {
    const res = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) });
    const ip = (await res.text()).trim() || '(empty)';
    console.log(`${LOG_PREFIX} Server outbound IP (no proxy): ${ip}`);
  } catch (e) {
    console.warn(`${LOG_PREFIX} Could not get server IP (api.ipify.org):`, (e as Error)?.message ?? e);
  }
}

/** Check TCP reachability of proxy server and log result (for debugging connection failures). */
function logProxyReachability(server: string): void {
  let host: string;
  let port: number;
  try {
    const u = new URL(server.startsWith('http://') || server.startsWith('https://') ? server : `http://${server}`);
    host = u.hostname;
    port = parseInt(u.port, 10) || 3120;
  } catch {
    return;
  }
  const socket = new net.Socket();
  const timeoutMs = 5000;
  const timeout = setTimeout(() => {
    socket.destroy();
    console.warn(`${LOG_PREFIX} Proxy reachability: timeout after ${timeoutMs}ms connecting to ${host}:${port}`);
  }, timeoutMs);
  socket.once('connect', () => {
    clearTimeout(timeout);
    socket.destroy();
    console.log(`${LOG_PREFIX} Proxy reachability: TCP connect OK to ${host}:${port}`);
  });
  socket.once('error', (err: NodeJS.ErrnoException) => {
    clearTimeout(timeout);
    console.warn(`${LOG_PREFIX} Proxy reachability: ${err.code || err.message} connecting to ${host}:${port}`);
  });
  socket.connect(port, host);
}

/** Options for createNewBookingPage (e.g. proxy for housejet-ppc). */
export interface CreateNewBookingPageOptions {
  proxy?: CreateBookingPageProxyOptions;
}

/**
 * Create a new browser session for a single Calendly booking. Caller must call cleanup(outcome) when done.
 * When outcome is 'failure', cleanup saves the recorded video and returns its path.
 * When options.proxy is set, the context uses that proxy (e.g. Smartproxy for housejet-ppc).
 */
async function createNewBookingPage(
  calendlyUrl: string,
  options?: CreateNewBookingPageOptions
): Promise<{
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

  console.log(`${LOG_PREFIX} [create] Acquiring browser and context lock...`);
  browser = await browserPool.getBrowser();
  releaseLock = await browserPool.acquireContextLock(browser);
  console.log(`${LOG_PREFIX} [create] Creating new context and page...`);

  const contextOptions: {
    timezoneId: string;
    locale: string;
    userAgent: string;
    viewport: { width: number; height: number };
    recordVideo?: { dir: string; size: { width: number; height: number } };
    proxy?: { server: string; username?: string; password?: string };
  } = {
    timezoneId: 'America/Chicago',
    locale: 'en-US',
    userAgent: CALENDLY_USER_AGENT,
    viewport: { width: 1280, height: 720 },
  };
  if (videoDir) contextOptions.recordVideo = { dir: videoDir, size: { width: 1280, height: 720 } };
  if (options?.proxy?.server) {
    contextOptions.proxy = {
      server: options.proxy.server,
      username: options.proxy.username,
      password: options.proxy.password,
    };
    console.log(`${LOG_PREFIX} [create] Using proxy for this context: ${options.proxy.server}`);
    await logServerOutboundIp();
    logProxyReachability(options.proxy.server);
  }

  let retries = 3;
  while (retries > 0) {
    try {
      if (typeof browser.isConnected === 'function' && !browser.isConnected()) {
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
  console.log(`${LOG_PREFIX} [create] Context and page ready`);

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

  if (options?.proxy?.server) {
    try {
      await page.goto('https://api.ipify.org', { waitUntil: 'domcontentloaded', timeout: 8000 });
      const outboundIp = (await page.textContent('body'))?.trim() || '(empty)';
      console.log(`${LOG_PREFIX} Proxy context outbound IP: ${outboundIp}`);
    } catch (ipErr) {
      console.warn(`${LOG_PREFIX} Could not confirm proxy IP (api.ipify.org):`, (ipErr as Error)?.message ?? ipErr);
    }
  }

  console.log(`${LOG_PREFIX} Navigating to ${calendlyUrl}`);
  try {
    await page.goto(calendlyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (navError: unknown) {
    const msg = navError instanceof Error ? navError.message : String(navError);
    const isProxyFailure = /ERR_PROXY|proxy.*(fail|connection|refused)/i.test(msg);
    if (options?.proxy?.server && isProxyFailure) {
      // Log full proxy error for debugging (Smartproxy auth/connect issues)
      const err = navError instanceof Error ? navError : new Error(String(navError));
      const errDetail: Record<string, unknown> = {
        message: err.message,
        name: err.name,
      };
      if (err.stack) errDetail.stack = err.stack;
      const cause = 'cause' in err ? (err as Error & { cause?: unknown }).cause : undefined;
      if (cause !== undefined) errDetail.cause = cause instanceof Error ? { message: cause.message, stack: cause.stack } : cause;
      console.warn(
        `${LOG_PREFIX} Proxy connection failed. Server: ${options.proxy.server} (user: ${options.proxy.username ? 'set' : 'not set'}).`,
        'Full error:',
        JSON.stringify(errDetail, null, 2)
      );
      console.warn(`${LOG_PREFIX} Retrying without proxy...`);
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      const noProxyOptions = { ...contextOptions };
      delete (noProxyOptions as { proxy?: unknown }).proxy;
      context = await browser.newContext(noProxyOptions);
      page = await context.newPage();
      page.setDefaultNavigationTimeout(15000);
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
      await page.goto(calendlyUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    } else {
      throw navError;
    }
  }
  const finalUrl = page.url();
  console.log(`${LOG_PREFIX} Page loaded: ${finalUrl}`);
  // Brief wait for OneTrust/cookie banner to inject (especially when loading via proxy).
  await new Promise((r) => setTimeout(r, 2500));

  let cleaned = false;
  const cleanup = async (outcome: 'success' | 'failure'): Promise<string | null> => {
    if (cleaned) return null;
    cleaned = true;
    let savedVideoPath: string | null = null;
    try {
      const videoPromise = page?.video?.() ?? context?.video?.() ?? null;
      if (page && !page.isClosed()) await page.close().catch(() => {});
      // Use saveAs() so Playwright flushes and finalizes the video before we close the context (avoids blank/incomplete video).
      if (outcome === 'failure' && videoPromise) {
        try {
          const video = await videoPromise;
          if (video) {
            const failedDir = path.join(CALENDLY_VIDEO_DIR, 'failed');
            fs.mkdirSync(failedDir, { recursive: true });
            const destName = `calendly-${sessionId}.webm`;
            const destPath = path.join(failedDir, destName);
            await video.saveAs(destPath);
            savedVideoPath = destPath;
            console.log(`${LOG_PREFIX} Saved failure video: ${destPath}`);
          }
        } catch (e) {
          console.warn(`${LOG_PREFIX} Could not save video:`, (e as Error)?.message);
        }
      }
      if (context) await context.close().catch(() => {});
      await new Promise((r) => setTimeout(r, 200));
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
  const clickOpts = { timeout: 4000, force: true } as const;
  const BANNER_WAIT_MS = 10000; // longer when loading via proxy

  try {
    // 0. Try OneTrust JS first (main frame) – works even before banner is visible
    const dismissedByJs = await page.evaluate(() => {
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
    if (dismissedByJs) {
      console.log(`${LOG_PREFIX} Dismissing cookie consent (OneTrust JS)`);
      await humanDelay(600);
      return;
    }

    // 1. Wait for banner: OneTrust IDs and any element with onetrust in id (e.g. onetrust-pc-sdk)
    const bannerSelectors = ['#onetrust-banner-sdk', '#onetrust-consent-sdk', '[id*="onetrust"]'];
    let bannerVisible = false;
    for (const sel of bannerSelectors) {
      try {
        await page.waitForSelector(sel, { state: 'visible', timeout: BANNER_WAIT_MS });
        bannerVisible = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!bannerVisible) {
      // 1b. Try consent button by text anywhere on page (banner may use different markup)
      const anyAccept = page.getByRole('button', { name: /I\s*understand|Accept\s*all|Allow\s*all|Accept\s*cookies|Allow\s*cookies/i }).first();
      try {
        await anyAccept.waitFor({ state: 'visible', timeout: 5000 });
        await anyAccept.click(clickOpts);
        console.log(`${LOG_PREFIX} Dismissing cookie consent (button by text)`);
        await humanDelay(400);
        return;
      } catch {
        console.log(`${LOG_PREFIX} No cookie consent banner found`);
        return;
      }
    }
    await humanDelay(500);

    // 2. OneTrust JS again after banner is visible
    const dismissedByJs2 = await page.evaluate(() => {
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
    if (dismissedByJs2) {
      console.log(`${LOG_PREFIX} Dismissing cookie consent (OneTrust JS)`);
      await humanDelay(600);
      return;
    }

    // 3. Calendly: "I understand" = #onetrust-accept-btn-handler
    const acceptBtn = page.locator('#onetrust-accept-btn-handler').first();
    if ((await acceptBtn.count()) > 0) {
      try {
        console.log(`${LOG_PREFIX} Dismissing cookie consent (I understand)`);
        await acceptBtn.click(clickOpts);
        await humanDelay(400);
        return;
      } catch (e) {
        console.log(`${LOG_PREFIX} I understand click failed: ${(e as Error)?.message || ''}`);
      }
    }

    // 4. Close button (X)
    const closeBtn = page.locator('#onetrust-close-btn-container button.onetrust-close-btn-handler, [id*="onetrust"] button.onetrust-close-btn-handler').first();
    if ((await closeBtn.count()) > 0) {
      try {
        console.log(`${LOG_PREFIX} Dismissing cookie consent (close button)`);
        await closeBtn.click(clickOpts);
        await humanDelay(400);
        return;
      } catch {
        /* try next */
      }
    }

    // 5. Allow All / accept-recommended
    const acceptRecommended = page.locator('#accept-recommended-btn-handler').first();
    if ((await acceptRecommended.count()) > 0) {
      try {
        await acceptRecommended.click(clickOpts);
        console.log(`${LOG_PREFIX} Dismissing cookie consent (Allow All)`);
        await humanDelay(400);
        return;
      } catch {
        /* try next */
      }
    }

    // 6. Button by role inside any onetrust container
    const byRole = page.locator('#onetrust-banner-sdk, #onetrust-consent-sdk, [id*="onetrust"]').getByRole('button', { name: /I\s*understand|Accept\s*all|Allow\s*all/i }).first();
    if ((await byRole.count()) > 0) {
      try {
        await byRole.click(clickOpts);
        console.log(`${LOG_PREFIX} Dismissing cookie consent (button by role)`);
        await humanDelay(400);
        return;
      } catch {
        /* fall through */
      }
    }

    // 7. Try inside iframes (OneTrust sometimes injects banner in iframe)
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const frameAccept = frame.locator('#onetrust-accept-btn-handler, button').filter({ hasText: /I\s*understand|Accept|Allow\s*all/i }).first();
        if ((await frameAccept.count()) > 0) {
          await frameAccept.click(clickOpts);
          console.log(`${LOG_PREFIX} Dismissing cookie consent (iframe button)`);
          await humanDelay(400);
          return;
        }
      } catch {
        /* next frame */
      }
    }

    console.log(`${LOG_PREFIX} No cookie consent button found`);
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

/**
 * Inject reCAPTCHA v3 token: find promise-callback in ___grecaptcha_cfg.clients and call it; set g-recaptcha-response if present.
 * Returns true if callback was called or textarea was set.
 */
async function injectRecaptchaV3TokenInFrame(frame: Page | import('playwright').Frame, token: string): Promise<boolean> {
  return frame.evaluate((gRecaptchaResponse: string) => {
    const cfg = (window as unknown as { ___grecaptcha_cfg?: { clients: Record<string, unknown> } }).___grecaptcha_cfg;
    if (!cfg?.clients || typeof cfg.clients !== 'object') return false;
    let injected = false;
    for (const [, client] of Object.entries(cfg.clients)) {
      const c = client as Record<string, unknown>;
      if (!c?.l || typeof c.l !== 'object') continue;
      const inner = (c.l as Record<string, unknown>).l as Record<string, unknown> | undefined;
      if (!inner || typeof inner !== 'object') continue;
      const callback = inner['promise-callback'] as ((t: string) => void) | undefined;
      if (typeof callback === 'function') {
        try {
          callback(gRecaptchaResponse);
          injected = true;
        } catch {
          /* ignore */
        }
        break;
      }
    }
    const textarea = document.querySelector('textarea[name="g-recaptcha-response"]') as HTMLTextAreaElement | null;
    if (textarea) {
      textarea.value = gRecaptchaResponse;
      injected = true;
    }
    return injected;
  }, token);
}

/**
 * Inject reCAPTCHA v3 token into the page and all frames. Calendly often embeds the form (and reCAPTCHA) in an iframe,
 * so the promise-callback may live in a child frame. We inject in every frame so the token is accepted before submit.
 * After injection, waits briefly so the page can process the callback before we click Schedule Event.
 */
async function injectRecaptchaV3TokenInAllFrames(page: Page, token: string): Promise<void> {
  const frames = [page, ...page.frames()];
  let anyInjected = false;
  for (const frame of frames) {
    try {
      const injected = await injectRecaptchaV3TokenInFrame(frame, token);
      if (injected) anyInjected = true;
    } catch {
      // Cross-origin or detached frame; skip
    }
  }
  if (anyInjected) {
    await humanDelay(600);
  }
}

/**
 * If CapSolver is configured, solve reCAPTCHA v3 Enterprise and inject token (and optional cookies) into the page.
 * Uses same proxy as booking context when calendlyType === 'payperclose' and HOUSEJET_PPC_PROXY_* are set.
 */
async function ensureRecaptchaTokenAndInject(page: Page, opts: BookCalendlySlotOptions, pageUrl: string): Promise<void> {
  const apiKey = process.env.CAPSOLVER_API_KEY?.trim();
  const websiteKey = process.env.CALENDLY_RECAPTCHA_WEBSITE_KEY?.trim();
  if (!apiKey) return;
  if (!websiteKey) {
    console.warn(`${LOG_PREFIX} CAPSOLVER_API_KEY set but CALENDLY_RECAPTCHA_WEBSITE_KEY missing; skipping reCAPTCHA solve`);
    return;
  }

  try {
    let proxy: CapSolverProxyOptions | undefined;
    if (opts.calendlyType === 'payperclose') {
      const server = process.env.HOUSEJET_PPC_PROXY_SERVER?.trim();
      if (server) {
        proxy = {
          server,
          username: process.env.HOUSEJET_PPC_PROXY_USERNAME?.trim() || undefined,
          password: process.env.HOUSEJET_PPC_PROXY_PASSWORD?.trim() || undefined,
        };
      }
    }

    console.log(`${LOG_PREFIX} Solving reCAPTCHA v3 Enterprise via CapSolver...`);
    const result = await solveRecaptchaV3Enterprise({
      websiteURL: pageUrl,
      websiteKey,
      proxy,
      pageAction: process.env.CALENDLY_RECAPTCHA_PAGE_ACTION?.trim() || undefined,
      enterprisePayload: process.env.CALENDLY_RECAPTCHA_ENTERPRISE_S
        ? { s: process.env.CALENDLY_RECAPTCHA_ENTERPRISE_S }
        : undefined,
      apiDomain: process.env.CALENDLY_RECAPTCHA_API_DOMAIN?.trim() || undefined,
    });

    await injectRecaptchaV3TokenInAllFrames(page, result.gRecaptchaResponse);

    if (result.recaptchaCaT ?? result.recaptchaCaE) {
      const u = new URL(pageUrl);
      const cookies: { name: string; value: string; domain: string; path: string }[] = [];
      if (result.recaptchaCaT) cookies.push({ name: 'recaptcha-ca-t', value: result.recaptchaCaT, domain: u.hostname, path: '/' });
      if (result.recaptchaCaE) cookies.push({ name: 'recaptcha-ca-e', value: result.recaptchaCaE, domain: u.hostname, path: '/' });
      if (cookies.length) await page.context().addCookies(cookies);
    }

    console.log(`${LOG_PREFIX} reCAPTCHA token injected`);
  } catch (e) {
    console.warn(`${LOG_PREFIX} CapSolver/inject failed (continuing without token):`, (e as Error)?.message ?? e);
  }
}

async function fillFormAndSubmit(
  page: Page,
  opts: BookCalendlySlotOptions,
  normalizedAnswers: Record<string, string | string[]>,
  simpleForm: boolean,
  confirmationRegex: RegExp | null
): Promise<void> {
  // Wait for either full form (first_name) or simple form (name)
  console.log(`${LOG_PREFIX} [form] Waiting for questionnaire form...`);
  await page.waitForSelector('input[name="first_name"], input[name="name"]', { timeout: 10000 });

  if (simpleForm) {
    await fillSimpleFormAndSubmit(page, opts, confirmationRegex);
    return;
  }

  console.log(`${LOG_PREFIX} [form] Form visible; filling radio/checkbox/combobox only (text fields prefilled via URL)`);
  await humanDelay(300);

  const logFill = (field: string, value: string | string[], ok: boolean, detail?: string) => {
    const v = Array.isArray(value) ? value.join(', ') : value;
    const status = ok ? 'filled' : 'MISSING';
    console.log(`${LOG_PREFIX} Form field ${field}: ${status} ${detail || ''} value="${(v || '').slice(0, 50)}${(v && v.length > 50 ? '...' : '')}"`);
  };

  // first_name, last_name, email, question_0 (phone), question_1, question_4, question_6, question_7 are prefilled via URL – do not fill again (avoids detached DOM).
  const urlPrefilledFields = new Set(['question_0', 'question_1', 'question_4', 'question_6', 'question_7']);

  // Use locators and force: true so clicks succeed even if a Calendly overlay is still present (e.g. T2M0sxxflxZJtbSit_lZ).
  const formClickOpts = { force: true, timeout: 15000 } as const;
  for (const [fieldName, value] of Object.entries(normalizedAnswers)) {
    if (urlPrefilledFields.has(fieldName)) {
      logFill(fieldName, value, true, '(prefilled via URL, skipped)');
      continue;
    }
    const raw = value;
    const isArray = Array.isArray(raw);
    const values = isArray ? (raw as string[]) : [raw as string];

    if (fieldName === 'question_2') {
      console.log(`${LOG_PREFIX} [form] Filling question_2 (value=${values[0]})...`);
      const radioLoc = page.locator(`input[name="question_2"][type="radio"][value="${values[0]}"]`).first();
      const byTestIdLoc = page.locator(`[data-testid="${values[0]}"]`).first();
      const firstRadioLoc = page.locator('input[name="question_2"][type="radio"]').first();
      if ((await radioLoc.count()) > 0) {
        await radioLoc.click(formClickOpts);
        logFill(fieldName, values[0] || '', true, '(radio clicked)');
      } else if ((await byTestIdLoc.count()) > 0) {
        await byTestIdLoc.click(formClickOpts);
        logFill(fieldName, values[0] || '', true, '(by testid)');
      } else if ((await firstRadioLoc.count()) > 0) {
        await firstRadioLoc.click(formClickOpts);
        logFill(fieldName, values[0] || '', true, '(first radio selected)');
      } else {
        logFill(fieldName, values[0] || '', false, '(no radios found)');
      }
      continue;
    }
    if (fieldName === 'question_3') {
      console.log(`${LOG_PREFIX} [form] Filling question_3 (values=${JSON.stringify(values)})...`);
      await page.waitForTimeout(250);
      let anyFilled = false;
      const clickOpt = formClickOpts;
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
      console.log(`${LOG_PREFIX} [form] Filling question_5 (value=${values[0]})...`);
      const radioLoc = page.locator(`input[name="question_5"][type="radio"][value="${values[0]}"]`).first();
      const byTestIdLoc = page.locator(`[data-testid="${values[0]}"]`).first();
      const firstRadioLoc = page.locator('input[name="question_5"][type="radio"]').first();
      if ((await radioLoc.count()) > 0) {
        await radioLoc.click(formClickOpts);
        logFill(fieldName, values[0] || '', true, '(radio clicked)');
      } else if ((await byTestIdLoc.count()) > 0) {
        await byTestIdLoc.click(formClickOpts);
        logFill(fieldName, values[0] || '', true, '(by testid)');
      } else if ((await firstRadioLoc.count()) > 0) {
        await firstRadioLoc.click(formClickOpts);
        logFill(fieldName, values[0] || '', true, '(first radio selected)');
      } else {
        logFill(fieldName, values[0] || '', false, '(no radios found)');
      }
      continue;
    }
    if (fieldName === 'question_8') {
      console.log(`${LOG_PREFIX} [form] Filling question_8...`);
      const checkboxLoc = page.locator('input[name="question_8"][type="checkbox"]').first();
      if ((await checkboxLoc.count()) > 0) {
        if (!(await checkboxLoc.isChecked())) await checkboxLoc.click(formClickOpts);
        logFill(fieldName, values, true, '(checkbox)');
      } else {
        logFill(fieldName, values, false, '(checkbox not found)');
      }
      continue;
    }
    if (fieldName === 'question_9') {
      console.log(`${LOG_PREFIX} [form] Filling question_9 (value=${values[0]})...`);
      const comboboxLoc = page.locator('[name="question_9"][role="combobox"]').first();
      if ((await comboboxLoc.count()) > 0) {
        await comboboxLoc.click(formClickOpts);
        await humanDelay(300);
        const optsLoc = page.locator('[role="option"]');
        const count = await optsLoc.count();
        if (count > 0) {
          await optsLoc.first().click(formClickOpts);
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

  console.log(`${LOG_PREFIX} [form] Form fill complete; looking for Schedule Event button`);
  const submitLoc = page.locator('button[type="submit"]').filter({ hasText: 'Schedule Event' }).first();
  if ((await submitLoc.count()) === 0) {
    throw new Error('Schedule Event button not found');
  }

  await ensureRecaptchaTokenAndInject(page, opts, page.url());
  await humanDelay(400); // Brief pause before submit (more human-like)
  const stopNetworkLogging = startScheduleEventNetworkLogging(page);
  console.log(`${LOG_PREFIX} [form] Clicking Schedule Event...`);
  await submitLoc.click(formClickOpts);
  await clickRecaptchaContinuePopupIfPresent(page, 5000);
  console.log(`${LOG_PREFIX} [form] Schedule Event clicked; waiting for confirmation...`);
  await waitForConfirmation(page, confirmationRegex, false);
  console.log(`${LOG_PREFIX} Reached confirmation; booking complete`);
  stopNetworkLogging();
}

/** Simple form: only name, email, phone. Human-like movement and name entry; fills and submits. */
async function fillSimpleFormAndSubmit(
  page: Page,
  opts: BookCalendlySlotOptions,
  confirmationRegex: RegExp | null
): Promise<void> {
  const formClickOpts = { force: true, timeout: 15000 } as const;
  const fullName = `${opts.firstName} ${opts.lastName}`.trim();

  await simulateHumanMovement(page);
  await humanDelay(300);

  // Name: wipe and re-enter with human-like typing (full_name, name, or first_name + last_name)
  const fullNameInput = page.locator('input[name="full_name"], #full_name_input').first();
  const nameInput = page.locator('input[name="name"]').first();
  if ((await fullNameInput.count()) > 0) {
    await typeLikeHuman(page, fullNameInput, fullName);
    console.log(`${LOG_PREFIX} [form] Filled full_name (human-like)`);
  } else if ((await nameInput.count()) > 0) {
    await typeLikeHuman(page, nameInput, fullName);
    console.log(`${LOG_PREFIX} [form] Filled name (single field, human-like)`);
  } else {
    const firstNameLoc = page.locator('input[name="first_name"]').first();
    const lastNameLoc = page.locator('input[name="last_name"]').first();
    if ((await firstNameLoc.count()) > 0) await typeLikeHuman(page, firstNameLoc, opts.firstName);
    if ((await lastNameLoc.count()) > 0) await typeLikeHuman(page, lastNameLoc, opts.lastName);
    console.log(`${LOG_PREFIX} [form] Filled first_name, last_name (human-like)`);
  }

  const emailLoc = page.locator('input[name="email"]').first();
  if ((await emailLoc.count()) > 0) await emailLoc.fill(opts.email);

  // Phone: often question_0 or a1; try common selectors
  const phoneValue = opts.phone ?? '';
  if (phoneValue) {
    const phoneLoc = page.locator('input[name="question_0"], input[name="a1"], input[type="tel"]').first();
    if ((await phoneLoc.count()) > 0) await phoneLoc.fill(phoneValue);
  }

  await humanDelay(400);
  const submitLoc = page.locator('button[type="submit"]').filter({ hasText: 'Schedule Event' }).first();
  if ((await submitLoc.count()) === 0) {
    throw new Error('Schedule Event button not found');
  }
  await ensureRecaptchaTokenAndInject(page, opts, page.url());
  const box = await submitLoc.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await humanDelay(200, 100);
  }
  const stopNetworkLogging = startScheduleEventNetworkLogging(page);
  await submitLoc.click(formClickOpts);
  await clickRecaptchaContinuePopupIfPresent(page, 5000);
  console.log(`${LOG_PREFIX} [form] Schedule Event clicked; waiting for confirmation...`);
  await waitForConfirmation(page, confirmationRegex, true);
  console.log(`${LOG_PREFIX} Reached confirmation; booking complete`);
  stopNetworkLogging();
}

/** Pay-per-close: form is pre-filled via URL; simulate human behavior, wipe/re-enter name, then click Schedule Event. */
async function clickScheduleEventOnlyAndWait(
  page: Page,
  confirmationRegex: RegExp,
  opts: BookCalendlySlotOptions
): Promise<void> {
  const formClickOpts = { force: true, timeout: 15000 } as const;
  console.log(`${LOG_PREFIX} [payperclose] Form pre-filled via URL; waiting for form...`);
  await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
  await humanDelay(400);

  await simulateHumanMovement(page);
  await humanDelay(300);

  const fullName = `${opts.firstName} ${opts.lastName}`.trim();
  const nameField = await findNameFieldInPageOrFrames(page);
  if (nameField) {
    console.log(`${LOG_PREFIX} [payperclose] Wiping and re-entering name (human-like)...`);
    if (nameField.type === 'single') {
      await typeLikeHuman(page, nameField.locator, fullName);
    } else {
      await typeLikeHuman(page, nameField.first, opts.firstName);
      await typeLikeHuman(page, nameField.last, opts.lastName);
    }
  } else {
    console.log(`${LOG_PREFIX} [payperclose] No name field found in page or iframes; skipping wipe/re-enter`);
  }
  await humanDelay(400);

  const submitLoc = page.locator('button[type="submit"]').filter({ hasText: 'Schedule Event' }).first();
  if ((await submitLoc.count()) === 0) {
    throw new Error('Schedule Event button not found');
  }
  await ensureRecaptchaTokenAndInject(page, opts, page.url());
  const box = await submitLoc.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await humanDelay(200, 100);
  }
  const stopNetworkLogging = startScheduleEventNetworkLogging(page);
  console.log(`${LOG_PREFIX} [payperclose] Clicking Schedule Event...`);
  await submitLoc.click(formClickOpts);
  await clickRecaptchaContinuePopupIfPresent(page, 5000);
  console.log(`${LOG_PREFIX} [payperclose] Schedule Event clicked; waiting for redirect to confirmation URL...`);
  await page.waitForURL(confirmationRegex, { timeout: 25000 });
  console.log(`${LOG_PREFIX} [payperclose] Confirmation URL reached`);
  stopNetworkLogging();
}

/**
 * If a reCAPTCHA popup with a "Continue" or "Verify" button appears after Schedule Event (v3 no-checkbox style),
 * click it so the flow can proceed. Tries main page and all frames. Returns true if a button was clicked.
 */
async function clickRecaptchaContinuePopupIfPresent(page: Page, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  const buttonTexts = [/^\s*continue\s*$/i, /^\s*verify\s*$/i, /^\s*submit\s*$/i];
  const frames = [page, ...page.frames()];

  while (Date.now() < deadline) {
    for (const frame of frames) {
      try {
        for (const textRe of buttonTexts) {
          const btn = frame.locator('button, input[type="submit"], [role="button"]').filter({ hasText: textRe }).first();
          if ((await btn.count()) > 0) {
            const visible = await btn.isVisible().catch(() => false);
            if (visible) {
              const tag = await btn.evaluate((el) => el.tagName);
              const isScheduleEvent =
                tag === 'BUTTON' && (await btn.textContent())?.toLowerCase().includes('schedule event');
              if (isScheduleEvent) continue;
              await btn.click({ force: true, timeout: 3000 });
              console.log(`${LOG_PREFIX} [recaptcha] Clicked Continue/Verify in popup`);
              await humanDelay(500);
              return true;
            }
          }
        }
      } catch {
        /* cross-origin or detached frame */
      }
    }
    await humanDelay(300);
  }
  return false;
}

/** Wait for booking confirmation: URL regex, or (in simple mode) body text "scheduled"/"confirmed". */
async function waitForConfirmation(
  page: Page,
  confirmationRegex: RegExp | null,
  simpleFormFallback: boolean
): Promise<void> {
  const confirmationTimeout = 25000;

  if (confirmationRegex) {
    await page.waitForURL(confirmationRegex, { timeout: confirmationTimeout });
    console.log(`${LOG_PREFIX} [form] Confirmation URL reached (regex)`);
    return;
  }

  if (simpleFormFallback) {
    // Wait for success text on page (Calendly often shows "You're scheduled" or similar)
    try {
      await page.waitForFunction(
        () => {
          const body = document.body?.innerText?.slice(0, 2000) || '';
          return /you'?re scheduled|you are scheduled|scheduled!|confirmed|booking confirmed/i.test(body);
        },
        { timeout: confirmationTimeout }
      );
      console.log(`${LOG_PREFIX} [form] Confirmation text found on page`);
      return;
    } catch {
      // Fall through to generic error with hint
    }
  } else {
    try {
      await page.waitForURL(/agentfire\.com\/thanks-for-booking/, { timeout: confirmationTimeout });
      console.log(`${LOG_PREFIX} [form] Confirmation URL reached (agentfire)`);
      return;
    } catch {
      // Fall through to generic error with hint
    }
  }

  const stillOnForm = await page.$('input[name="first_name"], input[name="name"]').then((el) => !!el);
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
    `Did not reach the booking confirmation page. The booking may have failed.${hint}`
  );
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
 * When opts.calendlyType is set, uses that event (agentfire vs payperclose); otherwise uses CALENDLY_BASE_URL and CALENDLY_SIMPLE_FORM env.
 */
export async function bookCalendlySlot(opts: BookCalendlySlotOptions): Promise<BookCalendlySlotResult> {
  let baseUrl: string;
  let simpleForm: boolean;
  if (opts.calendlyType === 'payperclose') {
    baseUrl = process.env.CALENDLY_REFERRAL_BASE_URL || CALENDLY_PAYPERCLOSE_BASE_URL;
    simpleForm = true;
  } else if (opts.calendlyType === 'agentfire') {
    baseUrl = getCalendlyBaseUrl();
    simpleForm = false;
  } else {
    baseUrl = getCalendlyBaseUrl();
    simpleForm = isSimpleFormMode();
  }
  const confirmationRegex = getConfirmationUrlRegex();
  /** Pay-per-close redirects to referralchime.com; use that as default if env not set. */
  const effectiveConfirmationRegex =
    confirmationRegex ||
    (opts.calendlyType === 'payperclose' ? /referralchime\.com/ : null);

  const normalizedTime = normalizeTimeForCalendly(opts.time);
  const normalizedAnswers = buildMergedAnswers(opts);
  const directUrl = buildDirectCalendlyUrl(opts.date, normalizedTime, opts, normalizedAnswers, baseUrl, simpleForm);

  console.log(`${LOG_PREFIX} Starting booking: date=${opts.date} time=${opts.time} (normalized: ${normalizedTime}) email=${opts.email} simpleForm=${simpleForm}`);
  console.log(`${LOG_PREFIX} Using direct form URL (skip calendar/time picker)`);

  // Optional rotating proxy for housejet-ppc (e.g. Smartproxy) – only this booking context uses it
  let createPageOptions: CreateNewBookingPageOptions | undefined;
  if (opts.calendlyType === 'payperclose') {
    const proxyServer = process.env.HOUSEJET_PPC_PROXY_SERVER?.trim();
    if (proxyServer) {
      createPageOptions = {
        proxy: {
          server: proxyServer,
          username: process.env.HOUSEJET_PPC_PROXY_USERNAME?.trim() || undefined,
          password: process.env.HOUSEJET_PPC_PROXY_PASSWORD?.trim() || undefined,
        },
      };
    }
  }

  const { page, cleanup } = await createNewBookingPage(directUrl, createPageOptions);
  let succeeded = false;
  let currentStep = 'create_page';
  try {
    currentStep = 'cookie_dismiss';
    console.log(`${LOG_PREFIX} [step=${currentStep}] Dismissing cookie consent...`);
    await dismissCookieConsent(page);
    console.log(`${LOG_PREFIX} [step=${currentStep}] Cookie consent done`);

    currentStep = 'wait_banner_hidden';
    console.log(`${LOG_PREFIX} [step=${currentStep}] Waiting for banner hidden...`);
    try {
      await page.waitForSelector('#onetrust-banner-sdk', { state: 'hidden', timeout: 5000 });
      console.log(`${LOG_PREFIX} [step=${currentStep}] Banner hidden`);
    } catch {
      console.log(`${LOG_PREFIX} [step=${currentStep}] Banner wait skipped (different id or already gone)`);
    }
    await humanDelay(600);

    currentStep = 'fill_form';
    console.log(`${LOG_PREFIX} [step=${currentStep}] Starting form fill and submit...`);
    if (opts.calendlyType === 'payperclose' && effectiveConfirmationRegex) {
      /** Pay-per-close: form pre-filled via URL; human simulation, wipe/re-enter name, then click Schedule Event. */
      await clickScheduleEventOnlyAndWait(page, effectiveConfirmationRegex, opts);
    } else {
      await fillFormAndSubmit(page, opts, normalizedAnswers, simpleForm, effectiveConfirmationRegex);
    }

    console.log(`${LOG_PREFIX} Booking success: ${opts.date} ${opts.time}`);
    succeeded = true;
    return {
      success: true,
      date: opts.date,
      time: opts.time,
    };
  } catch (error: any) {
    let message = error?.message || String(error);
    console.error(`Calendly booking error (failed after step=${currentStep}):`, message);
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
    console.log(`${LOG_PREFIX} [failure] Capturing validation errors and saving video (failedAfterStep=${currentStep})...`);
    const videoPath = await cleanup('failure');
    return {
      success: false,
      error: message,
      failedAfterStep: currentStep,
      ...(missingFields?.length ? { missingFields } : {}),
      ...(validationMessages?.length ? { validationMessages } : {}),
      ...(videoPath ? { videoPath } : {}),
    };
  } finally {
    if (succeeded) await cleanup('success');
  }
}
