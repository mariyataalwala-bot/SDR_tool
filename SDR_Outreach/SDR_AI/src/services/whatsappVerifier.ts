import { DbHelper } from './dbHelper';

export interface VerificationSummary {
  checkedCount: number;
  stillActiveCount: number;
  deactivatedCount: number;
}

export class WhatsAppVerifierService {
  /**
   * Performs an active HTTP validation request on a WhatsApp invite code.
   */
  private async checkCodeActive(code: string): Promise<boolean | 'rateLimited'> {
    if (!code || code.length < 20 || code.length > 24) {
      return false;
    }

    const url = `https://chat.whatsapp.com/invite/${code}`;
    try {
      const res = await globalThis.fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/115.0.0.0'
        },
        signal: (AbortSignal as any).timeout(4000)
      } as any);

      // If rate limited, return string indicator to halt verification loop
      if (res.status === 429) {
        return 'rateLimited';
      }

      if (res.status !== 200) {
        return false;
      }

      const html = await res.text();
      const lowerHtml = html.toLowerCase();

      // Check if page contains error/invalid indicators
      const invalidStrings = [
        'invite link is invalid',
        'link is invalid',
        'check the link and try again',
        'invite link was reset',
        'invite link has expired',
        'link has expired',
        'can\'t join this group',
        'no longer active',
        'group no longer exists'
      ];

      for (const str of invalidStrings) {
        if (lowerHtml.includes(str)) {
          return false;
        }
      }

      // Check if title or og:title exists
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
      
      const groupName = ogTitleMatch ? ogTitleMatch[1].trim() : '';
      const lowerName = groupName.toLowerCase();
      if (
        !groupName || 
        lowerName === 'whatsapp group invite' || 
        lowerName === 'join chat' || 
        lowerName === 'whatsapp' ||
        lowerName.includes('error') ||
        lowerName.includes('invalid') ||
        lowerName.includes('expired')
      ) {
        return false;
      }

      return true;
    } catch (err: any) {
      console.warn(`[WhatsAppVerifierService] Network check failed for ${code}:`, err.message);
      return false; // Discard on timeout/failures to prevent broken links
    }
  }

  /**
   * Runs the re-verification process over all active groups saved in the database.
   */
  async verifyAllActiveLinks(): Promise<VerificationSummary> {
    console.log('[WhatsAppVerifierService] Starting 24-hour active groups re-verification...');
    const activeGroups = await DbHelper.getActiveWhatsAppGroups();
    
    let checkedCount = 0;
    let stillActiveCount = 0;
    let deactivatedCount = 0;

    let rateLimited = false;

    for (const group of activeGroups) {
      if (rateLimited) {
        continue;
      }

      checkedCount++;
      const codeMatch = group.inviteLink.match(/chat\.whatsapp\.com\/(?:invite\/)?([a-zA-Z0-9_-]{20,24})/i);
      if (!codeMatch) {
        await DbHelper.updateWhatsAppGroupStatus(group.id, false);
        deactivatedCount++;
        continue;
      }

      const code = codeMatch[1];
      const isAlive = await this.checkCodeActive(code);
      
      if (isAlive === 'rateLimited') {
        rateLimited = true;
        console.warn(`[WhatsAppVerifierService] Hit WhatsApp Rate Limit (429) during verification loop. Suspending check.`);
        checkedCount--;
        continue;
      }

      if (isAlive === true) {
        stillActiveCount++;
        await DbHelper.updateWhatsAppGroupStatus(group.id, true);
      } else {
        deactivatedCount++;
        console.log(`[WhatsAppVerifierService] Group invite expired/invalid: ${group.inviteLink}. Deactivating.`);
        await DbHelper.updateWhatsAppGroupStatus(group.id, false);
      }

      // Small delay to prevent spamming WhatsApp servers too hard
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[WhatsAppVerifierService] Recheck completed: checked ${checkedCount}, active ${stillActiveCount}, deactivated ${deactivatedCount}`);
    
    return {
      checkedCount,
      stillActiveCount,
      deactivatedCount
    };
  }
}