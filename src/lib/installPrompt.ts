// Install-as-app support. Chrome/Edge/Android fire "beforeinstallprompt"; we keep it so a button can use it.
import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; notify(); });
  window.addEventListener('appinstalled', () => { deferred = null; notify(); });
}

const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

export function useInstallApp() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick(n => n + 1); listeners.add(l); return () => { listeners.delete(l); }; }, []);
  const installed = isStandalone();
  return {
    installed,
    canPrompt: !installed && !!deferred,
    needsManualSteps: !installed && !deferred && isIOS(),
    async install() {
      if (!deferred) return false;
      const ev = deferred; deferred = null; notify();
      await ev.prompt();
      return (await ev.userChoice).outcome === 'accepted';
    },
  };
}
