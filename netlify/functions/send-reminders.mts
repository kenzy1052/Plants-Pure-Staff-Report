// Runs every 15 minutes on Netlify. Sends "report due" alerts to staff who have not yet
// submitted, even when their app is closed. Accra is UTC+0 all year, so server time = local time.
import { createClient } from '@supabase/supabase-js';
import { startOfISOWeek } from 'date-fns';
import { reportingWeekNumber, setReportingStart } from '../../src/utils/reportingWeek';
import webpush from 'web-push';

export const config = { schedule: '*/15 * * * *' };

const mins = (t: string) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const pad = (n: number) => String(n).padStart(2, '0');

export default async () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return new Response('Supabase not configured', { status: 500 });
  const db = createClient(url, key, { auth: { persistSession: false } });

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const dayName = now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();

  const { data: srow } = await db.from('reporting_records').select('payload').eq('store', 'settings').eq('id', 'main').maybeSingle();
  const s: any = srow?.payload;
  if (!s) return new Response('No settings yet');

  setReportingStart(s.reportingStartDate);
  const due: { id: string; title: string; message: string; type: 'daily' | 'weekly'; submitted: Set<string> }[] = [];
  const workday = (s.reportingDays ?? []).includes(dayName) && !(s.publicHolidays ?? []).some((h: any) => h.date === today);
  if (workday) {
    const d = mins(s.dailyDeadlineTime);
    if (nowMin >= d - 60 && nowMin <= d + 180) {
      const { data } = await db.from('reporting_records').select('owner_id,payload').eq('store', 'daily_reports').eq('payload->>date', today);
      due.push({ id: `rem_daily_${today}`, title: 'Daily report due', message: `Your daily report for today is due by ${s.dailyDeadlineTime}.`, type: 'daily',
        submitted: new Set((data ?? []).filter((r: any) => ['submitted', 'approved'].includes(r.payload?.status)).map((r: any) => r.owner_id)) });
    }
  }
  if (dayName === s.weeklyDeadlineDay) {
    const w = mins(s.weeklyDeadlineTime);
    if (nowMin >= w - 60 && nowMin <= w + 180) {
      const wk = reportingWeekNumber(now), wy = startOfISOWeek(now).getFullYear();
      const { data } = await db.from('reporting_records').select('owner_id,payload').eq('store', 'weekly_reports').eq('payload->>weekNumber', String(wk)).eq('payload->>year', String(wy));
      due.push({ id: `rem_weekly_${wy}-W${pad(wk)}`, title: 'Weekly report due', message: `Your weekly report is due by ${s.weeklyDeadlineTime} today.`, type: 'weekly',
        submitted: new Set((data ?? []).filter((r: any) => ['submitted', 'approved'].includes(r.payload?.status)).map((r: any) => r.owner_id)) });
    }
  }
  if (!due.length) return new Response('Nothing due');

  const { data: staff } = await db.from('profiles').select('id').eq('active', true);
  const pub = process.env.VITE_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:plantsandpure@gmail.com', pub, priv);
  let sent = 0;

  for (const item of due) {
    const targets = (staff ?? []).map(p => p.id).filter(id => !item.submitted.has(id));
    if (!targets.length) continue;
    const ids = targets.map(id => `${item.id}_${id}`);
    const { data: existing } = await db.from('reporting_records').select('id').eq('store', 'notifications').in('id', ids);
    const have = new Set((existing ?? []).map(r => r.id));
    const fresh = targets.filter(id => !have.has(`${item.id}_${id}`));
    if (!fresh.length) continue;
    await db.from('reporting_records').upsert(fresh.map(uid => ({
      store: 'notifications', id: `${item.id}_${uid}`, owner_id: uid, supervisor_id: null, updated_at: now.toISOString(),
      payload: { id: `${item.id}_${uid}`, recipientId: uid, title: item.title, message: item.message, type: 'reminder', read: false, linkReportType: item.type, createdAt: now.toISOString() },
    })));
    if (pub && priv) {
      const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth,user_id').in('user_id', fresh);
      await Promise.all((subs ?? []).map(async (sub: any) => {
        try { await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: item.title, body: item.message, url: '/', tag: `${item.id}_${sub.user_id}` }), { TTL: 86400, urgency: 'high' }); sent++; }
        catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); }
      }));
    }
  }
  return new Response(`Reminders processed, pushes sent: ${sent}`);
};
