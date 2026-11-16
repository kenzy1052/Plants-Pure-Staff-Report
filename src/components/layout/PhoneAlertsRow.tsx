import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getPushState, enablePush, disablePush, type PushState } from '@/lib/pushClient';

const TEXT: Record<PushState, string> = {
  on: 'On — you will be alerted even when the app is closed.',
  off: 'Get alerted when reports are submitted, approved or due.',
  blocked: 'Blocked. Allow notifications for this site in your browser settings.',
  'needs-install': 'On iPhone: tap Share, then Add to Home Screen, and open the app from there.',
  unsupported: '',
};

export const PhoneAlertsRow: React.FC = () => {
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void getPushState().then(setState); }, []);
  if (state === 'unsupported') return null;
  const turnOn = async () => {
    setBusy(true);
    const ok = await enablePush();
    setState(await getPushState());
    setBusy(false);
    ok ? toast.success('Phone alerts are on') : toast.error('Alerts were not turned on', { description: 'Allow notifications for this site when asked.' });
  };
  const turnOff = async () => { setBusy(true); await disablePush(); setState(await getPushState()); setBusy(false); toast('Phone alerts are off'); };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
      <div className="min-w-0"><p className="text-xs font-semibold">Phone alerts</p><p className="text-[11px] leading-snug text-muted-foreground">{TEXT[state]}</p></div>
      {state === 'on' && <Button variant="outline" size="sm" className="h-8 shrink-0 text-xs" disabled={busy} onClick={() => void turnOff()}>Turn off</Button>}
      {state === 'off' && <Button size="sm" className="h-8 shrink-0 text-xs" disabled={busy} onClick={() => void turnOn()}>Turn on</Button>}
    </div>
  );
};
