import { DbHelper } from './dbHelper';

export class CrmService {
  /**
   * Upserts a company.
   */
  async upsertCompany(name: string, website: string, industry?: string, headquarters?: string, employeeCount?: number) {
    console.log(`[CrmService] Logging event: LEAD_IMPORTED / UPSERT_COMPANY for ${name}`);
    return await DbHelper.upsertCompany(name, website, industry, headquarters, employeeCount);
  }

  /**
   * Appends a research summary block to the DB.
   */
  async saveResearch(companyId: number, data: {
    description?: string;
    category?: string;
    activeMarketplaces?: string;
    reputationRating?: number;
    marketplaceDetails?: string;
  }) {
    console.log(`[CrmService] Logging event: RESEARCH_COMPLETED for company ID ${companyId}`);
    return await DbHelper.saveResearch(companyId, data);
  }

  /**
   * Saves or updates target contacts.
   */
  async saveContact(companyId: number, contact: {
    name: string;
    designation: string;
    linkedin?: string;
    email?: string;
    phone?: string;
    sources: string[];
    confidence: number;
    connectionNote?: string;
    emailSubject?: string;
    emailBody?: string;
    followupSubject?: string;
    followupBody?: string;
    additionalNotes?: string;
  }) {
    console.log(`[CrmService] Logging event: CONTACTS_FOUND for contact ${contact.name}`);
    
    const contactData = {
      name: contact.name,
      designation: contact.designation,
      linkedin: contact.linkedin,
      phone: contact.phone,
      sources: contact.sources.join(', '),
      confidence: contact.confidence,
      connectionNote: contact.connectionNote,
      emailSubject: contact.emailSubject,
      emailBody: contact.emailBody,
      followupSubject: contact.followupSubject,
      followupBody: contact.followupBody,
      additionalNotes: contact.additionalNotes
    };

    return await DbHelper.upsertContact(companyId, contact.email || '', contactData);
  }

  /**
   * Logs a pipeline transition event.
   */
  async logPipelineEvent(companyId: number, stage: string, comments?: string) {
    console.log(`[CrmService] Pipeline Audit: Transition to [${stage}]`);
    return await DbHelper.logPipelineEvent(companyId, stage, comments);
  }

  /**
   * Retrieves all companies stored in CRM.
   */
  async getAllCompanies() {
    return await DbHelper.getCompanies();
  }

  /**
   * Retrieves all contacts stored in CRM.
   */
  async getAllContacts() {
    return await DbHelper.getContacts();
  }
}
