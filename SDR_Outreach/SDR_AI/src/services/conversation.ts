import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

export interface IntentClassification {
  intent: 'Interested' | 'Need Pricing' | 'Not Interested' | 'General Inquiry';
  confidence: number; // 0 to 100 percentage
  suggestedResponse: string;
}

export class ConversationService {
  private geminiApiKey?: string;

  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
  }

  /**
   * Classifies reply intent and suggests a follow-up response script.
   */
  async classifyReply(messageHistory: string[]): Promise<IntentClassification> {
    const latestMessage = messageHistory[messageHistory.length - 1] || '';
    console.log(`[ConversationService] Classifying message intent: "${latestMessage.substring(0, 40)}..."`);

    // 1. Check for live Gemini API
    if (this.geminiApiKey && this.geminiApiKey !== 'mock_key_for_testing') {
      try {
        const ai = new GoogleGenerativeAI(this.geminiApiKey);
        const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

        const prompt = `
          Analyze the following prospect response and classify their intent into one of:
          - 'Interested'
          - 'Need Pricing'
          - 'Not Interested'
          - 'General Inquiry'

          Also suggest a professional, short, conversion-focused SDR reply script.

          Prospect Message: "${latestMessage}"
          All Message History: ${JSON.stringify(messageHistory)}

          Provide output as a valid JSON object matching this schema:
          {
            "intent": "Interested | Need Pricing | Not Interested | General Inquiry",
            "confidence": 85, // number from 0 to 100
            "suggestedResponse": "Suggested email reply..."
          }
        `;

        const result = await model.generateContent(prompt);
        const cleanJson = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
      } catch (error) {
        console.warn(`[ConversationService] Gemini classification failed, falling back to rule engine:`, error);
      }
    }

    // 2. Fallback rule-based heuristic engine
    const text = latestMessage.toLowerCase();
    
    if (text.includes('stop') || text.includes('remove') || text.includes('unsubscribe') || text.includes('not interested') || text.includes('leave me alone')) {
      return {
        intent: 'Not Interested',
        confidence: 85,
        suggestedResponse: "Understood. I will remove you from our mailing list immediately. Thank you for your time."
      };
    }

    if (text.includes('cost') || text.includes('price') || text.includes('pricing') || text.includes('how much') || text.includes('fees') || text.includes('charge')) {
      return {
        intent: 'Need Pricing',
        confidence: 85,
        suggestedResponse: "Our review management platform pricing starts at ₹12,000/month per brand listing, which covers automated response tracking on Amazon, Flipkart, Blinkit, and Zepto. We also offer bulk rates for additional listings. Would you be open to a 5-minute call to review our subscription models?"
      };
    }

    if (text.includes('interested') || text.includes('details') || text.includes('call') || text.includes('meeting') || text.includes('demo') || text.includes('zoom') || text.includes('schedule') || text.includes('time')) {
      return {
        intent: 'Interested',
        confidence: 85,
        suggestedResponse: "Excellent! I would love to show you a quick demo of the dashboard. Would any of the following slots work for a 10-minute Google Meet call next Tuesday?"
      };
    }

    // Default general query fallback
    return {
      intent: 'General Inquiry',
      confidence: 70,
      suggestedResponse: "Thanks for your response. Let me know if you have any questions about our review monitoring features or if you would like me to compile a custom ratings audit report for your brand."
    };
  }
}
