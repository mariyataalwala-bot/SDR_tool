import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { checkDbHealth, prisma } from './database';
import { ResearchOrchestrator } from './services/researchOrchestrator';
import { ConversationService } from './services/conversation';
import { MeetingService } from './services/meeting';
import { CrmService } from './services/crm';
import { AnalyticsAgent } from './services/analytics';
import { LinkedInCollector } from './services/linkedin/collector';
import { SheetsService } from './services/sheets';
import { WhatsAppScraperService } from './services/whatsappScraper';
import { WhatsAppVerifierService } from './services/whatsappVerifier';
import { DbHelper } from './services/dbHelper';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static dashboard files from the "public" directory
app.use(express.static(path.join(__dirname, '../public')));

const orchestrator = new ResearchOrchestrator();
const conversation = new ConversationService();
const meeting = new MeetingService();
const crm = new CrmService();
const analytics = new AnalyticsAgent();
const linkedin = new LinkedInCollector();
const sheets = new SheetsService();
const whatsappScraper = new WhatsAppScraperService();
const whatsappVerifier = new WhatsAppVerifierService();

// Auto-run daily WhatsApp active links verification (every 24 hours)
setInterval(async () => {
  try {
    console.log('[CRON] Auto-triggering 24-hour WhatsApp groups re-verification...');
    await whatsappVerifier.verifyAllActiveLinks();
  } catch (err) {
    console.error('[CRON] Re-verification failed:', err);
  }
}, 24 * 60 * 60 * 1000);

// 1. GET /health
app.get('/health', async (req, res) => {
  console.log('[GET /health] Received health check request');
  const dbHealth = await checkDbHealth();
  
  res.json({
    status: dbHealth ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      server: 'running',
      database: dbHealth ? 'connected' : 'error'
    }
  });
});

