import dotenv from 'dotenv';
dotenv.config();

export interface MarketplaceListing {
  marketplace: string;
  active: boolean;
  skusCount: number;
  rating: number;
  reviewsCount: number;
  priceRange: string;
  bestSeller?: string;
  sellerName?: string;
  categoryRanking?: string;
  deliveryAvailable: boolean;
}

export class MarketplaceResearchService {
  /**
   * Audits brand presence and gathers metrics across the 8 eCommerce marketplaces:
   * Amazon, Flipkart, Blinkit, Instamart, Nykaa, Myntra, Meesho, and Zepto.
   * Leverages real scraped marketplace listings to avoid fabrication.
   */
  async auditMarketplaces(
    companyName: string, 
    domain: string, 
    scrapedMarketplaces?: any[]
  ): Promise<MarketplaceListing[]> {
    console.log(`[MarketplaceResearchService] Auditing marketplace listings for ${companyName} (${domain})`);

    const marketplaces = ['Amazon', 'Flipkart', 'Blinkit', 'Instamart', 'Nykaa', 'Myntra', 'Meesho', 'Zepto'];
    const listings: MarketplaceListing[] = [];

    for (const mkt of marketplaces) {
      // Find matches in the live scraped listings list
      const scraped = scrapedMarketplaces?.find(s => s.name.toLowerCase() === mkt.toLowerCase());

      if (scraped && scraped.storeUrl) {
        listings.push({
          marketplace: mkt,
          active: true,
          skusCount: scraped.productCount || 0,
          rating: scraped.rating || 0.0,
          reviewsCount: scraped.reviewCount || 0,
          priceRange: 'Unknown range',
          bestSeller: scraped.isBestSeller ? 'Yes' : undefined,
          sellerName: companyName,
          categoryRanking: undefined,
          deliveryAvailable: true
        });
      } else {
        listings.push({
          marketplace: mkt,
          active: false,
          skusCount: 0,
          rating: 0.0,
          reviewsCount: 0,
          priceRange: '',
          bestSeller: undefined,
          sellerName: undefined,
          categoryRanking: undefined,
          deliveryAvailable: false
        });
      }
    }

    return listings;
  }
}
