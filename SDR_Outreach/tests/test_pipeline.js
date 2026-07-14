import test from 'node:test';
import assert from 'node:assert';
import { sequelize, Lead, CRMEventLedger, OpportunityScore, ResearchProfile, Contact } from '../src/database.js';
import { MasterAnalyzerPipeline } from '../src/analyzer.js';

test('End-to-End Master Analyzer Agent Pipeline Integration Test', async (t) => {
  // 1. Initialize DB in-memory for testing
  await sequelize.sync({ force: true });
  console.log("[Test] Database synchronized successfully.");

  // 2. Create a target test lead
  const testLead = await Lead.create({
    brandName: "SOLARA",
    website: "solara.in",
    category: "Drinkware",
    pipelineStage: 1,
    sheetRowNumber: 12
  });

  assert.ok(testLead.id, "Lead should have a valid auto-incremented ID.");
  assert.strictEqual(testLead.pipelineStage, 1, "Initial pipeline stage should be 1.");

  // 3. Instantiate and execute the pipeline
  const pipeline = new MasterAnalyzerPipeline();
  const result = await pipeline.processLead(testLead.id);

  // 4. Assertions on Lead stage update
  const updatedLead = await Lead.findByPk(testLead.id);
  assert.strictEqual(updatedLead.pipelineStage, 4, "Pipeline stage should update to 4 (Contact Verified).");

  // 5. Assertions on Opportunity Scoring calculations
  assert.ok(result.score, "Opportunity score should be generated.");
  assert.strictEqual(result.score.leadId, testLead.id, "Opportunity score should map to correct lead.");
  assert.ok(result.score.totalScore >= 0 && result.score.totalScore <= 100, "Opportunity score should be between 0 and 100.");
  assert.ok(Array.isArray(result.score.reasons), "reasons should be a JSON array.");
  assert.ok(result.score.reasons.length > 0, "Reasons array should have details.");

  // 6. Assertions on AI Research Profile compile
  assert.ok(result.profile, "AI Research Profile should be generated.");
  assert.strictEqual(result.profile.leadId, testLead.id, "Profile should map to correct lead.");
  assert.ok(result.profile.companyOverview.length > 10, "Company overview should have content.");
  assert.ok(result.profile.whyNeedReviewManagement.length > 10, "WhyNeedReviewManagement should have content.");
  assert.ok(result.profile.personalizedSalesAngle.length > 10, "PersonalizedSalesAngle should have content.");

  // 7. Assertions on Contact discovery and co-confirmation confidence calculations
  assert.ok(result.contacts.length > 0, "Should discover target contacts.");
  for (const c of result.contacts) {
    assert.strictEqual(c.leadId, testLead.id, "Contact should map to correct lead.");
    assert.ok(c.email.includes("@"), "Email should be valid format.");
    assert.ok(c.confidenceScore > 0, "Confidence score should be computed.");
    
    // Test the co-confirmation score multiplier for Amit Sharma
    // Amit Sharma has Apollo (85%) + Hunter (80%) + SMTP Verification (10% bonus)
    // combined base: 1 - (1 - 0.85) * (1 - 0.80) = 1 - 0.15 * 0.20 = 0.97 (97%)
    // verification bonus: 97% + 10% = 107% (capped at 100%)
    if (c.name === "Amit Sharma") {
      assert.strictEqual(c.confidenceScore, 100.0, "Amit Sharma combined confidence should calculate to 100% due to co-confirmation.");
    }
  }

  // 8. Assertions on Event-Driven CRM Ledger Audit Trail
  const events = await CRMEventLedger.findAll({ where: { leadId: testLead.id } });
  assert.ok(events.length >= 4, "Ledger should record at least 4 audit events.");
  
  const eventTypes = events.map(e => e.eventType);
  assert.ok(eventTypes.includes("LEAD_IMPORTED"), "Audit ledger should record LEAD_IMPORTED.");
  assert.ok(eventTypes.includes("RESEARCH_COMPLETED"), "Audit ledger should record RESEARCH_COMPLETED.");
  assert.ok(eventTypes.includes("REVIEWS_COLLECTED"), "Audit ledger should record REVIEWS_COLLECTED.");
  assert.ok(eventTypes.includes("CONTACTS_FOUND"), "Audit ledger should record CONTACTS_FOUND.");

  console.log("\n[SUCCESS] Integration test successfully completed. Node.js agents and state-ledger calculations verified.");
});
