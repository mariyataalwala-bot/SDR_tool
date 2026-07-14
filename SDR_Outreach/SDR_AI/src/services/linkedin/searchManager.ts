import { Page } from 'playwright';

export class SearchManager {
  /**
   * Performs standard query search for people on LinkedIn.
   */
  async navigateToPeopleSearch(page: Page, companyName: string, titles: string[]): Promise<void> {
    const query = encodeURIComponent(`"${companyName}" AND (${titles.join(' OR ')})`);
    const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${query}`;
    console.log(`[LinkedIn SearchManager] Accessing: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Scroll to the bottom of the page to trigger dynamic content loading
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);
  }

  /**
   * Navigates to target company details page on LinkedIn.
   */
  async navigateToCompanyAbout(page: Page, companyUrl: string): Promise<void> {
    const aboutUrl = companyUrl.endsWith('/') ? `${companyUrl}about/` : `${companyUrl}/about/`;
    console.log(`[LinkedIn SearchManager] Accessing Company About: ${aboutUrl}`);
    await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
  }
}
