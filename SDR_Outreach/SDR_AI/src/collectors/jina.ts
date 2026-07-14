import dotenv from 'dotenv';
dotenv.config();

export class JinaCollector {
  private apiKey?: string;

  constructor() {
    const rawKey = process.env.JINA_API_KEY || '';
    // Strip double/single quotes and trim whitespace
    this.apiKey = rawKey.replace(/['"]/g, '').trim();
  }

  /**
   * Scrapes the given URL using r.jina.ai and returns the text/markdown content.
   */
  async scrapeUrl(url: string): Promise<string> {
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    const endpoint = `https://r.jina.ai/${targetUrl}`;

    try {
      const headers: Record<string, string> = {
        'Accept': 'text/plain',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      console.log(`[JinaCollector] Scraping: ${targetUrl}`);
      const response = await fetch(endpoint, { headers });
      if (!response.ok) {
        throw new Error(`Jina Reader API returned status ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.warn(`[JinaCollector] Failed to scrape ${url} with Jina:`, error);
      throw error;
    }
  }

  /**
   * Searches the given query using s.jina.ai and returns search result text.
   */
  async search(query: string): Promise<string> {
    const endpoint = `https://s.jina.ai/${encodeURIComponent(query)}`;

    try {
      const headers: Record<string, string> = {
        'Accept': 'text/plain',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      console.log(`[JinaCollector] Searching: "${query}"`);
      const response = await fetch(endpoint, { headers });
      if (!response.ok) {
        throw new Error(`Jina Search API returned status ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.warn(`[JinaCollector] Failed to search "${query}" with Jina:`, error);
      throw error;
    }
  }
}
