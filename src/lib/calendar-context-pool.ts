import { Browser, BrowserContext, Page } from 'playwright';
import { browserPool } from './browser-pool';

class CalendarContextPool {
  private context: BrowserContext | null = null;
  private ready: boolean = false;
  private baseUrl: string;
  private warming: boolean = false;
  private lastCalendarUrl: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async warmUpOnce(firstName: string, lastName: string, email: string, phone: string): Promise<void> {
    if (this.ready || this.warming) return;
    this.warming = true;
    try {
      const browser = await browserPool.getBrowser();
      this.context = await browser.newContext({
        javaScriptEnabled: true,
        timezoneId: 'America/Chicago', // US Central Time (handles DST automatically)
      });
      if (!this.context) {
        throw new Error('Failed to create browser context');
      }
      const page = await this.context.newPage();
      // Block heavy resources
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const rt = route.request().resourceType();
        if (rt === 'image' || rt === 'stylesheet' || rt === 'font' || rt === 'media' ||
            url.includes('analytics') || url.includes('googletagmanager') || url.includes('facebook.net') || url.includes('doubleclick')) {
          return route.abort();
        }
        return route.continue();
      });

      await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Try to get past the form quickly with generic details
      const quickFill = async (sel: string, val: string) => {
        try { await page.fill(sel, val); return true; } catch {}
        try { await page.type(sel, val, { delay: 10 }); return true; } catch {}
        return false;
      };

      // Common selectors
      const first = [
        '[data-test-id="GuestFormField-PersonFirstName"]',
        'input[aria-label*="first" i]'
      ];
      const last = [
        '[data-test-id="GuestFormField-PersonLastName"]',
        'input[aria-label*="last" i]'
      ];
      const em = [
        '[data-test-id="GuestFormField-PersonEmail"]',
        'input[type="email"]'
      ];
      const ph = [
        '[data-test-id="PhoneField-input"]',
        'input[type="tel"]'
      ];

      for (const s of first) { if (await quickFill(s, firstName)) break; }
      for (const s of last) { if (await quickFill(s, lastName)) break; }
      for (const s of em) { if (await quickFill(s, email)) break; }
      for (const s of ph) { if (await quickFill(s, phone)) break; }

      const submitCandidates = [
        'button[type="submit"]', 'input[type="submit"]', 'button:has-text("Continue")', 'button:has-text("Next")'
      ];
      for (const sel of submitCandidates) {
        try { await page.click(sel, { timeout: 1000 }); break; } catch {}
      }

      // Skip to calendar if an interstitial exists
      const scheduleCandidates = [
        'button:has-text("Schedule a meeting")',
        'button:has-text("Schedule")',
        '[data-test-id*="schedule"]'
      ];
      for (const sel of scheduleCandidates) {
        try { await page.click(sel, { timeout: 1000 }); break; } catch {}
      }

      // Verify calendar presence
      try {
        await page.waitForSelector('[data-id="calendar"], [role="grid"], [data-id="calendar-day-button"]', { timeout: 5000 });
        this.ready = true;
        try { this.lastCalendarUrl = page.url(); } catch {}
      } catch {}

      try { await page.close(); } catch {}
    } catch (e) {
      // ignore warmup errors; will fallback later
    } finally {
      this.warming = false;
    }
  }

  isReady(): boolean { return this.ready && !!this.context; }

  async getCalendarPage(): Promise<Page | null> {
    if (!this.context || !this.ready) return null;
    try {
      const page = await this.context.newPage();
      if (this.lastCalendarUrl) {
        await page.goto(this.lastCalendarUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } else {
        await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      }
      // Ensure calendar visible; if not, caller will fallback
      return page;
    } catch {
      return null;
    }
  }
}

const instances: Map<string, CalendarContextPool> = new Map();

export function getCalendarContextPool(baseUrl: string): CalendarContextPool {
  if (!instances.has(baseUrl)) {
    instances.set(baseUrl, new CalendarContextPool(baseUrl));
  }
  return instances.get(baseUrl)!;
}


