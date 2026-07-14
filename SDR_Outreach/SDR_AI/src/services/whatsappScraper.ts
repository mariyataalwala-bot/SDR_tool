import { GoogleSearcher } from './googleSearcher';
import { WebsiteScraper } from './websiteScraper';
import { DbHelper } from './dbHelper';

export interface WhatsAppGroupResult {
  groupName: string;
  groupUrl: string;
  niche: string;
  country: string;
  sourceUrl: string;
  description: string;
  status: 'Valid Format' | 'Verification Pending';
}

export class WhatsAppScraperService {
  private searcher: GoogleSearcher;
  private scraper: WebsiteScraper;

  constructor() {
    this.searcher = new GoogleSearcher();
    this.scraper = new WebsiteScraper();
  }

  /**
   * Validates a WhatsApp invitation code using robust local checks first,
   * then uses direct fetch with abort timeout to avoid blocking or launching browsers.
   */
  private async validateCode(code: string): Promise<{ valid: boolean; name?: string; description?: string; rateLimited?: boolean }> {
    if (!code || code.length < 20 || code.length > 24) {
      return { valid: false };
    }
    
    // Ignore obviously fake/placeholder codes
    const lower = code.toLowerCase();
    if (
      /^(.)\1+$/.test(code) || // 'aaaaaaaaaaaaaaaaaaaa'
      lower.includes('abcdef') || 
      lower.includes('12345') || 
      lower === 'invitecodehere' || 
      lower === 'yourwhatsappcode' ||
      lower.includes('xxxx')
    ) {
      return { valid: false };
    }

    const url = `https://chat.whatsapp.com/invite/${code}`;
    try {
      // Perform a direct fetch with timeout
      const res = await globalThis.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/115.0.0.0'
        },
        signal: (AbortSignal as any).timeout(4000)
      } as any);

      // If we get 429 (Rate Limited)
      if (res.status === 429) {
        return { valid: false, rateLimited: true };
      }

      if (res.status !== 200) {
        return { valid: false };
      }

      const html = await res.text();
      const lowerHtml = html.toLowerCase();

      // Check if page contains error/invalid indicators
      const invalidStrings = [
        'invite link is invalid',
        'link is invalid',
        'check the link and try again',
        'invite link was reset',
        'invite link has expired',
        'link has expired',
        'can\'t join this group',
        'no longer active',
        'group no longer exists'
      ];

      for (const str of invalidStrings) {
        if (lowerHtml.includes(str)) {
          return { valid: false };
        }
      }

      // Extract the real group title from og:title meta property
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
      
      const groupName = ogTitleMatch ? ogTitleMatch[1].trim() : '';
      const lowerName = groupName.toLowerCase();

      // If name is default fallback or missing, it's invalid
      if (
        !groupName || 
        lowerName === 'whatsapp group invite' || 
        lowerName === 'join chat' || 
        lowerName === 'whatsapp' ||
        lowerName.includes('error') ||
        lowerName.includes('invalid') ||
        lowerName.includes('expired')
      ) {
        return { valid: false };
      }

      // Extract description
      const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      const description = ogDescMatch ? ogDescMatch[1].trim() : '';

      return {
        valid: true,
        name: groupName,
        description
      };
    } catch (err: any) {
      console.warn(`[WhatsAppScraperService] Active fetch validation failed for code ${code}:`, err.message);
      // Strictly discard on timeout/errors to avoid fake/dead links
      return { valid: false };
    }
  }

  /**
   * Extracts metadata fields from snippets using smart local heuristics.
   */
  private extractMetadata(snippet: string, text: string, defaultNiche: string, defaultCountry: string): {
    country: string;
    language: string;
    category: string;
    tags: string;
  } {
    const combined = `${snippet} ${text}`.toLowerCase();
    
    // 1. Deduce Language
    let language = 'English';
    if (combined.includes('unirse') || combined.includes('enlace') || combined.includes('grupo de')) {
      language = 'Spanish';
    } else if (combined.includes('rejoindre') || combined.includes('groupe whatsapp')) {
      language = 'French';
    } else if (combined.includes('entrar') || combined.includes('grupo do')) {
      language = 'Portuguese';
    } else if (combined.includes('ग्रुप') || combined.includes('लिंक')) {
      language = 'Hindi';
    } else if (combined.includes('الواتس') || combined.includes('مجموعة')) {
      language = 'Arabic';
    }

    // 2. Deduce Country
    let country = defaultCountry || 'Global';
    const countryMapping: Record<string, string> = {
      'india': 'India',
      'usa': 'United States',
      'united states': 'United States',
      'dubai': 'United Arab Emirates',
      'uae': 'United Arab Emirates',
      'uk': 'United Kingdom',
      'united kingdom': 'United Kingdom',
      'canada': 'Canada',
      'australia': 'Australia',
      'pakistan': 'Pakistan',
      'nigeria': 'Nigeria',
      'germany': 'Germany',
      'brazil': 'Brazil',
      'spain': 'Spain'
    };

    for (const key of Object.keys(countryMapping)) {
      if (combined.includes(key)) {
        country = countryMapping[key];
        break;
      }
    }

    // 3. Deduce Category & Tags
    let category = 'Business & Finance';
    const categoryMapping: Record<string, string> = {
      'crypto': 'Cryptocurrency',
      'bitcoin': 'Cryptocurrency',
      'trading': 'Business & Finance',
      'ecommerce': 'E-Commerce',
      'amazon': 'E-Commerce',
      'shopify': 'E-Commerce',
      'marketing': 'Marketing & Sales',
      'sales': 'Marketing & Sales',
      'developer': 'Technology',
      'coding': 'Technology',
      'gaming': 'Gaming & Entertainment',
      'movies': 'Gaming & Entertainment',
      'education': 'Education',
      'study': 'Education'
    };

    for (const key of Object.keys(categoryMapping)) {
      if (combined.includes(key) || defaultNiche.toLowerCase().includes(key)) {
        category = categoryMapping[key];
        break;
      }
    }

    // Generate tags
    const tagsSet = new Set<string>();
    tagsSet.add(defaultNiche.toLowerCase());
    if (category) tagsSet.add(category.toLowerCase());
    
    // Add extra matches as tags
    ['fba', 'ppc', 'wholesale', 'seo', 'dropshipping', 'investing', 'forex', 'jobs'].forEach(t => {
      if (combined.includes(t)) tagsSet.add(t);
    });

    return {
      country,
      language,
      category,
      tags: Array.from(tagsSet).join(', ')
    };
  }

  /**
   * Discovers WhatsApp Group invitation links based on niche, country, and web search keywords.
   */
  async discoverGroups(niche: string, country: string): Promise<WhatsAppGroupResult[]> {
    console.log(`[WhatsAppScraperService] Finding groups for niche: "${niche}", country: "${country}"`);

    // 1. Construct Search Queries targeting WhatsApp invite directories and platforms
    const queries = [
      `site:chat.whatsapp.com ${niche} ${country}`,
      `site:whatsgrouplink.com ${niche} ${country}`,
      `site:wagrouplinks.net ${niche} ${country}`,
      `site:grouplinkzone.com ${niche} ${country}`,
      `site:findgrouplink.com ${niche} ${country}`,
      `site:reddit.com "chat.whatsapp.com" ${niche} ${country}`,
      `site:medium.com "chat.whatsapp.com" ${niche} ${country}`,
      `site:blogspot.com "chat.whatsapp.com" ${niche} ${country}`,
      `site:github.com "chat.whatsapp.com" ${niche} ${country}`,
      `"chat.whatsapp.com/invite" ${niche} ${country}`
    ];

    const discoveredLinks: Map<string, WhatsAppGroupResult> = new Map();
    const regexInvite = /chat\.whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9_-]{20,24})/gi;

    for (const query of queries) {
      try {
        const searchHits = await this.searcher.search(query, 5);
        
        for (const hit of searchHits) {
          // A. Process direct invite links in search result URLs
          const urlMatch = regexInvite.exec(hit.url);
          if (urlMatch) {
            const code = urlMatch[1];
            if (!discoveredLinks.has(code)) {
              discoveredLinks.set(code, {
                groupName: hit.title.replace(/WhatsApp Group Link/gi, '').split('|')[0].trim(),
                groupUrl: `https://chat.whatsapp.com/invite/${code}`,
                niche,
                country,
                sourceUrl: hit.url,
                description: hit.snippet || 'WhatsApp Group Join Link',
                status: 'Valid Format'
              });
            }
          }
          regexInvite.lastIndex = 0; // Reset regex pointer

          // B. Extract direct invite links from search snippets
          let snippetMatch;
          while ((snippetMatch = regexInvite.exec(hit.snippet)) !== null) {
            const code = snippetMatch[1];
            if (!discoveredLinks.has(code)) {
              discoveredLinks.set(code, {
                groupName: `Group [${niche}] - Code: ${code.substring(0, 5)}`,
                groupUrl: `https://chat.whatsapp.com/invite/${code}`,
                niche,
                country,
                sourceUrl: hit.url,
                description: hit.snippet || 'Discovered in search result snippet.',
                status: 'Valid Format'
              });
            }
          }
          regexInvite.lastIndex = 0; // Reset regex pointer

          // C. If the result is a directory page (not a direct whatsapp.com link), crawl it to find embedded group invites
          if (!hit.url.includes('whatsapp.com')) {
            console.log(`[WhatsAppScraperService] Crawling directory page to extract group links: ${hit.url}`);
            try {
              const pageContent = await this.scraper.scrape(hit.url);
              let pageMatch;
              while ((pageMatch = regexInvite.exec(pageContent)) !== null) {
                const code = pageMatch[1];
                if (!discoveredLinks.has(code)) {
                  const idx = pageMatch.index;
                  const surroundingText = pageContent.substring(Math.max(0, idx - 60), Math.min(pageContent.length, idx + 100))
                    .replace(/[\n\r]+/g, ' ')
                    .trim();
                  
                  const groupTitleMatch = surroundingText.match(/([a-zA-Z0-9\s-]{5,30})/);
                  const parsedTitle = groupTitleMatch ? groupTitleMatch[1].trim() : `Group [${niche}]`;

                  discoveredLinks.set(code, {
                    groupName: parsedTitle,
                    groupUrl: `https://chat.whatsapp.com/invite/${code}`,
                    niche,
                    country,
                    sourceUrl: hit.url,
                    description: `Extracted from directory context: "...${surroundingText.substring(0, 100)}..."`,
                    status: 'Valid Format'
                  });
                }
              }
            } catch (crawlErr) {
              console.warn(`[WhatsAppScraperService] Failed to scrape directory page ${hit.url}:`, crawlErr);
            }
            regexInvite.lastIndex = 0; // Reset regex pointer
          }
        }
      } catch (err: any) {
        console.warn(`[WhatsAppScraperService] Query execution failed for: "${query}":`, err.message);
      }
    }

    const rawResults = Array.from(discoveredLinks.values()).slice(0, 45); // Limit max validated candidates per run to avoid spamming
    console.log(`[WhatsAppScraperService] Ingested ${rawResults.length} raw candidates. Validating and saving...`);

    const verifiedResults: WhatsAppGroupResult[] = [];
    let rateLimited = false;

    for (const item of rawResults) {
      const codeMatch = item.groupUrl.match(/chat\.whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9_-]{20,24})/i);
      if (!codeMatch) continue;
      
      const code = codeMatch[1];

      if (rateLimited) {
        // Skip calling WhatsApp servers if already rate-limited in this batch to protect IP
        const meta = this.extractMetadata(item.description, '', niche, country);
        const groupData = {
          title: item.groupName,
          inviteLink: item.groupUrl,
          description: item.description,
          country: meta.country,
          language: meta.language,
          category: meta.category,
          tags: meta.tags,
          source: item.sourceUrl,
          active: true // Fallback to active but unverified
        };
        await DbHelper.saveWhatsAppGroup(groupData);
        verifiedResults.push({
          ...item,
          status: 'Verification Pending'
        });
        continue;
      }

      const check = await this.validateCode(code);

      if (check.rateLimited) {
        rateLimited = true;
        console.warn(`[WhatsAppScraperService] Hit WhatsApp Rate Limit (429). Suspending active checks for this batch.`);
        const meta = this.extractMetadata(item.description, '', niche, country);
        await DbHelper.saveWhatsAppGroup({
          title: item.groupName,
          inviteLink: item.groupUrl,
          description: item.description,
          country: meta.country,
          language: meta.language,
          category: meta.category,
          tags: meta.tags,
          source: item.sourceUrl,
          active: true
        });
        verifiedResults.push({
          ...item,
          status: 'Verification Pending'
        });
        continue;
      }

      if (check.valid) {
        const meta = this.extractMetadata(item.description, check.description || '', niche, country);
        
        const groupData = {
          title: check.name || item.groupName,
          inviteLink: item.groupUrl,
          description: check.description || item.description,
          country: meta.country,
          language: meta.language,
          category: meta.category,
          tags: meta.tags,
          source: item.sourceUrl,
          active: true
        };

        const saved = await DbHelper.saveWhatsAppGroup(groupData);

        verifiedResults.push({
          ...item,
          groupName: saved.title,
          description: saved.description || item.description,
          status: 'Valid Format'
        });
      } else {
        console.log(`[WhatsAppScraperService] Filtered fake/invalid lead: ${item.groupUrl}`);
        await DbHelper.saveWhatsAppGroup({
          title: item.groupName,
          inviteLink: item.groupUrl,
          description: item.description,
          source: item.sourceUrl,
          active: false
        });
      }

      // Add a 200ms delay to space out sequential checks and avoid rate-limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[WhatsAppScraperService] Validation complete. Retained ${verifiedResults.length}/${rawResults.length} active groups.`);
    return verifiedResults;
  }
}
