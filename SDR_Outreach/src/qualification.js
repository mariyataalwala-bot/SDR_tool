export class LeadScoringAgent {
  /**
   * Calculates dynamic opportunity score (0-100) and rationale reasons.
   */
  calculateScore(leadId, marketplaces, reviews, research) {
    console.log(`[LeadScoringAgent] Calculating opportunity score for Lead ID: ${leadId}`);

    // 1. Marketplace Presence (Weight: 20)
    const mpCount = marketplaces.length;
    let presenceScore = 0;
    if (mpCount >= 5) presenceScore = 20;
    else if (mpCount >= 3) presenceScore = 15;
    else if (mpCount >= 1) presenceScore = 10;

    // 2. Monthly Reviews (Weight: 15)
    const totalReviews = marketplaces.reduce((sum, mp) => sum + (mp.reviewCount || 0), 0);
    let reviewsScore = 0;
    if (totalReviews >= 1000) reviewsScore = 15;
    else if (totalReviews >= 200) reviewsScore = 10;
    else if (totalReviews > 0) reviewsScore = 5;

    // 3. Negative Reviews / Pain points (Weight: 25)
    let maxComplaintsShare = 0;
    for (const rev of reviews) {
      if (rev.topComplaints && Array.isArray(rev.topComplaints)) {
        const share = rev.topComplaints.reduce((sum, c) => sum + (c.percentage || 0), 0);
        if (share > maxComplaintsShare) {
          maxComplaintsShare = share;
        }
      }
    }

    let negReviewsScore = 0;
    if (maxComplaintsShare >= 40) negReviewsScore = 25;
    else if (maxComplaintsShare >= 20) negReviewsScore = 15;
    else if (maxComplaintsShare > 0) negReviewsScore = 5;

    // 4. Review Response Rate / Unanswered flag (Weight: 20)
    const anyUnanswered = reviews.some(rev => rev.reviewsUnanswered);
    const responseRateScore = anyUnanswered ? 20 : 0;

    // 5. Growth Signals (Weight: 10)
    let hasGrowth = false;
    if (research && research.newsSignals) {
      hasGrowth = research.newsSignals.trim().length > 10;
    }
    const growthScore = hasGrowth ? 10 : 0;

    // 6. Hiring (Weight: 10)
    let hasHiring = false;
    if (research && research.hiringSignals) {
      const hStr = research.hiringSignals.toLowerCase();
      hasHiring = hStr.includes("hiring") || hStr.includes("open") || research.hiringSignals.trim().length > 5;
    }
    const hiringScore = hasHiring ? 10 : 0;

    // Sum total
    const total = presenceScore + reviewsScore + negReviewsScore + responseRateScore + growthScore + hiringScore;

    // Formulate reasons
    const reasons = [];
    if (mpCount > 0) reasons.push(`Selling on ${mpCount} marketplaces`);
    if (totalReviews >= 1000) reasons.push("High review volume representing high market scale");
    if (maxComplaintsShare >= 40) reasons.push("High share of negative reviews/complaints in listings");
    if (anyUnanswered) reasons.push("Poor review response rate with customer feedback left unanswered");
    if (hasGrowth) reasons.push("Strong marketplace expansion and growth signals");
    if (hasHiring) reasons.push("Hiring activity indicating business expansion");

    console.log(`[LeadScoringAgent] Calculated Opportunity Score: ${total}/100. Reasons:`, reasons);

    return {
      leadId,
      totalScore: total,
      marketplacePresenceScore: presenceScore,
      monthlyReviewsScore: reviewsScore,
      negativeReviewsScore: negReviewsScore,
      reviewResponseRateScore: responseRateScore,
      growthSignalsScore: growthScore,
      hiringScore,
      reasons
    };
  }
}
