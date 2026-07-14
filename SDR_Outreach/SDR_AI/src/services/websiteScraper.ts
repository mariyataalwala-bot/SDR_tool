import { BrowserManager } from './browserManager';
import { JinaCollector } from '../collectors/jina';

export class WebsiteScraper {
  private browserManager: BrowserManager;
  private jina: JinaCollector;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
    this.jina = new JinaCollector();
  }

  /**
   * Navigates to website URL and returns raw text content.
   * Utilizes Jina Reader API as primary extractor for accurate markdown; falls back to Playwright.
   */
  async scrape(url: string): Promise<string> {
    console.log(`[WebsiteScraper] Accessing URL: ${url}`);
    
    // 1. Try Jina Reader first for clean layout-independent markup extraction
    try {
      const jinaText = await this.jina.scrapeUrl(url);
      if (jinaText && jinaText.trim().length > 100) {
        console.log(`[WebsiteScraper] Successfully scraped via Jina Reader.`);
        return jinaText.substring(0, 15000);
      }
    } catch (jinaErr: any) {
      console.warn(`[WebsiteScraper] Jina Reader failed: ${jinaErr.message}. Trying Playwright fallback.`);
    }

    // 2. Playwright fallback
    let page = await this.browserManager.getPage();
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(3000);
        const bodyText = await page.evaluate(() => document.body.innerText);
        await page.close();
        return bodyText.substring(0, 12000);
      } catch (err: any) {
        console.warn(`[WebsiteScraper] Failed to scrape ${url} (Attempt ${attempts}/${maxAttempts}): ${err.message}`);
        if (attempts >= maxAttempts) {
          await page.close();
          return '';
        }
        const waitTime = Math.pow(2, attempts) * 1000;
        await page.waitForTimeout(waitTime);
      }
    }
    return '';
  }
}
