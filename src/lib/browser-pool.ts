import { chromium, Browser } from 'playwright';

class BrowserPool {
  private browser: Browser | null = null;
  private isLaunching = false;
  private launchPromise: Promise<Browser> | null = null;

  async getBrowser(): Promise<Browser> {
    // If browser exists and is connected, reuse it
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // If already launching, wait for that promise
    if (this.isLaunching && this.launchPromise) {
      return this.launchPromise;
    }

    // Launch new browser
    this.isLaunching = true;
    this.launchPromise = (async () => {
      try {
        return await chromium.launch({
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
      } catch (error: any) {
        // If browser is not installed, try to install it automatically
        if (error.message && (error.message.includes('Executable doesn\'t exist') || error.message.includes('Browser not found'))) {
          console.log('📦 Playwright browser not found. Installing chromium...');
          try {
            const { execSync } = require('child_process');
            execSync('npx playwright install chromium --with-deps', { stdio: 'inherit' });
            console.log('✅ Playwright browser installed. Retrying launch...');
            // Retry launch after installation
            return await chromium.launch({
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
          } catch (installError: any) {
            console.error('❌ Failed to install Playwright browser:', installError.message);
            throw new Error(`Playwright browser not installed. Please run: npx playwright install chromium --with-deps. Original error: ${error.message}`);
          }
        }
        throw error;
      }
    })();

    try {
      this.browser = await this.launchPromise;
      return this.browser;
    } finally {
      this.isLaunching = false;
      this.launchPromise = null;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// Singleton instance
export const browserPool = new BrowserPool();







