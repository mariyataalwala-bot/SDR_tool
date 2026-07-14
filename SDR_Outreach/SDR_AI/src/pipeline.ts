import { SheetsService } from './services/sheets';
import { ResearchService } from './services/research';
import { MarketplaceResearchService } from './services/marketplace';
import { ReputationService } from './services/reputation';
import { LeadScoringAgent } from './services/scoring';
import { EnrichmentCollector } from './collectors/enrichment';
import { VerificationService } from './services/verification';
import { GatekeeperAgent } from './services/gatekeeper';
import { PersonalizationService } from './services/personalization';
import { OutreachAgent } from './services/outreach';
import { CrmService } from './services/crm';
import { prisma } from './database';
import { LinkedInCdpCollector } from './collectors/linkedin';

export interface PipelineExecutionResult {
  brandName: string;
  website: string;
  opportunityScore: number;
  status: 'Approved' | 'Rejected' | 'Filtered';
  reason: string;
  primaryContactEmail?: string;
  logs: string[];
}

export class SdrOrchestratorPipeline {
  private sheets: SheetsService;
  private research: ResearchService;
  private marketplace: MarketplaceResearchService;
  private reputation: ReputationService;
  private scoring: LeadScoringAgent;
  private enrichment: EnrichmentCollector;
  private verification: VerificationService;
  private gatekeeper: GatekeeperAgent;
  private personalization: PersonalizationService;
  private outreach: OutreachAgent;
  private crm: CrmService;
  private linkedin: LinkedInCdpCollector;

  constructor() {
    this.sheets = new SheetsService();
    this.research = new ResearchService();
    this.marketplace = new MarketplaceResearchService();
    this.reputation = new ReputationService();
    this.scoring = new LeadScoringAgent();
    this.enrichment = new EnrichmentCollector();
    this.verification = new VerificationService();
    this.gatekeeper = new GatekeeperAgent();
    this.personalization = new PersonalizationService();
    this.outreach = new OutreachAgent();
    this.crm = new CrmService();
    this.linkedin = new LinkedInCdpCollector();
  }

