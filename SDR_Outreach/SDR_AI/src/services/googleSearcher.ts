import { BrowserManager } from './browserManager';
import { JinaCollector } from '../collectors/jina';

export interface GoogleResult {
  title: string;
  url: string;
  snippet: string;
}

export class GoogleSearcher {
  private browserManager: BrowserManager;
  private jina: JinaCollector;
  private searxngUrl: string;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
    this.jina = new JinaCollector();
    // Default to public instance searx.be if not specified in environment
    const rawUrl = process.env.SEARXNG_URL || 'https://searx.be';
    this.searxngUrl = rawUrl.replace(/['"]/g, '').trim().replace(/\/$/, '');
  }

  /**
   * Executes a search on Google, preferring SearXNG for multi-engine JSON results;
   * falls back to Jina, then Playwright.
   */
  async search(query: string, maxResults = 10): Promise<GoogleResult[]> {
    console.log(`[GoogleSearcher] Searching: "${query}"`);

    // 1. Try SearXNG first (returns JSON directly, aggregates DDG, Bing, Brave, Yahoo)
    try {
      const endpoint = `${this.searxngUrl}/search?q=${encodeURIComponent(query)}&format=json`;
      console.log(`[GoogleSearcher] Querying SearXNG: ${endpoint}`);
      
      const response = await globalThis.fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        },
        signal: (AbortSignal as any).timeout(6000)
      } as any);

      if (response.ok) {
        const data = await response.json();
        const results = data.results || [];
        if (results.length > 0) {
          console.log(`[GoogleSearcher] Successfully retrieved ${results.length} search results via SearXNG.`);
          return results.map((r: any) => ({
            title: r.title || 'Search Result',
            url: r.url,
            snippet: r.content || r.snippet || ''
          })).slice(0, maxResults);
        }
      } else {
        console.warn(`[GoogleSearcher] SearXNG returned status ${response.status}`);
      }
    } catch (searxngErr: any) {
      console.warn(`[GoogleSearcher] SearXNG search failed: ${searxngErr.message}. Trying Jina Search fallback.`);
    }

    // 2. Try Jina Search API second (bypasses Google Captchas and returns structured results)
    try {
      const rawText = await this.jina.search(query);
      if (rawText && rawText.length > 100) {
        const parsed = this.parseJinaMarkdown(rawText);
        if (parsed.length > 0) {
          console.log(`[GoogleSearcher] Successfully retrieved ${parsed.length} search results via Jina Search.`);
          return parsed.slice(0, maxResults);
        }
      }
    } catch (jinaErr: any) {
      console.warn(`[GoogleSearcher] Jina Search failed: ${jinaErr.message}. Trying Playwright Google query fallback.`);
    }

    // 3. Fallback: Google HTML Scraper via Playwright
    let page = await this.browserManager.getPage();
    let attempts = 0;
    const maxAttempts = 3;
    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);
        break;
      } catch (err: any) {
        console.warn(`[GoogleSearcher] Attempt ${attempts} failed: ${err.message}`);
        if (attempts >= maxAttempts) {
          await page.close();
          throw new Error(`Google Search failed after ${maxAttempts} attempts: ${err.message}`);
        }
        const waitTime = Math.pow(2, attempts) * 1000;
        await page.waitForTimeout(waitTime);
      }
    }

    try {
      const results = await page.evaluate(() => {
        const items: GoogleResult[] = [];
        const cards = document.querySelectorAll('div.g, div.tF2Cxc, div[data-ved], .yuRUbf, div.MjjYud');
        
        cards.forEach(card => {
          const titleEl = card.querySelector('h3');
          const linkEl = card.querySelector('a');
          const snippetEl = card.querySelector('[style*="webkit-line-clamp"], .VwiC3b, .yD755d, span.aCOp2e');
          
          if (titleEl && linkEl) {
            const href = linkEl.getAttribute('href');
            if (href && href.startsWith('http')) {
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

      console.log(`[GoogleSearcher] Successfully scraped ${results.length} search results.`);
      return results.slice(0, maxResults);
    } catch (err: any) {
      console.error(`[GoogleSearcher] Failed to extract search results:`, err.message);
      return [];
    } finally {
      await page.close();
    }
  }

  /**
   * Helper parser for Jina Search markdown output.
   */
  private parseJinaMarkdown(text: string): GoogleResult[] {
    const results: GoogleResult[] = [];
    const sections = text.split(/\n\s*\n/);

    for (const section of sections) {
      const urlMatch = section.match(/URL:\s*(https?:\/\/[^\s\n]+)/i);
      const titleMatch = section.match(/Title:\s*([^\n]+)/i) || section.match(/^\[\d+\]\s*([^\n]+)/);
      
      if (urlMatch) {
        const url = urlMatch[1].trim();
        const title = titleMatch ? titleMatch[1].trim() : 'Search Result';
        const snippet = section
          .replace(/URL:\s*(https?:\/\/[^\s\n]+)/gi, '')
          .replace(/Title:\s*([^\n]+)/gi, '')
          .trim();
        results.push({ title, url, snippet });
      }
    }

    return results;
  }
}
