import { MergedContact } from '../collectors/enrichment';
import { VerificationResult } from './verification';

export interface GatekeeperDecision {
  approved: boolean;
  reason: string;
  tier: number;
}

export class GatekeeperAgent {
  /**
   * Deterministically qualifies and approves contacts for outreach based on email status,
   * confidence rating, and priority designations.
   */
  evaluateContact(contact: MergedContact, verification: VerificationResult): GatekeeperDecision {
    console.log(`[GatekeeperAgent] Evaluating contact ${contact.name} (${contact.designation})`);

    const title = contact.designation.toLowerCase();
    let tier = 4; // default unprioritized tier

    // 1. Determine Title Priority Tier
    if (title.includes('ceo') || title.includes('founder') || title.includes('owner') || title.includes('proprietor')) {
      tier = 1;
    } else if (title.includes('ecommerce') || title.includes('e-commerce') || title.includes('marketplace') || title.includes('digital store')) {
      tier = 2;
    } else if (title.includes('brand') || title.includes('marketing') || title.includes('growth')) {
      tier = 3;
    }

    // 2. Validate qualifications
    const hasValidEmail = verification.status === 'Valid' || verification.status === 'Likely Valid';
    const hasHighConfidence = contact.confidence >= 80;
    const isPriorityTitle = tier <= 3;

    let approved = false;
    let reason = '';

    if (!hasValidEmail) {
      reason = 'Rejected: Unverified email address status';
    } else if (!hasHighConfidence) {
      reason = `Rejected: Discovery confidence score (${contact.confidence}%) is below the 80% threshold`;
    } else if (!isPriorityTitle) {
      reason = `Rejected: Designation (${contact.designation}) does not match priority outreach roles`;
    } else {
      approved = true;
      reason = `Approved: Verified email, high confidence (${contact.confidence}%), and Tier ${tier} job title`;
    }

    console.log(`[GatekeeperAgent] Decision: Approved=${approved}, Reason=${reason}, Tier=${tier}`);

    return {
      approved,
      reason,
      tier
    };
  }
}
