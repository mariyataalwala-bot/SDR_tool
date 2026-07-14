import dns from 'dns';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const resolveMxAsync = promisify(dns.resolveMx);

export interface VerificationResult {
  validFormat: boolean;
  dnsMxValid: boolean;
  hunterValid: boolean;
  status: 'Valid' | 'Invalid' | 'Likely Valid';
  confidence: number;
}

export class VerificationService {
  private hunterKey?: string;

  constructor() {
    this.hunterKey = process.env.HUNTER_API_KEY;
  }

  /**
   * Runs formatting validation, queries Hunter API verifier, and performs DNS MX lookups.
   */
  async verifyContactEmail(email: string): Promise<VerificationResult> {
    console.log(`[VerificationService] Verifying email: ${email}`);

    // 1. Basic formatting check
    const formatRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validFormat = formatRegex.test(email);

    if (!validFormat) {
      console.log(`[VerificationService] Invalid format for email: ${email}`);
      return {
        validFormat: false,
        dnsMxValid: false,
        hunterValid: false,
        status: 'Invalid',
        confidence: 0
      };
    }

    const domain = email.split('@')[1].toLowerCase();

    // 2. DNS MX check
    let dnsMxValid = false;
    try {
      console.log(`[VerificationService] Performing DNS MX lookup for domain: ${domain}`);
      const records = await resolveMxAsync(domain);
      dnsMxValid = records && records.length > 0;
    } catch (err) {
      console.warn(`[VerificationService] DNS MX lookup failed or timed out for ${domain}`);
      dnsMxValid = false;
    }

    // 3. Hunter Verifier Check
    let hunterValid = false;
    if (this.hunterKey) {
      try {
        console.log(`[VerificationService] Running live Hunter Verifier API check`);
        const response = await fetch(`https://api.hunter.io/v2/email-verifier?email=${email}&api_key=${this.hunterKey}`);
        if (response.ok) {
          const json: any = await response.json();
          hunterValid = json.data?.status === 'valid' || json.data?.result === 'deliverable';
        }
      } catch (error) {
        console.warn(`[VerificationService] Hunter API verification failed:`, error);
        hunterValid = dnsMxValid; // Fallback to DNS MX
      }
    } else {
      // Mock verifications
      hunterValid = dnsMxValid;
    }

    // 4. Calculate status & overall confidence
    let status: 'Valid' | 'Invalid' | 'Likely Valid' = 'Invalid';
    let confidence = 0;

    if (validFormat && dnsMxValid) {
      status = hunterValid ? 'Valid' : 'Likely Valid';
      confidence = hunterValid ? 98 : 80;
    } else if (validFormat) {
      status = 'Invalid';
      confidence = 10;
    }

    console.log(`[VerificationService] Result for ${email}: Status=${status}, Confidence=${confidence}%`);

    return {
      validFormat,
      dnsMxValid,
      hunterValid,
      status,
      confidence
    };
  }
}
