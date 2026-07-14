import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

export interface PersonalizationCopy {
  connectionNote: string;
  emailSubject: string;
  emailBody: string;
  followupSubject: string;
  followupBody: string;
  additionalNotes: string;
}

export class PersonalizationService {
  private geminiApiKey?: string;

  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
  }

  /**
   * Generates a custom outreach sequence containing LinkedIn note, email body, and follow-ups.
   */
  async generatePersonalizedCopy(
    contactName: string,
    brandName: string,
    jobTitle: string,
    researchProfile: any,
    reputationSummary: any
  ): Promise<PersonalizationCopy> {
    console.log(`[PersonalizationService] Generating personalized copy for ${contactName} at ${brandName}`);

    // If Gemini API is configured, use it for dynamic personalization
    if (this.geminiApiKey && this.geminiApiKey !== 'mock_key_for_testing') {
      try {
        const ai = new GoogleGenerativeAI(this.geminiApiKey);
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `
          You are a professional Sales Development Representative (SDR) pitching Review Management Services.
          Draft a highly personalized sequence for:
          - Contact Name: ${contactName}
          - Job Title: ${jobTitle}
          - Brand Name: ${brandName}
          - Brand Overview: ${researchProfile.companyOverview || ''}
          - Active Marketplaces: ${researchProfile.marketplacePresence || ''}
          - Weakest Marketplace: ${reputationSummary.weakestMarketplace || ''}
          - Top Complaints: ${JSON.stringify(reputationSummary.complaints || [])}

          Generate exactly these 6 copy blocks:
          1. connectionNote: LinkedIn invitation note (max 300 characters).
          2. emailSubject: Short, eye-catching email subject.
          3. emailBody: Professional, brief cold email.
          4. followupSubject: Follow-up email subject (usually "Re: <emailSubject>").
          5. followupBody: Short, polite follow-up email.
          6. additionalNotes: Helpful background notes on why this angle was chosen.

          Provide the output as a valid JSON object matching this schema:
          {
            "connectionNote": "...",
            "emailSubject": "...",
            "emailBody": "...",
            "followupSubject": "...",
            "followupBody": "...",
            "additionalNotes": "..."
          }
        `;

        const result = await model.generateContent(prompt);
        const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
      } catch (error) {
        console.warn(`[PersonalizationService] Gemini generation failed, falling back to template mock:`, error);
      }
    }

    // Default high-quality mock copy custom tailored to the brand
    const firstName = contactName.split(' ')[0];
    const weakestMarketplace = reputationSummary.weakestMarketplace || 'Amazon';
    
    // Customize specific complaints based on rating
    const complaintsStr = reputationSummary.complaints.length > 0 
      ? reputationSummary.complaints.map((c: any) => `${c.type} (${c.percentage}%)`).slice(0, 2).join(' and ')
      : 'delivery issues';

    const connectionNote = `Hi ${firstName}, noticed your products active on ${weakestMarketplace}. Would love to connect regarding eCommerce review strategies.`;
    
    const emailSubject = `Quick question re: ${brandName}'s ratings on ${weakestMarketplace}`;
    
    const emailBody = `Hi ${firstName},\n\n` +
      `I noticed that ${brandName} is performing well, but some customers on ${weakestMarketplace} are highlighting issues like ${complaintsStr}.\n\n` +
      `Since negative reviews heavily impact buy-box conversion, I wanted to share a quick audit of how automated review management could recover up to 15% of your lost sales. Do you have 5 minutes for a brief call next Tuesday?\n\n` +
      `Best regards,\nSDR Team`;

    const followupSubject = `Re: Quick question re: ${brandName}'s ratings on ${weakestMarketplace}`;
    
    const followupBody = `Hi ${firstName},\n\n` +
      `Just following up on my previous note. I know you're busy growing ${brandName}.\n\n` +
      `Would it make sense to connect for a quick 5-minute showcase of how we help brands automate responses to negative reviews on ${weakestMarketplace}?\n\n` +
      `Let me know if next Tuesday at 3 PM works for you.\n\n` +
      `Best,\nSDR Team`;

    const additionalNotes = `Angle selected because of unanswered negative reviews regarding ${complaintsStr} on ${weakestMarketplace}.`;

    return {
      connectionNote,
      emailSubject,
      emailBody,
      followupSubject,
      followupBody,
      additionalNotes
    };
  }
}
