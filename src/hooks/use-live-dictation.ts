import { useCallback, useEffect, useRef, useState } from "react";
import { isDemoSession } from "@/services/session";
import { transcribeAudio } from "@/services/narrationAssistant";
import { claimVoiceSession, recognitionCtor, recorderSupported, releaseVoiceSession, voiceAvailable, type RecognitionLike } from "@/hooks/use-voice-capture";

/**
 * Dictation for the Kenzy chat, in three honest stages:
 *
 *   1. RECORD   - the words appear on screen while the employee speaks.
 *   2. CONFIRM  - the tick stops the recording and hands the text back so it can be reviewed and edited.
 *   3. (the caller) SEND - nothing is ever sent from here.
 *
 * Live words come from the browser's own speech recognition (Chrome, Edge, Safari...). It is the only
 * live source: the configured server providers (Groq / Gemini) transcribe a finished recording and
 * cannot stream, so they are never described as live. When the employee is signed in and the browser
 * can record, the audio is ALSO captured; on confirm it is sent to the server provider and, if that
 * succeeds, its (usually more accurate) text replaces the live preview. If it fails or is slow, the live
 * transcript is kept. Browsers without live recognition record silently and show the text after the tick.
 */

export type DictationStatus = "idle" | "starting" | "recording" | "finishing";

export interface UseLiveDictationOptions {
  /** Called once with the confirmed text. `source` says where it came from. */
  onConfirmed: (text: string, source: "live" | "server") => void;
  onError?: (message: string) => void;
  onNote?: (note: string) => void;
}

interface Session {
  serverAudio: boolean;
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  recognition: RecognitionLike | null;
  committed: string;
  interim: string;
  /** Final results of the current recognition run, folded into `committed` when the run ends. */
  pendingFinals: string;
  active: boolean;
  cancelled: boolean;
  liveFailed: boolean;
  quickRestarts: number;
  lastRestart: number;
  tick: number | undefined;
  startedAt: number;
}

const MAX_RECORDING_SECONDS = 5 * 60;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const SERVER_TIMEOUT_MS = 20_000;

