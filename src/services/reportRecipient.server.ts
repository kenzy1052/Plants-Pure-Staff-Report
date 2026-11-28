import { supabaseAdmin } from '@/integrations/supabase/client.server';

/**
 * SERVER ONLY. The `.server.ts` suffix makes the build refuse to bundle this file for the
 * browser. Import it only with `await import('@/services/reportRecipient.server')` from
 * inside a createServerFn handler.
 */
export interface ReportRecipient { id: string; name: string }

let recipientCache: { value: ReportRecipient; at: number } | null = null;
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Resolves Madam Ursula's real staff profile. Order: REPORT_RECIPIENT_USER_ID (exact
 * profile id) -> active profile whose name matches REPORT_RECIPIENT_NAME (default
 * "Ursula"). Never guesses: zero or ambiguous matches throw a message that names
 * exactly what to fix.
 */
export async function resolveReportRecipient(): Promise<ReportRecipient> {
  if (recipientCache && Date.now() - recipientCache.at < 5 * 60_000) return recipientCache.value;
  const pinnedId = process.env['REPORT_RECIPIENT_USER_ID']?.trim();
  let found: ReportRecipient | null = null;
  if (pinnedId) {
    const { data, error } = await supabaseAdmin.from('profiles').select('id,name,email,active').eq('id', pinnedId).maybeSingle();
    if (error) throw new Error(`Could not look up the report recipient: ${error.message}`);
    if (!data || !data.active) throw new Error('REPORT_RECIPIENT_USER_ID does not match an active staff profile. Fix the id or remove the variable.');
    found = { id: data.id, name: data.name || data.email };
  } else {
    const needle = (process.env['REPORT_RECIPIENT_NAME'] || 'Ursula').trim();
    const { data, error } = await supabaseAdmin.from('profiles').select('id,name,email,active').eq('active', true).ilike('name', `%${escapeLike(needle)}%`);
    if (error) throw new Error(`Could not look up the report recipient: ${error.message}`);
    const rows = data ?? [];
    if (rows.length === 0) throw new Error(`Madam Ursula's staff profile was not found (no active profile name contains "${needle}"). Create her staff account, or set REPORT_RECIPIENT_USER_ID on the server.`);
    if (rows.length > 1) throw new Error(`More than one active profile matches "${needle}" (${rows.map((r) => r.name || r.email).join(', ')}). Set REPORT_RECIPIENT_USER_ID on the server to the correct profile id.`);
    const row = rows[0]!;
    found = { id: row.id, name: row.name || row.email };
  }
  recipientCache = { value: found, at: Date.now() };
  return found;
}
