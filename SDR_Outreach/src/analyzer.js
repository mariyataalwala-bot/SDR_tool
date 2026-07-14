import { 
  Lead, CompanyResearch, MarketplacePresence, ReviewIntelligence, 
  ReputationSummary, OpportunityScore, Contact, ResearchProfile, CRMEventLedger 
} from './database.js';
import { JinaCollector } from './collectors/jina.js';
import { PlaywrightCollector } from './collectors/playwright.js';
import { SearchCollector } from './collectors/search.js';
import { AIExtractor } from './extractor.js';
import { LeadScoringAgent } from './qualification.js';
import { ContactDiscoveryAgent } from './contact_discovery.js';
import { AIResearchAgent } from './research_agent.js';

export class MasterAnalyzerPipeline {
  constructor() {
    this.jinaCollector = new JinaCollector();
    this.playwrightCollector = new PlaywrightCollector();
    this.searchCollector = new SearchCollector();
    this.extractor = new AIExtractor();
    this.scoringAgent = new LeadScoringAgent();
    this.contactDiscoveryAgent = new ContactDiscoveryAgent();
    this.researchAgent = new AIResearchAgent();
  }

  async processLead(leadId) {
    console.log(`[MasterAnalyzerPipeline] Starting processing for Lead ID: ${leadId}`);

    // 0. Fetch Lead
    const lead = await Lead.findByPk(leadId);
    if (!lead) {
      throw new Error(`Lead with ID ${leadId} not found.`);
    }

    // Log lead imported event
    await this._logCrmEvent(lead.id, "LEAD_IMPORTED", { brand: lead.brandName });

    // 1. Company Website Research
    console.log("[MasterAnalyzerPipeline] Step 1: Initiating website research...");
    let rawWebContent = "";
    if (lead.website) {
      rawWebContent = await this.jinaCollector.collect(lead.website);
      if (!rawWebContent) {
        rawWebContent = await this.playwrightCollector.collect(lead.website);
      }
    }

    const signals = await this.extractor.extractSignals(rawWebContent);
    const researchRec = await CompanyResearch.create({
      leadId: lead.id,
      overview: signals.growthSignals || `Website research completed for ${lead.brandName}.`,
      products: "Primary brand products listed in store index.",
      newsSignals: signals.growthSignals,
      hiringSignals: signals.hiring ? "Hiring Activity" : "Stable recruitment"
    });
    console.log("[MasterAnalyzerPipeline] Website research completed and saved.");

    // 2. Marketplace Presence Analysis
    console.log("[MasterAnalyzerPipeline] Step 2: Mapping marketplaces footprint...");
    const targetMarketplaces = ["Amazon", "Flipkart", "Blinkit", "Instamart", "Nykaa", "Meesho", "Zepto", "Myntra"];
    const marketplacesFound = [];
    const reviewsFound = [];

    for (const mp of targetMarketplaces) {
      console.log(`[MasterAnalyzerPipeline] Searching for brand store on: ${mp}`);
      let searchQuery = `site:${mp.toLowerCase()}.com ${lead.brandName}`;
      if (["blinkit", "zepto", "instamart"].includes(mp.toLowerCase())) {
        searchQuery = `${lead.brandName} products on ${mp}`;
      }

      const searchResults = await this.searchCollector.collect(searchQuery);
      if (searchResults && searchQuery.trim().length > 10) {
        const metrics = await this.extractor.extractMarketplaceMetrics(searchResults, mp);
        const revIntel = await this.extractor.extractReviewIntelligence(searchResults, mp);

        const mpPresence = await MarketplacePresence.create({
          leadId: lead.id,
          marketplace: mp,
          storeUrl: `https://${mp.toLowerCase()}.com/store/${lead.brandName.toLowerCase()}`,
          skuCount: metrics.skuCount,
          avgRating: metrics.avgRating,
          reviewCount: metrics.reviewCount,
          priceMin: metrics.priceMin,
          priceMax: metrics.priceMax,
          bestSellers: metrics.bestSellers,
          sellerNames: metrics.sellerNames,
          categoryRankings: metrics.categoryRankings,
          deliveryAvailable: metrics.deliveryAvailable
        });
        marketplacesFound.push(mpPresence);

        const revRec = await ReviewIntelligence.create({
          leadId: lead.id,
          marketplace: mp,
          topComplaints: revIntel.topComplaints,
          affectedProducts: revIntel.affectedProducts,
          sentimentTrend: revIntel.sentimentTrend,
          reviewsUnanswered: revIntel.reviewsUnanswered,
          deliveryMentions: revIntel.deliveryMentions,
          packagingMentions: revIntel.packagingMentions,
          productQualityMentions: revIntel.productQualityMentions
        });
        reviewsFound.push(revRec);
      }
    }
    console.log(`[MasterAnalyzerPipeline] Marketplace mapping finished. Registered ${marketplacesFound.length} active channels.`);

    // 3. Opportunity Scoring
    console.log("[MasterAnalyzerPipeline] Step 3: Triggering Lead Scoring Agent...");
    const scoreData = this.scoringAgent.calculateScore(lead.id, marketplacesFound, reviewsFound, researchRec);
    const score = await OpportunityScore.create(scoreData);

    // Update CRM pipeline stage
    lead.pipelineStage = 2; // Stage 2: Research Completed
    await lead.save();
    await this._logCrmEvent(lead.id, "RESEARCH_COMPLETED", { opportunity_score: score.totalScore });

    // 4. Reputation Summary (identify weakest marketplace)
    console.log("[MasterAnalyzerPipeline] Step 4: Compiling Reputation Summary...");
    let weakestMp = null;
    let lowestRating = 5.0;

    for (const mp of marketplacesFound) {
      if (mp.avgRating && mp.avgRating < lowestRating) {
        lowestRating = mp.avgRating;
        weakestMp = mp.marketplace;
      }
    }

    let overallSummary = `Reputation diagnostic finished. Brand has active presence on ${marketplacesFound.length} channels. `;
    if (weakestMp) {
      overallSummary += `The weakest channel is ${weakestMp} with an average rating of ${lowestRating}/5.0. `;
      const weakestReviews = reviewsFound.find(r => r.marketplace === weakestMp);
      if (weakestReviews && weakestReviews.reviewsUnanswered) {
        overallSummary += `Customer feedback on ${weakestMp} is largely left unanswered by representatives.`;
      }
    } else {
      overallSummary += "No critical reviews or ratings gaps identified across active marketplaces.";
    }

    const reputation = await ReputationSummary.create({
      leadId: lead.id,
      weakestMarketplace: weakestMp,
      overallReputationSummary: overallSummary
    });
    await this._logCrmEvent(lead.id, "REVIEWS_COLLECTED", { weakest_marketplace: weakestMp });

    // 5. Contact Discovery & Verification
    console.log("[MasterAnalyzerPipeline] Step 5: Resolving targets contacts...");
    const contactDataList = await this.contactDiscoveryAgent.discoverAndVerify(lead.id, lead.brandName, lead.website);
    const contacts = [];
    for (const data of contactDataList) {
      const contact = await Contact.create(data);
      contacts.push(contact);
    }

    lead.pipelineStage = 4; // Stage 4: Contact Verified
    await lead.save();
    await this._logCrmEvent(lead.id, "CONTACTS_FOUND", { contacts_count: contacts.length });

    // 6. AI Research Profile Synthesis
    console.log("[MasterAnalyzerPipeline] Step 6: Compiling Research Profile...");
    const profileData = await this.researchAgent.compileProfile(lead, researchRec, marketplacesFound, reviewsFound, score);
    const profile = await ResearchProfile.create(profileData);

    console.log("[MasterAnalyzerPipeline] Master pipeline execution completed successfully.");
    return { lead, score, profile, contacts };
  }

  async _logCrmEvent(leadId, eventType, metadata) {
    await CRMEventLedger.create({
      leadId,
      eventType,
      metadataJson: metadata
    });
    console.log(`[CRMEventLedger] Event Registered: ${eventType} for Lead: ${leadId}`);
  }
}
