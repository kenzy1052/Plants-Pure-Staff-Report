import { useRef, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceCapture } from "@/hooks/use-voice-capture";

/** Appends dictated text to what is already in the field; never replaces it. */
export function appendDictation(current: string, dictated: string): string {
  const text = dictated.trim();
  if (!text) return current;
  return current.trim() ? `${current.replace(/\s+$/, "")} ${text}` : text;
}

interface MicButtonProps {
  status: ReturnType<typeof useVoiceCapture>["status"];
  supported: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}

export function MicButton({ status, supported, onToggle, label, className }: MicButtonProps) {
  const recording = status === "recording";
  const working = status === "starting" || status === "transcribing";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={working || !supported}
      aria-pressed={recording}
      aria-label={recording ? `Stop recording ${label}` : supported ? `Speak ${label}` : `Voice input unavailable for ${label}`}
      title={supported ? (recording ? "Tap to stop and insert your words here" : "Speak into this field") : "Voice input is not available in this browser"}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 sm:size-8",
        recording && "border-destructive bg-destructive-soft text-destructive",
        className,
      )}
    >
      {working ? <Loader2 className="size-4 animate-spin" /> : recording ? <Square className="size-3.5 fill-current" /> : <Mic className="size-4" />}
    </button>
  );
}

type SharedProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Spoken description used for accessibility and error text, e.g. "activity description". */
  voiceLabel: string;
};

type InputProps = SharedProps & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;
type TextareaProps = SharedProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">;

function useFieldVoice(value: string, onValueChange: (value: string) => void) {
  const latest = useRef(value);
  latest.current = value;
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const voice = useVoiceCapture({
    onTranscript: (text) => { setError(""); onValueChange(appendDictation(latest.current, text)); },
    onError: (message) => { setNote(""); setError(message); },
    onProviderNote: setNote,
  });
  const toggle = () => { setError(""); setNote(""); voice.toggle(); };
  return { voice, error, note, toggle };
}

function Status({ voice, error, note }: { voice: ReturnType<typeof useVoiceCapture>; error: string; note: string }) {
  if (voice.status === "recording") return <p role="status" className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-destructive"><span className="size-1.5 rounded-full bg-destructive" />Listening — tap the square to stop. Your words will be added to this field.</p>;
  if (voice.status === "transcribing") return <p role="status" className="mt-1 text-[11px] text-muted-foreground">Transcribing…</p>;
  if (error) return <p role="alert" className="mt-1 text-[11px] text-destructive">{error}</p>;
  if (note) return <p role="status" className="mt-1 text-[11px] text-muted-foreground">{note}</p>;
  return null;
}

/** Text input with its own microphone. Dictation is appended to this field only. */
export function VoiceInput({ value, onValueChange, voiceLabel, className, ...rest }: InputProps) {
  const { voice, error, note, toggle } = useFieldVoice(value, onValueChange);
  return (
    <div>
      <div className="relative">
        <input {...rest} type="text" value={value} onChange={(event) => onValueChange(event.target.value)} className={cn(className, "pr-12")} />
        <MicButton status={voice.status} supported={voice.supported} onToggle={toggle} label={voiceLabel} className="absolute right-1.5 top-1/2 -translate-y-1/2" />
      </div>
      <Status voice={voice} error={error} note={note} />
    </div>
  );
}

export function VoiceTextarea({ value, onValueChange, voiceLabel, className, ...rest }: TextareaProps) {
  const { voice, error, note, toggle } = useFieldVoice(value, onValueChange);
  return (
    <div>
      <div className="relative">
        <textarea {...rest} value={value} onChange={(event) => onValueChange(event.target.value)} className={cn(className, "pr-12")} />
        <MicButton status={voice.status} supported={voice.supported} onToggle={toggle} label={voiceLabel} className="absolute right-1.5 top-1.5" />
      </div>
      <Status voice={voice} error={error} note={note} />
    </div>
  );
}
