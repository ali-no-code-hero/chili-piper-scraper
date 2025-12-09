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
          const fs = require('fs');
          const path = require('path');
          
          // Delete corrupted Playwright installations
          console.log('🗑️ Removing corrupted Playwright installation...');
          const nodeModulesPath = path.join(process.cwd(), 'node_modules');
          const playwrightPath = path.join(nodeModulesPath, 'playwright');
          const playwrightCorePath = path.join(nodeModulesPath, 'playwright-core');
          
          try {
            if (fs.existsSync(playwrightPath)) {
              fs.rmSync(playwrightPath, { recursive: true, force: true });
            }
            if (fs.existsSync(playwrightCorePath)) {
              fs.rmSync(playwrightCorePath, { recursive: true, force: true });
            }
          } catch (rmError) {
            console.log('⚠️ Could not remove old installation, continuing...');
          }
          
          console.log('📦 Reinstalling Playwright from scratch...');
          execSync('npm install playwright@^1.56.1 --force --no-save', { 
            stdio: 'inherit', 
            cwd: process.cwd(),
            timeout: 120000 // 2 minutes
          });
          
          console.log('📦 Installing browser (this may take a few minutes)...');
          // Use the direct path to avoid npx issues
          const playwrightCliPath = path.join(playwrightPath, 'cli.js');
          if (fs.existsSync(playwrightCliPath)) {
            execSync(`node ${playwrightCliPath} install chromium --with-deps`, { 
              stdio: 'inherit', 
              cwd: process.cwd(),
              timeout: 300000 // 5 minutes
            });
          } else {
            // Fallback to npx
            execSync('npx --yes playwright@^1.56.1 install chromium --with-deps', { 
              stdio: 'inherit', 
              cwd: process.cwd(),
              timeout: 300000 // 5 minutes
            });
          }
          
          console.log('✅ Reinstall complete. Retrying import...');
          playwrightModule = await import('playwright');
          return playwrightModule;
        } catch (installError: any) {
          console.error('❌ Failed to fix Playwright installation:', installError.message);
          playwrightLoadError = new Error(`Playwright installation is corrupted and could not be fixed automatically. Please ensure Playwright is properly installed during build. Original error: ${error.message}`);
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
            '--disable-notifications',
            '--disable-setuid-sandbox',
            '--single-process'
          ],
          ignoreDefaultArgs: ['--disable-extensions']
        });
      } catch (error: any) {
        // If browser is not installed, try to install it automatically
        if (error.message && (error.message.includes('Executable doesn\'t exist') || error.message.includes('Browser not found'))) {
          console.log('📦 Playwright browser not found. Attempting to install chromium...');
          try {
            const { execSync } = require('child_process');
            // Set browser path to workspace cache to avoid permission issues
            const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: '/workspace/.cache/ms-playwright' };
            // Try installing without --with-deps first (doesn't require root)
            try {
              execSync('npx playwright install chromium', { 
                stdio: 'inherit',
                cwd: process.cwd(),
                env: env,
                timeout: 300000 // 5 minutes
              });
              console.log('✅ Playwright browser installed. Retrying launch...');
            } catch (installError: any) {
              // If that fails, try with --with-deps (might need root, but worth trying)
              console.log('⚠️ Standard install failed, trying with dependencies...');
              execSync('npx playwright install chromium --with-deps', { 
                stdio: 'inherit',
                cwd: process.cwd(),
                env: env,
                timeout: 300000 // 5 minutes
              });
              console.log('✅ Playwright browser installed with dependencies. Retrying launch...');
            }
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
