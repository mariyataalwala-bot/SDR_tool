import dotenv from 'dotenv';
dotenv.config();

export interface SlotSuggestion {
  slots: string[];
  emailDraft: string;
}

export class MeetingService {
  /**
   * Evaluates available time slots and drafts a meeting calendar invite.
   */
  async suggestSlots(baseDateStr?: string): Promise<SlotSuggestion> {
    console.log(`[MeetingService] Fetching slot recommendations...`);

    // Standardize base date
    const baseDate = baseDateStr ? new Date(baseDateStr) : new Date();
    // Default mock slots next Tuesday
    const nextTuesday = new Date(baseDate);
    nextTuesday.setDate(baseDate.getDate() + ((2 + 7 - baseDate.getDay()) % 7 || 7)); // get next Tuesday
    
    const nextTuesdayFormatted = nextTuesday.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    const slots = [
      `${nextTuesdayFormatted} at 2:00 PM IST`,
      `${nextTuesdayFormatted} at 3:30 PM IST`,
      `${nextTuesdayFormatted} at 5:00 PM IST`
    ];

    const emailDraft = `Subject: Confirmed: 10-Min Demo - AI SDR Review Platform\n\n` +
      `Hi,\n\n` +
      `Thank you for scheduling the call. I have sent a calendar invite matching our slot:\n` +
      `📅 ${slots[0]}\n\n` +
      `We will meet over Google Meet at: https://meet.google.com/abc-defg-hij\n\n` +
      `Looking forward to talking next week!\n\n` +
      `Best regards,\nSDR Team`;

    return {
      slots,
      emailDraft
    };
  }
}
