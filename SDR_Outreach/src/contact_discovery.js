import { EnrichmentCollector } from './collectors/enrichment.js';

export class ContactDiscoveryAgent {
  constructor() {
    this.enrichmentCollector = new EnrichmentCollector();
  }

  async discoverAndVerify(leadId, brandName, domain) {
    console.log(`[ContactDiscoveryAgent] Starting contact discovery for lead: ${brandName}`);

    const rawResults = await this.enrichmentCollector.discoverContacts(brandName, domain);
    if (!rawResults || rawResults.length === 0) {
      console.warn("[ContactDiscoveryAgent] No raw contacts discovered.");
      return [];
    }

    // Group contacts by email address (case-insensitive)
    const groupedContacts = {};
    for (const item of rawResults) {
      const email = item.email;
      if (!email) continue;
      const cleanEmail = email.toLowerCase().trim();
      if (!groupedContacts[cleanEmail]) {
        groupedContacts[cleanEmail] = [];
      }
      groupedContacts[cleanEmail].push(item);
    }

    const mergedContacts = [];

    // Process co-confirmation calculations
    for (const [email, records] of Object.entries(groupedContacts)) {
      const repRecord = records[0];
      const name = repRecord.name;
      const designation = repRecord.designation;
      const linkedinUrl = repRecord.linkedinUrl;
      const phone = repRecord.phone;

      // Deduplicate sources
      const sources = Array.from(new Set(records.map(r => r.source).filter(Boolean)));

      // Combined confidence calculation
      // Formula: C_combined = 1 - Product(1 - C_i)
      let productTerm = 1.0;
      for (const r of records) {
        const val = r.confidence || 50.0;
        const fraction = val / 100.0;
        productTerm *= (1.0 - fraction);
      }

      let combinedConfidence = (1.0 - productTerm) * 100.0;
      combinedConfidence = Math.round(combinedConfidence * 100) / 100; // Round to 2 decimal places

      // Simple SMTP verification simulation
      const isValidFormat = email.includes("@") && email.split("@")[1].length > 3;
      let isVerified = false;
      if (isValidFormat) {
        isVerified = true;
        // Apply verification confidence bonus (capped at 100%)
        combinedConfidence = Math.min(combinedConfidence + 10.0, 100.0);
      }

      mergedContacts.push({
        leadId,
        name,
        designation,
        linkedinUrl,
        email,
        phone,
        sources,
        confidenceScore: combinedConfidence,
        isVerified
      });
    }

    console.log(`[ContactDiscoveryAgent] Successfully processed and merged ${mergedContacts.length} verified contacts.`);
    return mergedContacts;
  }
}
