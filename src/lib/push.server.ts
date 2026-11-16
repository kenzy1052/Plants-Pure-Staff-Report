// Server-only: sends a Web Push message to every device a person has enabled alerts on.
export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const publicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return; // push not configured yet: in-app notifications still work
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const db = supabaseAdmin as any;
  const { data: subs } = await db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('user_id', userId);
  if (!subs?.length) return;
  const mod: any = await import('web-push');
  const webpush = mod.default ?? mod;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:plantsandpure@gmail.com', publicKey, privateKey);
  await Promise.all(subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 172800, urgency: 'high' });
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }));
}
