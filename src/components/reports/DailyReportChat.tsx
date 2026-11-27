import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ClipboardCheck, Loader2, Mic, Pencil, RotateCcw, SendHorizontal, Trash2, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLiveDictation } from "@/hooks/use-live-dictation";
import { structureNarration, type NarrationResult, type StructuredNarrationDraft } from "@/services/narrationAssistant";
import { describeMerge, type MergeSummary, type ReportState } from "@/services/narrationParser";
import { appendDictation } from "./VoiceField";
import { KenzyAvatar } from "./KenzyMascot";

/**
 * Kenzy's chat. It lives in an overlay on top of the report form (full screen on phones, a floating
 * panel on larger screens). It stays mounted while closed, so the conversation, anything typed and the
 * form underneath are exactly as the employee left them when the panel is reopened.
 *
 * Writing a report by voice has three separate stages, never merged into one tap:
 *   1. Speak   - live words appear while the microphone is recording (tap X to throw it away).
 *   2. Confirm - the tick stops recording and puts the words in the box, where they can be edited.
 *   3. Send    - only the Send button sends the message to Kenzy.
 *
 * Kenzy never writes into the form on her own. She first shows how she understood the message,
 * field by field, and the employee chooses: Fill form, Try again, Edit my words or Discard.
 */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  notice?: string;
  tone?: "ok" | "warn";
  question?: string;
  todo?: string[];
  /** True when this reply changed the report, so it can offer Review and Undo. */
  changed?: boolean;
  /** How Kenzy understood a message, waiting for the employee's decision. */
  proposal?: { narration: string; result: NarrationResult; state: "pending" | "applied" | "discarded" };
}

const draftHasRows = (draft: StructuredNarrationDraft) => draft.objectives.length + draft.activities.length + draft.challenges.length + draft.tomorrowPlans.length + draft.removeIds.length > 0;

interface DailyReportChatProps {
  open: boolean;
  onClose: () => void;
  employeeName: string;
  department: string;
  recipientName: string;
  recipientError: string;
  /** Latest report rows, so follow-up messages can add to or correct what is already there. */
  getReport: () => ReportState;
  knownActivities: string[];
  /** Applies a draft to the report form and returns what changed. Provided by the form. */
  onApplyDraft: (draft: StructuredNarrationDraft, result: NarrationResult) => MergeSummary;
  /** How many Kenzy changes can still be undone. */
  undoDepth: number;
  /** Undoes the most recent Kenzy change and returns a sentence describing the result. */
  onUndo: () => string;
  onReview: () => void;
}

let messageCounter = 0;
const nextId = () => `msg_${Date.now()}_${(messageCounter += 1)}`;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const isTouchOnly = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(pointer: fine)").matches;