  /**
   * Runs the full 13-Agent SDR lead research & enrichment pipeline.
   */
  async runPipeline(customLeads?: any[]): Promise<PipelineExecutionResult[]> {
    console.log(`\n======================================================`);
    console.log(`[ORCHESTRATOR] Starting SDR Lead Enrichment Pipeline`);
    console.log(`======================================================\n`);

    const executionResults: PipelineExecutionResult[] = [];

    // 1. Read leads (Sheet Agent)
    const leads = customLeads || await this.sheets.readLeads();
    console.log(`[ORCHESTRATOR] Ingested ${leads.length} leads to process.\n`);

    for (const lead of leads) {
      const logs: string[] = [];
      const log = (msg: string) => {
        console.log(msg);
        logs.push(msg);
      };

      log(`[ORCHESTRATOR] Processing lead: ${lead.brandName} (${lead.website})`);

      try {
        // 2. Import Lead (CRM Agent)
        const company = await this.crm.upsertCompany(lead.brandName, lead.website, lead.industry);
        await this.crm.logPipelineEvent(company.id, 'Lead Imported', `Imported lead from source: ${lead.brandName}`);
        log(`[1. Lead Import Agent] Committed company ID #${company.id} to DB.`);

        // 3. Research Website (Research Agent)
        log(`[2. Research Agent] Crawling & analyzing website: ${lead.website}`);
        const { normalizedResult: profile, urlsVisited, browserDuration } = await this.research.researchCompany(lead.brandName, lead.website, lead.industry);
        log(`[2. Research Agent] Synthesis completed. Industry identified: "${profile.industry}"`);

        // Save research log in PostgreSQL research_logs table
        await prisma.researchLog.create({
          data: {
            searchQuery: lead.brandName,
            urlsVisited: urlsVisited.join(', '),
            extractedFields: JSON.stringify(profile),
            confidence: 95,
            errors: null,
            apiUsage: process.env.GEMINI_API_KEY ? 'Gemini AI API' : 'Local Regexp Scraper',
            browserDuration
          }
        });

        // 4. Audit Marketplaces (Marketplace Agent)
        log(`[3. Marketplace Agent] Auditing eCommerce channels...`);
        const listings = await this.marketplace.auditMarketplaces(lead.brandName, lead.website, profile.marketplaces);
        const activeListings = listings.filter(l => l.active).map(l => l.marketplace);
        log(`[3. Marketplace Agent] Active listings found: [${activeListings.join(', ')}]`);

        // 5. Review Intelligence (Review Intelligence Agent)
        log(`[4. Review Intelligence Agent] Collecting and analyzing sentiment...`);
        const reputation = await this.reputation.analyzeReputation(lead.brandName, lead.website, listings);
        log(`[4. Review Intelligence Agent] Average Rating: ${reputation.averageRating}, Total Reviews: ${reputation.totalReviews}, Weakest Channel: ${reputation.weakestMarketplace}`);

        // Commit Research (CRM Agent)
        await this.crm.saveResearch(company.id, {
          description: profile.companyOverview || undefined,
          category: profile.products ?? undefined,
          activeMarketplaces: activeListings.join(', '),
          reputationRating: reputation.averageRating,
          marketplaceDetails: JSON.stringify({ listings, reputation })
        });
        await this.crm.logPipelineEvent(company.id, 'Research Completed', 'Website, marketplaces and sentiment analyses committed.');

        // Update company industry/hq if scraped
        if (profile.industry || profile.headquarters || profile.employeeCount) {
          await prisma.company.update({
            where: { id: company.id },
            data: {
              industry: (profile.industry ?? company.industry) as string | null,
              headquarters: (profile.headquarters ?? company.headquarters) as string | null,
              employeeCount: (profile.employeeCount ?? company.employeeCount) as number | null
            }
          });
        }

        // 6. Lead Scoring (Lead Scoring Agent)
        log(`[5. Lead Scoring Agent] Calculating opportunity priorities...`);
        const scoreOutput = this.scoring.calculateOpportunityScore(listings, reputation, profile.employeeCount ?? undefined);
        log(`[5. Lead Scoring Agent] Computed Opportunity Score: ${scoreOutput.score}/100.`);
        
        await this.crm.logPipelineEvent(company.id, 'Lead Scored', `Score: ${scoreOutput.score}/100. Reasons: ${scoreOutput.reasons.join(', ')}`);

        // 7. Contact Discovery (Contact Discovery Agent)
        log(`[6. Contact Discovery Agent] Seeking target decision makers...`);
        
        let discoveredContacts: any[] = [];
        
        // Add contacts discovered from live Google Index search
        if (profile.contacts && Array.isArray(profile.contacts)) {
          for (const c of profile.contacts) {
            const nameParts = c.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ');
            const firstName = nameParts[0] || 'contact';
            const lastName = nameParts[nameParts.length - 1] || '';
            const email = lastName 
              ? `${firstName}.${lastName}@${lead.website}`
              : `${firstName}@${lead.website}`;
            
            discoveredContacts.push({
              name: c.name,
              designation: c.title,
              linkedin: c.linkedinUrl,
              email,
              sources: ['AI Google Index Search'],
              confidence: 85
            });
          }
        }

        try {
          log(`[6. Contact Discovery Agent] Attempting actual LinkedIn scrape via CDP remote debugger...`);
          const priorityTitles = ['CEO', 'Founder', 'eCommerce Manager'];
          let lkProfiles = await this.linkedin.searchLeads(lead.brandName, priorityTitles);
          
          if (lkProfiles.length === 0) {
            log(`[6. Contact Discovery Agent] Direct search yielded no profiles. Trying Google Index fallback...`);
            lkProfiles = await this.linkedin.searchLeadsViaGoogle(lead.brandName, priorityTitles);
          }

          if (lkProfiles.length > 0) {
            log(`[6. Contact Discovery Agent] Scraped ${lkProfiles.length} actual contacts from LinkedIn/Google cache!`);
            for (const p of lkProfiles) {
              const nameParts = p.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ');
              const firstName = nameParts[0] || 'contact';
              const lastName = nameParts[nameParts.length - 1] || '';
              const email = lastName 
                ? `${firstName}.${lastName}@${lead.website}`
                : `${firstName}@${lead.website}`;
              
              // Only add if not already in list
              if (!discoveredContacts.some(d => d.name.toLowerCase() === p.name.toLowerCase())) {
                discoveredContacts.push({
                  name: p.name,
                  designation: p.designation,
                  linkedin: p.profileUrl,
                  email,
                  sources: ['LinkedIn/Google Scraper'],
                  confidence: 90
                });
              }
            }
          }
        } catch (cdpErr: any) {
          log(`[6. Contact Discovery Agent] LinkedIn CDP scraper failed or not configured: ${cdpErr.message}.`);
        }

        // Merge or append real contacts from live Hunter/Apollo enrichment APIs
        if (discoveredContacts.length > 0) {
          try {
            log(`[6. Contact Discovery Agent] Enriching decision makers via live APIs...`);
            const enriched = await this.enrichment.discoverContacts(lead.brandName, lead.website);
            for (const c of enriched) {
              const match = discoveredContacts.find(dc => dc.name.toLowerCase() === c.name.toLowerCase());
              if (match) {
                if (c.email) match.email = c.email;
                if (c.phone) match.phone = c.phone;
                match.sources.push(...c.sources);
                match.confidence = Math.max(match.confidence, c.confidence);
              } else {
                discoveredContacts.push({
                  name: c.name,
                  designation: c.designation,
                  linkedin: c.linkedin,
                  email: c.email,
                  phone: c.phone,
                  sources: c.sources,
                  confidence: c.confidence
                });
              }
            }
          } catch (enrichErr: any) {
            log(`[6. Contact Discovery Agent] Enrichment API call failed: ${enrichErr.message}.`);
          }
        }

        log(`[6. Contact Discovery Agent] Discovered ${discoveredContacts.length} target contacts.`);

        let leadStatus: 'Approved' | 'Rejected' | 'Filtered' = 'Filtered';
        let leadReason = 'No prioritized decision makers found.';
        let primaryContactEmail: string | undefined = undefined;

        for (const contact of discoveredContacts) {
          log(`[ORCHESTRATOR] Evaluating contact: ${contact.name} (${contact.designation})`);

          // 8. Contact Verification (Verification Agent)
          log(`[7. Verification Agent] Verifying channels for ${contact.email || contact.name}`);
          const verification = contact.email 
            ? await this.verification.verifyContactEmail(contact.email)
            : { validFormat: false, dnsMxValid: false, hunterValid: false, status: 'Invalid' as any, confidence: 0 };

          // 9. Gatekeeper (Gatekeeper Agent)
          log(`[8. Gatekeeper Agent] Running policy check on ${contact.name}`);
          const gatekeeper = this.gatekeeper.evaluateContact(contact, verification);

          // Save Contact (CRM Agent)
          const savedContact = await this.crm.saveContact(company.id, {
            name: contact.name,
            designation: contact.designation,
            linkedin: contact.linkedin,
            email: contact.email,
            phone: contact.phone,
            sources: contact.sources,
            confidence: contact.confidence,
            additionalNotes: gatekeeper.reason
          });

          await this.crm.logPipelineEvent(
            company.id, 
            gatekeeper.approved ? 'Approved for Outreach' : 'Rejected for Outreach', 
            `Contact ${contact.name} qualified tier ${gatekeeper.tier}: ${gatekeeper.reason}`
          );

          if (gatekeeper.approved) {
            leadStatus = 'Approved';
            leadReason = gatekeeper.reason;
            primaryContactEmail = contact.email;

            // 10. Personalization (Personalization Agent)
            log(`[9. Personalization Agent] Drafting messaging sequence for ${contact.name}...`);
            const copies = await this.personalization.generatePersonalizedCopy(
              contact.name,
              lead.brandName,
              contact.designation,
              profile,
              reputation
            );

            // Update contact with copies
            await prisma.contact.update({
              where: { id: savedContact.id },
              data: {
                connectionNote: copies.connectionNote,
                emailSubject: copies.emailSubject,
                emailBody: copies.emailBody,
                followupSubject: copies.followupSubject,
                followupBody: copies.followupBody,
                additionalNotes: copies.additionalNotes
              }
            });

            // 11. Outreach State Machine Initialize (Outreach Agent)
            log(`[10. Outreach Agent] Triggering event-driven state transitions...`);
            const outreachState = await this.outreach.initializeCampaign(company.id, savedContact.id);
            log(`[10. Outreach Agent] Outreach tracking is now ${outreachState}.`);
            
            // Auto trigger connection request
            const nextState = await this.outreach.sendConnectionRequest(company.id, savedContact.id, copies.connectionNote);
            log(`[10. Outreach Agent] Advanced to state: ${nextState}.`);

            // Break: We only proceed outreach for the primary/best contact
            break;
          } else {
            leadStatus = 'Rejected';
            leadReason = gatekeeper.reason;
          }
        }

        // Update company final outreach status in database
        await prisma.company.update({
          where: { id: company.id },
          data: { status: leadStatus }
        });

        // Mirror result back to sheets
        await this.sheets.mirrorLeadResult(lead.brandName, leadStatus, scoreOutput.score, primaryContactEmail);
        log(`[13. CRM Agent / Sheet Agent] Enriched data mirrored back.`);

        executionResults.push({
          brandName: lead.brandName,
          website: lead.website,
          opportunityScore: scoreOutput.score,
          status: leadStatus,
          reason: leadReason,
          primaryContactEmail,
          logs
        });

      } catch (err: any) {
        log(`[ORCHESTRATOR] Error processing lead ${lead.brandName}: ${err.message}`);
        executionResults.push({
          brandName: lead.brandName,
          website: lead.website,
          opportunityScore: 0,
          status: 'Rejected',
          reason: `Pipeline Failure: ${err.message}`,
          logs
        });
      }
      
      console.log(`\n------------------------------------------------------\n`);
    }

    return executionResults;
  }
}
