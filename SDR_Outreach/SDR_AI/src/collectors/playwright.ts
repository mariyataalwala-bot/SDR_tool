import { chromium } from 'playwright';

export class PlaywrightCollector {
  /**
   * Scrapes the target URL using headless Playwright.
   */
  async scrapeUrl(url: string): Promise<string> {
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    console.log(`[PlaywrightCollector] Launching headless browser for: ${targetUrl}`);

    let browser;
    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      
      // Navigate with timeout
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      
      // Extract text content and some basic structure
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText);
      const html = await page.content();

      return `Title: ${title}\n\nContent:\n${bodyText}\n\nHTML:\n${html.substring(0, 5000)}`;
    } catch (error) {
      console.warn(`[PlaywrightCollector] Playwright failed to scrape ${url}:`, error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
