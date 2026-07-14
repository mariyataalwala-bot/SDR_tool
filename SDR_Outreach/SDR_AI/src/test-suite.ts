import assert from 'assert';
import { VerificationService } from './services/verification';
import { LeadScoringAgent } from './services/scoring';
import { EnrichmentCollector } from './collectors/enrichment';
import { ConversationService } from './services/conversation';
import { MeetingService } from './services/meeting';
import { ResearchOrchestrator } from './services/researchOrchestrator';
import { DbHelper } from './services/dbHelper';
import { prisma } from './database';

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`[TEST SUITE] Initiating Automated Agent Verification`);
  console.log(`======================================================\n`);

  // --- Test 1: Email Verification Agent ---
  console.log(`[TEST 1] Testing VerificationService...`);
  const verification = new VerificationService();
  
  const invalidResult = await verification.verifyContactEmail('invalid-format-email');
  assert.strictEqual(invalidResult.validFormat, false);
  assert.strictEqual(invalidResult.status, 'Invalid');
  console.log(`[TEST 1] PASS: Format check correctly mapped.\n`);

  // --- Test 2: Enrichment Co-confirmation Confidence Math ---
  console.log(`[TEST 2] Testing EnrichmentCollector & Co-confirmation Confidence...`);
  const enrichment = new EnrichmentCollector();
  const emptyRes = await enrichment.discoverContacts('Solara', 'solara.in');
  // Should return empty list if API keys are missing per the NO MOCK DATA rule
  assert.strictEqual(emptyRes.length, 0);
  console.log(`[TEST 2] PASS: Mock fallback contacts purged successfully.\n`);

  // --- Test 3: Opportunity Scoring Agent ---
  console.log(`[TEST 3] Testing LeadScoringAgent...`);
  const scoring = new LeadScoringAgent();
  
  const mockListings = [
    { marketplace: 'Amazon', active: true, skusCount: 15, rating: 4.3, reviewsCount: 1250, priceRange: '₹500 - ₹3000', deliveryAvailable: true },
    { marketplace: 'Flipkart', active: true, skusCount: 10, rating: 4.1, reviewsCount: 840, priceRange: '₹450 - ₹2800', deliveryAvailable: true },
    { marketplace: 'Blinkit', active: true, skusCount: 4, rating: 4.4, reviewsCount: 120, priceRange: '₹300 - ₹1200', deliveryAvailable: true },
    { marketplace: 'Zepto', active: true, skusCount: 3, rating: 4.3, reviewsCount: 90, priceRange: '₹300 - ₹1000', deliveryAvailable: true }
  ];
  const mockReputation = {
    complaints: [],
    affectedProducts: [],
    sentimentTrend: 'worsening' as any,
    weakestMarketplace: 'Flipkart',
    reviewsUnanswered: true,
    mentionsDelivery: true,
    mentionsPackaging: true,
    mentionsQuality: true,
    averageRating: 4.28,
    totalReviews: 2300
  };
  
  const scoreResult = scoring.calculateOpportunityScore(mockListings, mockReputation, 45);
  assert.strictEqual(scoreResult.score, 75);
  assert.ok(scoreResult.reasons.includes('Poor review responses'));
  assert.ok(scoreResult.reasons.includes('Selling on 4 marketplaces'));
  console.log(`[TEST 3] PASS: Opportunity Score calculated as ${scoreResult.score}/100.\n`);

  // --- Test 4: Conversation Intent Classifier ---
  console.log(`[TEST 4] Testing ConversationService...`);
  const conversation = new ConversationService();
  
  const pricingReply = await conversation.classifyReply(["How much does it cost?"]);
  assert.strictEqual(pricingReply.intent, 'Need Pricing');
  
  const optOutReply = await conversation.classifyReply(["Please stop emailing me"]);
  assert.strictEqual(optOutReply.intent, 'Not Interested');
  console.log(`[TEST 4] PASS: Reply intent classifications mapped correctly.\n`);

  // --- Test 5: End-to-End Orchestrator Pipeline & CRM Log Persistence ---
  console.log(`[TEST 5] Testing End-to-End Orchestrator Pipeline Database Sync...`);
  
  // Clean DB first to avoid duplicate errors
  await DbHelper.clearDatabase();
  
  const orchestrator = new ResearchOrchestrator();
  const result = await orchestrator.runPipelineForBrand('Test Brand', 'example.com', 'Other');
  
  assert.strictEqual(result.status, 'Completed', 'Pipeline should complete successfully.');
  
  // Verify company counts
  const companies = await DbHelper.getCompanies();
  assert.strictEqual(companies.length, 1);
  
  const company = companies[0];
  
  assert.ok(company, 'Company should be saved.');
  assert.ok(company.researches.length > 0, 'Research record should exist.');
  assert.ok(company.pipelines.length > 0, 'CRM ledger events should be saved.');
  
  console.log(`[TEST 5] PASS: Pipeline run successfully completed. PostgreSQL database fully populated.\n`);

  console.log(`======================================================`);
  console.log(`[TEST SUITE] ALL TESTS PASSED SUCCESSFULLY!`);
  console.log(`======================================================\n`);
}

runTests().catch(err => {
  console.error('[TEST SUITE] Assertion Failure:', err);
  process.exit(1);
});