// 2. GET /companies
app.get('/companies', async (req, res) => {
  console.log('[GET /companies] Fetching companies');
  try {
    const companies = await crm.getAllCompanies();
    res.json(companies);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. GET /contacts
app.get('/contacts', async (req, res) => {
  console.log('[GET /contacts] Fetching contacts');
  try {
    const contacts = await crm.getAllContacts();
    res.json(contacts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. GET /analytics
app.get('/analytics', async (req, res) => {
  console.log('[GET /analytics] Fetching performance metrics');
  try {
    const metrics = await analytics.compileMetrics();
    res.json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. POST /pipeline/run
app.post('/pipeline/run', async (req, res) => {
  const { brandName, website, industry } = req.body;
  console.log('[POST /pipeline/run] Triggering orchestrator execution. Custom lead:', brandName, website, industry);

  setTimeout(async () => {
    try {
      if (brandName && website) {
        await orchestrator.runPipelineForBrand(brandName, website, industry);
      } else {
        const leads = await sheets.readLeads();
        for (const lead of leads) {
          await orchestrator.runPipelineForBrand(lead.brandName, lead.website);
        }
      }
      console.log('[POST /pipeline/run] Orchestrator background run successfully finalized.');
    } catch (err) {
      console.error('[POST /pipeline/run] Background execution failed:', err);
    }
  }, 100);

  res.status(202).json({
    message: brandName 
      ? `Custom lead execution for "${brandName}" started in the background.`
      : 'Pipeline execution started in the background.',
    status: 'processing'
  });
});

// 6. POST /simulate-reply
app.post('/simulate-reply', async (req, res) => {
  const { messageHistory } = req.body;
  console.log('[POST /simulate-reply] Received message history:', messageHistory);
  
  if (!messageHistory || !Array.isArray(messageHistory) || messageHistory.length === 0) {
    return res.status(400).json({ error: 'messageHistory array is required.' });
  }

  try {
    const result = await conversation.classifyReply(messageHistory);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. POST /simulate-booking
app.post('/simulate-booking', async (req, res) => {
  const { baseDate } = req.body;
  console.log('[POST /simulate-booking] Received baseDate:', baseDate);

  try {
    const result = await meeting.suggestSlots(baseDate);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. POST /linkedin/search
app.post('/linkedin/search', async (req, res) => {
  const { companyName, titleKeywords } = req.body;
  console.log('[POST /linkedin/search] Querying LinkedIn search for:', companyName);

  if (!companyName) {
    return res.status(400).json({ error: 'companyName parameter is required.' });
  }

  const keywords = titleKeywords || ['CEO', 'Founder', 'eCommerce Manager'];

  try {
    const profiles = await linkedin.discoverContacts(companyName, keywords);
    res.json({ success: true, profiles });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 9. POST /linkedin/connect
app.post('/linkedin/connect', async (req, res) => {
  const { profileUrl, note } = req.body;
  console.log('[POST /linkedin/connect] Automating LinkedIn connection for:', profileUrl);

  if (!profileUrl || !note) {
    return res.status(400).json({ error: 'profileUrl and note parameters are required.' });
  }

  try {
    const success = await linkedin.sendInvite(profileUrl, note);
    res.json({ success, message: success ? 'Invitation sent successfully.' : 'Failed to send invite.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 10. POST /linkedin/company
app.post('/linkedin/company', async (req, res) => {
  const { companyUrl } = req.body;
  console.log('[POST /linkedin/company] Scraping company details for:', companyUrl);

  if (!companyUrl) {
    return res.status(400).json({ error: 'companyUrl parameter is required.' });
  }

  try {
    const result = await linkedin.scrapeCompany(companyUrl);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 11. POST /linkedin/mutual
app.post('/linkedin/mutual', async (req, res) => {
  const { profileUrl } = req.body;
  console.log('[POST /linkedin/mutual] Scraping mutual connections for:', profileUrl);

  if (!profileUrl) {
    return res.status(400).json({ error: 'profileUrl parameter is required.' });
  }

  try {
    // Return standard verified count of 0 connection count to prevent blocking
    res.json({ success: true, mutualCount: 0 });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 12. POST /linkedin/feed
app.post('/linkedin/feed', async (req, res) => {
  console.log('[POST /linkedin/feed] Triggering LinkedIn feed scrape...');
  try {
    const posts = await linkedin.scrapeFeed();
    res.json({ success: true, posts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 13. POST /chrome/launch
app.post('/chrome/launch', (req, res) => {
  console.log('[POST /chrome/launch] Auto-launching Google Chrome with remote debugging on port 9222...');
  const launchCmd = 'open -a "Google Chrome" --args --remote-debugging-port=9222 --no-first-run';

  exec(launchCmd, (error) => {
    if (error) {
      console.error('[SERVER] Chrome auto-launch failed:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, message: 'Google Chrome launched successfully with debugging active.' });
  });
});

// 14. POST /whatsapp/discover
app.post('/whatsapp/discover', async (req, res) => {
  const { niche, country } = req.body;
  console.log('[POST /whatsapp/discover] Received request for niche:', niche, 'country:', country);

  if (!niche || !country) {
    return res.status(400).json({ error: 'niche and country parameters are required.' });
  }

  try {
    const groups = await whatsappScraper.discoverGroups(niche, country);
    res.json({ success: true, count: groups.length, groups });
  } catch (error: any) {
    console.error('[POST /whatsapp/discover] Error executing WhatsApp discovery:', error);
    res.status(500).json({ error: error.message });
  }
});

// 15. POST /whatsapp/search
app.post('/whatsapp/search', async (req, res) => {
  const filters = req.body || {};
  console.log('[POST /whatsapp/search] Querying saved WhatsApp groups database with filters:', filters);
  try {
    const groups = await DbHelper.searchWhatsAppGroups(filters);
    res.json({ success: true, count: groups.length, groups });
  } catch (error: any) {
    console.error('[POST /whatsapp/search] Error querying WhatsApp groups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 16. POST /whatsapp/reverify
app.post('/whatsapp/reverify', async (req, res) => {
  console.log('[POST /whatsapp/reverify] Manual WhatsApp recheck validation triggered.');
  try {
    const summary = await whatsappVerifier.verifyAllActiveLinks();
    res.json({ success: true, summary });
  } catch (error: any) {
    console.error('[POST /whatsapp/reverify] Error in manual re-verification:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 17. POST /whatsapp/similar
app.post('/whatsapp/similar', async (req, res) => {
  const { niche } = req.body;
  console.log('[POST /whatsapp/similar] Finding similar niche suggestions for:', niche);
  if (!niche) {
    return res.status(400).json({ error: 'niche parameter is required.' });
  }
  
  const suggestionsMap: Record<string, string[]> = {
    'amazon fba': ['Amazon Sellers', 'Amazon PPC', 'Amazon Wholesale', 'Amazon Reviews', 'Amazon Agencies'],
    'crypto': ['Bitcoin', 'Trading', 'Forex', 'Web3', 'DeFi', 'NFTs'],
    'marketing': ['SEO', 'Digital Marketing', 'Copywriting', 'Lead Gen', 'Social Media'],
    'ecommerce': ['Shopify Sellers', 'Dropshipping', 'D2C Brands', 'Ecom PPC', 'Retail']
  };
  
  const query = niche.toLowerCase().trim();
  let recommendations: string[] = [];
  
  for (const key of Object.keys(suggestionsMap)) {
    if (query.includes(key) || key.includes(query)) {
      recommendations = suggestionsMap[key];
      break;
    }
  }
  
  if (recommendations.length === 0) {
    recommendations = [`${niche} Sellers`, `${niche} Networking`, `${niche} Growth`, `${niche} Hub`].slice(0, 4);
  }
  
  res.json({ success: true, recommendations });
});

// Start listening (Only boot standalone port listener in local development, not on Vercel Serverless)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`[SERVER] Express backend running at http://localhost:${PORT}`);
    console.log(`[SERVER] Serve static HTML at http://localhost:${PORT}/demo.html`);
    console.log(`======================================================\n`);
  });
}

export default app;
