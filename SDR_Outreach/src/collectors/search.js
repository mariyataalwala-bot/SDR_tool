import { BaseCollector } from './base.js';

export class SearchCollector extends BaseCollector {
  constructor() {
    super();
    this.apiKey = process.env.JINA_API_KEY || "";
    this.timeout = parseInt(process.env.JINA_TIMEOUT || "15000", 10);
  }

  async collect(query, kwargs) {
    // 1. Try Jina Search API if key is present
    if (this.apiKey) {
      const jinaSearchUrl = `https://s.jina.ai/${encodeURIComponent(query)}`;
      const headers = { "Authorization": `Bearer ${this.apiKey}` };
      console.log(`[SearchCollector] Attempting Jina Search query: ${query}`);

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(jinaSearchUrl, { headers, signal: controller.signal });
        clearTimeout(id);
        if (response.status === 200) {
          const text = await response.text();
          console.log(`[SearchCollector] Jina Search successful for: ${query}`);
          return text;
        }
      } catch (err) {
        clearTimeout(id);
        console.error(`[SearchCollector] Error during Jina Search for '${query}':`, err.message || err);
      }
    }

    // 2. Fallback to DuckDuckGo HTML Scraper
    console.log(`[SearchCollector] Attempting DuckDuckGo scrape for query: ${query}`);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    };

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(ddgUrl, { headers, signal: controller.signal });
      clearTimeout(id);

      if (response.status === 200) {
        const html = await response.text();
        
        // Simple regex parser to extract DuckDuckGo results
        // DDG has structure: <a class="result__snippet" ...>...</a>
        // And results url: <a class="result__url" href="URL">...</a>
        const results = [];
        const resultBlockRegex = /<div class="result[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
        let match;
        
        while ((match = resultBlockRegex.exec(html)) !== null) {
          const block = match[1];
          
          // Extract href and title
          const urlMatch = /<a[^>]+class="[a-zA-Z0-9_-]*result__url"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
          const snippetMatch = /<a[^>]+class="[a-zA-Z0-9_-]*result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
          
          if (urlMatch) {
            const url = urlMatch[1];
            const title = urlMatch[2].replace(/<[^>]*>/g, '').trim();
            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : "No Snippet available.";
            results.push(`### ${title}\nURL: ${url}\nSnippet: ${snippet}\n`);
          }
        }

        console.log(`[SearchCollector] DuckDuckGo search successful. Found ${results.length} results.`);
        return results.join("\n");
      } else {
        console.warn(`[SearchCollector] DuckDuckGo search failed. Status: ${response.status}`);
        return "";
      }
    } catch (err) {
      clearTimeout(id);
      console.error(`[SearchCollector] Error during DuckDuckGo search for '${query}':`, err.message || err);
      return "";
    }
  }
}
