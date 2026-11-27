import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import kenzyImage from "@/assets/kenzy.webp";

/**
 * Kenzy, the Plants & Pure assistant. The artwork is the supplied mascot image (src/assets/kenzy.webp),
 * unchanged apart from a transparent background; it is only ever cropped (never redrawn).
 */

/** Head-and-shoulders crop of the mascot for headers and chat bubbles. */
export function KenzyAvatar({ size = 44, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("kenzy-avatar", className)} style={{ width: size, height: size }} aria-hidden="true">
      <img src={kenzyImage} alt="" draggable={false} />
    </span>
  );
}

export const KENZY_GREETING = "Hi, I'm Kenzy! Need help filling your report?";
const BUBBLE_DELAY_MS = 900;
const BUBBLE_VISIBLE_MS = 12_000;
const BUBBLE_REPEEK_MS = 7_000;

interface KenzyFloatingProps {
  onOpen: () => void;
  /** Pushes the mascot above a sticky action bar on small screens so it never covers a button. */
  liftOnMobile?: boolean;
}

/**
 * The small floating mascot (bottom-right) with its short greeting. The greeting appears a moment after the
 * form opens, fades away by itself, can be dismissed, and comes back when the employee hovers or focuses
 * Kenzy. The mascot and the greeting both open the chat.
 */
export const KenzyFloating = forwardRef<HTMLButtonElement, KenzyFloatingProps>(function KenzyFloating({ onOpen, liftOnMobile = false }, ref) {
  const [bubble, setBubble] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const showFor = useCallback((ms: number) => {
    window.clearTimeout(timer.current);
    setBubble(true);
    timer.current = window.setTimeout(() => setBubble(false), ms);
  }, []);

  useEffect(() => {
    const start = window.setTimeout(() => showFor(BUBBLE_VISIBLE_MS), BUBBLE_DELAY_MS);
    return () => { window.clearTimeout(start); window.clearTimeout(timer.current); };
  }, [showFor]);

  const hide = () => { window.clearTimeout(timer.current); setBubble(false); };

  return (
    <div className={cn("kenzy-dock", liftOnMobile && "kenzy-dock-lift")}>
      {bubble && (
        <div className="kenzy-bubble" role="status">
          <button type="button" onClick={() => { hide(); onOpen(); }} className="kenzy-bubble-text">{KENZY_GREETING}</button>
          <button type="button" onClick={hide} className="kenzy-bubble-close" aria-label="Dismiss Kenzy's message"><X className="size-3.5" aria-hidden="true" /></button>
        </div>
      )}
      <button
        ref={ref}
        id="kenzy-fab"
        type="button"
        onClick={() => { hide(); onOpen(); }}
        onMouseEnter={() => { if (!bubble) showFor(BUBBLE_REPEEK_MS); }}
        onFocus={() => { if (!bubble) showFor(BUBBLE_REPEEK_MS); }}
        className="kenzy-fab"
        aria-label="Open Kenzy, your daily reporting assistant"
        title="Ask Kenzy for help"
      >
        <img src={kenzyImage} alt="" draggable={false} />
      </button>
    </div>
  );
});
