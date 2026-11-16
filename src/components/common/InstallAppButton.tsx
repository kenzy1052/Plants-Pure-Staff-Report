import React, { useState } from 'react';
import { Download, Share, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallApp } from '@/lib/installPrompt';

/** variant "card": full-width button for the sign-in page. variant "row": compact row for the bell menu. */
export const InstallAppButton: React.FC<{ variant?: 'card' | 'row' }> = ({ variant = 'card' }) => {
  const { installed, canPrompt, needsManualSteps, install } = useInstallApp();
  const [showSteps, setShowSteps] = useState(false);
  if (installed || (!canPrompt && !needsManualSteps)) return null;
  const onClick = () => { if (canPrompt) void install(); else setShowSteps(s => !s); };
  const steps = (
    <p className="text-[12px] leading-relaxed text-muted-foreground">
      In Safari, tap <Share className="inline size-3.5 align-text-bottom" /> <b>Share</b>, then <Plus className="inline size-3.5 align-text-bottom" /> <b>Add to Home Screen</b>, then <b>Add</b>. Open the app from its new icon.
    </p>
  );
  if (variant === 'row') {
    return (
      <div className="border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0"><p className="text-xs font-semibold">Install app</p><p className="text-[11px] leading-snug text-muted-foreground">Open it from your home screen like any other app.</p></div>
          <Button size="sm" className="h-8 shrink-0 text-xs" onClick={onClick}>Install</Button>
        </div>
        {showSteps && <div className="mt-2">{steps}</div>}
      </div>
    );
  }
  return (
    <div className="mt-6">
      <Button type="button" variant="outline" className="h-11 w-full gap-2 text-[14px]" onClick={onClick}>
        <Download className="size-4" />Install Plants &amp; Pure app
      </Button>
      {showSteps && <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">{steps}</div>}
    </div>
  );
};
