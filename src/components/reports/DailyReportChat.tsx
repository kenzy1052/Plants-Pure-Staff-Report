import { useEffect, useRef, useState } from "react";
import { ArrowDown, BrainCircuit, ChevronDown, ChevronUp, Loader2, Lock, SendHorizontal, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVoiceCapture } from "@/hooks/use-voice-capture";
import { structureNarration, type NarrationResult, type StructuredNarrationDraft } from "@/services/narrationAssistant";
import type { ActivitySuggestion } from "@/services/activitySuggestions";
import type { MergeSummary, ReportState } from "@/services/narrationParser";
import { MicButton, appendDictation } from "./VoiceField";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  lines?: string[];
  notice?: string;
  tone?: "ok" | "warn";
  question?: string;
  todo?: string[];
}

interface DailyReportChatProps {
  employeeName: string;
  department: string;
  recipientName: string;
  recipientError: string;
  /** Latest report rows, so follow-up messages can add to or correct what is already there. */
  getReport: () => ReportState;
  /** Applies a draft to the report and returns what changed. Provided by the form. */
  onApplyDraft: (draft: StructuredNarrationDraft, result: NarrationResult) => MergeSummary;
  canUndo: boolean;
  onUndo: () => void;
  suggestions: ActivitySuggestion[];
  onUseSuggestion: (value: string) => void;
  onDismissSuggestion: (normalized: string) => void;
  /** Editing an existing report: the chat starts collapsed instead of being the main screen. */
  compact: boolean;
  hasDraft: boolean;
  onReview: () => void;
  onFillManually: () => void;
}

let messageCounter = 0;
const nextId = () => `msg_${Date.now()}_${(messageCounter += 1)}`;

