import { chromium, Browser, BrowserContext, Page } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface LinkedInProfile {
  name: string;
  designation: string;
  profileUrl: string;
}

export class LinkedInCdpCollector {
  private cdpUrl: string;
  private email?: string;
  private password?: string;
  
  // Persistent singleton context for heads-up browser fallback
  private fallbackBrowser: Browser | null = null;
  private fallbackContext: BrowserContext | null = null;

  constructor() {
    let url = process.env.LINKEDIN_CDP_URL || 'http://127.0.0.1:9222';
    if (url.includes('localhost')) {
      url = url.replace('localhost', '127.0.0.1');
    }
    this.cdpUrl = url;
    this.email = process.env.LINKEDIN_EMAIL;
    this.password = process.env.LINKEDIN_PASSWORD;
  }

  /**
   * Helper to retrieve or launch the headed singleton browser.
   */
  private async getFallbackPage(): Promise<Page> {
    if (!this.email || !this.password) {
      throw new Error('No LINKEDIN_EMAIL/PASSWORD credentials found in .env to run auto-login fallback.');
    }

    // Reuse session if already active in this run
    if (this.fallbackContext) {
      try {
        console.log(`[LinkedInCdpCollector] Reusing persistent fallback browser context...`);
        const pages = this.fallbackContext.pages();
        const page = pages[0] || await this.fallbackContext.newPage();
        return page;
      } catch (err) {
        console.log(`[LinkedInCdpCollector] Persistent session closed. Re-opening...`);
        this.fallbackContext = null;
      }
    }

    console.log(`[LinkedInCdpCollector] Launching headed Chrome fallback session with persistent context...`);
    const sessionDir = path.join(__dirname, '../../linkedin_session');
    
    // Launch persistent context so cookies and session state persist on disk
    this.fallbackContext = await chromium.launchPersistentContext(sessionDir, {
      headless: false,
      viewport: null
    });
    
    this.fallbackContext.setDefaultNavigationTimeout(60000);
    this.fallbackContext.setDefaultTimeout(60000);

    const page = this.fallbackContext.pages()[0] || await this.fallbackContext.newPage();

    console.log(`[LinkedInCdpCollector] Checking login status on LinkedIn Feed...`);
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);

