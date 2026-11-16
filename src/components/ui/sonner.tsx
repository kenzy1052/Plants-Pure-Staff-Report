import { Toaster as Sonner } from "sonner";
import { CheckCircle2, AlertTriangle, Info, XCircle, Loader2 } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    className="toaster group"
    icons={{
      success: <CheckCircle2 className="size-4 text-success" />,
      error: <XCircle className="size-4 text-destructive" />,
      warning: <AlertTriangle className="size-4 text-warning" />,
      info: <Info className="size-4 text-info" />,
      loading: <Loader2 className="size-4 animate-spin text-primary" />,
    }}
    toastOptions={{
      classNames: {
        toast:
          "group toast !bg-popover/90 !text-popover-foreground !border !border-border/80 !rounded-2xl !shadow-[var(--shadow-pop)] !font-sans !gap-3 !py-4 !px-4 !backdrop-blur-xl",
        title: "!font-semibold !text-sm !tracking-[-0.01em]",
        description: "!text-muted-foreground !text-xs !leading-relaxed",
        actionButton: "!bg-primary !text-primary-foreground !rounded-lg !font-semibold",
        cancelButton: "!bg-muted !text-muted-foreground !rounded-lg",
        closeButton: "!bg-card/80 !border-border !text-muted-foreground !rounded-full",
        success: "!border-l-4 !border-l-success",
        error: "!border-l-4 !border-l-destructive",
        warning: "!border-l-4 !border-l-warning",
        info: "!border-l-4 !border-l-primary",
      },
    }}
    {...props}
  />
);

export { Toaster };
