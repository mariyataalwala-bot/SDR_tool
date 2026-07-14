import { prisma } from '../database';

export type OutreachState =
  | 'INITIALIZED'
  | 'CONNECTION_SENT'
  | 'CONNECTION_ACCEPTED'
  | 'INITIAL_MESSAGE_SENT'
  | 'WAITING_FOR_REPLY'
  | 'AI_FOLLOW_UP'
  | 'PROSPECT_REPLIED'
  | 'INTERESTED'
  | 'MEETING_SCHEDULED'
  | 'WON'
  | 'LOST';

export class OutreachAgent {
  /**
   * Initializes the outreach campaign state for a given contact.
   */
  async initializeCampaign(companyId: number, contactId: number): Promise<OutreachState> {
    console.log(`[OutreachAgent] Initializing outreach campaign for contact ID: ${contactId}`);
    
    // Log the initial stage in Pipeline logs
    await prisma.pipeline.create({
      data: {
        companyId,
        stage: 'Campaign Initialized',
        comments: `Outreach track initialized for contact #${contactId}`
      }
    });

    return 'INITIALIZED';
  }

  /**
   * Simulates sending a LinkedIn connection request.
   */
  async sendConnectionRequest(companyId: number, contactId: number, note: string): Promise<OutreachState> {
    console.log(`[OutreachAgent] Transitioning to CONNECTION_SENT for contact: ${contactId}`);

    // Create Activity
    await prisma.activity.create({
      data: {
        companyId,
        contactId,
        type: 'outbound',
        channel: 'LinkedIn',
        status: 'SENT',
        messageContent: note
      }
    });

    // Update Pipeline Stage
    await prisma.pipeline.create({
      data: {
        companyId,
        stage: 'Connection Sent',
        comments: 'LinkedIn connection request sent with personalization note.'
      }
    });

    return 'CONNECTION_SENT';
  }

  /**
   * Transitions to CONNECTION_ACCEPTED and automatically triggers the initial pitch email.
   */
  async acceptConnectionAndPitch(
    companyId: number,
    contactId: number,
    emailSubject: string,
    emailBody: string
  ): Promise<OutreachState> {
    console.log(`[OutreachAgent] Contact ${contactId} accepted connection. Pitching via Email...`);

    // Log connection accepted
    await prisma.activity.create({
      data: {
        companyId,
        contactId,
        type: 'inbound',
        channel: 'LinkedIn',
        status: 'DELIVERED',
        messageContent: '[LinkedIn Event] Connection request accepted.'
      }
    });

    await prisma.pipeline.create({
      data: {
        companyId,
        stage: 'Connection Accepted',
        comments: 'Contact accepted the LinkedIn connection.'
      }
    });

    // Send the cold email pitch
    await prisma.activity.create({
      data: {
        companyId,
        contactId,
        type: 'outbound',
        channel: 'Email',
        status: 'SENT',
        messageContent: `Subject: ${emailSubject}\n\n${emailBody}`
      }
    });

    await prisma.pipeline.create({
      data: {
        companyId,
        stage: 'Initial Message Sent',
        comments: 'Personalized cold pitch email sent.'
      }
    });

    return 'WAITING_FOR_REPLY';
  }

  /**
   * Triggers the follow-up email if no reply is received.
   */
  async triggerFollowUp(
    companyId: number,
    contactId: number,
    subject: string,
    body: string
  ): Promise<OutreachState> {
    console.log(`[OutreachAgent] Triggering follow-up track for contact: ${contactId}`);

    await prisma.activity.create({
      data: {
        companyId,
        contactId,
        type: 'outbound',
        channel: 'Email',
        status: 'SENT',
        messageContent: `Subject: ${subject}\n\n${body}`
      }
    });

    await prisma.pipeline.create({
      data: {
        companyId,
        stage: 'AI Follow-up Sent',
        comments: 'Day 3 follow-up email sent automatically.'
      }
    });

    return 'AI_FOLLOW_UP';
  }

  /**
   * Moves outreach state to PROSPECT_REPLIED and logs the incoming message.
   */
  async registerReply(companyId: number, contactId: number, channel: string, messageText: string): Promise<OutreachState> {
    console.log(`[OutreachAgent] Reply received from contact: ${contactId} on ${channel}`);

    // Log incoming activity
    await prisma.activity.create({
      data: {
        companyId,
        contactId,
        type: 'inbound',
        channel,
        status: 'REPLIED',
        messageContent: messageText
      }
    });

    await prisma.pipeline.create({
      data: {
        companyId,
        stage: 'Reply Received',
        comments: `Prospect replied via ${channel}: "${messageText.substring(0, 50)}..."`
      }
    });

    return 'PROSPECT_REPLIED';
  }
}
