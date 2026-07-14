import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

export interface Lead {
  brandName: string;
  website: string;
}

export class SheetsService {
  private mockLeadsPath: string;

  constructor() {
    this.mockLeadsPath = path.resolve(process.cwd(), 'mock_leads.json');
  }

  /**
   * Reads new leads from Google Sheets (or falls back to mock_leads.json).
   */
  async readLeads(): Promise<Lead[]> {
    console.log(`[SheetsService] Reading leads...`);

    // Check if Google Sheet ID is provided (if so, we would do a live fetch; otherwise fallback)
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (sheetId) {
      console.log(`[SheetsService] Live Google Sheets ID configured: ${sheetId}. (Using mockup records for demonstration).`);
    }

    if (!fs.existsSync(this.mockLeadsPath)) {
      console.warn(`[SheetsService] mock_leads.json not found at ${this.mockLeadsPath}. Initializing with empty list.`);
      return [];
    }

    const data = fs.readFileSync(this.mockLeadsPath, 'utf8');
    const json = JSON.parse(data);

    return json.map((row: any) => ({
      brandName: row['Brand Name'] || row['brandName'],
      website: row['Website'] || row['website']
    }));
  }

  /**
   * Mirrors the final status and enrichment output back to the Sheet (or mock_leads.json).
   */
  async mirrorLeadResult(brandName: string, status: string, score: number, contactEmail?: string): Promise<void> {
    console.log(`[SheetsService] Mirroring result back to sheet for ${brandName}: Status=${status}, Score=${score}`);
    
    if (!fs.existsSync(this.mockLeadsPath)) {
      return;
    }

    try {
      const data = fs.readFileSync(this.mockLeadsPath, 'utf8');
      const json = JSON.parse(data);

      const index = json.findIndex((row: any) => 
        (row['Brand Name'] === brandName || row['brandName'] === brandName)
      );

      if (index !== -1) {
        json[index] = {
          ...json[index],
          'Status': status,
          'Opportunity Score': score,
          'Primary Contact': contactEmail || 'None'
        };
        fs.writeFileSync(this.mockLeadsPath, JSON.stringify(json, null, 2), 'utf8');
        console.log(`[SheetsService] Updated mock_leads.json successfully.`);
      }
    } catch (error) {
      console.error(`[SheetsService] Failed to update mock_leads.json:`, error);
    }
  }
}
