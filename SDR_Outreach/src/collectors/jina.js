import { BaseCollector } from './base.js';

export class JinaCollector extends BaseCollector {
  constructor() {
    super();
    this.apiKey = process.env.JINA_API_KEY || "";
    this.timeout = parseInt(process.env.JINA_TIMEOUT || "15000", 10);
  }

  async collect(url, kwargs) {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers = {};
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    console.log(`[JinaCollector] Attempting Jina scrape for: ${url}`);
    
    // Set up request timeout via AbortController
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(jinaUrl, {
        headers,
        signal: controller.signal
      });
      clearTimeout(id);
      
      if (response.status === 200) {
        const text = await response.text();
        console.log(`[JinaCollector] Jina scrape successful for: ${url}`);
        return text;
      } else {
        console.warn(`[JinaCollector] Jina scrape failed with status: ${response.status}`);
        return "";
      }
    } catch (err) {
      clearTimeout(id);
      console.error(`[JinaCollector] Error during Jina scrape for ${url}:`, err.message || err);
      return "";
    }
  }
}