export function DailyReportChat({ open, onClose, employeeName, department, recipientName, recipientError, getReport, knownActivities, onApplyDraft, undoDepth, onUndo, onReview }: DailyReportChatProps) {
  const firstName = employeeName.trim().split(/\s+/)[0] ?? "";
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [changeIds, setChangeIds] = useState<string[]>([]);
  const [fullScreen, setFullScreen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  const voice = useLiveDictation({
    onConfirmed: (spoken) => {
      setVoiceError("");
      setText(appendDictation(textRef.current, spoken));
      setReviewing(true);
      window.setTimeout(() => { const el = areaRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 30);
    },
    onError: (message) => { setVoiceNote(""); setVoiceError(message); },
    onNote: setVoiceNote,
  });

  // Phones get a full-screen sheet; remember which, for focus handling and the dialog role.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setFullScreen(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  // Opening: move focus into the panel and stop the page behind from scrolling on phones.
  useEffect(() => {
    if (!open) { voice.cancel(); return; }
    const target = fullScreen ? panelRef.current : areaRef.current;
    window.setTimeout(() => target?.focus(), 60);
    if (!fullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fullScreen]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text, open, voice.status]);
  useEffect(() => { if (voice.recording) liveRef.current?.scrollTo({ top: liveRef.current.scrollHeight }); }, [voice.liveText, voice.recording]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const patchMessage = (id: string, patch: Partial<ChatMessage>) => setMessages((current) => current.map((message) => (message.id === id ? { ...message, ...patch } : message)));

  const send = async () => {
    const narration = text.trim();
    if (!narration || busyRef.current) return;
    if (voice.busy) { setVoiceError("Finish or cancel the recording first."); return; }
    busyRef.current = true;
    setBusy(true);
    setVoiceError("");
    setVoiceNote("");
    setReviewing(false);
    setMessages((current) => [...current, { id: nextId(), role: "user", text: narration }]);
    setText("");
    try {
      const result = await structureNarration({ narration, department, knownActivities, currentReport: getReport() });
      const hasRows = draftHasRows(result.draft);
      setMessages((current) => [...current, {
        id: nextId(),
        role: "assistant",
        text: hasRows
          ? "Here is how I understood it. Nothing has been put in your report yet. Check it, then press Fill form."
          : result.draft.clarification ? "I haven't changed anything yet." : "I couldn't find anything new to add from that. Tell me a little more about what you did, or type straight into the report.",
        notice: result.notice,
        tone: result.source === "local" ? "warn" : "ok",
        ...(result.draft.clarification ? { question: result.draft.clarification } : {}),
        ...(hasRows ? { proposal: { narration, result, state: "pending" as const } } : {}),
      }]);
    } catch (error) {
      setText(narration);
      setMessages((current) => [...current, { id: nextId(), role: "assistant", text: error instanceof Error ? error.message : "That message could not be sent. Your words are still in the box, so you can try again.", tone: "warn" }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Fill form: only now is the draft written into the report. */
  const fillForm = (id: string) => {
    const message = messagesRef.current.find((item) => item.id === id);
    if (!message?.proposal || message.proposal.state !== "pending") return;
    const { result } = message.proposal;
    const summary = onApplyDraft(result.draft, result);
    const changed = summary.added + summary.updated + summary.removed > 0;
    if (changed) setChangeIds((current) => [...current, id]);
    patchMessage(id, {
      text: changed ? describeMerge(summary) : "Everything in that was already in your report, so nothing changed.",
      changed,
      proposal: { ...message.proposal, state: "applied" },
      ...(changed && summary.needsAttention.length ? { todo: summary.needsAttention } : {}),
    });
  };

  const discardDraft = (id: string) => {
    const message = messagesRef.current.find((item) => item.id === id);
    if (!message?.proposal || message.proposal.state !== "pending") return;
    patchMessage(id, { text: "Okay, I've thrown that draft away. Nothing in your report was changed.", proposal: { ...message.proposal, state: "discarded" } });
  };

  /** Puts the employee's own words back in the box so they can fix them and send again. */
  const editWords = (id: string) => {
    const message = messagesRef.current.find((item) => item.id === id);
    if (!message?.proposal || message.proposal.state !== "pending" || busyRef.current) return;
    patchMessage(id, { text: "No problem. Your words are back in the box. Fix anything that is wrong, then press Send.", proposal: { ...message.proposal, state: "discarded" } });
    setText(message.proposal.narration);
    setReviewing(true);
    window.setTimeout(() => { const el = areaRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 30);
  };

  /** Runs the same words through Kenzy again and replaces the draft in place. */
  const tryAgain = async (id: string) => {
    const message = messagesRef.current.find((item) => item.id === id);
    if (!message?.proposal || message.proposal.state !== "pending" || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { narration } = message.proposal;
      const result = await structureNarration({ narration, department, knownActivities, currentReport: getReport() });
      const hasRows = draftHasRows(result.draft);
      patchMessage(id, hasRows
        ? { text: "Here is my second try. Nothing has been put in your report yet.", notice: result.notice, tone: result.source === "local" ? "warn" : "ok", proposal: { narration, result, state: "pending" } }
        : { text: "I still couldn't find anything to add. You can fix your words and send them again.", notice: result.notice, tone: "warn" });
    } catch (error) {
      patchMessage(id, { notice: error instanceof Error ? error.message : "Kenzy could not try again right now.", tone: "warn" });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const undo = () => {
    const confirmation = onUndo();
    if (confirmation) setMessages((current) => [...current, { id: nextId(), role: "assistant", text: confirmation }]);
  };

  const undoMessageId = undoDepth > 0 ? changeIds[undoDepth - 1] : undefined;
  const dictating = voice.status !== "idle";
  const state: "listening" | "writing" | "thinking" | "ready" = voice.status === "recording" || voice.status === "starting" ? "listening" : voice.status === "finishing" ? "writing" : busy ? "thinking" : "ready";
  const statusLabel = { listening: "Listening…", writing: "Writing out your words…", thinking: "Thinking…", ready: "Your Daily Reporting Assistant" }[state];
  const touchOnly = isTouchOnly();

  return (
    <div
      ref={panelRef}
      className="kenzy-panel"
      hidden={!open}
      role="dialog"
      aria-modal={fullScreen}
      aria-labelledby="kenzy-title"
      tabIndex={-1}
      onKeyDown={(event) => { if (event.key === "Escape" && !voice.recording) { event.stopPropagation(); onClose(); } }}
    >
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <KenzyAvatar size={46} />
        <div className="min-w-0 flex-1">
          <h2 id="kenzy-title" className="text-base font-bold leading-tight text-foreground">Kenzy</h2>
          <p role="status" className={cn("flex items-center gap-1.5 truncate text-[13px]", state === "ready" ? "text-muted-foreground" : "font-semibold text-brand-strong")}>
            {state === "listening" && <span className="kenzy-rec-dot" aria-hidden="true" />}
            {(state === "thinking" || state === "writing") && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
            {statusLabel}
          </p>
        </div>
        <button type="button" onClick={onClose} className="pp-btn pp-btn-outline" aria-label="Close Kenzy and go back to your report">
          <X className="size-5" aria-hidden="true" /><span className="hidden sm:inline">Close</span>
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4" aria-live="polite" aria-label="Conversation with Kenzy">
        <AssistantBubble>
          <p>
            Hi{firstName ? ` ${firstName}` : ""}! Just tell me about your day. You can type it, or tap <strong>Speak</strong> and talk.
          </p>
          <p className="mt-2 text-muted-foreground">I'll put everything in the right place in your report. You can still change anything yourself, and nothing is sent to {recipientName || "Madam Ursula"} until you press Submit.</p>
        </AssistantBubble>

        {messages.map((message) => message.role === "user" ? (
          <div key={message.id} className="ml-auto max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-brand-strong px-4 py-3 text-[15px] leading-relaxed text-white dark:text-[oklch(0.2_0.01_50)]">{message.text}</div>
        ) : (
          <AssistantBubble key={message.id} warn={message.tone === "warn"}>
            <p>{message.text}</p>
            {message.proposal && message.proposal.state === "pending" && (
              <>
                <DraftPreview draft={message.proposal.result.draft} />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => fillForm(message.id)} disabled={busy} className="pp-btn pp-btn-primary pp-btn-sm"><Check className="size-4" aria-hidden="true" />Fill form</button>
                  <button type="button" onClick={() => void tryAgain(message.id)} disabled={busy} className="pp-btn pp-btn-outline pp-btn-sm"><RotateCcw className="size-4" aria-hidden="true" />Try again</button>
                  <button type="button" onClick={() => editWords(message.id)} disabled={busy} className="pp-btn pp-btn-outline pp-btn-sm"><Pencil className="size-4" aria-hidden="true" />Edit my words</button>
                  <button type="button" onClick={() => discardDraft(message.id)} disabled={busy} className="pp-btn pp-btn-ghost pp-btn-sm"><Trash2 className="size-4" aria-hidden="true" />Discard</button>
                </div>
              </>
            )}
            {message.todo && message.todo.length > 0 && (
              <div className="mt-2 text-sm">
                <p className="font-semibold">Still needed before you can submit:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">{message.todo.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            )}
            {message.question && <p className="mt-2 font-semibold">{message.question}</p>}
            {message.notice && <p className="mt-2 text-xs text-muted-foreground">{message.notice}</p>}
            {message.changed && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={onReview} className="pp-btn pp-btn-primary pp-btn-sm"><ClipboardCheck className="size-4" aria-hidden="true" />Review my report</button>
                {message.id === undoMessageId && <button type="button" onClick={undo} className="pp-btn pp-btn-outline pp-btn-sm"><Undo2 className="size-4" aria-hidden="true" />Undo this change</button>}
              </div>
            )}
          </AssistantBubble>
        ))}

        {busy && (
          <AssistantBubble>
            <span role="status" className="flex items-center gap-2 text-muted-foreground"><span className="kenzy-dots" aria-hidden="true"><span /><span /><span /></span>Kenzy is putting your report together…</span>
          </AssistantBubble>
        )}
      </div>

      <footer className="border-t border-border bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {recipientError && <p role="alert" className="mb-2 rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-xs text-destructive">{recipientError}</p>}

        {voice.recording || voice.status === "starting" ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive-soft/50 p-3">
            <div ref={liveRef} className="max-h-36 min-h-16 overflow-y-auto text-[15px] leading-relaxed text-foreground" aria-label="What I am hearing">
              {text.trim() && <span className="text-muted-foreground">{text.trim()} </span>}
              {voice.liveText ? <span className="kenzy-caret">{voice.liveText}</span> : (
                <span className="text-muted-foreground">{voice.liveSupported ? "Start speaking… your words will appear here." : "Recording… live words are not available in this browser. Tap ✓ when you are finished and I'll write out what you said."}</span>
              )}
            </div>
            {voice.liveNote && <p className="mt-1.5 text-xs text-muted-foreground">{voice.liveNote}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={() => voice.cancel()} className="pp-btn pp-btn-outline" aria-label="Cancel recording and throw it away"><X className="size-5" aria-hidden="true" />Cancel</button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-2 text-sm font-semibold text-destructive" role="timer" aria-label={`Recording ${clock(voice.elapsed)}`}>
                <span className="kenzy-rec-dot" aria-hidden="true" /><Mic className="size-4" aria-hidden="true" /><span className="tabular-nums">{clock(voice.elapsed)}</span>
              </div>
              <button type="button" onClick={() => void voice.confirm()} className="pp-btn pp-btn-primary" aria-label="Finish recording and use these words"><Check className="size-5" aria-hidden="true" />Done</button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">Step 1 of 3 · Speak, then tap <strong>Done</strong>. You can check and fix your words before sending.</p>
          </div>
        ) : (
          <>
            {reviewing && text.trim() && <p role="status" className="mb-2 rounded-lg bg-brand-wash px-3 py-2 text-[13px] font-medium text-brand-strong">Step 2 of 3 · Check your words below and fix anything that is wrong. Step 3: press <strong>Send</strong>.</p>}
            <div className="rounded-xl border border-input bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
              <label htmlFor="daily-chat-input" className="sr-only">Tell Kenzy about your day</label>
              <textarea
                id="daily-chat-input"
                ref={areaRef}
                value={text}
                maxLength={8000}
                rows={2}
                autoComplete="off"
                disabled={voice.status === "finishing"}
                onChange={(event) => { setText(event.target.value); if (!event.target.value.trim()) setReviewing(false); }}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && (!touchOnly || event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }}
                placeholder="Example: Today I designed three flyers and edited two videos. I couldn't finish the catalogue because I was waiting for the product images. Tomorrow I will finish it."
                className="block max-h-40 min-h-[4.25rem] w-full resize-none border-0 bg-transparent px-3 py-2.5 text-[15px] leading-relaxed shadow-none outline-none focus:shadow-none"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2">
                <button
                  type="button"
                  onClick={() => { setVoiceError(""); setVoiceNote(""); void voice.start(); }}
                  disabled={!voice.supported || busy || voice.status === "finishing"}
                  className="pp-btn pp-btn-outline"
                  aria-label={voice.supported ? "Speak to Kenzy" : "Voice input is not available in this browser"}
                  title={voice.supported ? "Tap and talk about your day" : "Voice input is not available in this browser"}
                >
                  {voice.status === "finishing" ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <Mic className="size-5" aria-hidden="true" />}Speak
                </button>
                <button type="button" onClick={() => void send()} disabled={busy || dictating || !text.trim()} className="pp-btn pp-btn-primary" aria-label="Send my message to Kenzy">
                  {busy ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <SendHorizontal className="size-5" aria-hidden="true" />}Send
                </button>
              </div>
            </div>
          </>
        )}

        <div className="mt-1.5 min-h-4 text-xs" role="status">
          {voiceError ? <p role="alert" className="font-medium text-destructive">{voiceError}</p>
            : voiceNote ? <p className="text-muted-foreground">{voiceNote}</p>
            : !voice.supported ? <p className="text-muted-foreground">Voice input isn't available in this browser, so please type.</p>
            : !dictating && !touchOnly ? <p className="text-muted-foreground">Press Enter to send · Shift+Enter for a new line</p> : null}
          {text.length > 6000 && <p className="text-muted-foreground">{text.length.toLocaleString()} / 8,000 characters</p>}
        </div>
      </footer>
    </div>
  );
}

const PREVIEW_SECTIONS = ["Assigned objectives and results", "Activities performed", "Challenges and actions taken", "Plans for tomorrow"] as const;

/** Shows a draft using the same names as the form's fields, so the employee can check it before it is filled in. */
function DraftPreview({ draft }: { draft: StructuredNarrationDraft }) {
  const rows: Record<(typeof PREVIEW_SECTIONS)[number], { key: string; updates: boolean; fields: [string, string][] }[]> = {
    "Assigned objectives and results": draft.objectives.map((o, i) => ({ key: `o${i}`, updates: Boolean(o.id), fields: [["What were you asked to do?", o.objective], ["Was it finished?", o.status], ["Why was it not finished?", o.reasonIfNotCompleted], ["Result achieved", o.resultsFigures]] })),
    "Activities performed": draft.activities.map((a, i) => ({ key: `a${i}`, updates: Boolean(a.id), fields: [["What did you do?", a.task], ["Where, who or which platform?", a.placePersonPlatform], ["How many?", a.quantityFigures], ["Result or outcome", a.outcome], ["Time", a.time.replace(/\s*-\s*$/, "")]] })),
    "Challenges and actions taken": draft.challenges.map((c, i) => ({ key: `c${i}`, updates: Boolean(c.id), fields: [["What went wrong?", c.problem], ["What did you do about it?", c.actionTaken], ["When?", c.whenHappened], ["Solved?", c.resolved ? "Yes" : ""]] })),
    "Plans for tomorrow": draft.tomorrowPlans.map((p, i) => ({ key: `p${i}`, updates: Boolean(p.id), fields: [["What will you work on?", p.task], ["Support needed", p.resourcesNeeded], ["Approval needed", p.approvalsRequired]] })),
  };
  return (
    <div className="mt-3 space-y-3 text-sm" aria-label="How Kenzy understood your message">
      {PREVIEW_SECTIONS.map((title) => rows[title].length > 0 && (
        <section key={title}>
          <h3 className="text-xs font-bold uppercase tracking-wide text-brand-strong">{title}</h3>
          <ul className="mt-1 space-y-1.5">
            {rows[title].map((row) => (
              <li key={row.key} className="rounded-lg border border-border bg-background px-3 py-2">
                {row.updates && <p className="mb-0.5 text-xs font-semibold text-muted-foreground">Updates a row you already have</p>}
                <dl className="space-y-0.5">
                  {row.fields.filter(([, value]) => value.trim()).map(([label, value]) => (
                    <div key={label} className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{label}:</dt><dd className="font-medium text-foreground">{value}</dd></div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {draft.removeIds.length > 0 && <p className="text-xs font-semibold text-destructive">This will also remove {draft.removeIds.length} {draft.removeIds.length === 1 ? "row" : "rows"} you asked me to cancel.</p>}
      {draft.challenges.length === 0 && <p className="text-xs text-muted-foreground">No challenges found in what you said.</p>}
    </div>
  );
}

function AssistantBubble({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return (
    <div className="flex max-w-[94%] items-start gap-2">
      <KenzyAvatar size={30} className="mt-0.5" />
      <div className={cn("min-w-0 rounded-2xl rounded-tl-sm border px-4 py-3 text-[15px] leading-relaxed text-foreground", warn ? "border-warning bg-warning-soft" : "border-border bg-card")}>{children}</div>
    </div>
  );
}
