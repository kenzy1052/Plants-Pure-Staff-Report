import { useEffect, useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small building blocks for the daily report form. They hold no report logic: the form owns all
 * state, these only make every section, field, add button and remove button look and behave the
 * same way (large tap targets, visible text labels, no icon-only controls).
 */

export type SectionStatus = "complete" | "incomplete" | "optional";

export function StatusPill({ status, attempted = false }: { status: SectionStatus; attempted?: boolean }) {
  if (status === "complete") return <span className="pp-pill pp-pill-ok"><Check className="size-3.5" aria-hidden="true" />Complete</span>;
  if (status === "optional") return <span className="pp-pill">Optional</span>;
  return <span className={cn("pp-pill", attempted ? "pp-pill-warn" : "pp-pill-todo")}>{attempted ? "Needs attention" : "To do"}</span>;
}

interface SectionCardProps {
  id: string;
  step: number;
  title: string;
  description: string;
  status: SectionStatus;
  attempted: boolean;
  /** One line shown while the section is collapsed. */
  summary?: string;
  /** Section-level message (for example "Add at least one activity"). */
  error?: string | undefined;
  /** Changing this number opens the section (used after a failed submit or when Kenzy fills it). */
  openSignal?: number;
  children: ReactNode;
}

export function SectionCard({ id, step, title, description, status, attempted, summary, error, openSignal = 0, children }: SectionCardProps) {
  const [open, setOpen] = useState(true);
  const headingId = useId();
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-32 rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <header className="flex items-start gap-3 p-4 sm:p-5">
        <span className="pp-step" aria-hidden="true">{step}</span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-base font-bold leading-snug text-foreground sm:text-lg">{title}</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          {!open && summary && <p className="mt-1.5 text-sm font-medium text-foreground">{summary}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusPill status={status} attempted={attempted} />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? `Hide the ${title} section` : `Show the ${title} section`}
            className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronDown className={cn("size-5 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </button>
        </div>
      </header>
      {error && <p role="alert" className="mx-4 mb-3 rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive sm:mx-5">{error}</p>}
      <div hidden={!open} className="space-y-4 border-t border-border p-4 sm:p-5">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  /** Short explanation under the label. */
  hint?: ReactNode;
  error?: string | undefined;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, required, hint, error, children, className }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-foreground">
        {label}
        {required ? <span className="ml-1 text-xs font-medium text-muted-foreground">(required)</span> : null}
      </label>
      {hint && <p className="mb-1.5 text-[13px] leading-snug text-muted-foreground">{hint}</p>}
      {children}
      {error && <p role="alert" className="mt-1 text-[13px] font-medium text-destructive">{error}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

/** Three big, labelled choices instead of a drop-down: easier to see and to tap. */
export function Segmented<T extends string>({ label, value, onChange, options }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1.5 rounded-lg bg-muted p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn("pp-seg", value === option.value && "pp-seg-on")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface RowShellProps {
  /** DOM id, so "Review my report" can scroll to a row Kenzy changed. */
  rowId?: string;
  index: number;
  total: number;
  label: string;
  flashed: boolean;
  onRemove?: (() => void) | undefined;
  removeLabel: string;
  children: ReactNode;
}

/** One repeatable entry (an objective, an activity, a challenge or a plan). */
export function RowShell({ rowId, index, total, label, flashed, onRemove, removeLabel, children }: RowShellProps) {
  return (
    <div id={rowId} className={cn("scroll-mt-36 rounded-lg border border-border bg-background/60 p-3 sm:p-4", flashed && "ai-flash")}>
      <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {total > 1 ? `${label} ${index + 1}` : label}
          {flashed && <span className="ai-badge"><Sparkles className="size-3" aria-hidden="true" />Updated by Kenzy</span>}
        </p>
        {onRemove && (
          <button type="button" onClick={onRemove} className="pp-btn pp-btn-ghost pp-btn-sm text-destructive" aria-label={removeLabel}>
            <Trash2 className="size-4" aria-hidden="true" />Remove
          </button>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="pp-btn pp-btn-add w-full sm:w-auto">
      <Plus className="size-4" aria-hidden="true" />{children}
    </button>
  );
}

interface DisclosureProps {
  label: string;
  /** Plain-text summary of what is already filled in, shown while closed. */
  summary?: string;
  /** Opens automatically when something inside has content. */
  autoOpen: boolean;
  children: ReactNode;
}

/** "More details" area: keeps rarely used fields out of the way, but never hides filled-in data. */
export function Disclosure({ label, summary, autoOpen, children }: DisclosureProps) {
  const [open, setOpen] = useState(autoOpen);
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);
  const panelId = useId();
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId} className="pp-btn pp-btn-ghost pp-btn-sm -ml-2 text-brand-strong">
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        {open ? "Hide details" : label}
      </button>
      {!open && summary && <p className="mt-0.5 text-[13px] text-muted-foreground">{summary}</p>}
      <div id={panelId} hidden={!open} className="mt-2 space-y-3">{children}</div>
    </div>
  );
}
