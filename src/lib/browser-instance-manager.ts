import { Browser, BrowserContext, Page } from 'playwright';
import { browserPool } from './browser-pool';

interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  email: string;
  lastUsed: number;
  createdAt: number;
}

class BrowserInstanceManager {
  private instances: Map<string, BrowserInstance> = new Map();
  private maxInstances: number;
  private timeoutMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxInstances: number = 50, timeoutMs: number = 900000) {
    this.maxInstances = maxInstances;
    this.timeoutMs = timeoutMs;
    this.startCleanupTask();
  }

  /**
   * Register a browser instance for an email
   */
  async registerInstance(
    email: string,
    browser: Browser,
    context: BrowserContext,
    page: Page
  ): Promise<void> {
    // Check if instance already exists for this email
    const existing = this.instances.get(email);
    if (existing) {
      // Clean up existing instance
      await this.cleanupInstance(email);
    }

    // Check if we're at max capacity
    if (this.instances.size >= this.maxInstances && !existing) {
      // Find oldest instance to evict
      let oldestEmail = '';
      let oldestTime = Date.now();
      for (const [e, instance] of this.instances.entries()) {
        if (instance.lastUsed < oldestTime) {
          oldestTime = instance.lastUsed;
          oldestEmail = e;
        }
      }
      if (oldestEmail) {
        await this.cleanupInstance(oldestEmail);
      }
    }

    // Register new instance
    this.instances.set(email, {
      browser,
      context,
      page,
      email,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    });

    // Release browser from pool so it's available for new requests
    // The browser is now managed by instance manager, not the pool
    browserPool.releaseBrowser(browser);

    console.log(`✅ Registered browser instance for ${email} (${this.instances.size}/${this.maxInstances} instances)`);
  }

  /**
   * Get browser instance for an email
   */
  getInstance(email: string): BrowserInstance | null {
    const instance = this.instances.get(email);
    if (!instance) {
      return null;
    }

    // Check if browser is still connected
    if (!instance.browser.isConnected()) {
      console.log(`⚠️ Browser instance for ${email} is disconnected, cleaning up...`);
      this.cleanupInstance(email).catch(() => {});
      return null;
    }

    // Update last used timestamp
    instance.lastUsed = Date.now();
    return instance;
  }

  /**
   * Check if instance exists and is valid
   */
  hasInstance(email: string): boolean {
    const instance = this.getInstance(email);
    return instance !== null;
  }

  /**
   * Clean up a specific instance
   */
  async cleanupInstance(email: string): Promise<void> {
    const instance = this.instances.get(email);
    if (!instance) {
      return;
    }

    try {
      if (instance.page && !instance.page.isClosed()) {
        await instance.page.close().catch(() => {});
      }
      if (instance.context) {
        await instance.context.close().catch(() => {});
      }
      // Note: We don't close the browser itself as it may be from the browser pool
      // The browser pool will handle disconnected browsers in its cleanup
    } catch (error) {
      console.error(`Error cleaning up instance for ${email}:`, error);
    } finally {
      this.instances.delete(email);
      console.log(`🗑️ Cleaned up browser instance for ${email}`);
    }
  }

  /**
   * Clean up all instances
   */
  async cleanupAll(): Promise<void> {
    const emails = Array.from(this.instances.keys());
    await Promise.all(emails.map(email => this.cleanupInstance(email)));
  }

  /**
   * Clean up stale instances (older than timeout)
   */
  private async cleanupStaleInstances(): Promise<void> {
    const now = Date.now();
    const staleEmails: string[] = [];

    for (const [email, instance] of this.instances.entries()) {
      // Check if browser is disconnected
      if (!instance.browser.isConnected()) {
        staleEmails.push(email);
        continue;
      }

      // Check if instance has timed out
      const timeSinceLastUse = now - instance.lastUsed;
      if (timeSinceLastUse >= this.timeoutMs) {
        staleEmails.push(email);
      }
    }

    // Clean up stale instances
    for (const email of staleEmails) {
      await this.cleanupInstance(email);
    }

    if (staleEmails.length > 0) {
      console.log(`🧹 Cleaned up ${staleEmails.length} stale browser instance(s)`);
    }
  }

  /**
   * Start background cleanup task
   */
  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleInstances().catch(error => {
        console.error('Error in cleanup task:', error);
      });
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup task (for shutdown)
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get status information
   */
  getStatus(): {
    total: number;
    max: number;
    instances: Array<{ email: string; lastUsed: number; age: number }>;
  } {
    const instances = Array.from(this.instances.entries()).map(([email, instance]) => ({
      email,
      lastUsed: instance.lastUsed,
      age: Date.now() - instance.createdAt,
    }));

    return {
      total: this.instances.size,
      max: this.maxInstances,
      instances,
    };
  }
}

// Singleton instance with configurable limits
const MAX_INSTANCES = parseInt(process.env.MAX_BROWSER_INSTANCES || '50', 10);
const TIMEOUT_MS = parseInt(process.env.BROWSER_INSTANCE_TIMEOUT_MS || '900000', 10); // 15 minutes default

export const browserInstanceManager = new BrowserInstanceManager(MAX_INSTANCES, TIMEOUT_MS);

// Cleanup on process exit
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, cleaning up browser instances...');
  browserInstanceManager.stopCleanupTask();
  await browserInstanceManager.cleanupAll();
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, cleaning up browser instances...');
  browserInstanceManager.stopCleanupTask();
  await browserInstanceManager.cleanupAll();
});