export function DailyReportChat({ employeeName, department, recipientName, recipientError, getReport, onApplyDraft, canUndo, onUndo, suggestions, onUseSuggestion, onDismissSuggestion, compact, hasDraft, onReview, onFillManually }: DailyReportChatProps) {
  const firstName = employeeName.trim().split(/\s+/)[0] ?? "";
  const [open, setOpen] = useState(!compact);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceNote, setVoiceNote] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  textRef.current = text;

  const voice = useVoiceCapture({
    onTranscript: (spoken) => { setVoiceError(""); setText(appendDictation(textRef.current, spoken)); },
    onError: (message) => { setVoiceNote(""); setVoiceError(message); },
    onProviderNote: setVoiceNote,
  });

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text, open]);

  const send = async () => {
    const narration = text.trim();
    if (!narration || busyRef.current) return;
    if (voice.busy) { setVoiceError("Finish or stop the recording first."); return; }
    busyRef.current = true;
    setBusy(true);
    setVoiceError("");
    setVoiceNote("");
    setMessages((current) => [...current, { id: nextId(), role: "user", text: narration }]);
    setText("");
    try {
      const result = await structureNarration({ narration, department, knownActivities: suggestions.map((s) => s.value), currentReport: getReport() });
      const summary = onApplyDraft(result.draft, result);
      const changed = summary.added + summary.updated + summary.removed > 0;
      const reply: ChatMessage = {
        id: nextId(),
        role: "assistant",
        text: changed ? "I've updated your report. Here is what changed:" : result.draft.clarification ? "I didn't change anything yet." : "I couldn't find anything new to add from that message. You can add more detail, or edit the report below.",
        lines: changed ? summary.lines : [],
        notice: result.notice,
        tone: result.source === "local" ? "warn" : "ok",
        ...(result.draft.clarification ? { question: result.draft.clarification } : {}),
        ...(changed && summary.needsAttention.length ? { todo: summary.needsAttention } : {}),
      };
      setMessages((current) => [...current, reply]);
    } catch (error) {
      setText(narration);
      setMessages((current) => [...current, { id: nextId(), role: "assistant", text: error instanceof Error ? error.message : "That message could not be processed. Your text is still in the box.", tone: "warn" }]);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <section className="daily-report-chat rounded-2xl border border-brand-strong/20 bg-brand-wash/70 shadow-[var(--shadow-soft)]" aria-labelledby="chat-heading">
      <header className="flex items-start justify-between gap-3 p-4 sm:p-5">
        <div className="flex gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-strong text-white"><BrainCircuit className="size-5" /></div>
          <div>
            <h2 id="chat-heading" className="text-base font-bold text-foreground sm:text-lg">Tell me about your day</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Lock className="size-3" />Goes to {recipientName || "Madam Ursula"}</span>
              <span>Nothing is submitted until you confirm</span>
            </p>
          </div>
        </div>
        {compact && <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="shrink-0 gap-1.5">{open ? <><ChevronUp className="size-4" />Hide</> : <><ChevronDown className="size-4" />Add by chat</>}</Button>}
      </header>

      {open && (
        <>
          <div ref={listRef} className={cn("space-y-3 overflow-y-auto px-4 sm:px-5", compact ? "max-h-[40dvh]" : "min-h-[22dvh] max-h-[46dvh]")} aria-live="polite" aria-label="Conversation">
            <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground sm:max-w-[80%]">
              {compact
                ? "Add anything that is missing, or correct something. I'll update the matching fields below and you can still edit everything."
                : <>Hi{firstName ? ` ${firstName}` : ""}! Describe what you did today — type it or tap the microphone. I'll organise it into your daily report fields. You can add more, correct me, and edit every field before you submit to {recipientName || "Madam Ursula"}.</>}
            </div>
            {messages.map((message) => message.role === "user" ? (
              <div key={message.id} className="ml-auto max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground sm:max-w-[80%]">{message.text}</div>
            ) : (
              <div key={message.id} className={cn("max-w-[92%] space-y-2 rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed sm:max-w-[80%]", message.tone === "warn" ? "border-warning bg-warning-soft text-foreground" : "border-border bg-card text-foreground")}>
                <p>{message.text}</p>
                {message.lines && message.lines.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-[13px]">{message.lines.map((line) => <li key={line}>{line}</li>)}</ul>}
                {message.todo && message.todo.length > 0 && <div className="text-[13px]"><p className="font-semibold">Still to do before you can submit:</p><ul className="list-disc space-y-0.5 pl-5">{message.todo.map((line) => <li key={line}>{line}</li>)}</ul></div>}
                {message.question && <p className="font-medium">{message.question}</p>}
                {message.notice && <p className="text-[11px] text-muted-foreground">{message.notice}</p>}
                {message.id === lastAssistantId && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {hasDraft && <Button type="button" size="sm" onClick={onReview} className="gap-1.5"><ArrowDown className="size-3.5" />Review report</Button>}
                    {canUndo && <Button type="button" size="sm" variant="outline" onClick={onUndo} className="gap-1.5"><Undo2 className="size-3.5" />Undo this change</Button>}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div role="status" className="flex max-w-[80%] items-center gap-2 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />Preparing your report…
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="px-4 pt-3 sm:px-5">
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Did you do any of these today? Tap the ones you did to add them.</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <span key={suggestion.normalized} className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/25 bg-card py-1 pl-3 pr-1 text-xs text-accent-foreground">
                    <button type="button" onClick={() => onUseSuggestion(suggestion.value)} className="min-h-6 truncate text-left font-semibold hover:underline" title={`Add “${suggestion.value}” to today's activities`}>{suggestion.value}</button>
                    <button type="button" onClick={() => onDismissSuggestion(suggestion.normalized)} className="grid size-6 place-items-center rounded-full hover:bg-muted" aria-label={`Dismiss suggestion ${suggestion.value}`}><X className="size-3.5" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="sticky bottom-0 rounded-b-2xl bg-brand-wash/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:p-4">
            {recipientError && <p role="alert" className="mb-2 rounded-lg border border-destructive/40 bg-destructive-soft px-3 py-2 text-xs text-destructive">{recipientError}</p>}
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:ring-2 focus-within:ring-primary">
              <label htmlFor="daily-chat-input" className="sr-only">Describe your day</label>
              <textarea
                id="daily-chat-input"
                ref={areaRef}
                value={text}
                maxLength={8000}
                rows={compact ? 2 : 4}
                enterKeyHint="enter"
                autoComplete="off"
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void send(); } }}
                placeholder="Today I designed a promotional flyer, edited the video, posted on Facebook and Instagram, and attended the marketing meeting. I couldn't finish the second video because I was waiting for the product images."
                className="max-h-60 min-h-24 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-base leading-relaxed outline-none focus:ring-0"
              />
              <div className="flex shrink-0 flex-col gap-2">
                <MicButton status={voice.status} supported={voice.supported} onToggle={() => { setVoiceError(""); setVoiceNote(""); voice.toggle(); }} label="your day" className="size-11" />
                <Button type="button" onClick={() => void send()} disabled={busy || !text.trim()} size="icon" className="size-11 rounded-full" aria-label="Send and prepare my report">
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
                </Button>
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span role="status">
                {voice.status === "recording" ? <span className="flex items-center gap-1.5 font-medium text-destructive"><span className="size-1.5 rounded-full bg-destructive" />Listening — tap the square to stop. Your words are added to the box; nothing is sent until you press send.</span>
                  : voice.status === "transcribing" ? "Transcribing your recording…"
                  : voiceError ? <span className="text-destructive">{voiceError}</span>
                  : voiceNote || (voice.supported ? "Type or tap the microphone. Dictation is added to what you already wrote." : "Voice input isn't available in this browser — you can type instead.")}
              </span>
              <span className="flex items-center gap-3">
                {text.length > 6000 && <span>{text.length.toLocaleString()} / 8,000</span>}
                {!hasDraft && !compact && <button type="button" onClick={onFillManually} className="font-semibold text-primary underline-offset-2 hover:underline">Fill in the form myself</button>}
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
