// Tells installed-app users when a newer version has been deployed, and updates on tap.
import { toast } from 'sonner';

declare const __BUILD_ID__: string;
let shown = false;

async function applyUpdate() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  } catch { /* ignore */ }
  window.location.reload(); // unsaved report drafts are autosaved on the device and come back
}

async function check() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { id } = (await res.json()) as { id?: string };
    if (!id || id === __BUILD_ID__ || shown) return;
    shown = true;
    toast('A new version is available', {
      description: 'Tap Update to get the latest improvements. Anything you were typing is kept.',
      duration: Infinity,
      action: { label: 'Update', onClick: () => { void applyUpdate(); } },
    });
  } catch { /* offline: try again later */ }
}

export function startUpdateWatcher(): () => void {
  if (typeof window === 'undefined' || import.meta.env.DEV) return () => {};
  const timer = window.setInterval(() => { void check(); }, 10 * 60 * 1000);
  const wake = () => { if (!document.hidden) void check(); };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  const first = window.setTimeout(() => { void check(); }, 5000);
  return () => { window.clearInterval(timer); window.clearTimeout(first); document.removeEventListener('visibilitychange', wake); window.removeEventListener('online', wake); };
}
