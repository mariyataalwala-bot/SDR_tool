import { prisma, checkDbHealth } from '../database';
import { WebsiteScraper } from './websiteScraper';
import { GoogleSearcher } from './googleSearcher';
import { MarketplaceResearch } from './marketplaceResearch';
import { LinkedInCollector } from './linkedin/collector';
import { AINormalizer, NormalizedProfile } from './aiNormalizer';
import { VerificationService } from './verification';
import { GatekeeperAgent } from './gatekeeper';
import { PersonalizationService } from './personalization';
import { OutreachAgent } from './outreach';
import { LoggerService } from './logger';
import { DbHelper } from './dbHelper';

export interface OrchestratorResult {
  status: 'Completed' | 'Failed';
  companyId?: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

export class ResearchOrchestrator {
  private scraper: WebsiteScraper;
  private searcher: GoogleSearcher;
  private marketplace: MarketplaceResearch;
  private linkedin: LinkedInCollector;
  private normalizer: AINormalizer;
  private verification: VerificationService;
  private gatekeeper: GatekeeperAgent;
  private personalization: PersonalizationService;
  private outreach: OutreachAgent;

  constructor() {
    this.scraper = new WebsiteScraper();
    this.searcher = new GoogleSearcher();
    this.marketplace = new MarketplaceResearch();
    this.linkedin = new LinkedInCollector();
    this.normalizer = new AINormalizer();
    this.verification = new VerificationService();
    this.gatekeeper = new GatekeeperAgent();
    this.personalization = new PersonalizationService();
    this.outreach = new OutreachAgent();
  }

  /**
   * Run the concurrent research and SDR qualification pipeline for a brand.
   */
  async runPipelineForBrand(brandName: string, website: string, customIndustry?: string): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const warnings: string[] = [];
    const errors: string[] = [];

    console.log(`\n======================================================`);
    console.log(`[ORCHESTRATOR] Initiating lead pipeline for: ${brandName}`);
    console.log(`======================================================\n`);

    // 1. Initial State: Queued
    let company: any;
    try {
      const companies = await DbHelper.getCompanies();
      company = companies.find(c => c.name.toLowerCase() === brandName.toLowerCase() || c.website.toLowerCase() === website.toLowerCase());

      if (!company) {
        company = await DbHelper.upsertCompany(brandName, website, customIndustry);
      }
    } catch (err: any) {
      console.warn(`[ORCHESTRATOR] Initial database read/write failed, using temporary local company object:`, err.message);
      company = {
        id: 9999,
        name: brandName,
        website,
        industry: customIndustry || null,
        status: 'NEW',
        researches: [],
        contacts: []
      };
    }

    await LoggerService.logPipelineState(company.id, 'Queued', 'Added lead to research queue.');

    // 2. Cache Validation Check (7-Day TTL)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const hasRecentResearch = company.researches && company.researches.length > 0 && 
                              new Date(company.updatedAt || company.createdAt) > sevenDaysAgo;

    if (hasRecentResearch) {
      console.log(`[ORCHESTRATOR] 7-day Cache Hit! Skipping live crawls for ${brandName}.`);
      await LoggerService.logPipelineState(company.id, 'Persisted', 'Researched loaded from local database cache (7-day TTL).');
      await LoggerService.logPipelineState(company.id, 'Completed', 'Pipeline completed successfully via cache.');
      
      return {
        status: 'Completed',
        companyId: company.id,
        warnings: ['Loaded from database cache'],
        errors: [],
        durationMs: Date.now() - startTime
      };
    }

    // 3. State transition: Research
    await LoggerService.logPipelineState(company.id, 'Research', 'Initiating live concurrent search queries.');

    // 4. Concurrent execution of crawls using Promise.all
    let rawWebText = '';
    let searchSnippetText = '';
    let marketplaceResults: any[] = [];
    let discoveredProfiles: any[] = [];

    try {
      await LoggerService.logPipelineState(company.id, 'Website', 'Crawling company web pages and running marketplace search...');
      
      const homepageScrapePromise = this.scraper.scrape(`https://${website}`).catch(e => {
        warnings.push(`Homepage scrape failed: ${e.message}`);
        return '';
      });

      const searchPromise = this.searcher.search(`${brandName} official website`, 5).then(res => 
        res.map(r => `${r.title}: ${r.snippet}`).join('\n')
      ).catch(e => {
        warnings.push(`Search indexing failed: ${e.message}`);
        return '';
      });

      const marketplacePromise = this.marketplace.auditMarketplaces(brandName).catch(e => {
        warnings.push(`Marketplace audits failed: ${e.message}`);
        return [];
      });

      const linkedinPromise = this.linkedin.discoverContacts(brandName, ['CEO', 'Founder', 'eCommerce Manager']).catch(e => {
        warnings.push(`LinkedIn discovery failed: ${e.message}`);
        return [];
      });

      // Await all concurrently
      const [webText, snippets, audits, lkProfiles] = await Promise.all([
        homepageScrapePromise,
        searchPromise,
        marketplacePromise,
        linkedinPromise
      ]);

      rawWebText = webText;
      searchSnippetText = snippets;
      marketplaceResults = audits;
      discoveredProfiles = lkProfiles;

    } catch (err: any) {
      errors.push(`Critical concurrent crawl failure: ${err.message}`);
      await LoggerService.logPipelineState(company.id, 'Failed', `Crawl phase failed: ${err.message}`);
      await LoggerService.logError('ResearchOrchestrator', err.message, err.stack);
      
      return {
        status: 'Failed',
        companyId: company.id,
        warnings,
        errors,
        durationMs: Date.now() - startTime
      };
    }

