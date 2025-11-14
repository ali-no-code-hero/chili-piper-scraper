import { chromium, Browser, Page } from 'playwright';

class PagePreloader {
  private browser: Browser | null = null;
  private preloadedPage: Page | null = null;
  private baseUrl: string;
  private isPreloading = false;
  private preloadPromise: Promise<Page> | null = null;
  private lastUsed: number = 0;
  private readonly PRELOAD_TIMEOUT = 5 * 60 * 1000; // 5 minutes - preload expires after inactivity

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async getPreloadedPage(): Promise<Page> {
    const now = Date.now();

    // If page exists, is not closed, and is recent enough, reuse it
    if (this.preloadedPage && !this.preloadedPage.isClosed() && (now - this.lastUsed) < this.PRELOAD_TIMEOUT) {
      this.lastUsed = now;
      return this.preloadedPage;
    }

    // If already preloading, wait for that
    if (this.isPreloading && this.preloadPromise) {
      this.preloadedPage = await this.preloadPromise;
      this.lastUsed = Date.now();
      return this.preloadedPage;
    }

    // Start preloading
    this.isPreloading = true;
    this.preloadPromise = this.preloadPage();

    try {
      this.preloadedPage = await this.preloadPromise;
      this.lastUsed = Date.now();
      return this.preloadedPage;
    } finally {
      this.isPreloading = false;
      this.preloadPromise = null;
    }
  }

  private async preloadPage(): Promise<Page> {
    // Close old browser if exists
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore
      }
    }

    // Launch new browser with optimizations
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript-harmony-shipping',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--disable-default-apps',
        '--mute-audio',
        '--no-first-run',
        '--disable-infobars',
        '--disable-notifications'
      ]
    });

    const page = await this.browser.newPage();
    page.setDefaultNavigationTimeout(20000);

    // Set up resource blocking for faster loads
    await page.route("**/*", (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();
      
      // Block images, stylesheets, fonts
      if (resourceType === "image" || 
          resourceType === "stylesheet" || 
          resourceType === "font" ||
          resourceType === "media") {
        route.abort();
        return;
      }
      
      // Block analytics/tracking
      if (url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('analytics') ||
          url.includes('facebook.net') ||
          url.includes('doubleclick') ||
          url.includes('ads') ||
          url.includes('tracking') ||
          url.includes('pixel') ||
          url.includes('beacon')) {
        route.abort();
        return;
      }
      
      route.continue();
    });

    // Navigate to form page and wait for it to be ready
    console.log(`⚡ Preloading form page: ${this.baseUrl}`);
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    
    // Wait for form elements to be present
    try {
      await page.waitForSelector('input, textbox, [data-test-id*="Field"], form', { timeout: 5000 });
      console.log(`✅ Form page preloaded and ready`);
    } catch (e) {
      console.log(`⚠️ Form elements not immediately available, but page loaded`);
    }

    return page;
  }

  // Create a new page from the preloaded browser for reuse
  async getNewPage(): Promise<Page> {
    if (!this.browser || !this.browser.isConnected()) {
      // Browser closed, need to re-preload
      await this.getPreloadedPage();
    }

    if (!this.browser) {
      throw new Error('Browser not available');
    }

    const page = await this.browser.newPage();
    page.setDefaultNavigationTimeout(20000);

    // Set up resource blocking
    await page.route("**/*", (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();
      
      if (resourceType === "image" || 
          resourceType === "stylesheet" || 
          resourceType === "font" ||
          resourceType === "media") {
        route.abort();
        return;
      }
      
      if (url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('analytics') ||
          url.includes('facebook.net') ||
          url.includes('doubleclick') ||
          url.includes('ads') ||
          url.includes('tracking')) {
        route.abort();
        return;
      }
      
      route.continue();
    });

    // Navigate to form (should be fast since browser is already loaded)
    await page.goto(this.baseUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(200); // Minimal wait - form should load quickly

    return page;
  }

  async close(): Promise<void> {
    if (this.preloadedPage) {
      try {
        await this.preloadedPage.close();
      } catch (e) {
        // Ignore
      }
      this.preloadedPage = null;
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore
      }
      this.browser = null;
    }
  }

  // Preload in background (non-blocking)
  async preloadInBackground(): Promise<void> {
    if (!this.isPreloading && (!this.preloadedPage || this.preloadedPage.isClosed())) {
      this.getPreloadedPage().catch(err => {
        console.error('Background preload failed:', err);
      });
    }
  }
}

// Singleton instance - will be initialized with URL
let pagePreloaderInstance: PagePreloader | null = null;

export function getPagePreloader(baseUrl: string): PagePreloader {
  if (!pagePreloaderInstance || pagePreloaderInstance !== pagePreloaderInstance) {
    pagePreloaderInstance = new PagePreloader(baseUrl);
    // Start preloading immediately
    pagePreloaderInstance.preloadInBackground();
  }
  return pagePreloaderInstance;
}

export { PagePreloader };






