import fs from 'fs';
import path from 'path';
import { prisma, checkDbHealth } from '../database';

export interface LocalDbSchema {
  companies: any[];
  researchLogs: any[];
  browserLogs: any[];
  errorLogs: any[];
  whatsAppGroups: any[];
}

export class DbHelper {
  private static fallbackPath = path.resolve(process.cwd(), 'database_fallback.json');
  private static inMemoryDb: LocalDbSchema | null = null;

  private static loadLocal(): LocalDbSchema {
    if (process.env.VERCEL) {
      if (!this.inMemoryDb) {
        this.inMemoryDb = { companies: [], researchLogs: [], browserLogs: [], errorLogs: [], whatsAppGroups: [] };
      }
      return this.inMemoryDb;
    }

    if (!fs.existsSync(this.fallbackPath)) {
      const init: LocalDbSchema = { companies: [], researchLogs: [], browserLogs: [], errorLogs: [], whatsAppGroups: [] };
      try {
        fs.writeFileSync(this.fallbackPath, JSON.stringify(init, null, 2), 'utf8');
      } catch (err) {
        console.warn('[DbHelper] Read-only file system, falling back to memory database.');
        this.inMemoryDb = init;
        return this.inMemoryDb;
      }
      return init;
    }
    try {
      const text = fs.readFileSync(this.fallbackPath, 'utf8');
      const data = JSON.parse(text);
      if (!data.whatsAppGroups) {
        data.whatsAppGroups = [];
      }
      return data;
    } catch {
      return { companies: [], researchLogs: [], browserLogs: [], errorLogs: [], whatsAppGroups: [] };
    }
  }

  private static saveLocal(data: LocalDbSchema) {
    if (process.env.VERCEL || this.inMemoryDb) {
      this.inMemoryDb = data;
      return;
    }
    try {
      fs.writeFileSync(this.fallbackPath, JSON.stringify(data, null, 2), 'utf8');
    } catch {
      this.inMemoryDb = data;
    }
  }

  /**
   * Retrieves all companies from PostgreSQL or the local file fallback.
   */
  static async getCompanies(): Promise<any[]> {
    const active = await checkDbHealth();
    if (active) {
      try {
        return await prisma.company.findMany({
          include: {
            researches: true,
            contacts: true,
            pipelines: true,
            activities: true,
            pipelineStates: true
          }
        });
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL read error, falling back to local storage:`, err);
      }
    }

    const local = this.loadLocal();
    return local.companies;
  }

  /**
   * Retrieves all contacts from PostgreSQL or the local file fallback.
   */
  static async getContacts(): Promise<any[]> {
    const active = await checkDbHealth();
    if (active) {
      try {
        return await prisma.contact.findMany({
          include: {
            company: true
          }
        });
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL read error, falling back to local storage:`, err);
      }
    }

