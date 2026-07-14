import { GoogleGenerativeAI } from '@google/generative-ai';

export class AIResearchAgent {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    if (this.apiKey) {
      const genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    } else {
      this.model = null;
      console.warn("[AIResearchAgent] GEMINI_API_KEY not set. Research profiles will use mock templates.");
    }
  }

  async compileProfile(lead, research, marketplaces, reviews, score) {
    console.log(`[AIResearchAgent] Compiling research profile for: ${lead.brandName}`);

    if (!this.model) {
      return this._generateMockProfile(lead, marketplaces, reviews, score);
    }

    const activeMps = marketplaces.map(m => m.marketplace);
    const reasonsStr = score.reasons ? score.reasons.map(r => `- ${r}`).join("\n") : "None";
    
    let rawReviewsSummary = "";
    for (const r of reviews) {
      const complaintsStr = r.topComplaints 
        ? r.topComplaints.map(c => `${c.complaint} (${c.percentage}%)`).join(", ") 
        : "None";
      rawReviewsSummary += `- ${r.marketplace}: Rating ${r.avgRating}, Complaints: ${complaintsStr}, Unanswered: ${r.reviewsUnanswered}\n`;
    }

    const prompt = `
    You are a Senior Sales Development Representative (SDR) Research Analyst.
    Your task is to synthesize raw intelligence gathered for the brand '${lead.brandName}' (${lead.website}) into a structured sales profile.
    
    Raw Data Points Available:
    - Category: ${lead.category}
    - Active Marketplaces: ${activeMps.join(", ")}
    - Opportunity Score: ${score.totalScore}/100
    - Score Reasons:
    ${reasonsStr}
    - Review Diagnostics:
    ${rawReviewsSummary}
    - Raw Website Scraping Overview: ${research ? (research.overview || "").slice(0, 3000) : "None"}
    
    You MUST compile a profile containing exactly the following 8 sections:
    
    1. **Company Overview**: Concise background, size, sector.
    2. **Products**: Primary offerings, pricing tier, and key selling propositions.
    3. **Marketplace Presence**: Detailed mapping across Amazon, Flipkart, Blinkit, Instamart, etc.
    4. **Customer Pain Points**: Real problems retrieved from negative reviews.
    5. **Review Analysis**: Analysis of ratings, review counts, unanswered feedback, and sentiment trajectory.
    6. **Competitors**: Leading competitor brands in their niche.
    7. **Why They Need Review Management**: Targeted case showing how review optimization directly boosts their marketplace ranking, buy-box retention, or sales.
    8. **Personalized Sales Angle**: Actionable outreach hook for the SDR team (e.g. "Approach Solara highlighting that 42% of their Amazon reviews complain of late delivery, suggesting our specialized delivery-management responses as a fix").
    
    Respond with clean Markdown. Keep sections concise and highly professional.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();
      const sections = this._parseMarkdownSections(text);

      return {
        leadId: lead.id,
        companyOverview: sections.company_overview || "Profile generation failed.",
        products: sections.products || "Profile generation failed.",
        marketplacePresence: sections.marketplace_presence || "Profile generation failed.",
        customerPainPoints: sections.customer_pain_points || "Profile generation failed.",
        reviewAnalysis: sections.review_analysis || "Profile generation failed.",
        competitors: sections.competitors || "Profile generation failed.",
        whyNeedReviewManagement: sections.why_need_review_management || "Profile generation failed.",
        personalizedSalesAngle: sections.personalized_sales_angle || "Profile generation failed."
      };
    } catch (err) {
      console.error("[AIResearchAgent] Error generating AI research profile:", err.message || err);
      return this._generateMockProfile(lead, marketplaces, reviews, score);
    }
  }

  _parseMarkdownSections(text) {
    const sections = {};
    const headers = [
      ["Company Overview", "company_overview"],
      ["Products", "products"],
      ["Marketplace Presence", "marketplace_presence"],
      ["Customer Pain Points", "customer_pain_points"],
      ["Review Analysis", "review_analysis"],
      ["Competitors", "competitors"],
      ["Why They Need Review Management", "why_need_review_management"],
      ["Personalized Sales Angle", "personalized_sales_angle"]
    ];

    const lines = text.split("\n");
    let currentSection = null;
    let currentContent = [];

    for (const line of lines) {
      let headerFound = false;
      for (const [headerName, key] of headers) {
        if (line.toLowerCase().includes(headerName.toLowerCase()) && (line.includes("**") || line.includes("#"))) {
          if (currentSection) {
            sections[currentSection] = currentContent.join("\n").trim();
          }
          currentSection = key;
          currentContent = [];
          headerFound = true;
          break;
        }
      }
      if (!headerFound && currentSection) {
        currentContent.push(line);
      }
    }

    if (currentSection) {
      sections[currentSection] = currentContent.join("\n").trim();
    }

    // Fallbacks
    for (const [_, key] of headers) {
      if (!sections[key] || sections[key].length === 0) {
        sections[key] = text.slice(0, 500) + "...";
      }
    }

    return sections;
  }

  _generateMockProfile(lead, marketplaces, reviews, score) {
    const activeMps = marketplaces.map(m => m.marketplace).join(", ");
    
    const overview = `${lead.brandName} is a leading brand in the ${lead.category || 'eCommerce'} sector, known for high quality utilities.`;
    const products = `Main product portfolio focuses on high-performance items in the ${lead.category || 'eCommerce'} category.`;
    const marketplacePresence = `Active across ${marketplaces.length} marketplaces: ${activeMps}.`;
    
    const complaintsList = [];
    for (const r of reviews) {
      if (r.topComplaints) {
        for (const c of r.topComplaints) {
          complaintsList.push(`${c.complaint} on ${r.marketplace}`);
        }
      }
    }
    const customerPainPoints = "Common issues include: " + (complaintsList.length > 0 ? complaintsList.join(", ") : "delivery delays, damaged packaging.");
    
    const reviewAnalysis = `Aggregated average rating is around 4.1. Unanswered complaints flag is set, showing high gaps in customer service engagement.`;
    const competitors = `Competing directly with top national brands in the ${lead.category || 'eCommerce'} segment.`;
    
    const whyNeedReview = `With an opportunity score of ${score.totalScore}/100, the brand shows high review volumes but lacks review reply automations. Implementing a review management response strategy will directly recover buy-box losses and improve seller rankings.`;
    
    const personalizedAngle = `Pitch the contact highlighting that scans show unresolved issues on their active listings. Use the specific pain points (e.g. delivery issues) to suggest our automated review engagement service.`;

    return {
      leadId: lead.id,
      companyOverview: overview,
      products,
      marketplacePresence,
      customerPainPoints,
      reviewAnalysis,
      competitors,
      whyNeedReviewManagement: whyNeedReview,
      personalizedSalesAngle: personalizedAngle
    };
  }
}
