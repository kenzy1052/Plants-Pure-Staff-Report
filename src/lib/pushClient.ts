import { savePushSubscription, removePushSubscription } from '@/services/cloud.functions';

const toKey = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!import.meta.env.VITE_VAPID_PUBLIC_KEY;

/** Registers this device for alerts. ask=true shows the browser permission prompt. Returns true when alerts are on. */
export async function syncPushSubscription(ask: boolean): Promise<boolean> {
  if (!pushSupported()) return false;
  if (!ask && localStorage.getItem('pp_push_off') === '1') return false; // person switched alerts off on this device
  try {
    if (Notification.permission === 'default' && ask) await Notification.requestPermission();
    if (Notification.permission !== 'granted') return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(import.meta.env.VITE_VAPID_PUBLIC_KEY as string) }));
    const j = sub.toJSON();
    await savePushSubscription({ data: { endpoint: j.endpoint as string, p256dh: j.keys!.p256dh as string, auth: j.keys!.auth as string } });
    return true;
  } catch { return false; }
}

/** Called on sign-out so the next person on a shared phone never receives this person's alerts. */
export async function unsubscribePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await Promise.race([removePushSubscription({ data: { endpoint: sub.endpoint } }), new Promise(r => setTimeout(r, 3000))]);
    await sub.unsubscribe();
  } catch { /* ignore */ }
}

export type PushState = 'on' | 'off' | 'blocked' | 'needs-install' | 'unsupported';
export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'needs-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  if (Notification.permission === 'granted' && localStorage.getItem('pp_push_off') !== '1') {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
  }
  return 'off';
}
export async function enablePush(): Promise<boolean> { localStorage.removeItem('pp_push_off'); return syncPushSubscription(true); }
export async function disablePush(): Promise<void> { localStorage.setItem('pp_push_off', '1'); await unsubscribePush(); }
