import { DbHelper } from './dbHelper';

export class LoggerService {
  /**
   * Log browser action.
   */
  static async logBrowser(action: string, url: string | null, message: string): Promise<void> {
    await DbHelper.logBrowser(action, url, message);
  }

  /**
   * Log state transition to pipeline_states table.
   */
  static async logPipelineState(companyId: number, state: string, comments?: string): Promise<void> {
    await DbHelper.logPipelineState(companyId, state, comments);
  }

  /**
   * Log error details to error_logs table.
   */
  static async logError(context: string, message: string, stack?: string): Promise<void> {
    await DbHelper.logError(context, message, stack);
  }
}
