import dotenv from 'dotenv';

dotenv.config();

export interface RawContact {
  name: string;
  designation: string;
  linkedin?: string;
  email?: string;
  phone?: string;
  source: string;
  sourceConfidence: number; // 0 to 1 decimal confidence
}

export interface MergedContact {
  name: string;
  designation: string;
  linkedin?: string;
  email?: string;
  phone?: string;
  sources: string[];
  confidence: number; // 0 to 100 percentage confidence
}

export class EnrichmentCollector {
  private apolloKey?: string;
  private hunterKey?: string;

  constructor() {
    this.apolloKey = process.env.APOLLO_API_KEY;
    this.hunterKey = process.env.HUNTER_API_KEY;
  }

  /**
   * Discovers contacts for a given company name and website domain using real API calls.
   * If no API keys are configured, it returns an empty array to comply with the NO MOCK DATA rule.
   */
  async discoverContacts(companyName: string, domain: string): Promise<MergedContact[]> {
    console.log(`[EnrichmentCollector] Querying contact APIs for ${companyName} (${domain})`);

    const rawContacts: RawContact[] = [];

    // 1. Apollo API search integration
    if (this.apolloKey && this.apolloKey !== 'mock_key_for_testing' && this.apolloKey !== '') {
      try {
        console.log(`[EnrichmentCollector] Calling live Apollo API search for domain: ${domain}`);
        const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: this.apolloKey,
            q_organization_domains: domain,
            person_titles: ['ceo', 'founder', 'ecommerce manager', 'e-commerce manager', 'managing director', 'co-founder']
          })
        });
        if (res.ok) {
          const json = await res.json() as any;
          if (json && json.people) {
            for (const person of json.people) {
              rawContacts.push({
                name: `${person.first_name || ''} ${person.last_name || ''}`.trim(),
                designation: person.title || 'Executive',
                email: person.email || undefined,
                linkedin: person.linkedin_url || undefined,
                source: 'Apollo',
                sourceConfidence: person.email_status === 'verified' ? 0.95 : 0.70
              });
            }
          }
        }
      } catch (err: any) {
        console.error(`[EnrichmentCollector] Apollo API search failed:`, err.message);
      }
    }

    // 2. Hunter API search integration
    if (this.hunterKey && this.hunterKey !== 'mock_key_for_testing' && this.hunterKey !== '') {
      try {
        console.log(`[EnrichmentCollector] Calling live Hunter API domain search for domain: ${domain}`);
        const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${this.hunterKey}`);
        if (res.ok) {
          const json = await res.json() as any;
          const data = json.data;
          if (data && data.emails) {
            for (const emailObj of data.emails) {
              rawContacts.push({
                name: `${emailObj.first_name || ''} ${emailObj.last_name || ''}`.trim() || 'Contact',
                designation: emailObj.position || 'Employee',
                email: emailObj.value || undefined,
                linkedin: emailObj.linkedin || undefined,
                phone: emailObj.phone_number || undefined,
                source: 'Hunter',
                sourceConfidence: (emailObj.confidence || 90) / 100
              });
            }
          }
        }
      } catch (err: any) {
        console.error(`[EnrichmentCollector] Hunter API domain search failed:`, err.message);
      }
    }

    if (rawContacts.length === 0) {
      console.log(`[EnrichmentCollector] No API keys configured or no contacts returned for ${domain}. Skipping enrichment fallbacks.`);
      return [];
    }

    return this.mergeAndCalculateConfidence(rawContacts);
  }

  /**
   * Merges contacts with same email or name, applying:
   * C_combined = 1 - Product(1 - C_i)
   */
  private mergeAndCalculateConfidence(rawContacts: RawContact[]): MergedContact[] {
    const mergedMap = new Map<string, {
      name: string;
      designation: string;
      linkedin?: string;
      phone?: string;
      sources: string[];
      confidences: number[];
    }>();

    for (const contact of rawContacts) {
      const key = contact.email ? contact.email.toLowerCase() : `name_${contact.name.toLowerCase().replace(/\s+/g, '_')}`;
      
      const existing = mergedMap.get(key);
      if (existing) {
        existing.sources.push(contact.source);
        existing.confidences.push(contact.sourceConfidence);
        if (contact.linkedin) existing.linkedin = contact.linkedin;
        if (contact.phone) existing.phone = contact.phone;
      } else {
        mergedMap.set(key, {
          name: contact.name,
          designation: contact.designation,
          linkedin: contact.linkedin,
          phone: contact.phone,
          sources: [contact.source],
          confidences: [contact.sourceConfidence]
        });
      }
    }

    const mergedContacts: MergedContact[] = [];

    for (const [key, val] of mergedMap.entries()) {
      let productOfComplements = 1;
      for (const conf of val.confidences) {
        productOfComplements *= (1 - conf);
      }
      const combinedConfidenceDecimal = 1 - productOfComplements;
      const confidencePercentage = Math.round(combinedConfidenceDecimal * 100);

      mergedContacts.push({
        name: val.name,
        designation: val.designation,
        linkedin: val.linkedin,
        email: key.startsWith('name_') ? undefined : key,
        phone: val.phone,
        sources: Array.from(new Set(val.sources)),
        confidence: confidencePercentage
      });
    }

    return mergedContacts.sort((a, b) => b.confidence - a.confidence);
  }
}
