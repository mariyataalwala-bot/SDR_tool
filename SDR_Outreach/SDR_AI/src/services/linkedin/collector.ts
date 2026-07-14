import { BrowserManager } from '../browserManager';
import { SessionManager } from './sessionManager';
import { SearchManager } from './searchManager';
import { ProfileParser, ScrapedProfile, ScrapedPost } from './profileParser';
import { GoogleSearcher } from '../googleSearcher';

export class LinkedInCollector {
  private browserManager: BrowserManager;
  private session: SessionManager;
  private search: SearchManager;
  private parser: ProfileParser;
  private googleSearcher: GoogleSearcher;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
    this.session = new SessionManager();
    this.search = new SearchManager();
    this.parser = new ProfileParser();
    this.googleSearcher = new GoogleSearcher();
  }

  /**
   * Automates search for target profiles on LinkedIn.
   */
  async discoverContacts(companyName: string, titles: string[]): Promise<ScrapedProfile[]> {
    console.log(`[LinkedInCollector] Discovering contacts for ${companyName}...`);
    let page = await this.browserManager.getPage();

    try {
      const logged = await this.session.isLoggedIn(page);
      if (!logged) {
        const success = await this.session.login(page);
        if (!success) {
          console.warn(`[LinkedInCollector] Could not authenticate. Running Google Index fallback search instead.`);
          await page.close();
          return this.discoverContactsViaGoogle(companyName, titles);
        }
      }

      await this.search.navigateToPeopleSearch(page, companyName, titles);
      const profiles = await this.parser.parsePeopleSearch(page);
      await page.close();

      if (profiles.length === 0) {
        console.log(`[LinkedInCollector] LinkedIn search empty. Falling back to Google Index...`);
        return this.discoverContactsViaGoogle(companyName, titles);
      }

      return profiles;
    } catch (err: any) {
      console.error(`[LinkedInCollector] Discovery failed:`, err.message);
      await page.close();
      return this.discoverContactsViaGoogle(companyName, titles);
    }
  }

  /**
   * Queries Google for public LinkedIn profiles matching the target criteria.
   */
  async discoverContactsViaGoogle(companyName: string, titles: string[]): Promise<ScrapedProfile[]> {
    console.log(`[LinkedInCollector] Executing Google search for LinkedIn profiles...`);
    const query = `site:linkedin.com/in/ "${companyName}" (${titles.join(' OR ')})`;
    try {
      const searchResults = await this.googleSearcher.search(query, 10);
      const profiles: ScrapedProfile[] = [];

      for (const res of searchResults) {
        if (res.url.includes('linkedin.com/in/')) {
          const parts = res.title.split('-');
          const name = parts[0]?.trim() || '';
          let designation = parts[1]?.trim() || 'Executive';
          if (designation.includes('|')) {
            designation = designation.split('|')[0].trim();
          }

          if (name && !name.includes('LinkedIn') && name.split(' ').length <= 4) {
            profiles.push({
              name,
              designation,
              profileUrl: res.url.split('?')[0]
            });
          }
        }
      }
      return profiles;
    } catch (err: any) {
      console.error(`[LinkedInCollector] Google fallback failed:`, err.message);
      return [];
    }
  }

  /**
   * Scrapes metadata details for a company profile, falling back to public search if not logged in.
   */
  async scrapeCompany(companyUrl: string): Promise<{ industry?: string, employeeCount?: number, headquarters?: string }> {
    console.log(`[LinkedInCollector] Scraping company details: ${companyUrl}`);
    let page = await this.browserManager.getPage();

    try {
      const logged = await this.session.isLoggedIn(page);
      if (!logged) {
        const success = await this.session.login(page);
        if (!success) {
          console.warn(`[LinkedInCollector] Could not authenticate. Running Google fallback search for company details...`);
          await page.close();
          return this.scrapeCompanyViaGoogle(companyUrl);
        }
      }

      await this.search.navigateToCompanyAbout(page, companyUrl);
      const companyDetails = await this.parser.parseCompanyProfile(page);
      await page.close();
      return companyDetails;
    } catch (err: any) {
      console.error(`[LinkedInCollector] Company scrape failed:`, err.message);
      await page.close();
      return this.scrapeCompanyViaGoogle(companyUrl);
    }
  }

  /**
   * Fallback to extract company details using public search engine crawls.
   */
  async scrapeCompanyViaGoogle(companyUrl: string): Promise<{ industry?: string, employeeCount?: number, headquarters?: string }> {
    const handleMatch = companyUrl.match(/linkedin\.com\/company\/([a-zA-Z0-9_-]+)/i);
    const companyHandle = handleMatch ? handleMatch[1] : companyUrl;
    
    console.log(`[LinkedInCollector] Performing Google search fallback for company: ${companyHandle}`);
    
    const query = `site:linkedin.com/company/ "${companyHandle}"`;
    try {
      const results = await this.googleSearcher.search(query, 3);
      
      let industry = 'Other';
      let employeeCount = 50; 
      let headquarters = 'Unknown';

      for (const res of results) {
        const text = `${res.title} ${res.snippet}`.toLowerCase();
        
        const empMatch = text.match(/(\d+[,.]?\d*)\s*-\s*(\d+[,.]?\d*)\s*employees/i) || 
                         text.match(/(\d+[,.]?\d*)\s*employees/i) ||
                         text.match(/size:\s*(\d+)/i);
                         
        if (empMatch) {
          const rawNum = empMatch[2] ? empMatch[2] : empMatch[1];
          const parsedNum = parseInt(rawNum.replace(/[,.]/g, ''), 10);
          if (!isNaN(parsedNum)) {
            employeeCount = parsedNum;
          }
        }

        const industries = [
          'retail', 'apparel', 'fashion', 'cosmetics', 'beauty', 'beverages', 'food',
          'software', 'technology', 'marketing', 'advertising', 'e-commerce', 'ecommerce',
          'manufacturing', 'wellness', 'fitness', 'consumer goods'
        ];
        for (const ind of industries) {
          if (text.includes(ind)) {
            industry = ind.toUpperCase();
            break;
          }
        }

        const hqMatch = text.match(/headquarters\s+(?:is\s+)?in\s+([a-zA-Z\s,]+)/i) ||
                        text.match(/based\s+in\s+([a-zA-Z\s,]+)/i);
        if (hqMatch) {
          headquarters = hqMatch[1].trim();
        }
      }

      return {
        industry,
        employeeCount,
        headquarters
      };
    } catch (err: any) {
      console.error(`[LinkedInCollector] Google company fallback failed:`, err.message);
      return { industry: 'Other', employeeCount: 50, headquarters: 'Unknown' };
    }
  }

  /**
   * Automates sending a connection request note on LinkedIn.
   */
  async sendInvite(profileUrl: string, note: string): Promise<boolean> {
    console.log(`[LinkedInCollector] Sending connection invite to: ${profileUrl}`);
    let page = await this.browserManager.getPage();

    try {
      const logged = await this.session.isLoggedIn(page);
      if (!logged) {
        await this.session.login(page);
      }

      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Trigger "More" or "Connect" buttons
      const connectBtn = page.locator('button:has-text("Connect")').first();
      if (await connectBtn.isVisible()) {
        await connectBtn.click();
      } else {
        const moreBtn = page.locator('button:has-text("More")').first();
        if (await moreBtn.isVisible()) {
          await moreBtn.click();
          await page.waitForTimeout(1000);
          const connectSubBtn = page.locator('span:has-text("Connect")').first();
          if (await connectSubBtn.isVisible()) {
            await connectSubBtn.click();
          } else {
            await page.close();
            return false;
          }
        } else {
          await page.close();
          return false;
        }
      }

      await page.waitForTimeout(2000);
      const addNoteBtn = page.locator('button:has-text("Add a note")').first();
      if (await addNoteBtn.isVisible()) {
        await addNoteBtn.click();
        await page.waitForTimeout(1000);
        await page.fill('textarea[name="message"]', note);
        await page.click('button:has-text("Send")');
        await page.waitForTimeout(2000);
        await page.close();
        return true;
      }

      await page.close();
      return false;
    } catch (err: any) {
      console.error(`[LinkedInCollector] Invite automation failed:`, err.message);
      await page.close();
      return false;
    }
  }

  /**
   * Scrapes live posts from user homepage feed.
   */
  async scrapeFeed(): Promise<ScrapedPost[]> {
    console.log(`[LinkedInCollector] Scraping feed...`);
    let page = await this.browserManager.getPage();

    try {
      const logged = await this.session.isLoggedIn(page);
      if (!logged) {
        await this.session.login(page);
      }

      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      
      // Scroll to trigger feed loads
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(2000);

      const posts = await this.parser.parseFeed(page);
      await page.close();
      return posts;
    } catch (err: any) {
      console.error(`[LinkedInCollector] Feed scrape failed:`, err.message);
      await page.close();
      return [];
    }
  }
}