    const local = this.loadLocal();
    const contacts: any[] = [];
    local.companies.forEach(c => {
      const companyRef = { ...c };
      delete companyRef.contacts;
      delete companyRef.researches;
      delete companyRef.pipelines;
      delete companyRef.activities;
      delete companyRef.pipelineStates;

      c.contacts.forEach((con: any) => {
        contacts.push({
          ...con,
          company: companyRef
        });
      });
    });
    return contacts;
  }

  /**
   * Upserts a company.
   */
  static async upsertCompany(name: string, website: string, industry?: string, headquarters?: string, employeeCount?: number): Promise<any> {
    const active = await checkDbHealth();
    if (active) {
      try {
        return await prisma.company.upsert({
          where: { name },
          update: { website, industry, headquarters, employeeCount },
          create: { name, website, industry, headquarters, employeeCount, status: 'NEW' }
        });
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error, falling back to local storage:`, err);
      }
    }

    const local = this.loadLocal();
    let company = local.companies.find(c => c.name.toLowerCase() === name.toLowerCase());

    if (company) {
      company.website = website;
      if (industry) company.industry = industry;
      if (headquarters) company.headquarters = headquarters;
      if (employeeCount) company.employeeCount = employeeCount;
      company.updatedAt = new Date().toISOString();
    } else {
      company = {
        id: local.companies.length + 1,
        name,
        website,
        industry: industry || null,
        headquarters: headquarters || null,
        employeeCount: employeeCount || null,
        status: 'NEW',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        researches: [],
        contacts: [],
        activities: [],
        pipelines: [],
        pipelineStates: []
      };
      local.companies.push(company);
    }

    this.saveLocal(local);
    return company;
  }

  /**
   * Updates company attributes.
   */
  static async updateCompany(id: number, data: any): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.company.update({
          where: { id },
          data
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    const company = local.companies.find(c => c.id === id);
    if (company) {
      Object.keys(data).forEach(k => {
        company[k] = data[k];
      });
      company.updatedAt = new Date().toISOString();
      this.saveLocal(local);
    }
  }

  /**
   * Save a research block.
   */
  static async saveResearch(companyId: number, researchData: any): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.research.create({
          data: {
            companyId,
            description: researchData.description,
            category: researchData.category,
            activeMarketplaces: researchData.activeMarketplaces,
            reputationRating: researchData.reputationRating,
            marketplaceDetails: researchData.marketplaceDetails
          }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    const company = local.companies.find(c => c.id === companyId);
    if (company) {
      const research = {
        id: company.researches.length + 1,
        companyId,
        ...researchData,
        createdAt: new Date().toISOString()
      };
      company.researches.push(research);
      this.saveLocal(local);
    }
  }

  /**
   * Upsert a contact.
   */
  static async upsertContact(companyId: number, email: string, contactData: any): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.contact.upsert({
          where: {
            companyId_email: {
              companyId,
              email
            }
          },
          update: contactData,
          create: {
            companyId,
            email,
            ...contactData
          }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    const company = local.companies.find(c => c.id === companyId);
    if (company) {
      let contact = company.contacts.find((con: any) => con.email === email);
      if (contact) {
        Object.keys(contactData).forEach(k => {
          contact[k] = contactData[k];
        });
      } else {
        contact = {
          id: company.contacts.length + 1,
          companyId,
          email,
          ...contactData,
          createdAt: new Date().toISOString()
        };
        company.contacts.push(contact);
      }
      this.saveLocal(local);
    }
  }

  /**
   * Logs a pipeline stage event.
   */
  static async logPipelineEvent(companyId: number, stage: string, comments?: string): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.pipeline.create({
          data: {
            companyId,
            stage,
            comments
          }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    const company = local.companies.find(c => c.id === companyId);
    if (company) {
      company.pipelines.push({
        id: company.pipelines.length + 1,
        companyId,
        stage,
        comments,
        timestamp: new Date().toISOString()
      });
      this.saveLocal(local);
    }
  }

  /**
   * Logs a state transition event.
   */
  static async logPipelineState(companyId: number, state: string, comments?: string): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.pipelineState.create({
          data: {
            companyId,
            state,
            comments
          }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    const company = local.companies.find(c => c.id === companyId);
    if (company) {
      company.pipelineStates.push({
        id: company.pipelineStates.length + 1,
        companyId,
        state,
        comments,
        timestamp: new Date().toISOString()
      });
      this.saveLocal(local);
    }
  }

  /**
   * Logs a browser operation.
   */
  static async logBrowser(action: string, url: string | null, message: string): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.browserLog.create({
          data: { action, url, message }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    local.browserLogs.push({
      id: local.browserLogs.length + 1,
      action,
      url,
      message,
      timestamp: new Date().toISOString()
    });
    this.saveLocal(local);
  }

  /**
   * Logs an execution trace error.
   */
  static async logError(context: string, message: string, stack?: string): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.errorLog.create({
          data: { context, message, stack }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    local.errorLogs.push({
      id: local.errorLogs.length + 1,
      context,
      message,
      stack,
      timestamp: new Date().toISOString()
    });
    this.saveLocal(local);
  }

  /**
   * Write activity logs.
   */
  static async logActivity(companyId: number, contactId: number, type: string, channel: string, status: string, messageContent: string): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.activity.create({
          data: { companyId, contactId, type, channel, status, messageContent }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    const company = local.companies.find(c => c.id === companyId);
    if (company) {
      company.activities.push({
        id: company.activities.length + 1,
        companyId,
        contactId,
        type,
        channel,
        status,
        messageContent,
        timestamp: new Date().toISOString()
      });
      this.saveLocal(local);
    }
  }

  /**
   * Saves or updates a WhatsApp group in PostgreSQL or local fallback.
   */
  static async saveWhatsAppGroup(group: any): Promise<any> {
    const active = await checkDbHealth();
    if (active) {
      try {
        return await prisma.whatsAppGroup.upsert({
          where: { inviteLink: group.inviteLink },
          update: {
            title: group.title,
            description: group.description,
            country: group.country,
            city: group.city,
            language: group.language,
            category: group.category,
            tags: group.tags,
            source: group.source,
            lastChecked: new Date(),
            active: group.active ?? true
          },
          create: {
            title: group.title,
            inviteLink: group.inviteLink,
            description: group.description,
            country: group.country,
            city: group.city,
            language: group.language,
            category: group.category,
            tags: group.tags,
            source: group.source,
            lastChecked: new Date(),
            active: group.active ?? true
          }
        });
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error, falling back to local storage:`, err);
      }
    }

    const local = this.loadLocal();
    let entry = local.whatsAppGroups.find(g => g.inviteLink.toLowerCase() === group.inviteLink.toLowerCase());
    if (entry) {
      entry.title = group.title;
      entry.description = group.description;
      if (group.country) entry.country = group.country;
      if (group.city) entry.city = group.city;
      if (group.language) entry.language = group.language;
      if (group.category) entry.category = group.category;
      if (group.tags) entry.tags = group.tags;
      if (group.source) entry.source = group.source;
      entry.lastChecked = new Date().toISOString();
      entry.active = group.active ?? true;
    } else {
      entry = {
        id: local.whatsAppGroups.length + 1,
        title: group.title,
        inviteLink: group.inviteLink,
        description: group.description,
        country: group.country || null,
        city: group.city || null,
        language: group.language || null,
        category: group.category || null,
        tags: group.tags || null,
        source: group.source || null,
        lastChecked: new Date().toISOString(),
        active: group.active ?? true,
        createdAt: new Date().toISOString()
      };
      local.whatsAppGroups.push(entry);
    }
    this.saveLocal(local);
    return entry;
  }

  /**
   * Retrieves WhatsApp groups matching filters.
   */
  static async searchWhatsAppGroups(filters: any = {}): Promise<any[]> {
    const active = await checkDbHealth();
    if (active) {
      try {
        const whereClause: any = {};
        
        if (filters.country) whereClause.country = { equals: filters.country, mode: 'insensitive' };
        if (filters.city) whereClause.city = { equals: filters.city, mode: 'insensitive' };
        if (filters.language) whereClause.language = { equals: filters.language, mode: 'insensitive' };
        if (filters.category) whereClause.category = { equals: filters.category, mode: 'insensitive' };
        
        if (filters.active !== undefined) {
          whereClause.active = filters.active;
        }

        const andConditions: any[] = [];

        if (filters.niche) {
          andConditions.push({
            OR: [
              { title: { contains: filters.niche, mode: 'insensitive' } },
              { description: { contains: filters.niche, mode: 'insensitive' } },
              { tags: { contains: filters.niche, mode: 'insensitive' } }
            ]
          });
        }

        if (filters.keywords) {
          andConditions.push({
            OR: [
              { title: { contains: filters.keywords, mode: 'insensitive' } },
              { description: { contains: filters.keywords, mode: 'insensitive' } }
            ]
          });
        }

        if (andConditions.length > 0) {
          whereClause.AND = andConditions;
        }

        const orderBy: any = {};
        if (filters.newest || filters.recentlyAdded) {
          orderBy.createdAt = 'desc';
        } else {
          orderBy.lastChecked = 'desc';
        }

        return await prisma.whatsAppGroup.findMany({
          where: whereClause,
          orderBy
        });
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL read error, falling back to local:`, err);
      }
    }

    const local = this.loadLocal();
    let results = [...local.whatsAppGroups];

    if (filters.country) {
      results = results.filter(g => g.country && g.country.toLowerCase() === filters.country.toLowerCase());
    }
    if (filters.city) {
      results = results.filter(g => g.city && g.city.toLowerCase() === filters.city.toLowerCase());
    }
    if (filters.language) {
      results = results.filter(g => g.language && g.language.toLowerCase() === filters.language.toLowerCase());
    }
    if (filters.category) {
      results = results.filter(g => g.category && g.category.toLowerCase() === filters.category.toLowerCase());
    }
    if (filters.active !== undefined) {
      results = results.filter(g => g.active === filters.active);
    }
    if (filters.niche) {
      const q = filters.niche.toLowerCase();
      results = results.filter(g => 
        (g.title && g.title.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.tags && g.tags.toLowerCase().includes(q))
      );
    }
    if (filters.keywords) {
      const q = filters.keywords.toLowerCase();
      results = results.filter(g => 
        (g.title && g.title.toLowerCase().includes(q)) ||
        (g.description && g.description.toLowerCase().includes(q))
      );
    }

    if (filters.newest || filters.recentlyAdded) {
      results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      results.sort((a, b) => new Date(b.lastChecked).getTime() - new Date(a.lastChecked).getTime());
    }

    return results;
  }

  /**
   * Gets all active WhatsApp groups for verification.
   */
  static async getActiveWhatsAppGroups(): Promise<any[]> {
    const active = await checkDbHealth();
    if (active) {
      try {
        return await prisma.whatsAppGroup.findMany({
          where: { active: true }
        });
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL read error, falling back:`, err);
      }
    }

    const local = this.loadLocal();
    return local.whatsAppGroups.filter(g => g.active === true);
  }

  /**
   * Updates validation status of WhatsApp group.
   */
  static async updateWhatsAppGroupStatus(id: number, activeStatus: boolean): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.whatsAppGroup.update({
          where: { id },
          data: { active: activeStatus, lastChecked: new Date() }
        });
        return;
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL write error:`, err);
      }
    }

    const local = this.loadLocal();
    const group = local.whatsAppGroups.find(g => g.id === id);
    if (group) {
      group.active = activeStatus;
      group.lastChecked = new Date().toISOString();
      this.saveLocal(local);
    }
  }

  /**
   * Empties fallback file database records.
   */
  static async clearDatabase(): Promise<void> {
    const active = await checkDbHealth();
    if (active) {
      try {
        await prisma.company.deleteMany({});
        await prisma.whatsAppGroup.deleteMany({});
      } catch (err) {
        console.warn(`[DbHelper] PostgreSQL delete failed:`, err);
      }
    }

    const init: LocalDbSchema = { companies: [], researchLogs: [], browserLogs: [], errorLogs: [], whatsAppGroups: [] };
    this.saveLocal(init);
  }
}
