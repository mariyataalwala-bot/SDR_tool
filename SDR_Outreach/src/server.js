import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  sequelize, Lead, CompanyResearch, MarketplacePresence, ReviewIntelligence, 
  ReputationSummary, OpportunityScore, Contact, ResearchProfile, initDb 
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static demo assets
app.use(express.static(path.join(__dirname, '..')));
app.use(express.json());

// API Endpoint to fetch actual leads from SQLite database
app.get('/api/leads', async (req, res) => {
  try {
    const leads = await Lead.findAll({
      include: [
        { model: CompanyResearch, as: 'researches' },
        { model: MarketplacePresence, as: 'marketplaces' },
        { model: ReviewIntelligence, as: 'reviews' },
        { model: ReputationSummary, as: 'reputationSummary' },
        { model: OpportunityScore, as: 'opportunityScore' },
        { model: Contact, as: 'contacts' },
        { model: ResearchProfile, as: 'researchProfile' }
      ]
    });
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Initialize database connection and serve
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] Web server active and running at http://localhost:${PORT}/demo.html`);
  });
}).catch(err => {
  console.error("[Server] Failed to initialize database:", err);
});
