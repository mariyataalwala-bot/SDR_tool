import { chromium, Browser, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';

export class BrowserManager {
  private static instance: BrowserManager;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private persistentDir: string;
  private isCdp = false;

  private constructor() {
    this.persistentDir = path.resolve(process.cwd(), 'linkedin_session');
    if (!fs.existsSync(this.persistentDir)) {
      fs.mkdirSync(this.persistentDir, { recursive: true });
    }
    
    // Wire up cleanup on shutdown
    process.on('SIGINT', () => this.close());
    process.on('SIGTERM', () => this.close());
    process.on('exit', () => this.close());
  }

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * Initializes or returns the cached BrowserContext.
   */
  public async getContext(): Promise<BrowserContext> {
    if (this.context) {
      return this.context;
    }

    console.log(`[BrowserManager] Initializing browser session...`);
    
    // 1. Try connecting to CDP port 9222 first
    try {
      console.log(`[BrowserManager] Attempting to connect to remote Chrome CDP on port 9222...`);
      this.browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
      this.context = this.browser.contexts()[0] || await this.browser.newContext();
      this.isCdp = true;
      console.log(`[BrowserManager] Successfully connected to live Chrome CDP session.`);
      return this.context;
    } catch (cdpErr: any) {
      console.warn(`[BrowserManager] CDP connection failed: ${cdpErr.message}. Falling back to persistent profile folder context.`);
    }

    // 2. Launch persistent local browser context
    try {
      this.context = await chromium.launchPersistentContext(this.persistentDir, {
        headless: process.env.HEADLESS_BROWSER !== 'false',
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-infobars',
          '--disable-blink-features=AutomationControlled'
        ]
      });
      console.log(`[BrowserManager] Persistent context launched at ${this.persistentDir}.`);
      return this.context;
    } catch (err: any) {
      console.error(`[BrowserManager] Failed to launch persistent context:`, err.message);
      // Fallback to basic browser launch if folder lock error occurs
      console.log(`[BrowserManager] Launching standard browser context fallback.`);
      this.browser = await chromium.launch({
        headless: process.env.HEADLESS_BROWSER !== 'false',
        args: ['--no-sandbox']
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 }
      });
      return this.context;
    }
  }

  /**
   * Borrows a fresh page from the context, keeping context alive.
   */
  public async getPage(): Promise<Page> {
    const ctx = await this.getContext();
    const page = await ctx.newPage();
    
    // Apply standard user agent/stealth configs
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
    
    return page;
  }

  /**
   * Closes resources on shutdown.
   */
  public async close(): Promise<void> {
    try {
      if (this.context && !this.isCdp) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    } catch (e: any) {
      // Ignored during shutdown hooks
    } finally {
      this.context = null;
      this.browser = null;
    }
  }
}
