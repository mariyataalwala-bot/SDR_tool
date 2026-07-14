import dotenv from 'dotenv';
import { sequelize, Lead, initDb } from './src/database.js';
import { MasterAnalyzerPipeline } from './src/analyzer.js';

// Load .env variables
dotenv.config();

async function runRealPipeline() {
  // Read CLI arguments or default to a real prominent Indian consumer brand
  const args = process.argv.slice(2);
  const brandName = args[0] || "Borosil";
  const website = args[1] || "borosil.com";
  const category = args[2] || "Kitchenware";

  console.log(`\n======================================================`);
  console.log(`🚀 Starting Real-world Scrape and AI Lead Qualification`);
  console.log(`   Brand Name : ${brandName}`);
  console.log(`   Website    : ${website}`);
  console.log(`   Category   : ${category}`);
  console.log(`======================================================\n`);

  try {
    // 1. Sync Database
    console.log("[Pipeline] Initializing database schema...");
    await initDb();

    // 2. Create Lead
    console.log("[Pipeline] Registering new Lead in local CRM...");
    const lead = await Lead.create({
      brandName,
      website,
      category,
      pipelineStage: 1
    });

    console.log(`[Pipeline] Lead created. Assigned ID: ${lead.id}`);

    // 3. Instantiate and run orchestrator pipeline
    const pipeline = new MasterAnalyzerPipeline();
    console.log("[Pipeline] Starting 13-Agent operational flow. This may take up to 20 seconds...");
    const result = await pipeline.processLead(lead.id);

    // 4. Output results beautifully to CLI console
    console.log(`\n======================================================`);
    console.log(`🎉 Pipeline Execution Finished Successfully!`);
    console.log(`======================================================`);
    console.log(`Opportunity Score : ${result.score.totalScore}/100`);
    console.log(`Qualification Reasons:`);
    result.score.reasons.forEach(r => console.log(`  - ${r}`));
    console.log(`------------------------------------------------------`);
    console.log(`Discovered Decision Makers:`);
    if (result.contacts.length > 0) {
      result.contacts.forEach(c => {
        console.log(`  👤 ${c.name} (${c.designation})`);
        console.log(`     Email : ${c.email}`);
        console.log(`     Phone : ${c.phone}`);
        console.log(`     Link  : ${c.linkedinUrl}`);
        console.log(`     Conf. : ${c.confidenceScore}% (from: ${c.sources.join(", ")})`);
        console.log(`     Verify: ${c.isVerified ? "SMTP Verified" : "Unverified"}`);
        console.log();
      });
    } else {
      console.log("  No contacts resolved.");
    }
    console.log(`------------------------------------------------------`);
    console.log(`AI Personalization Pitch Angle:`);
    console.log(`"${result.profile.personalizedSalesAngle}"`);
    console.log(`======================================================\n`);
    
    console.log(`👉 Refresh http://localhost:3000/demo.html and select the new LIVE dropdown option to view the live dashboard!`);

  } catch (err) {
    console.error("\n❌ Pipeline execution encountered an error:", err.message || err);
  } finally {
    await sequelize.close();
  }
}

runRealPipeline();