    // If redirected to login, autocomplete and submit
    if (page.url().includes('login') || await page.locator('#username').isVisible()) {
      console.log(`[LinkedInCdpCollector] Session expired or empty. Navigating to login page...`);
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });
      if (await page.locator('#username').isVisible()) {
        console.log(`[LinkedInCdpCollector] Auto-filling credentials...`);
        await page.fill('#username', this.email);
        await page.fill('#password', this.password);
        await page.click('button[type="submit"]');
      }

      console.log(`[LinkedInCdpCollector] Awaiting feed landing (waiting up to 60s for 2FA / verification)...`);
      try {
        await page.waitForURL('**/feed/**', { timeout: 60000 });
        console.log(`[LinkedInCdpCollector] Successful landing. Feed is active.`);
      } catch (err) {
        console.warn(`[LinkedInCdpCollector] Await feed redirect timed out. Continuing...`);
      }
    } else {
      console.log(`[LinkedInCdpCollector] Session active! Logged in automatically via saved cookie context.`);
    }

    return page;
  }

  /**
   * Resolves target browser page (CDP first, then fallback heads-up singleton).
   */
  private async getPage(): Promise<{ browser: any; page: Page; isFallback: boolean }> {
    try {
      console.log(`[LinkedInCdpCollector] Attempting CDP remote connect: ${this.cdpUrl}`);
      const browser = await chromium.connectOverCDP(this.cdpUrl);
      const contexts = browser.contexts();
      const context = contexts[0] || await browser.newContext();
      const page = context.pages()[0] || await context.newPage();
      return { browser, page, isFallback: false };
    } catch (cdpErr: any) {
      console.warn(`[LinkedInCdpCollector] CDP connection refused: ${cdpErr.message}`);
      const page = await this.getFallbackPage();
      return { browser: this.fallbackBrowser, page, isFallback: true };
    }
  }

  /**
   * Executes a search on Google and returns result URLs, snippets, and titles.
   */
  async googleSearchAndScrape(query: string): Promise<{ title: string, url: string, snippet: string }[]> {
    const { browser, page, isFallback } = await this.getPage();
    try {
      const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      console.log(`[LinkedInCdpCollector] Google Search: "${query}"`);
      await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);

      const results = await page.evaluate(() => {
        const items: { title: string, url: string, snippet: string }[] = [];
        const cards = document.querySelectorAll('div.g, div.tF2Cxc, div[data-ved], .yuRUbf, div.MjjYud');
        cards.forEach(card => {
          const titleEl = card.querySelector('h3');
          const linkEl = card.querySelector('a');
          const snippetEl = card.querySelector('[style*="webkit-line-clamp"], .VwiC3b, .yD755d, span.aCOp2e');
          if (titleEl && linkEl) {
            const href = linkEl.getAttribute('href');
            if (href && href.startsWith('http')) {
              // Ensure we don't insert duplicate search results
              if (!items.some(i => i.url === href)) {
                items.push({
                  title: titleEl.innerText || '',
                  url: href,
                  snippet: snippetEl ? (snippetEl as HTMLElement).innerText : ''
                });
              }
            }
          }
        });
        return items;
      });
      return results;
    } catch (err: any) {
      console.error(`[LinkedInCdpCollector] Google search failed for "${query}":`, err.message);
      return [];
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }

  /**
   * Navigates to a specific URL and scrapes the visible text.
   */
  async scrapePageContent(url: string): Promise<string> {
    const { browser, page, isFallback } = await this.getPage();
    try {
      console.log(`[LinkedInCdpCollector] Crawling page: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      const text = await page.evaluate(() => document.body.innerText);
      return text.substring(0, 10000); // return first 10k characters to prevent API limits
    } catch (err: any) {
      console.warn(`[LinkedInCdpCollector] Scrape failed for ${url}:`, err.message);
      return '';
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }

  /**
   * Searches for target contacts.
   */
  async searchLeads(companyName: string, titleKeywords: string[]): Promise<LinkedInProfile[]> {
    const { browser, page, isFallback } = await this.getPage();
    try {
      const query = encodeURIComponent(`"${companyName}" AND (${titleKeywords.join(' OR ')})`);
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${query}&network=%5B%22F%22%2C%22S%22%5D`;
      
      console.log(`[LinkedInCdpCollector] Navigating to LinkedIn Search: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6000);

      const profiles: LinkedInProfile[] = await page.evaluate(() => {
        const results: LinkedInProfile[] = [];
        const items = document.querySelectorAll('.reusable-search__result-container');
        
        items.forEach(item => {
          const titleEl = item.querySelector('.entity-result__title-text a');
          const descEl = item.querySelector('.entity-result__primary-subtitle');
          
          if (titleEl && descEl) {
            const nameText = (titleEl as HTMLElement).innerText.split('\n')[0].trim();
            let profileUrl = (titleEl as HTMLAnchorElement).href.split('?')[0];
            
            if (profileUrl && !profileUrl.startsWith('http')) {
              profileUrl = 'https://www.linkedin.com' + (profileUrl.startsWith('/') ? '' : '/') + profileUrl;
            }

            const designation = (descEl as HTMLElement).innerText.trim();
            
            if (nameText && nameText !== 'LinkedIn Member') {
              results.push({ name: nameText, designation, profileUrl });
            }
          }
        });
        return results;
      });

      console.log(`[LinkedInCdpCollector] Scraped ${profiles.length} profiles.`);
      return profiles;
    } catch (error: any) {
      console.error(`[LinkedInCdpCollector] Search leads failed:`, error.message);
      throw error;
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }

  /**
   * Automates sending a connection request.
   */
  async sendConnectionInvite(profileUrl: string, note: string): Promise<boolean> {
    const { browser, page, isFallback } = await this.getPage();
    try {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);

      let connectBtn = await page.locator('button:has-text("Connect")').first();
      let isVisible = await connectBtn.isVisible();

      if (!isVisible) {
        const moreBtn = await page.locator('button:has-text("More")').first();
        if (await moreBtn.isVisible()) {
          await moreBtn.click();
          await page.waitForTimeout(1000);
          connectBtn = await page.locator('div[role="button"]:has-text("Connect"), span:has-text("Connect")').first();
          isVisible = await connectBtn.isVisible();
        }
      }

      if (!isVisible) {
        console.log(`[LinkedInCdpCollector] Connect action not found.`);
        return false;
      }

      await connectBtn.click();
      await page.waitForTimeout(1500);

      const addNoteBtn = await page.locator('button:has-text("Add a note")');
      if (await addNoteBtn.isVisible()) {
        await addNoteBtn.click();
        await page.waitForTimeout(1000);

        const noteArea = await page.locator('textarea[name="message"]');
        await noteArea.fill(note.substring(0, 299));
        await page.waitForTimeout(1000);

        const sendBtn = await page.locator('button:has-text("Send")');
        await sendBtn.click();
        await page.waitForTimeout(2000);
        return true;
      } else {
        const sendBtn = await page.locator('button:has-text("Send without a note"), button:has-text("Send")');
        if (await sendBtn.isVisible()) {
          await sendBtn.click();
          await page.waitForTimeout(2000);
          return true;
        }
      }
      return false;
    } catch (error: any) {
      console.error(`[LinkedInCdpCollector] Connect invite failed:`, error.message);
      return false;
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }

  /**
   * Extracts company size.
   */
  async scrapeCompanyProfile(companyUrl: string): Promise<{ employeeRange: string, employeeCountOnLinkedin: number }> {
    const { browser, page, isFallback } = await this.getPage();
    try {
      await page.goto(companyUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);

      const data = await page.evaluate(() => {
        let employeeCountOnLinkedin = 0;
        let employeeRange = 'Unknown employees';
        const bodyText = document.body.innerText;

        const countMatch = bodyText.match(/(\d+,?\d*)\s+employees\s+on\s+LinkedIn/i) || 
                           bodyText.match(/See\s+all\s+(\d+,?\d*)\s+employees/i) ||
                           bodyText.match(/(\d+,?\d*)\s+associated\s+members/i);
        if (countMatch && countMatch[1]) {
          employeeCountOnLinkedin = parseInt(countMatch[1].replace(/,/g, ''), 10);
        }

        const rangeMatch = bodyText.match(/(\d+-\d+,?\d*)\s+employees/i) ||
                           bodyText.match(/(\d+,\d+-\d+,\d+)\s+employees/i) ||
                           bodyText.match(/Company\s+size\s+(\d+-?\d*,?\d*)/i);
        if (rangeMatch && rangeMatch[1]) {
          employeeRange = rangeMatch[1].includes('employees') ? rangeMatch[1] : `${rangeMatch[1]} employees`;
        }

        return { employeeRange, employeeCountOnLinkedin };
      });
      return data;
    } catch (err: any) {
      console.warn(`[LinkedInCdpCollector] Failed to scrape company:`, err.message);
      return { employeeRange: 'Unknown employees', employeeCountOnLinkedin: 0 };
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }

  /**
   * Extracts mutual connections.
   */
  async scrapeMutualConnections(profileUrl: string): Promise<number> {
    const { browser, page, isFallback } = await this.getPage();
    try {
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(4000);

      const count = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const match = bodyText.match(/(\d+)\s+mutual\s+connections?/i) ||
                      bodyText.match(/(\d+)\s+shared\s+connections?/i);
        return match && match[1] ? parseInt(match[1], 10) : 0;
      });
      return count;
    } catch (err: any) {
      console.warn(`[LinkedInCdpCollector] Mutual connection scrape failed:`, err.message);
      return 0;
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }

  /**
   * Scrapes feed updates.
   */
  async scrapeLinkedInFeed(): Promise<any[]> {
    const { browser, page, isFallback } = await this.getPage();
    try {
      console.log(`[LinkedInCdpCollector] Navigating to LinkedIn Feed...`);
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 50000 });
      
      console.log(`[LinkedInCdpCollector] Waiting for feed render & scrolling...`);
      await page.waitForTimeout(7000);
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);

      const selectorExists = await page.evaluate(() => {
        return document.querySelectorAll('article, [data-urn*="activity:"], .feed-shared-update-v2').length > 0;
      });

      if (!selectorExists) {
        const sampleText = await page.evaluate(() => document.body.innerText.substring(0, 800));
        console.warn(`[LinkedInCdpCollector] Body Sample (CDP/Login Session): "${sampleText.replace(/\n/g, ' ')}"`);
      }

      const posts = await page.evaluate(() => {
        const results: any[] = [];
        const cards = Array.from(document.querySelectorAll('article, [data-urn*="activity:"], .feed-shared-update-v2, .feed-shared-update'));

        cards.forEach((card) => {
          if (results.length >= 10) return;

          let author = '';
          const authorSelectors = [
            '.update-components-actor__title',
            '.feed-shared-actor__title',
            '.update-components-actor__name',
            '.hoverable-link-text',
            'span.font-weight-bold',
            '[class*="actor__name"]',
            '[class*="actor__title"]'
          ];
          for (const selector of authorSelectors) {
            const el = card.querySelector(selector);
            if (el) {
              const text = (el as HTMLElement).innerText.trim().split('\n')[0];
              if (text && text !== 'LinkedIn Member') {
                author = text;
                break;
              }
            }
          }

          let description = '';
          const descSelectors = [
            '.update-components-actor__description',
            '.feed-shared-actor__description',
            '[class*="actor__description"]',
            '.feed-shared-actor__secondary-subtitle'
          ];
          for (const selector of descSelectors) {
            const el = card.querySelector(selector);
            if (el) {
              description = (el as HTMLElement).innerText.trim();
              break;
            }
          }

          let textContent = '';
          const textSelectors = [
            '.update-components-text',
            '.feed-shared-update-v2__commentary',
            '.feed-shared-text',
            '.feed-shared-update-v2__description',
            '[class*="commentary"]',
            '.break-words'
          ];
          for (const selector of textSelectors) {
            const el = card.querySelector(selector);
            if (el) {
              const text = (el as HTMLElement).innerText.trim();
              if (text) {
                textContent = text;
                break;
              }
            }
          }

          if (author && (textContent || description)) {
            if (!results.some(r => r.author === author && r.textContent === textContent)) {
              results.push({ author, description, textContent, scrapedAt: new Date().toISOString() });
            }
          }
        });
        return results;
      });

      console.log(`[LinkedInCdpCollector] Successfully scraped ${posts.length} feed posts.`);
      return posts;
    } catch (err: any) {
      console.error(`[LinkedInCdpCollector] Feed scraper failed:`, err.message);
      throw err;
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }

  /**
   * Google Index Fallback Search: queries Google search index for public LinkedIn profiles matching the company.
   * This guarantees actual real-world profiles are returned even if direct LinkedIn search returns no connections.
   */
  async searchLeadsViaGoogle(companyName: string, titleKeywords: string[]): Promise<LinkedInProfile[]> {
    console.log(`[LinkedInCdpCollector] Direct LinkedIn search empty. Querying Google cache index for: ${companyName}`);
    const { browser, page, isFallback } = await this.getPage();
    try {
      const query = encodeURIComponent(`site:linkedin.com/in/ "${companyName}" (${titleKeywords.join(' OR ')})`);
      const googleUrl = `https://www.google.com/search?q=${query}`;
      
      console.log(`[LinkedInCdpCollector] Navigating to Google Search: ${googleUrl}`);
      await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(4000);

      const profiles: LinkedInProfile[] = await page.evaluate((compName) => {
        const results: LinkedInProfile[] = [];
        const cards = document.querySelectorAll('div.g, div.tF2Cxc, div[data-ved], .yuRUbf, div.MjjYud');
        
        cards.forEach(card => {
          const titleEl = card.querySelector('h3');
          const linkEl = card.querySelector('a');
          
          if (titleEl && linkEl) {
            const fullTitle = titleEl.innerText;
            const url = linkEl.getAttribute('href');
            
            if (url && url.includes('linkedin.com/in/')) {
              const parts = fullTitle.split('-');
              const name = parts[0]?.trim() || '';
              
              let designation = parts[1]?.trim() || 'Executive';
              if (designation.includes('|')) {
                designation = designation.split('|')[0].trim();
              }
              
              if (name && !name.includes('LinkedIn') && name.split(' ').length <= 4) {
                if (!results.some(r => r.profileUrl === url)) {
                  results.push({
                    name,
                    designation,
                    profileUrl: url.split('?')[0]
                  });
                }
              }
            }
          }
        });
        return results;
      }, companyName);

      console.log(`[LinkedInCdpCollector] Scraped ${profiles.length} real profiles from Google Cache index.`);
      return profiles;
    } catch (err: any) {
      console.error(`[LinkedInCdpCollector] Google Index search failed:`, err.message);
      return [];
    } finally {
      if (!isFallback && browser) {
        await browser.close();
      }
    }
  }
}
