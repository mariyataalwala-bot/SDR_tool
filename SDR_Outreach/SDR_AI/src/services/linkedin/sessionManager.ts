import { Page } from 'playwright';

export class SessionManager {
  private email?: string;
  private password?: string;

  constructor() {
    this.email = process.env.LINKEDIN_EMAIL;
    this.password = process.env.LINKEDIN_PASSWORD;
  }

  /**
   * Verifies if session is currently authenticated.
   */
  async isLoggedIn(page: Page): Promise<boolean> {
    try {
      console.log(`[LinkedIn SessionManager] Checking auth status...`);
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork')) {
        console.log(`[LinkedIn SessionManager] Verified: Session is authenticated.`);
        return true;
      }
      return false;
    } catch (e: any) {
      console.warn(`[LinkedIn SessionManager] Verification failed:`, e.message);
      return false;
    }
  }

  /**
   * Performs manual authentication workflow.
   */
  async login(page: Page): Promise<boolean> {
    if (!this.email || !this.password) {
      console.warn(`[LinkedIn SessionManager] No credentials loaded in environment! Cannot automate login.`);
      return false;
    }

    try {
      console.log(`[LinkedIn SessionManager] Performing automated credentials login...`);
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      // Handle cases where the browser auto-logs in or redirects to feed immediately
      const currentUrl = page.url();
      if (currentUrl.includes('/feed') || currentUrl.includes('/mynetwork') || currentUrl.includes('/feed/')) {
        console.log(`[LinkedIn SessionManager] Redirected to feed. Re-using active authenticated session.`);
        return true;
      }

      await page.fill('#username', this.email);
      await page.fill('#password', this.password);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(5000);

      const success = await this.isLoggedIn(page);
      if (!success) {
        console.log(`[LinkedIn SessionManager] Security challenge detected. Please solve 2FA manually in head session.`);
      }
      return success;
    } catch (err: any) {
      console.error(`[LinkedIn SessionManager] Login process failed:`, err.message);
      return false;
    }
  }
}
