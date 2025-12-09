// Dynamic import to avoid bundling issues and handle missing modules
type PlaywrightType = typeof import('playwright');
let playwrightModule: PlaywrightType | null = null;
let playwrightLoadError: Error | null = null;

async function getPlaywright(): Promise<PlaywrightType> {
  if (playwrightLoadError) {
    throw playwrightLoadError;
  }
  
  if (!playwrightModule) {
    try {
      playwrightModule = await import('playwright');
      return playwrightModule;
    } catch (error: any) {
      // If import fails due to missing modules (like imageUtils), try to reinstall
      if (error.message && (error.message.includes('imageUtils') || error.message.includes('Cannot find module'))) {
        console.log('🔧 Playwright installation appears corrupted. Attempting to fix...');
        try {
          const { execSync } = require('child_process');
          console.log('📦 Reinstalling Playwright...');
          execSync('npm install playwright@^1.56.1 --force', { 
            stdio: 'inherit', 
            cwd: process.cwd(),
            timeout: 120000 // 2 minutes
          });
          console.log('📦 Installing browser...');
          execSync('npx playwright install chromium --with-deps', { 
            stdio: 'inherit', 
            cwd: process.cwd(),
            timeout: 300000 // 5 minutes
          });
          console.log('✅ Reinstall complete. Retrying import...');
          playwrightModule = await import('playwright');
          return playwrightModule;
        } catch (installError: any) {
          console.error('❌ Failed to fix Playwright installation:', installError.message);
          playwrightLoadError = new Error(`Playwright installation is corrupted. Please ensure Playwright is properly installed. Original error: ${error.message}`);
          throw playwrightLoadError;
        }
      } else {
        playwrightLoadError = error;
        throw error;
      }
    }
  }
  return playwrightModule;
}

class BrowserPool {
  private browser: any | null = null;
  private isLaunching = false;
  private launchPromise: Promise<any> | null = null;

  async getBrowser(): Promise<any> {
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
      const playwright = await getPlaywright();
      const { chromium } = playwright;
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
            execSync('npx playwright install chromium --with-deps', { 
              stdio: 'inherit',
              cwd: process.cwd(),
              timeout: 300000 // 5 minutes
            });
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
