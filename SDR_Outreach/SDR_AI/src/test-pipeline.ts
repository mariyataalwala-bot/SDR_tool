import { ResearchOrchestrator } from './services/researchOrchestrator';

async function runDryRun() {
  console.log(`\n======================================================`);
  console.log(`[DRY RUN] Starting SDR Pipeline dry run`);
  console.log(`======================================================\n`);

  const orchestrator = new ResearchOrchestrator();
  const testLeads = [
    { brandName: 'Biba', website: 'biba.in' }
  ];

  for (const lead of testLeads) {
    console.log(`>>> DRY-RUNNING CRAWL FOR: ${lead.brandName} (${lead.website})`);
    try {
      const result = await orchestrator.runPipelineForBrand(lead.brandName, lead.website);
      console.log(`Dry Run result: Status=${result.status}, duration=${(result.durationMs / 1000).toFixed(1)}s`);
      console.log(`Warnings:`, result.warnings);
      console.log(`Errors:`, result.errors);
    } catch (err: any) {
      console.error(`Dry Run execution crashed:`, err.message);
    }
  }
}

runDryRun().catch(err => {
  console.error('[DRY RUN] Failed:', err);
});
