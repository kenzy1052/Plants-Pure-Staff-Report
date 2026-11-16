import { useEffect, useState } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type ConfirmOptions = { title: string; description: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean };
type Pending = ConfirmOptions & { resolve: (v: boolean) => void };
let push: ((p: Pending) => void) | null = null;

/** Branded replacement for window.confirm. Resolves true when confirmed. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => { if (push) push({ ...options, resolve }); else resolve(false); });
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => { push = setPending; return () => { push = null; }; }, []);
  const close = (v: boolean) => { pending?.resolve(v); setPending(null); };
  const Icon = pending?.destructive ? AlertTriangle : HelpCircle;
  return (
    <AlertDialog open={!!pending} onOpenChange={o => { if (!o) close(false); }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="sm:text-left">
          <div className={cn('mb-2 flex size-11 items-center justify-center rounded-full', pending?.destructive ? 'bg-destructive-soft text-destructive' : 'bg-brand-soft text-primary')}><Icon className="size-5" /></div>
          <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">{pending?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 gap-2">
          <AlertDialogCancel onClick={() => close(false)}>{pending?.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
          <AlertDialogAction className={cn(pending?.destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')} onClick={() => close(true)}>{pending?.confirmLabel ?? 'Confirm'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
