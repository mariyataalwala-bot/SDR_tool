import { Page } from 'playwright';

export interface ScrapedProfile {
  name: string;
  designation: string;
  profileUrl: string;
}

export interface ScrapedPost {
  author: string;
  description: string;
  textContent: string;
  scrapedAt: string;
}

export class ProfileParser {
  /**
   * Extract profiles from People Search page DOM.
   */
  async parsePeopleSearch(page: Page): Promise<ScrapedProfile[]> {
    return page.evaluate(() => {
      const results: ScrapedProfile[] = [];
      
      const cardSelectors = [
        '.reusable-search__result-container',
        '.search-results__list-item',
        '.entity-result',
        '.entity-result__item',
        '.search-result__wrapper'
      ];
      
      let cards: Element[] = [];
      for (const sel of cardSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) {
          cards = Array.from(found);
          break;
        }
      }
      
      cards.forEach(card => {
        const titleEl = card.querySelector('.entity-result__title-text a, .search-result__info a, .app-aware-link, a[href*="/in/"]');
        const descEl = card.querySelector('.entity-result__primary-subtitle, .search-result__info .subline-level-1, .entity-result__badge-line, .entity-result__summary');
        
        if (titleEl) {
          const href = (titleEl as HTMLAnchorElement).href;
          const fullTitleText = (titleEl as HTMLElement).innerText;
          const name = fullTitleText.split('\n')[0]?.split(',')[0]?.trim() || '';
          
          let designation = 'Executive';
          if (descEl) {
            designation = (descEl as HTMLElement).innerText.trim();
          }

          if (name && !name.includes('LinkedIn Member') && href.includes('/in/')) {
            results.push({
              name,
              designation,
              profileUrl: href.split('?')[0]
            });
          }
        }
      });
      return results;
    });
  }

  /**
   * Extract details from Company Profile page DOM.
   */
  async parseCompanyProfile(page: Page): Promise<{ industry?: string, employeeCount?: number, headquarters?: string }> {
    return page.evaluate(() => {
      let industry: string | undefined;
      let employeeCount: number | undefined;
      let headquarters: string | undefined;

      const items = document.querySelectorAll('.org-top-card-summary-info-list__info-item');
      items.forEach(el => {
        const txt = (el as HTMLElement).innerText.trim();
        if (txt.includes('employees')) {
          const match = txt.replace(/[^0-9]/g, '');
          if (match) employeeCount = parseInt(match, 10);
        } else if (txt.length > 3 && !txt.includes('http')) {
          if (!industry) {
            industry = txt;
          } else {
            headquarters = txt;
          }
        }
      });

      return { industry, employeeCount, headquarters };
    });
  }

  /**
   * Extract networking feed posts from Feed Page DOM.
   */
  async parseFeed(page: Page): Promise<ScrapedPost[]> {
    return page.evaluate(() => {
      const results: ScrapedPost[] = [];
      const cards = document.querySelectorAll('[data-urn]');
      
      cards.forEach(card => {
        const authorEl = card.querySelector('.update-components-actor__title span[aria-hidden="true"], .feed-shared-actor__title');
        const descEl = card.querySelector('.update-components-actor__description, .feed-shared-actor__description');
        const contentEl = card.querySelector('.update-components-text, .feed-shared-update-v2__commentary, .feed-shared-text');

        if (authorEl) {
          const author = (authorEl as HTMLElement).innerText.trim();
          const description = descEl ? (descEl as HTMLElement).innerText.trim() : '';
          const textContent = contentEl ? (contentEl as HTMLElement).innerText.trim() : '';

          if (author && (textContent || description)) {
            if (!results.some(r => r.author === author && r.textContent === textContent)) {
              results.push({
                author,
                description,
                textContent,
                scrapedAt: new Date().toISOString()
              });
            }
          }
        }
      });
      return results;
    });
  }
}
