import { DEMO_USERS } from './seedData';
import { isDemoSession } from './session';
import { getDailyReportRecipient } from './cloud.functions';

export interface ReportRecipient {
  id: string;
  name: string;
}

/** Display name shown wherever the fixed recipient is explained to employees. */
export const REPORT_RECIPIENT_LABEL = 'Madam Ursula';

let cached: { key: string; value: ReportRecipient } | null = null;

/**
 * The one and only recipient of daily reports. Live workspace: resolved on the
 * server from the real staff profile (never hardcoded, never guessed). Demo
 * workspace: the demo account named Madam Ursula.
 */
export async function getReportRecipient(): Promise<ReportRecipient> {
  const demo = isDemoSession();
  const key = demo ? 'demo' : 'live';
  if (cached?.key === key) return cached.value;
  let value: ReportRecipient;
  if (demo) {
    const user = DEMO_USERS.find((candidate) => /ursula/i.test(candidate.name));
    if (!user) throw new Error("The demo workspace has no account for Madam Ursula.");
    value = { id: user.id, name: user.name };
  } else {
    value = await getDailyReportRecipient();
  }
  cached = { key, value };
  return value;
}

export function clearReportRecipientCache(): void {
  cached = null;
}
