/**
 * Browser pool for housejet-ppc (payperclose) Calendly bookings only.
 * Launches Chromium with the CapSolver Chrome extension via launchPersistentContext
 * so reCAPTCHA can be solved in-page by the extension.
 * @see https://playwright.dev/docs/chrome-extensions
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type PlaywrightType = typeof import('playwright');
let playwrightModule: PlaywrightType | null = null;

async function getPlaywright(): Promise<PlaywrightType> {
  if (!playwrightModule) {
    playwrightModule = await import('playwright');
  }
  return playwrightModule;
}

/** Resolve path to unpacked CapSolver extension; copy to temp and inject apiKey into assets/config.js. Returns null if extension path not set or invalid. */
export function getCapsolverExtensionPathForLaunch(): string | null {
  const raw = process.env.CAPSOLVER_EXTENSION_PATH?.trim();
  const sourceDir = raw
    ? path.resolve(process.cwd(), raw)
    : path.join(process.cwd(), 'capsolver-extension');
  if (!fs.existsSync(sourceDir)) return null;
  const manifestPath = path.join(sourceDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  const apiKey = process.env.CAPSOLVER_API_KEY?.trim();
  if (!apiKey) return null;

  const tempDir = path.join(os.tmpdir(), `capsolver-extension-${process.pid}-${Date.now()}`);
  try {
    copyDirSync(sourceDir, tempDir);
    const configPath = path.join(tempDir, 'assets', 'config.js');
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    const configContent = buildExtensionConfig(apiKey);
    fs.writeFileSync(configPath, configContent, 'utf8');
    return tempDir;
  } catch (e) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    return null;
  }
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Build CapSolver extension config.js content with apiKey. */
function buildExtensionConfig(apiKey: string): string {
  return `// Auto-generated for Playwright (housejet-ppc). Do not edit.
(function() {
  window.CapSolverConfig = window.CapSolverConfig || {};
  Object.assign(window.CapSolverConfig, {
    apiKey: ${JSON.stringify(apiKey)},
    useCapsolver: true,
    manualSolving: false,
    enabledForRecaptcha: true,
    enabledForRecaptchaV3: true,
  });
})();
`;
}

/** Browser-like wrapper around a persistent BrowserContext so callers can use browser.newContext() and context.newPage(). */
function createBrowserWrapper(context: Awaited<ReturnType<import('playwright').ChromiumBrowser['newContext']>>): {
  newContext: () => typeof context;
  isConnected: () => boolean;
  _context: typeof context;
} {
  let closed = false;
  return {
    _context: context,
    newContext() {
      return context;
    },
    isConnected() {
      return !closed;
    },
    _setClosed() {
      closed = true;
    },
  } as any;
}

interface SlotInfo {
  wrapper: ReturnType<typeof createBrowserWrapper>;
  context: Awaited<ReturnType<import('playwright').ChromiumBrowser['newContext']>>;
  inUse: number;
  maxUse: number;
}

const CAPSOLVER_POOL_SIZE = Math.max(1, parseInt(process.env.CAPSOLVER_POOL_SIZE || '1', 10));

class CapsolverBrowserPool {
  private slots: SlotInfo[] = [];
  private launching: Set<Promise<SlotInfo>> = new Set();
  private index: number = 0;
  private extensionPath: string | null = null;
  private locks: Map<unknown, Promise<void>> = new Map();

  constructor() {
    this.extensionPath = getCapsolverExtensionPathForLaunch();
  }

  isAvailable(): boolean {
    return this.extensionPath !== null;
  }

  private async launchSlot(): Promise<SlotInfo> {
    const pathToExtension = this.extensionPath;
    if (!pathToExtension) throw new Error('CapSolver extension path not configured (CAPSOLVER_EXTENSION_PATH and CAPSOLVER_API_KEY required)');

    const playwright = await getPlaywright();
    const { chromium } = playwright;
    const userDataDir = path.join(os.tmpdir(), `capsolver-pw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--disable-plugins',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--disable-default-apps',
        '--mute-audio',
        '--no-first-run',
        '--disable-infobars',
        '--disable-notifications',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
      timezoneId: 'America/Chicago',
      locale: 'en-US',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const wrapper = createBrowserWrapper(context);
    wrapper._context = context;
    (context as any).on?.('close', () => (wrapper as any)._setClosed?.());

    return {
      wrapper,
      context,
      inUse: 0,
      maxUse: 1,
    };
  }

  async getBrowser(): Promise<ReturnType<typeof createBrowserWrapper>> {
    if (!this.extensionPath) {
      throw new Error(
        'CapSolver extension not available. Set CAPSOLVER_EXTENSION_PATH (path to unpacked extension) and CAPSOLVER_API_KEY.'
      );
    }

    this.slots = this.slots.filter((s) => {
      try {
        return s.context.pages().length >= 0;
      } catch {
        (s.wrapper as any)._setClosed?.();
        return false;
      }
    });

    const maxAttempts = 50;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      for (let i = 0; i < this.slots.length; i++) {
        const idx = (this.index + i) % this.slots.length;
        const slot = this.slots[idx];
        if (slot.inUse < slot.maxUse && slot.wrapper.isConnected()) {
          const lock = this.locks.get(slot.wrapper);
          if (lock) await lock;
          if (slot.inUse >= slot.maxUse) continue;
          slot.inUse++;
          this.index = (idx + 1) % this.slots.length;
          console.log(`[Capsolver pool] Using slot ${idx + 1} (${slot.inUse}/${slot.maxUse})`);
          return slot.wrapper;
        }
      }

      if (this.slots.length < CAPSOLVER_POOL_SIZE) {
        const launchPromise = this.launchSlot();
        this.launching.add(launchPromise);
        try {
          const slot = await launchPromise;
          this.slots.push(slot);
          slot.inUse++;
          this.index = this.slots.length - 1;
          console.log(`[Capsolver pool] Launched new slot (${this.slots.length}/${CAPSOLVER_POOL_SIZE})`);
          return slot.wrapper;
        } finally {
          this.launching.delete(launchPromise);
        }
      }

      if (this.launching.size > 0) {
        try {
          const slot = await Promise.race(Array.from(this.launching));
          if (slot && slot.inUse < slot.maxUse) {
            slot.inUse++;
            this.slots.push(slot);
            this.index = this.slots.length - 1;
            return slot.wrapper;
          }
        } catch {}
      }

      await new Promise((r) => setTimeout(r, 100));
    }

    throw new Error('Capsolver browser pool: no slot available');
  }

  releaseBrowser(browser: unknown): void {
    const slot = this.slots.find((s) => s.wrapper === browser);
    if (slot && slot.inUse > 0) {
      slot.inUse--;
      console.log(`[Capsolver pool] Released slot (${slot.inUse}/${slot.maxUse})`);
    }
  }

  async acquireContextLock(browser: unknown): Promise<() => void> {
    const existing = this.locks.get(browser);
    if (existing) await existing;
    let release: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(browser, promise);
    return () => {
      release!();
      this.locks.delete(browser);
    };
  }

  async close(): Promise<void> {
    for (const slot of this.slots) {
      try {
        await slot.context.close();
      } catch {}
      (slot.wrapper as any)._setClosed?.();
    }
    this.slots = [];
  }
}

export const capsolverBrowserPool = new CapsolverBrowserPool();
