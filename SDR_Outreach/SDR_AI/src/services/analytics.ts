import { DbHelper } from './dbHelper';

export interface DashboardMetrics {
  totalLeads: number;
  researchedLeads: number;
  contactsFound: number;
  outboundSent: number;
  repliesReceived: number;
  meetingsBooked: number;
  pipelineBreakdown: Record<string, number>;
}

export class AnalyticsAgent {
  /**
   * Compiles platform performance metrics by inspecting database records.
   */
  async compileMetrics(): Promise<DashboardMetrics> {
    console.log(`[AnalyticsAgent] Compiling performance analytics...`);
    const companies = await DbHelper.getCompanies();

    const totalLeads = companies.length;
    
    const researchedLeads = companies.filter(c => c.researches && c.researches.length > 0).length;

    let contactsFound = 0;
    let outboundSent = 0;
    let repliesReceived = 0;
    let meetingsBooked = 0;

    const pipelineBreakdown: Record<string, number> = {};

    companies.forEach(c => {
      if (c.contacts) contactsFound += c.contacts.length;
      
      if (c.activities) {
        c.activities.forEach((act: any) => {
          if (act.type === 'outbound') outboundSent++;
          if (act.type === 'inbound' && act.status === 'REPLIED') repliesReceived++;
        });
      }

      if (c.pipelines) {
        c.pipelines.forEach((p: any) => {
          pipelineBreakdown[p.stage] = (pipelineBreakdown[p.stage] || 0) + 1;
          if (p.stage === 'Meeting Scheduled') meetingsBooked++;
        });
      }
    });

    return {
      totalLeads,
      researchedLeads,
      contactsFound,
      outboundSent,
      repliesReceived,
      meetingsBooked,
      pipelineBreakdown
    };
  }
}
