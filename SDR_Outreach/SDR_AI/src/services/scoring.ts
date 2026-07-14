import { MarketplaceListing } from './marketplace';
import { ReputationSummary } from './reputation';

export interface ScoreOutput {
  score: number;
  reasons: string[];
}

export class LeadScoringAgent {
  /**
   * Calculates the weighted Opportunity Score (0-100) and compiles reasons.
   */
  calculateOpportunityScore(
    listings: MarketplaceListing[],
    reputation: ReputationSummary,
    employeeCount?: number
  ): ScoreOutput {
    console.log(`[LeadScoringAgent] Calculating Opportunity Score...`);

    const activeListings = listings.filter(l => l.active);
    const activeCount = activeListings.length;

    // 1. Marketplace Presence (Weight: 20)
    // Scale: 2.5 points per active marketplace, max 20
    const presenceScore = Math.min(20, activeCount * 2.5);

    // 2. Monthly Reviews (Weight: 15)
    // High review volume indicates more opportunity to automate
    let reviewsScore = 0;
    if (reputation.totalReviews > 10000) {
      reviewsScore = 15;
    } else if (reputation.totalReviews > 5000) {
      reviewsScore = 12;
    } else if (reputation.totalReviews > 1000) {
      reviewsScore = 9;
    } else if (reputation.totalReviews > 100) {
      reviewsScore = 5;
    } else {
      reviewsScore = 1;
    }

    // 3. Negative Reviews (Weight: 25)
    // Low rating or complaints = high need for review management (so high opportunity score!)
    let negativeReviewsScore = 0;
    if (reputation.averageRating > 0 && reputation.averageRating < 4.0) {
      negativeReviewsScore = 25;
    } else if (reputation.averageRating > 0 && reputation.averageRating < 4.3) {
      negativeReviewsScore = 20;
    } else if (reputation.averageRating > 0 && reputation.averageRating < 4.5) {
      negativeReviewsScore = 15;
    } else if (reputation.averageRating > 0) {
      negativeReviewsScore = 8;
    } else {
      // 0 reviews/ratings = no negative reviews, low opportunity
      negativeReviewsScore = 0;
    }

    // 4. Review Response Rate (Weight: 20)
    // If reviews go unanswered, opportunity is very high (20 points). If they answer them, opportunity is lower (5 points).
    const responseScore = reputation.reviewsUnanswered ? 20 : 5;

    // 5. Growth Signals (Weight: 10)
    // Being active on fast commerce channels (Blinkit, Zepto, Swiggy Instamart) shows strong growth/expansion
    const hasFastCommerce = listings.some(l => 
      l.active && ['Blinkit', 'Zepto', 'Instamart'].includes(l.marketplace)
    );
    const growthScore = hasFastCommerce ? 10 : 3;

    // 6. Hiring / Employee size (Weight: 10)
    let hiringScore = 4;
    const count = employeeCount || 0;
    if (count > 200) {
      hiringScore = 10;
    } else if (count > 50) {
      hiringScore = 8;
    } else if (count > 10) {
      hiringScore = 6;
    }

    // Sum the scores
    const totalScore = Math.round(
      presenceScore + reviewsScore + negativeReviewsScore + responseScore + growthScore + hiringScore
    );

    // Compile human-readable reasons
    const reasons: string[] = [];
    if (reputation.totalReviews > 1000) {
      reasons.push('High review volume');
    }
    if (reputation.reviewsUnanswered) {
      reasons.push('Poor review responses');
    }
    if (activeCount >= 4) {
      reasons.push(`Selling on ${activeCount} marketplaces`);
    }
    if (hasFastCommerce) {
      reasons.push('Strong marketplace expansion');
    }
    if (count > 50) {
      reasons.push('Growing D2C organization');
    }
    if (reputation.averageRating > 0 && reputation.averageRating < 4.3) {
      reasons.push(`Averaging ${reputation.averageRating} rating (below standard)`);
    }

    console.log(`[LeadScoringAgent] Calculated Opportunity Score: ${totalScore}/100. Reasons: ${reasons.join(', ')}`);

    return {
      score: Math.min(100, totalScore),
      reasons
    };
  }
}