    // 5. State transition: Normalization
    await LoggerService.logPipelineState(company.id, 'Normalization', 'Feeding crawl payloads to AI model normalizer...');
    
    let profile: NormalizedProfile;
    try {
      const payloads = [rawWebText, searchSnippetText, JSON.stringify(marketplaceResults)];
      profile = await this.normalizer.normalize(brandName, website, payloads);
    } catch (err: any) {
      errors.push(`AI Normalization failed: ${err.message}`);
      await LoggerService.logPipelineState(company.id, 'Failed', `Normalization phase failed: ${err.message}`);
      await LoggerService.logError('ResearchOrchestrator', err.message, err.stack);
      
      return {
        status: 'Failed',
        companyId: company.id,
        warnings,
        errors,
        durationMs: Date.now() - startTime
      };
    }

    // Merge Google search contacts with scraped contacts
    const candidateContacts = [...discoveredProfiles];
    if (profile.contacts && Array.isArray(profile.contacts)) {
      for (const c of profile.contacts) {
        if (!candidateContacts.some(existing => existing.name.toLowerCase() === c.name.toLowerCase())) {
          candidateContacts.push({
            name: c.name,
            designation: c.title,
            profileUrl: c.linkedinUrl
          });
        }
      }
    }

    // 6. State transition: Verification (Email and Gatekeeper)
    await LoggerService.logPipelineState(company.id, 'Verification', 'Verifying decision maker emails and qualifying outreach...');
    
    const verifiedContacts: any[] = [];
    for (const rawC of candidateContacts) {
      const nameParts = rawC.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ');
      const firstName = nameParts[0] || 'contact';
      const lastName = nameParts[nameParts.length - 1] || '';
      const email = lastName 
        ? `${firstName}.${lastName}@${website}`
        : `${firstName}@${website}`;

      const verificationResult = await this.verification.verifyContactEmail(email);
      const contactObj = {
        name: rawC.name,
        designation: rawC.designation,
        linkedin: rawC.profileUrl,
        email,
        sources: ['LinkedIn/Google Crawler'],
        confidence: 85
      };

      const gkResult = this.gatekeeper.evaluateContact(contactObj, verificationResult);
      if (gkResult.approved) {
        const copy = await this.personalization.generatePersonalizedCopy(
          rawC.name,
          brandName,
          rawC.designation,
          {
            companyOverview: profile.companyOverview,
            products: profile.products,
            marketplacePresence: JSON.stringify(marketplaceResults),
            customerPainPoints: profile.customerPainPoints,
            reviewAnalysis: profile.reviewAnalysis,
            competitors: profile.competitors,
            whyNeedReviewManagement: profile.whyNeedReviewManagement,
            personalizedSalesAngle: profile.personalizedSalesAngle,
            marketplaces: []
          },
          {
            averageRating: marketplaceResults.reduce((acc, m) => acc + (m.rating || 0), 0) / (marketplaceResults.filter(m => m.active).length || 1),
            totalReviews: marketplaceResults.reduce((acc, m) => acc + (m.reviewsCount || 0), 0),
            weakestMarketplace: marketplaceResults.find(m => m.active && m.rating < 4.2)?.marketplace || 'Amazon',
            complaints: [],
            affectedProducts: [],
            sentimentTrend: 'worsening',
            reviewsUnanswered: true,
            mentionsQuality: true,
            mentionsPackaging: true,
            mentionsDelivery: true
          }
        );

        verifiedContacts.push({
          ...contactObj,
          connectionNote: copy.connectionNote,
          emailSubject: copy.emailSubject,
          emailBody: copy.emailBody,
          followupSubject: copy.followupSubject,
          followupBody: copy.followupBody
        });
      }
    }

    // 7. State transition: Persisted
    await LoggerService.logPipelineState(company.id, 'Persisted', 'Syncing normalized details to database tables...');

