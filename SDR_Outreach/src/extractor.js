import { GoogleGenerativeAI } from '@google/generative-ai';

export class AIExtractor {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || "";
    if (this.apiKey) {
      const genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    } else {
      this.model = null;
      console.warn("[AIExtractor] GEMINI_API_KEY not set. Operating in mock/simulation mode.");
    }
  }

  async extractMarketplaceMetrics(rawContent, marketplace) {
    if (!rawContent) return this._mockMarketplaceMetrics(marketplace);
    if (!this.model) return this._mockMarketplaceMetrics(marketplace);

    const prompt = `
    Extract e-commerce marketplace metrics from the following scraped content for the marketplace '${marketplace}':
    ---
    ${rawContent.slice(0, 20000)}
    ---
    Respond with a raw JSON object containing these keys:
    - sku_count (integer or null)
    - avg_rating (float or null)
    - review_count (integer or null)
    - price_min (float or null)
    - price_max (float or null)
    - best_sellers (array of strings)
    - seller_names (array of strings)
    - category_rankings (object mapping category to rank integer)
    - delivery_available (boolean or null)
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);
      
      return {
        skuCount: parsed.sku_count || null,
        avgRating: parsed.avg_rating || null,
        reviewCount: parsed.review_count || null,
        priceMin: parsed.price_min || null,
        priceMax: parsed.price_max || null,
        bestSellers: parsed.best_sellers || [],
        sellerNames: parsed.seller_names || [],
        categoryRankings: parsed.category_rankings || {},
        deliveryAvailable: parsed.delivery_available !== undefined ? parsed.delivery_available : null
      };
    } catch (err) {
      console.error(`[AIExtractor] Error extracting marketplace metrics for ${marketplace}:`, err.message || err);
      return this._mockMarketplaceMetrics(marketplace);
    }
  }

  async extractReviewIntelligence(rawContent, marketplace) {
    if (!rawContent) return this._mockReviewIntelligence(marketplace);
    if (!this.model) return this._mockReviewIntelligence(marketplace);

    const prompt = `
    Analyze customer reviews in the following scraped content from '${marketplace}':
    ---
    ${rawContent.slice(0, 20000)}
    ---
    Respond with a raw JSON object containing these keys:
    - top_complaints (array of objects like {"complaint": "Late Delivery", "percentage": 42})
    - affected_products (array of strings)
    - sentiment_trend (string: "IMPROVING", "WORSENING", "STABLE")
    - reviews_unanswered (boolean)
    - delivery_mentions (integer)
    - packaging_mentions (integer)
    - product_quality_mentions (integer)
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);
      
      return {
        topComplaints: parsed.top_complaints || [],
        affectedProducts: parsed.affected_products || [],
        sentimentTrend: parsed.sentiment_trend || "STABLE",
        reviewsUnanswered: parsed.reviews_unanswered || false,
        deliveryMentions: parsed.delivery_mentions || 0,
        packagingMentions: parsed.packaging_mentions || 0,
        productQualityMentions: parsed.product_quality_mentions || 0
      };
    } catch (err) {
      console.error(`[AIExtractor] Error extracting review intelligence for ${marketplace}:`, err.message || err);
      return this._mockReviewIntelligence(marketplace);
    }
  }

  async extractSignals(rawContent) {
    if (!rawContent) return this._mockSignals();
    if (!this.model) return this._mockSignals();

    const prompt = `
    Identify signals from the following company website pages content:
    ---
    ${rawContent.slice(0, 20000)}
    ---
    Respond with a raw JSON object containing these keys:
    - hiring (boolean)
    - growth_signals (string)
    - contact_info (array of objects like {"name": "Amit Sharma", "designation": "Founder & CEO"})
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      });
      const responseText = result.response.text();
      const parsed = JSON.parse(responseText);
      
      return {
        hiring: parsed.hiring || false,
        growthSignals: parsed.growth_signals || "",
        contactInfo: parsed.contact_info || []
      };
    } catch (err) {
      console.error("[AIExtractor] Error extracting company signals:", err.message || err);
      return this._mockSignals();
    }
  }

  _mockMarketplaceMetrics(marketplace) {
    if (marketplace.toLowerCase() === "amazon") {
      return {
        skuCount: 45,
        avgRating: 4.1,
        reviewCount: 12000,
        priceMin: 299.0,
        priceMax: 1999.0,
        bestSellers: ["Solara Smart Water Bottle", "Solara Vacuum Flask"],
        sellerNames: ["SOLARA Retail", "Appario Retail"],
        categoryRankings: { "Sports & Outdoors": 142, "Home & Kitchen": 89 },
        deliveryAvailable: true
      };
    } else if (marketplace.toLowerCase() === "blinkit") {
      return {
        skuCount: 8,
        avgRating: 4.3,
        reviewCount: 450,
        priceMin: 199.0,
        priceMax: 899.0,
        bestSellers: ["Solara Insulated Bottle 1L"],
        sellerNames: ["Solara Quick-Comm Store"],
        categoryRankings: { "Kitchenware Utilities": 12 },
        deliveryAvailable: true
      };
    } else {
      return {
        skuCount: 15,
        avgRating: 4.2,
        reviewCount: 230,
        priceMin: 350.0,
        priceMax: 1500.0,
        bestSellers: ["Generic Brand Item"],
        sellerNames: [`${marketplace} Partner Seller`],
        categoryRankings: { "Utility Utilities": 45 },
        deliveryAvailable: true
      };
    }
  }

  _mockReviewIntelligence(marketplace) {
    return {
      topComplaints: [
        { complaint: "Late Delivery", percentage: 42 },
        { complaint: "Broken Packaging", percentage: 27 },
        { complaint: "Poor Customer Support", percentage: 18 },
        { complaint: "Wrong Product", percentage: 13 }
      ],
      affectedProducts: ["Solara Smart Water Bottle 1L", "USB Charger Cap"],
      sentimentTrend: "WORSENING",
      reviewsUnanswered: true,
      deliveryMentions: 42,
      packagingMentions: 27,
      productQualityMentions: 15
    };
  }

  _mockSignals() {
    return {
      hiring: true,
      growthSignals: "The brand is expanding rapidly into quick commerce platforms Blinkit and Zepto.",
      contactInfo: [
        { name: "Amit Sharma", designation: "Founder & CEO" },
        { name: "Neha Patel", designation: "Head of eCommerce" }
      ]
    };
  }
}
