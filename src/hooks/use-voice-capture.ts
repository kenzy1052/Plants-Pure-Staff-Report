import { useCallback, useEffect, useRef, useState } from "react";
import { isDemoSession } from "@/services/session";
import { transcribeAudio } from "@/services/narrationAssistant";

/**
 * One reusable voice-capture hook for the chat box AND every report field.
 *
 * - Signed-in staff: records with MediaRecorder and sends the audio to the server
 *   transcription service (configured provider, automatic fallback to the other one).
 * - Demo workspace, or browsers without MediaRecorder: uses the browser's own speech
 *   recognition when it exists.
 * - Otherwise reports that voice is unavailable. Nothing is faked: "recording" is
 *   only ever true while a microphone is really capturing.
 *
 * The transcript is delivered ONLY to the `onTranscript` callback of the instance
 * that recorded it, so it always lands in the field the employee tapped.
 */

export type VoiceStatus = "idle" | "starting" | "recording" | "transcribing";

interface RecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function recorderSupported(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function voiceAvailable(): boolean {
  return recorderSupported() || Boolean(recognitionCtor());
}

const MAX_RECORDING_MS = 5 * 60_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

// Only one microphone session at a time across the whole page.
let cancelActiveSession: (() => void) | null = null;

export interface UseVoiceCaptureOptions {
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  onProviderNote?: (note: string) => void;
}

export function useVoiceCapture({ onTranscript, onError, onProviderNote }: UseVoiceCaptureOptions) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [supported, setSupported] = useState(false);
  const handlers = useRef({ onTranscript, onError, onProviderNote });
  handlers.current = { onTranscript, onError, onProviderNote };
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => {
    setSupported(voiceAvailable());
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      window.clearTimeout(timerRef.current);
      recognitionRef.current?.abort();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const safeSet = (next: VoiceStatus) => { if (mountedRef.current) setStatus(next); };
  const fail = (message: string) => { handlers.current.onError?.(message); };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    window.clearTimeout(timerRef.current);
    recognitionRef.current?.abort();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    else { releaseStream(); safeSet("idle"); }
  }, []);

  const startNative = (Ctor: RecognitionCtor): boolean => {
    const recognition = new Ctor();
    cancelledRef.current = false;
    let finalText = "";
    let failed = false;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-GH";
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result?.isFinal) finalText += `${result[0]?.transcript ?? ""} `;
      }
    };
    recognition.onerror = (event) => {
      failed = true;
      const code = event.error ?? "";
      fail(code === "not-allowed" || code === "service-not-allowed" ? "Microphone permission was not granted. You can keep typing." : code === "no-speech" ? "No speech was heard. Try again or type instead." : "Voice input failed. You can keep typing.");
    };
    recognition.onend = () => {
      const wasCancelled = cancelledRef.current;
      recognitionRef.current = null;
      cancelledRef.current = false;
      window.clearTimeout(timerRef.current);
      safeSet("idle");
      const text = finalText.trim();
      if (failed || wasCancelled) return;
      if (text) handlers.current.onTranscript(text);
      else fail("No speech was captured. Try again or type instead.");
    };
    try {
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      recognitionRef.current = null;
      return false;
    }
    safeSet("recording");
    return true;
  };

  const startRecorder = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      safeSet("idle");
      fail("Microphone permission was not granted. Allow microphone access for this site, or keep typing.");
      return;
    }
    if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    streamRef.current = stream;
    cancelledRef.current = false;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream);
    } catch {
      releaseStream();
      safeSet("idle");
      fail("This browser could not start recording. You can keep typing.");
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
    recorder.onstop = () => {
      window.clearTimeout(timerRef.current);
      releaseStream();
      recorderRef.current = null;
      if (cancelledRef.current) { cancelledRef.current = false; safeSet("idle"); return; }
      const type = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type });
      if (!blob.size) { safeSet("idle"); fail("No audio was captured. Try again or type instead."); return; }
      if (blob.size > MAX_AUDIO_BYTES) { safeSet("idle"); fail("That recording is too long. Please record a shorter note."); return; }
      safeSet("transcribing");
      const reader = new FileReader();
      reader.onerror = () => { safeSet("idle"); fail("The recording could not be read. Try again or type instead."); };
      reader.onloadend = () => {
        void (async () => {
          try {
            const base64 = String(reader.result ?? "").split(",", 2)[1] ?? "";
            const result = await transcribeAudio({ audioBase64: base64, mimeType: type });
            if (!result.text) throw new Error("No recognizable speech was found in the recording.");
            if (result.fellBack) handlers.current.onProviderNote?.("The first speech provider was unavailable, so the backup provider transcribed this.");
            handlers.current.onTranscript(result.text);
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            fail(/Both AI providers/i.test(message) ? "Speech transcription is unavailable right now. You can keep typing." : message && !/fetch|network|server/i.test(message) ? message : "Speech transcription could not be completed. You can keep typing.");
          } finally {
            safeSet("idle");
          }
        })();
      };
      reader.readAsDataURL(blob);
    };
    recorderRef.current = recorder;
    recorder.start();
    safeSet("recording");
  };

  const start = useCallback(async () => {
    if (status !== "idle") return;
    if (!voiceAvailable()) { fail("Voice input is not available in this browser. You can keep typing."); return; }
    cancelActiveSession?.();
    cancelActiveSession = cancel;
    safeSet("starting");
    const useServer = !isDemoSession() && recorderSupported();
    if (useServer) {
      await startRecorder();
    } else {
      const Ctor = recognitionCtor();
      if (!Ctor || !startNative(Ctor)) { safeSet("idle"); fail("Voice input is not available here. You can keep typing."); return; }
    }
    timerRef.current = window.setTimeout(() => stop(), MAX_RECORDING_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, cancel]);

  const stop = useCallback(() => {
    window.clearTimeout(timerRef.current);
    if (recognitionRef.current) recognitionRef.current.stop();
    else if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const toggle = useCallback(() => {
    if (status === "recording") stop();
    else if (status === "idle") void start();
  }, [status, start, stop]);

  return { status, supported, start, stop, cancel, toggle, recording: status === "recording", busy: status !== "idle" };
}
