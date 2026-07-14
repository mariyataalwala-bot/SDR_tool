import { BaseCollector } from './base.js';

export class PlaywrightCollector extends BaseCollector {
  async collect(url, kwargs) {
    console.log(`[PlaywrightCollector] Attempting Playwright scrape for: ${url}`);
    
    let playwright;
    try {
      playwright = await import('playwright');
    } catch (e) {
      console.error("[PlaywrightCollector] Playwright module is not installed or available.");
      return "";
    }

    try {
      const { chromium } = playwright;
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" }
      });
      const page = await context.newPage();
      
      // Bypass webDriver check
      await page.addInitScript(() => {
        delete navigator.__proto__.webdriver;
      });

      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      const content = await page.content();

      await context.close();
      await browser.close();

      console.log(`[PlaywrightCollector] Playwright scrape successful for: ${url}`);
      return content;
    } catch (err) {
      console.error(`[PlaywrightCollector] Error during Playwright scrape for ${url}:`, err.message || err);
      return "";
    }
  }
}