    try {
      const dbConnected = await checkDbHealth();
      if (dbConnected) {
        // Execute DB sync as a transactional unit on PostgreSQL
        await prisma.$transaction(async (tx) => {
          await tx.company.update({
            where: { id: company.id },
            data: {
              industry: profile.industry || company.industry,
              headquarters: profile.headquarters || company.headquarters,
              employeeCount: profile.employeeCount || company.employeeCount,
              status: verifiedContacts.length > 0 ? 'Approved' : 'Filtered'
            }
          });

          await tx.research.create({
            data: {
              companyId: company.id,
              description: profile.companyOverview,
              category: profile.products,
              activeMarketplaces: marketplaceResults.filter(m => m.active).map(m => m.marketplace).join(', '),
              reputationRating: marketplaceResults.reduce((acc, m) => acc + (m.rating || 0), 0) / (marketplaceResults.filter(m => m.active).length || 1),
              marketplaceDetails: JSON.stringify({ listings: marketplaceResults, profile })
            }
          });

          for (const contact of verifiedContacts) {
            await tx.contact.upsert({
              where: {
                companyId_email: {
                  companyId: company.id,
                  email: contact.email
                }
              },
              update: {
                designation: contact.designation,
                linkedin: contact.linkedin,
                connectionNote: contact.connectionNote,
                emailSubject: contact.emailSubject,
                emailBody: contact.emailBody,
                followupSubject: contact.followupSubject,
                followupBody: contact.followupBody
              },
              create: {
                companyId: company.id,
                name: contact.name,
                designation: contact.designation,
                linkedin: contact.linkedin,
                email: contact.email,
                sources: contact.sources.join(', '),
                confidence: contact.confidence,
                connectionNote: contact.connectionNote,
                emailSubject: contact.emailSubject,
                emailBody: contact.emailBody,
                followupSubject: contact.followupSubject,
                followupBody: contact.followupBody
              }
            });
          }

          await tx.pipeline.create({
            data: {
              companyId: company.id,
              stage: verifiedContacts.length > 0 ? 'Approved for Outreach' : 'Filtered',
              comments: `Pipeline completed. Discovered ${verifiedContacts.length} qualified contacts.`
            }
          });
        });
      } else {
        // Fallback to writing using the local DbHelper file mapping adapter
        await DbHelper.updateCompany(company.id, {
          industry: profile.industry || company.industry,
          headquarters: profile.headquarters || company.headquarters,
          employeeCount: profile.employeeCount || company.employeeCount,
          status: verifiedContacts.length > 0 ? 'Approved' : 'Filtered'
        });

        await DbHelper.saveResearch(company.id, {
          description: profile.companyOverview,
          category: profile.products,
          activeMarketplaces: marketplaceResults.filter(m => m.active).map(m => m.marketplace).join(', '),
          reputationRating: marketplaceResults.reduce((acc, m) => acc + (m.rating || 0), 0) / (marketplaceResults.filter(m => m.active).length || 1),
          marketplaceDetails: JSON.stringify({ listings: marketplaceResults, profile })
        });

        for (const contact of verifiedContacts) {
          await DbHelper.upsertContact(company.id, contact.email, {
            name: contact.name,
            designation: contact.designation,
            linkedin: contact.linkedin,
            sources: contact.sources.join(', '),
            confidence: contact.confidence,
            connectionNote: contact.connectionNote,
            emailSubject: contact.emailSubject,
            emailBody: contact.emailBody,
            followupSubject: contact.followupSubject,
            followupBody: contact.followupBody
          });
        }

        await DbHelper.logPipelineEvent(company.id, verifiedContacts.length > 0 ? 'Approved for Outreach' : 'Filtered', `Pipeline completed. Discovered ${verifiedContacts.length} qualified contacts.`);
      }

      // Trigger automatic outreach campaign send
      if (verifiedContacts.length > 0) {
        const companiesList = await DbHelper.getCompanies();
        const companyWithContacts = companiesList.find(c => c.id === company.id);
        if (companyWithContacts) {
          for (const c of companyWithContacts.contacts) {
            await this.outreach.initializeCampaign(company.id, c.id);
            if (c.connectionNote) {
              await this.outreach.sendConnectionRequest(company.id, c.id, c.connectionNote);
            }
          }
        }
      }

      await LoggerService.logPipelineState(company.id, 'Completed', `Lead Research successfully finalized in ${((Date.now() - startTime) / 1000).toFixed(1)}s.`);
      
      return {
        status: 'Completed',
        companyId: company.id,
        warnings,
        errors,
        durationMs: Date.now() - startTime
      };

    } catch (dbErr: any) {
      errors.push(`Database persistence error: ${dbErr.message}`);
      await LoggerService.logPipelineState(company.id, 'Failed', `Persistence failed: ${dbErr.message}`);
      await LoggerService.logError('ResearchOrchestrator', dbErr.message, dbErr.stack);
      
      return {
        status: 'Failed',
        companyId: company.id,
        warnings,
        errors,
        durationMs: Date.now() - startTime
      };
    }
  }
}