const join = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(" ");

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The recording could not be read."));
    reader.onloadend = () => resolve(String(reader.result ?? "").split(",", 2)[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

export function useLiveDictation({ onConfirmed, onError, onNote }: UseLiveDictationOptions) {
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [liveText, setLiveText] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [liveNote, setLiveNote] = useState("");
  const [supported, setSupported] = useState(false);
  const [liveSupported, setLiveSupported] = useState(false);
  const handlers = useRef({ onConfirmed, onError, onNote });
  handlers.current = { onConfirmed, onError, onNote };
  const session = useRef<Session | null>(null);
  const mounted = useRef(true);
  const statusRef = useRef<DictationStatus>("idle");

  const setStatusBoth = (next: DictationStatus) => { statusRef.current = next; if (mounted.current) setStatus(next); };
  const fail = (message: string) => handlers.current.onError?.(message);

  useEffect(() => {
    mounted.current = true;
    setSupported(voiceAvailable());
    setLiveSupported(Boolean(recognitionCtor()));
    return () => { mounted.current = false; discard(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teardown = (s: Session) => {
    s.active = false;
    window.clearInterval(s.tick);
    try { s.recognition?.abort(); } catch { /* already stopped */ }
    s.recognition = null;
    s.stream?.getTracks().forEach((track) => track.stop());
    s.stream = null;
  };

  /** Throws away the current recording and everything it captured. */
  const discard = useCallback(() => {
    const s = session.current;
    if (!s) return;
    s.cancelled = true;
    session.current = null;
    teardown(s);
    if (s.recorder && s.recorder.state !== "inactive") { try { s.recorder.stop(); } catch { /* ignore */ } }
    releaseVoiceSession(discard);
    if (mounted.current) { setLiveText(""); setElapsed(0); setLiveNote(""); }
    setStatusBoth("idle");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showLive = (s: Session) => { if (mounted.current && session.current === s) setLiveText(join(s.committed, s.pendingFinals, s.interim)); };

  const startRecognition = (s: Session): boolean => {
    const Ctor = recognitionCtor();
    if (!Ctor) return false;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-GH";
    recognition.onresult = (event) => {
      let finals = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finals += `${text} `; else interim += `${text} `;
      }
      s.interim = interim.trim();
      s.pendingFinals = finals.trim();
      showLive(s);
    };
    recognition.onerror = (event) => {
      const code = event.error ?? "";
      if (code === "no-speech" || code === "aborted") return;
      s.liveFailed = true;
      const message = code === "not-allowed" || code === "service-not-allowed" ? "Microphone permission was not granted."
        : code === "network" ? "Live words need an internet connection."
        : code === "audio-capture" ? "Live words are not available on this device while recording."
        : "Live words stopped working.";
      if (s.serverAudio) {
        if (mounted.current && session.current === s) setLiveNote(`${message} Your voice is still being recorded — tap ✓ and I'll write it out.`);
      } else {
        fail(`${message} You can type instead.`);
        discard();
      }
    };
    recognition.onend = () => {
      // Fold whatever this recognition run produced into the committed text.
      s.committed = join(s.committed, s.pendingFinals ?? "", s.interim);
      s.interim = "";
      s.pendingFinals = "";
      s.recognition = null;
      showLive(s);
      if (!s.active || s.liveFailed || s.cancelled) return;
      // Browsers end recognition after a pause; start it again while the employee is still recording.
      const now = Date.now();
      s.quickRestarts = now - s.lastRestart < 1000 ? s.quickRestarts + 1 : 0;
      s.lastRestart = now;
      if (s.quickRestarts > 4) { s.liveFailed = true; if (mounted.current) setLiveNote("Live words stopped. Keep talking and tap ✓ when you are done."); return; }
      window.setTimeout(() => { if (s.active && !s.cancelled && session.current === s) { try { startRecognition(s); } catch { s.liveFailed = true; } } }, 120);
    };
    try {
      s.recognition = recognition;
      recognition.start();
      return true;
    } catch {
      s.recognition = null;
      return false;
    }
  };

  const start = useCallback(async () => {
    if (statusRef.current !== "idle") return;
    if (!voiceAvailable()) { fail("Voice input is not available in this browser. You can type instead."); return; }
    claimVoiceSession(discard);
    setStatusBoth("starting");
    setLiveText("");
    setElapsed(0);
    setLiveNote("");
    const s: Session = { serverAudio: !isDemoSession() && recorderSupported(), recorder: null, stream: null, chunks: [], recognition: null, committed: "", interim: "", pendingFinals: "", active: true, cancelled: false, liveFailed: false, quickRestarts: 0, lastRestart: 0, tick: undefined, startedAt: Date.now() };
    session.current = s;

    if (s.serverAudio) {
      try {
        s.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        discard();
        fail("Microphone permission was not granted. Allow the microphone for this site, or type instead.");
        return;
      }
      if (session.current !== s) { s.stream.getTracks().forEach((t) => t.stop()); return; }
      try {
        s.recorder = new MediaRecorder(s.stream);
        s.recorder.ondataavailable = (event) => { if (event.data.size) s.chunks.push(event.data); };
        s.recorder.start();
      } catch {
        discard();
        fail("This browser could not start recording. You can type instead.");
        return;
      }
      if (!startRecognition(s)) {
        s.liveFailed = true;
        setLiveNote("This browser cannot show live words. Your voice is being recorded — tap ✓ and I'll write it out.");
      }
    } else if (!startRecognition(s)) {
      discard();
      fail("Voice input is not available here. You can type instead.");
      return;
    }

    s.tick = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - s.startedAt) / 1000);
      if (mounted.current) setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) void finishRecording();
    }, 250);
    setStatusBoth("recording");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishRecording = useCallback(async () => {
    const s = session.current;
    if (!s || statusRef.current !== "recording") return;
    setStatusBoth("finishing");
    s.active = false;
    window.clearInterval(s.tick);
    // Let the speech recogniser flush its last words, then fold them in.
    const recognition = s.recognition;
    if (recognition) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 700);
        const previous = recognition.onend;
        recognition.onend = () => { window.clearTimeout(timer); previous?.call(recognition); resolve(); };
        try { recognition.stop(); } catch { resolve(); }
      });
    }
    s.committed = join(s.committed, s.pendingFinals ?? "", s.interim);
    s.interim = "";
    s.pendingFinals = "";
    const liveFinal = s.committed.trim();

    // Stop the recorder and collect the audio (only when the server can transcribe it).
    let blob: Blob | null = null;
    if (s.recorder) {
      const recorder = s.recorder;
      blob = await new Promise<Blob | null>((resolve) => {
        if (recorder.state === "inactive") { resolve(s.chunks.length ? new Blob(s.chunks, { type: recorder.mimeType || "audio/webm" }) : null); return; }
        recorder.onstop = () => resolve(s.chunks.length ? new Blob(s.chunks, { type: recorder.mimeType || "audio/webm" }) : null);
        try { recorder.stop(); } catch { resolve(null); }
      });
    }
    s.stream?.getTracks().forEach((track) => track.stop());
    s.stream = null;
    if (session.current !== s || s.cancelled) return; // cancelled while finishing

    const finish = (text: string, source: "live" | "server") => {
      session.current = null;
      releaseVoiceSession(discard);
      if (mounted.current) { setLiveText(""); setElapsed(0); setLiveNote(""); }
      setStatusBoth("idle");
      handlers.current.onConfirmed(text, source);
    };
    const giveUp = (message: string) => {
      session.current = null;
      releaseVoiceSession(discard);
      if (mounted.current) { setLiveText(""); setElapsed(0); setLiveNote(""); }
      setStatusBoth("idle");
      fail(message);
    };

    if (blob && blob.size > 0 && blob.size <= MAX_AUDIO_BYTES) {
      try {
        const audioBase64 = await blobToBase64(blob);
        const result = await Promise.race([
          transcribeAudio({ audioBase64, mimeType: blob.type || "audio/webm" }),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("timeout")), SERVER_TIMEOUT_MS)),
        ]);
        if (session.current !== s || s.cancelled) return;
        if (result.text) { finish(result.text, "server"); return; }
        throw new Error("empty");
      } catch (error) {
        if (session.current !== s || s.cancelled) return;
        if (liveFinal) {
          handlers.current.onNote?.("I kept the words you saw while speaking, because the speech service could not refine them. Please check them.");
          finish(liveFinal, "live");
          return;
        }
        const message = error instanceof Error ? error.message : "";
        giveUp(message && !/timeout|empty|fetch|network|server|AI providers/i.test(message) ? message : "I could not turn that recording into text. You can try again or type instead.");
        return;
      }
    }
    if (blob && blob.size > MAX_AUDIO_BYTES && !liveFinal) { giveUp("That recording is too long. Please record a shorter note."); return; }
    if (liveFinal) { finish(liveFinal, "live"); return; }
    giveUp("I did not hear anything. Please try again, or type instead.");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, supported, liveSupported, liveText, elapsed, liveNote, start, confirm: finishRecording, cancel: discard, recording: status === "recording", busy: status !== "idle" };
}
