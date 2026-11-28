import { isDemoSession } from "@/services/session";
import { structureNarration as structureNarrationServer, transcribeAudio as transcribeAudioServer } from "@/services/cloud.functions";
import { MAX_NARRATION_LENGTH, parseNarrationLocally, snapshotForAi, type ReportState } from "@/services/narrationParser";

import type {
  NarrationDraftActivity,
  NarrationDraftChallenge,
  NarrationDraftObjective,
  NarrationDraftPlan,
  StructuredNarrationDraft as SharedStructuredNarrationDraft,
} from "@/types";

export { parseNarrationLocally };
export type NarrationObjectiveDraft = NarrationDraftObjective;
export type NarrationActivityDraft = NarrationDraftActivity;
export type NarrationChallengeDraft = NarrationDraftChallenge;
export type NarrationPlanDraft = NarrationDraftPlan;
export type StructuredNarrationDraft = SharedStructuredNarrationDraft;

export type NarrationSource = "ai" | "local";
export type AiProviderName = "gemini" | "groq" | "deepseek";

export interface NarrationResult {
  draft: StructuredNarrationDraft;
  /** "ai" only when a real provider produced the draft; "local" for the offline parser. */
  source: NarrationSource;
  provider?: AiProviderName;
  /** True when the primary provider failed and the fallback provider produced the draft. */
  fellBack: boolean;
  /** Honest, employee-facing statement of who prepared the draft. */
  notice: string;
  warning?: string;
}

const providerLabel: Record<AiProviderName, string> = { gemini: "Gemini", groq: "Groq", deepseek: "DeepSeek" };

export function describeProvider(provider: AiProviderName, fellBack: boolean): string {
  if (!fellBack) return `Prepared with ${providerLabel[provider]}.`;
  return `The first AI service was unavailable, so ${providerLabel[provider]} prepared this draft.`;
}

const LOCAL_NOTICE = "The offline parser prepared this draft instead. It only copies what you wrote — please check every field carefully.";

/**
 * Turns one chat message into proposed report changes. `currentReport` lets the AI
 * update existing rows (corrections, additions) instead of starting over.
 */
export async function structureNarration(input: { narration: string; department: string; knownActivities?: string[]; currentReport?: ReportState }): Promise<NarrationResult> {
  const narration = input.narration.trim().slice(0, MAX_NARRATION_LENGTH);
  if (!narration) throw new Error("Add a short narration before processing it.");
  const local = (warning?: string): NarrationResult => ({ draft: parseNarrationLocally(narration, input.currentReport), source: "local", fellBack: false, notice: warning ? `${warning} ${LOCAL_NOTICE}` : "The offline reporting parser prepared this demo draft. Please check every field.", ...(warning ? { warning } : {}) });
  if (isDemoSession()) return local();
  try {
    const result = await structureNarrationServer({
      data: {
        narration,
        department: input.department,
        knownActivities: input.knownActivities ?? [],
        ...(input.currentReport ? { currentReport: snapshotForAi(input.currentReport) } : {}),
      },
    });
    const provider = result.provider as AiProviderName;
    return { draft: result.draft as StructuredNarrationDraft, source: "ai", provider, fellBack: Boolean(result.fellBack), notice: describeProvider(provider, Boolean(result.fellBack)) };
  } catch (error) {
    // Visible in the browser console (F12) and, for the provider detail, in the server log lines starting with [report-ai].
    console.warn("[Kenzy] The AI could not prepare this draft, so the offline parser was used instead:", error);
    const reason = error instanceof Error && /AI providers/i.test(error.message) ? "None of the AI services (Gemini, Groq, DeepSeek) could respond." : "The AI service could not be reached.";
    return local(reason);
  }
}

export interface TranscriptionResult {
  text: string;
  provider?: AiProviderName;
  fellBack: boolean;
}

/** Browsers report e.g. "audio/webm;codecs=opus"; the server expects the bare type. */
export function bareAudioType(mimeType: string): string {
  return (mimeType.split(";")[0] ?? "").trim().toLowerCase() || "audio/webm";
}

export async function transcribeAudio(input: { audioBase64: string; mimeType: string }): Promise<TranscriptionResult> {
  if (isDemoSession()) throw new Error("Speech transcription needs a configured server provider. You can type or paste the narration instead.");
  const result = await transcribeAudioServer({ data: { audioBase64: input.audioBase64, mimeType: bareAudioType(input.mimeType) } });
  const text = String(result.text ?? "").trim();
  return { text, provider: result.provider as AiProviderName, fellBack: Boolean(result.fellBack) };
}
