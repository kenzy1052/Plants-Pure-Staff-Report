import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import type { Json } from '@/integrations/supabase/types';
import type { StructuredNarrationDraft } from '@/types';
import { MAX_NARRATION_LENGTH, normalizeActivityTime } from '@/services/narrationParser';
import { AllProvidersFailedError, ProviderError, callWithFallback, callWithProviderChain, isRecoverableStatus, providerChainFrom, type ProviderName } from '@/services/providerFallback';

// Re-exported so existing imports/tests keep working.
export { AllProvidersFailedError, ProviderError, callWithFallback, isRecoverableStatus };


const storeSchema = z.enum(['daily_reports','weekly_reports','employees','roles','settings','notifications','audit_logs','evidence_attachments']);
const reportItemShape = {
  objectives: z.array(z.object({ id: z.string().catch(''), objective: z.string().catch(''), status: z.enum(['Done', 'Partly Done', 'Not Done']).catch('Not Done'), resultsFigures: z.string().catch(''), reasonIfNotCompleted: z.string().catch('') })).max(30),
  activities: z.array(z.object({ id: z.string().catch(''), task: z.string().catch(''), outcome: z.string().catch(''), placePersonPlatform: z.string().catch(''), quantityFigures: z.string().catch(''), time: z.string().catch(''), objectiveId: z.string().catch('') })).max(40),
  challenges: z.array(z.object({ id: z.string().catch(''), problem: z.string().catch(''), whenHappened: z.string().catch(''), actionTaken: z.string().catch(''), resolved: z.boolean().catch(false) })).max(30),
  tomorrowPlans: z.array(z.object({ id: z.string().catch(''), task: z.string().catch(''), resourcesNeeded: z.string().catch(''), approvalsRequired: z.string().catch('') })).max(30),
};
const narrationInputSchema = z.object({
  narration: z.string().trim().min(1).max(MAX_NARRATION_LENGTH),
  department: z.string().trim().max(160),
  knownActivities: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
  currentReport: z.object(reportItemShape).partial().optional(),
});
const narrationOutputSchema = z.object({
  ...reportItemShape,
  pendingTasks: z.array(z.string()).max(30).catch([]),
  achievements: z.array(z.string()).max(30).catch([]),
  removeIds: z.array(z.string()).max(60).catch([]),
  clarification: z.string().catch(''),
  cleanedNarration: z.string().catch(''),
}).partial({ objectives: true, activities: true, challenges: true, tomorrowPlans: true });
const transcriptionInputSchema = z.object({
  audioBase64: z.string().min(1).max(15_000_000),
  // Browsers report e.g. "audio/webm;codecs=opus"; strip parameters before validating.
  mimeType: z.string().default('audio/webm').transform((value) => normalizeAudioMime(value)).pipe(z.enum(['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/mpeg'])),
});

export function normalizeAudioMime(value: string): string {
  const base = (value.split(';')[0] ?? '').trim().toLowerCase();
  if (base === 'audio/x-wav' || base === 'audio/wave') return 'audio/wav';
  if (base === 'audio/x-m4a' || base === 'audio/m4a' || base === 'audio/aac') return 'audio/mp4';
  if (base === 'audio/mp3') return 'audio/mpeg';
  if (base === 'video/webm') return 'audio/webm';
  if (base === 'video/mp4') return 'audio/mp4';
  return base || 'audio/webm';
}

type ProviderConfig = { name: ProviderName; apiKey: string; model: string; baseUrl?: string };

function safeErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error;
    if (typeof error === 'string') return error.slice(0, 300);
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message.slice(0, 300);
  }
  return fallback;
}

function groqBaseUrl(): string {
  return (process.env['GROQ_API_URL'] || 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
}

function deepseekBaseUrl(): string {
  return (process.env['DEEPSEEK_API_URL'] || 'https://api.deepseek.com').replace(/\/+$/, '');
}

// Model defaults. Every one can be overridden with the matching environment variable, so a model
// being retired never needs a code change. (Checked Nov 2026: gemini-3.1-flash-lite is stable, on
// Google's free tier and accepts audio; Groq retired llama-3.3-70b-versatile on 16 Aug 2026; DeepSeek's
// current fast model is deepseek-flash, the old deepseek-chat id is gone.)
const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_GROQ_REPORT_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-flash';

/** True when the provider has an API key on the server, so the chain can skip providers you have not set up. */
function providerConfigured(name: ProviderName): boolean {
  const key = name === 'gemini' ? 'GEMINI_API_KEY' : name === 'groq' ? 'GROQ_API_KEY' : 'DEEPSEEK_API_KEY';
  return Boolean(process.env[key]?.trim());
}

function providerConfig(name: ProviderName, purpose: 'report' | 'transcription'): ProviderConfig {
  if (name === 'gemini') {
    const apiKey = process.env['GEMINI_API_KEY']?.trim();
    if (!apiKey) throw new ProviderError('Gemini is not configured. Add GEMINI_API_KEY on the server.', 'gemini');
    return {
      name,
      apiKey,
      model: purpose === 'report' ? (process.env['REPORT_AI_MODEL'] || DEFAULT_GEMINI_MODEL) : (process.env['GEMINI_TRANSCRIPTION_MODEL'] || DEFAULT_GEMINI_MODEL),
    };
  }
  if (name === 'deepseek') {
    const apiKey = process.env['DEEPSEEK_API_KEY']?.trim();
    if (!apiKey) throw new ProviderError('DeepSeek is not configured. Add DEEPSEEK_API_KEY on the server.', 'deepseek');
    if (purpose === 'transcription') throw new ProviderError('DeepSeek does not offer speech transcription.', 'deepseek');
    return { name, apiKey, baseUrl: deepseekBaseUrl(), model: process.env['DEEPSEEK_REPORT_MODEL'] || DEFAULT_DEEPSEEK_MODEL };
  }
  const apiKey = process.env['GROQ_API_KEY']?.trim();
  if (!apiKey) throw new ProviderError('Groq is not configured. Add GROQ_API_KEY on the server.', 'groq');
  return {
    name,
    apiKey,
    baseUrl: groqBaseUrl(),
    model: purpose === 'report' ? (process.env['GROQ_REPORT_MODEL'] || DEFAULT_GROQ_REPORT_MODEL) : (process.env['REPORT_TRANSCRIPTION_MODEL'] || DEFAULT_GROQ_TRANSCRIPTION_MODEL),
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, provider: ProviderName, timeoutMs = 30_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error instanceof DOMException || error instanceof Error) && error.name === 'AbortError') throw new ProviderError('The AI provider timed out.', provider, 408, true);
    throw new ProviderError('The AI provider could not be reached.', provider, undefined, true);
  } finally {
    clearTimeout(timer);
  }
}

async function readProviderJson(response: Response, provider: ProviderName, purpose: string): Promise<unknown> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ProviderError(`${provider} ${purpose} failed: ${safeErrorMessage(payload, `HTTP ${response.status}`)}`, provider, response.status, isRecoverableStatus(response.status));
  }
  return payload;
}

const STATUS_VALUES = ['Done', 'Partly Done', 'Not Done'];
function reportSchema(options: { strict: boolean }) {
  const obj = (required: string[], properties: Record<string, unknown>) => ({ type: 'object', ...(options.strict ? { additionalProperties: false } : {}), required, properties });
  const str = { type: 'string' };
  return obj(
    ['objectives', 'activities', 'challenges', 'tomorrowPlans', 'pendingTasks', 'achievements', 'removeIds', 'clarification', 'cleanedNarration'],
    {
      objectives: { type: 'array', items: obj(['id', 'objective', 'status', 'resultsFigures', 'reasonIfNotCompleted'], { id: str, objective: str, status: { type: 'string', enum: STATUS_VALUES }, resultsFigures: str, reasonIfNotCompleted: str }) },
      activities: { type: 'array', items: obj(['id', 'task', 'outcome', 'placePersonPlatform', 'quantityFigures', 'time', 'objectiveId'], { id: str, task: str, outcome: str, placePersonPlatform: str, quantityFigures: str, time: str, objectiveId: str }) },
      challenges: { type: 'array', items: obj(['id', 'problem', 'whenHappened', 'actionTaken', 'resolved'], { id: str, problem: str, whenHappened: str, actionTaken: str, resolved: { type: 'boolean' } }) },
      tomorrowPlans: { type: 'array', items: obj(['id', 'task', 'resourcesNeeded', 'approvalsRequired'], { id: str, task: str, resourcesNeeded: str, approvalsRequired: str }) },
      pendingTasks: { type: 'array', items: str },
      achievements: { type: 'array', items: str },
      removeIds: { type: 'array', items: str },
      clarification: str,
      cleanedNarration: str,
    },
  );
}

const narrationSystem = (department: string) => `You are Kenzy, the drafting engine behind the daily report assistant for a company's staff. The employee talks or types about their working day, often in one long, loosely worded paragraph. Your job is to READ it, SPLIT it into its separate facts and PLACE each fact in the correct field of the company's approved daily report. You never write one polished paragraph and never put everything in one field.

THE APPROVED REPORT (four lists, nothing else)
- objectives: what the employee was ASSIGNED to accomplish today. {objective, status "Done"|"Partly Done"|"Not Done", resultsFigures, reasonIfNotCompleted}
- activities: what the employee ACTUALLY DID, one entry per separate piece of work. {task, placePersonPlatform, quantityFigures, outcome, time, objectiveId}
- challenges: problems, delays or blockers. {problem, whenHappened, actionTaken, resolved}
- tomorrowPlans: what they intend to do on the next working day. {task, resourcesNeeded, approvalsRequired}

HOW TO DISTRIBUTE WHAT THE EMPLOYEE SAYS
1. Split every sentence into individual facts. "I edited two videos and uploaded them to Facebook" is TWO activities: "Edited two promotional videos" and "Uploaded the videos to Facebook". Never merge unrelated tasks into one activity.
2. Completed work -> activities. Each activity is a short, clean, past-tense sentence fragment ("Designed three promotional flyers for the Christmas campaign").
3. Quantities -> that activity's quantityFigures ("3 promotional flyers"), but only when the employee actually said a number. Copy figures exactly. Where it was done or with whom or on which platform -> placePersonPlatform ("Production department", "Facebook and Instagram"). Use outcome only for a RESULT the employee states beyond the task itself (for example "approved by the manager", "published"); otherwise "". Do not repeat the task text in outcome.
4. Objectives are ASSIGNED goals. NEVER invent one. Create a new objective ONLY when the employee clearly says something was assigned, targeted or expected of them ("my task today was...", "I was supposed to...", "my target was...", "objective assigned: ...", "my objective is..."). When an existing objective in the current report matches the work described, update THAT row by id (status, resultsFigures, reasonIfNotCompleted) and set objectiveId on the matching activities. If no objective can be established, leave objectives alone and leave objectiveId "".
5. Work the employee could NOT finish, or is waiting on, is NOT an activity. Record the blocker as a challenge (problem written as a clear sentence that names the unfinished work and the cause). If it clearly matches an existing objective, set that objective to "Not Done" (or "Partly Done" if some progress was stated) with the stated reason. List the unfinished work in pendingTasks. Do not turn it into a tomorrow plan unless the employee said they will do it.
6. A challenge needs an explicit problem. actionTaken only if the employee said what they did about it. resolved true only if they said it was resolved.
7. Future intentions ("tomorrow", "next", "I will", "I intend to") -> tomorrowPlans, one entry per separate intended task, written as a short imperative ("Complete the product catalogue"). resourcesNeeded and approvalsRequired only if stated.
8. achievements: only results the employee presents as accomplishments, copied faithfully (for example "Three promotional flyers designed").
9. Fix grammar, remove repetition and use simple professional English, but keep the employee's meaning and every figure exactly.

WHEN THE EMPLOYEE READS THE FORM'S FIELD NAMES ALOUD
Staff often dictate by reading the form top to bottom, so the message contains the form's own labels mixed into the sentences. The labels are NOT content. They tell you which field the words after them belong to. Never copy a label into a field, and never put the whole message into one field. The labels, in form order:
- "Objective assigned" / "Objective" / "What were you asked to do" -> objectives[].objective
- "Was it finished" / "Done" -> that objective's status. yes / done / completed = "Done"; partly / some = "Partly Done"; no / not yet = "Not Done" (then the reason, if given, goes in reasonIfNotCompleted)
- "Result achieved" / "Results achieved" -> that objective's resultsFigures
- "Activities performed" / "Activity" / "What did you do" -> activities[].task (create one activity per separate task)
- "Details" / "Where, who or which platform" / "Platform" -> that activity's placePersonPlatform
- "How many" / "Quantity" -> that activity's quantityFigures
- "Result or outcome" / "Outcome" -> that activity's outcome
- "Time" -> that activity's time. "No need", "skip", "none" = ""
- "Challenges" / "Problems" -> challenges[]. "No challenges", "none", "nothing" = no challenge rows at all
- "Plans for tomorrow" / "Tomorrow" -> tomorrowPlans[]
Answers such as "no need to go there", "skip", "none", "not applicable" mean the field stays empty.
Speech-to-text damage is normal. Repair it from context: "cup cat pc" = "CapCut PC", "face book" = "Facebook". Self-corrections ("three, so one video, sorry, one video") mean only the final version counts. A label that is followed by a repeat of the previous answer ("details: CapCut PC") fills the field named by the label. If a word group could belong to two fields, prefer the field the nearest label names.
Quantity words in an answer to "Result achieved" or "How many" count as stated numbers ("one" -> "1 video").

HARD ACCURACY RULES
- Use only facts explicitly stated in the employee's message or already in the report. Never invent activities, quantities, achievements, people, places, platforms, dates, times, reasons, challenges, actions or objectives.
- A field that was not stated must be an empty string (or false / empty array). No placeholders, no guessing.
- "time" is only for a clock time the employee literally gave: "HH:MM - HH:MM" (24-hour) for a range, "HH:MM - " for a single start time, otherwise "". Never output a default such as 08:00 - 09:00.

WORKED EXAMPLE (illustration of the expected behaviour)
Message: "Today I designed three promotional flyers for the Christmas campaign. I also visited the production department to take photographs of the new spice products. I edited two promotional videos and uploaded them to the company's social media pages. However, I couldn't complete the product catalogue because I was waiting for the final product images. Tomorrow, I intend to complete the catalogue and prepare another promotional video."
With an empty report you return:
activities: [{task:"Designed three promotional flyers for the Christmas campaign", quantityFigures:"3 promotional flyers"}, {task:"Visited the production department and photographed the new spice products", placePersonPlatform:"Production department"}, {task:"Edited two promotional videos", quantityFigures:"2 promotional videos"}, {task:"Uploaded the promotional videos to the company's social media pages", placePersonPlatform:"Company social media pages"}]
challenges: [{problem:"Product catalogue could not be completed because the final product images were not yet available", actionTaken:"", resolved:false}]
tomorrowPlans: [{task:"Complete the product catalogue"}, {task:"Prepare another promotional video"}]
pendingTasks: ["Complete the product catalogue"]
achievements: ["Three promotional flyers designed", "Two promotional videos edited", "Promotional content uploaded"]
objectives: [] (none were stated), removeIds: [], clarification: "".

SECOND EXAMPLE (form labels read aloud)
Message: "Objective assigned. Finish the delivery post. was it finished yes just done results achieved three so one video sorry one video activities performed design the videos using cup cat pc details who on which platform cup cat pc How many? One. Result or outcome? Complete. Time. No need to go there. No challenges were taken. Plans for tomorrow. Finish the Afia garlic post."
With an empty report you return:
objectives: [{id:"", objective:"Finish the delivery post", status:"Done", resultsFigures:"1 video", reasonIfNotCompleted:""}]
activities: [{task:"Designed the video using CapCut PC", placePersonPlatform:"CapCut PC", quantityFigures:"1 video", outcome:"Complete", time:"", objectiveId:""}]
challenges: [] (the employee said there were none)
tomorrowPlans: [{task:"Finish the Afia garlic post"}]
pendingTasks: [], achievements: ["One video completed"], removeIds: [], clarification: "".

UPDATING AN EXISTING DRAFT
The current report rows are provided with ids. The employee may already have typed some rows by hand: those are their words, so respect them. Return ONLY rows that should change or be added:
- If the new message is about something already in the report, return that row with its id and the improved or corrected content instead of adding a duplicate. (Example: "I actually edited three videos, not two" updates the existing video row.)
- To add something new, return it with id "".
- Do not repeat rows that need no change. Never return a row just to clear a field. Never lower-quality or shorten what is already there.
- Put an id in removeIds only if the employee explicitly asks to remove or cancel that item.
- If the message is ambiguous (for example it could refer to several existing rows, or it is unclear whether something was done or only planned), change nothing for that part and ask ONE short, friendly question in "clarification". Otherwise clarification is "".
- cleanedNarration: the new message with grammar cleaned up only.

The employee's department is ${department || 'not specified'}. Respond with a single JSON object that follows the provided schema exactly and nothing else.`;

function userPrompt(narration: string, knownActivities: string[], currentReport: unknown): string {
  return `Known activity wording from this employee's past reports is vocabulary context only and is NOT evidence they did these today: ${knownActivities.join('; ') || 'none'}\n\nCurrent report rows (JSON):\n${JSON.stringify(currentReport ?? {})}\n\nEmployee's new message:\n${narration}`;
}

export type NarrationInput = z.infer<typeof narrationInputSchema>;

/** Exported for tests only. */
export async function callGeminiReport(input: NarrationInput) {
  const config = providerConfig('gemini', 'report');
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: narrationSystem(input.department) }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt(input.narration, input.knownActivities, input.currentReport) }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: reportSchema({ strict: false }) },
    }),
  }, 'gemini');
  const payload = await readProviderJson(response, 'gemini', 'report structuring') as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const content = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!content) throw new ProviderError('Gemini returned no report draft.', 'gemini', undefined, false);
  return parseReportOutput(content, 'gemini');
}

/** Exported for tests only. */
export async function callGroqReport(input: NarrationInput) {
  const config = providerConfig('groq', 'report');
  const schemaText = JSON.stringify(reportSchema({ strict: false }));
  const messages = [
    { role: 'system', content: `${narrationSystem(input.department)}\n\nJSON schema to follow:\n${schemaText}` },
    { role: 'user', content: userPrompt(input.narration, input.knownActivities, input.currentReport) },
  ];
  const formats: (Record<string, unknown> | undefined)[] = [
    { type: 'json_schema', json_schema: { name: 'daily_report_changes', strict: true, schema: reportSchema({ strict: true }) } },
    { type: 'json_object' },
    undefined,
  ];
  let response: Response | undefined;
  for (const format of formats) {
    response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.model, temperature: 0, messages, ...(format ? { response_format: format } : {}) }),
    }, 'groq');
    // 400 usually means this model does not support that response_format; try a simpler one.
    if (response.status !== 400) break;
  }
  if (!response) throw new ProviderError('Groq did not respond.', 'groq', undefined, true);
  const payload = await readProviderJson(response, 'groq', 'report structuring') as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new ProviderError('Groq returned no report draft.', 'groq', undefined, false);
  return parseReportOutput(content, 'groq');
}

/** Exported for tests only. DeepSeek is OpenAI-compatible but only supports `json_object` (not `json_schema`), so the schema is given in the prompt. */
export async function callDeepseekReport(input: NarrationInput) {
  const config = providerConfig('deepseek', 'report');
  const schemaText = JSON.stringify(reportSchema({ strict: false }));
  const messages = [
    { role: 'system', content: `${narrationSystem(input.department)}\n\nReturn JSON only. The JSON must follow this schema:\n${schemaText}` },
    { role: 'user', content: userPrompt(input.narration, input.knownActivities, input.currentReport) },
  ];
  const response = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.model, temperature: 0, max_tokens: 4096, messages, response_format: { type: 'json_object' } }),
  }, 'deepseek', 45_000);
  const payload = await readProviderJson(response, 'deepseek', 'report structuring') as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  // DeepSeek's JSON mode can occasionally return an empty body; treat that as a failed attempt so the chain moves on.
  if (!content?.trim()) throw new ProviderError('DeepSeek returned no report draft.', 'deepseek', undefined, false);
  return parseReportOutput(content, 'deepseek');
}

function parseReportOutput(content: string, provider: ProviderName) {
  let raw: unknown;
  try { raw = parseJsonObject(content); } catch { throw new ProviderError(`${provider} returned an invalid report draft.`, provider, undefined, false); }
  const parsed = narrationOutputSchema.safeParse(raw);
  if (!parsed.success) throw new ProviderError(`${provider} returned an incomplete report draft.`, provider, undefined, false);
  return parsed.data;
}

const CLOCK_TIME = /\b\d{1,2}\s*(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b|\bnoon\b|\bmidnight\b/i;

/** Converts validated provider output into the shared draft, enforcing the anti-fabrication rules. */
export function toDraft(output: z.infer<typeof narrationOutputSchema>, input: { narration: string; currentReport?: NarrationInput['currentReport'] }): StructuredNarrationDraft {
  const known = new Set<string>();
  for (const list of [input.currentReport?.objectives, input.currentReport?.activities, input.currentReport?.challenges, input.currentReport?.tomorrowPlans]) for (const row of list ?? []) known.add(row.id);
  const idOf = (id: string) => (id && known.has(id) ? id : undefined);
  const objectiveIds = new Set((input.currentReport?.objectives ?? []).map((row) => row.id));
  const timeAllowed = CLOCK_TIME.test(input.narration);
  const objectives = (output.objectives ?? []).map((o) => ({ id: idOf(o.id), objective: o.objective.trim(), status: o.status, resultsFigures: o.resultsFigures.trim(), reasonIfNotCompleted: o.status === 'Done' ? '' : o.reasonIfNotCompleted.trim() })).filter((o) => o.objective);
  const activities = (output.activities ?? []).map((a) => ({ id: idOf(a.id), task: a.task.trim(), outcome: a.outcome.trim(), placePersonPlatform: a.placePersonPlatform.trim(), quantityFigures: a.quantityFigures.trim(), time: timeAllowed ? normalizeActivityTime(a.time) : '', objectiveId: a.objectiveId && objectiveIds.has(a.objectiveId) ? a.objectiveId : undefined })).filter((a) => a.task);
  const challenges = (output.challenges ?? []).map((c) => ({ id: idOf(c.id), problem: c.problem.trim(), whenHappened: c.whenHappened.trim(), actionTaken: c.actionTaken.trim(), resolved: c.resolved })).filter((c) => c.problem);
  const tomorrowPlans = (output.tomorrowPlans ?? []).map((p) => ({ id: idOf(p.id), task: p.task.trim(), resourcesNeeded: p.resourcesNeeded.trim(), approvalsRequired: p.approvalsRequired.trim() })).filter((p) => p.task);
  return {
    objectives, activities, challenges, tomorrowPlans,
    pendingTasks: output.pendingTasks.map((t) => t.trim()).filter(Boolean),
    achievements: output.achievements.map((t) => t.trim()).filter(Boolean),
    removeIds: output.removeIds.filter((id) => known.has(id)),
    clarification: output.clarification.trim(),
    cleanedNarration: output.cleanedNarration.trim() || input.narration.trim(),
  };
}

function isEmptyDraft(draft: StructuredNarrationDraft) {
  return !draft.objectives.length && !draft.activities.length && !draft.challenges.length && !draft.tomorrowPlans.length && !draft.removeIds.length && !draft.clarification;
}

/**
 * An empty answer is only a FAILED attempt when the report is still blank (a real narration must produce
 * rows). When the report already has rows, an empty answer is legitimate: the model is told to return only
 * what is new or changed, so repeating something already in the report correctly yields nothing. Rejecting
 * that made every provider "fail" and silently switched the employee to the offline parser.
 */
export function shouldRejectEmptyDraft(draft: StructuredNarrationDraft, input: { narration: string; currentReport?: NarrationInput['currentReport'] }): boolean {
  if (!isEmptyDraft(draft) || input.narration.trim().length < 15) return false;
  const report = input.currentReport;
  const existingRows = (report?.objectives?.length ?? 0) + (report?.activities?.length ?? 0) + (report?.challenges?.length ?? 0) + (report?.tomorrowPlans?.length ?? 0);
  return existingRows === 0;
}

function parseJsonObject(content: string): unknown {
  const unfenced = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(unfenced); } catch {
    const start = unfenced.indexOf('{'); const end = unfenced.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('The AI provider returned an invalid report draft.');
    return JSON.parse(unfenced.slice(start, end + 1));
  }
}

async function callGroqTranscription(audioBase64: string, mimeType: string) {
  const config = providerConfig('groq', 'transcription');
  const bytes = Buffer.from(audioBase64, 'base64');
  if (!bytes.length) throw new Error('The recording was empty.');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mimeType }), `daily-report.${mimeType.split('/')[1] || 'webm'}`);
  form.append('model', config.model);
  form.append('language', 'en');
  form.append('temperature', '0');
  const response = await fetchWithTimeout(`${config.baseUrl}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${config.apiKey}` }, body: form }, 'groq', 60_000);
  const payload = await readProviderJson(response, 'groq', 'transcription') as { text?: string };
  if (!payload.text?.trim()) throw new ProviderError('Groq returned an empty transcript.', 'groq', undefined, false);
  return payload.text.trim();
}

async function callGeminiTranscription(audioBase64: string, mimeType: string) {
  const config = providerConfig('gemini', 'transcription');
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': config.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Transcribe this audio exactly. Return only the spoken words with punctuation. Do not summarize or invent missing words.' }, { inlineData: { mimeType, data: audioBase64 } }] }] }),
  }, 'gemini', 60_000);
  const payload = await readProviderJson(response, 'gemini', 'transcription') as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new ProviderError('Gemini returned an empty transcript.', 'gemini', undefined, false);
  return text;
}

/**
 * Providers to try, in order, for this purpose. REPORT_AI_PROVIDER / REPORT_TRANSCRIPTION_PROVIDER may be a
 * single name ("gemini") or a list ("gemini,deepseek,groq"). Providers without an API key are skipped.
 */
export function providerChain(purpose: 'report' | 'transcription'): ProviderName[] {
  const configured = purpose === 'report' ? process.env['REPORT_AI_PROVIDER'] : process.env['REPORT_TRANSCRIPTION_PROVIDER'];
  return providerChainFrom(purpose, configured).filter(providerConfigured);
}

const REPORT_CALLS: Record<ProviderName, (input: NarrationInput) => ReturnType<typeof callGeminiReport>> = {
  gemini: callGeminiReport,
  groq: callGroqReport,
  deepseek: callDeepseekReport,
};

export const structureNarration = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).validator((input: unknown) => narrationInputSchema.parse(input)).handler(async ({ data }) => {
  const outcome = await callWithProviderChain('report', providerChain('report'), async (provider) => {
    const output = await REPORT_CALLS[provider](data);
    const draft = toDraft(output, data);
    // A provider that returns nothing usable for a real narration counts as a failed attempt.
    if (shouldRejectEmptyDraft(draft, data)) throw new ProviderError(`${provider} returned no usable report content.`, provider, undefined, false);
    return draft;
  });
  return { draft: outcome.value, provider: outcome.provider, fellBack: outcome.fellBack, primaryFailure: outcome.primaryFailure ?? '' };
});

export const transcribeAudio = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).validator((input: unknown) => transcriptionInputSchema.parse(input)).handler(async ({ data }) => {
  const outcome = await callWithProviderChain('transcription', providerChain('transcription'), (provider) => provider === 'groq' ? callGroqTranscription(data.audioBase64, data.mimeType) : callGeminiTranscription(data.audioBase64, data.mimeType));
  return { text: outcome.value, provider: outcome.provider, fellBack: outcome.fellBack };
});

// Fixed daily-report recipient (Madam Ursula): the lookup lives in reportRecipient.server.ts so
// the Supabase service-role client can never be pulled into the browser bundle.
export const getDailyReportRecipient = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async () => {
  const { resolveReportRecipient } = await import('@/services/reportRecipient.server');
  return resolveReportRecipient();
});

export const getCloudUser = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [{ data: profile, error }, { data: role }] = await Promise.all([
    context.supabase.from('profiles').select('*').eq('id', context.userId).single(),
    context.supabase.from('user_roles').select('role').eq('user_id', context.userId).single(),
  ]);
  if (error || !profile || !profile.active) throw new Error('Your staff account is not active.');
  let supervisorName: string | undefined;
  if (profile.supervisor_id) {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: sup } = await supabaseAdmin.from('profiles').select('name,email').eq('id', profile.supervisor_id).maybeSingle();
    supervisorName = sup ? (sup.name || sup.email) : undefined;
  }
  return { id: profile.id, name: profile.name || profile.email, email: profile.email, role: role?.role ?? 'employee', employeeId: profile.employee_code, department: profile.department, roleTitle: profile.role_title, supervisorId: profile.supervisor_id ?? undefined, supervisorName };
});
export const readCloudStore = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).validator((input: unknown) => z.object({ store: storeSchema }).parse(input)).handler(async ({ data, context }) => {
  const rows: Json[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data: records, error } = await context.supabase.from('reporting_records').select('payload').eq('store', data.store).order('id').range(offset,offset+499);
    if (error) throw new Error(error.message);
    rows.push(...(records ?? []).map(row => row.payload));
    if (!records || records.length < 500) break;
  }
  if (data.store === 'employees') {
    const { data: profiles, error } = await context.supabase.from('profiles').select('*');
    if (error) throw new Error(error.message);
    for (const p of profiles ?? []) if (!rows.some(r => r && typeof r === 'object' && !Array.isArray(r) && r['id'] === p.id)) rows.push({ id:p.id, name:p.name, email:p.email, employeeId:p.employee_code, department:p.department, roleTitle:p.role_title, roleId:'', phone:p.phone, status:p.active?'active':'inactive', dateAdded:'', supervisorId:p.supervisor_id });
  }
  return rows;
});
const mutationSchema = z.object({ store:storeSchema, id:z.string().min(1), operation:z.enum(['put','delete']), payload:z.record(z.string(),z.unknown()).optional() });
export const writeCloudRecord = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).validator((input:unknown)=>mutationSchema.parse(input)).handler(async ({data,context})=> {
  const {data:roleRow,error:roleError}=await context.supabase.from('user_roles').select('role').eq('user_id',context.userId).single();
  const {data:profile}=await context.supabase.from('profiles').select('active,supervisor_id').eq('id',context.userId).single();
  if(roleError || !profile?.active) throw new Error('Staff access required.');
  const role=roleRow?.role ?? 'employee';
  const {data:old,error:readError}=await context.supabase.from('reporting_records').select('*').eq('store',data.store).eq('id',data.id).maybeSingle();
  if(readError) throw new Error(readError.message);
  const payload=data.payload ?? {};
  let ownerId=context.userId;
  let supervisorId: string | null=profile.supervisor_id;
  const reportStore=['daily_reports','weekly_reports'].includes(data.store);
  if(reportStore) {
    const prior=old?.payload as Record<string,unknown> | undefined;
    ownerId=old?.owner_id ?? String(payload['employeeId'] ?? context.userId);
    if(ownerId!==context.userId) {
      if(role!=='ceo' && role!=='manager') throw new Error('You cannot change this report.');
      if(!old || data.operation==='delete' || prior?.['status']!=='submitted') throw new Error('Only submitted reports can be reviewed.');
      if(!['approved','returned'].includes(String(payload['status']))) throw new Error('Invalid review decision.');
      const oldReviews=Array.isArray(prior['reviews'])?prior['reviews']:[];
      const newReviews=Array.isArray(payload['reviews'])?payload['reviews']:[];
      if(newReviews.length!==oldReviews.length+1) throw new Error('One review is required.');
      const review=newReviews.at(-1) as Record<string,unknown> | undefined;
      if(review?.['reviewerId']!==context.userId || review?.['decision']!==payload['status']) throw new Error('Invalid reviewer.');
      if(payload['status']==='returned' && !String(review?.['comments'] ?? '').trim()) throw new Error('Correction feedback is required.');
      for(const key of Object.keys(prior)) if(!['status','reviews','updatedAt'].includes(key) && JSON.stringify(prior[key])!==JSON.stringify(payload[key])) throw new Error('Reviews cannot alter report contents.');
    } else {
      if(old && !['draft','returned'].includes(String(prior?.['status']))) throw new Error('Submitted reports are locked.');
      if(data.operation==='put' && !['draft','submitted'].includes(String(payload['status']))) throw new Error('Only supervisors can approve reports.');
      if(JSON.stringify(payload['reviews'] ?? [])!==JSON.stringify(prior?.['reviews'] ?? [])) throw new Error('Only supervisors can add reviews.');
    }
    const {data:ownerProfile}=await context.supabase.from('profiles').select('supervisor_id').eq('id',ownerId).maybeSingle();
    supervisorId=old?.supervisor_id ?? ownerProfile?.supervisor_id ?? null;
    // Daily reports always go to the fixed recipient (Madam Ursula), whatever the client sent.
    if(data.store==='daily_reports' && data.operation==='put' && ownerId===context.userId) {
      const { resolveReportRecipient } = await import('@/services/reportRecipient.server');
      const recipient=await resolveReportRecipient();
      if(recipient.id!==ownerId) { payload['submittedToId']=recipient.id; payload['submittedToName']=recipient.name; supervisorId=recipient.id; }
    }
  } else if(['employees','roles','settings'].includes(data.store)) {
    if(role!=='ceo') throw new Error('CEO access required.');
  } else if(data.store==='notifications') {
    if(old && old.owner_id!==context.userId) throw new Error('Only your notifications can be changed.');
    const recipient=String(payload['recipientId'] ?? context.userId);
    if(recipient!==context.userId) {
      const reportId=String(payload['linkReportId']??'');
      const {data:linked}=await context.supabase.from('reporting_records').select('owner_id,supervisor_id').eq('id',reportId).in('store',['daily_reports','weekly_reports']).maybeSingle();
      if(!linked || ![linked.owner_id,linked.supervisor_id].includes(context.userId) || ![linked.owner_id,linked.supervisor_id].includes(recipient)) throw new Error('Invalid notification recipient.');
    }
    ownerId=recipient;
  } else if(old && old.owner_id!==context.userId) throw new Error('Only your records can be changed.');
  if(data.store==='audit_logs' && (old || data.operation==='delete' || payload['userId']!==context.userId)) throw new Error('Audit entries are immutable.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  if(data.operation==='delete') {
    const {error}=await supabaseAdmin.from('reporting_records').delete().eq('store',data.store).eq('id',data.id);
    if(error) throw new Error(error.message);
  } else {
    const {error}=await supabaseAdmin.from('reporting_records').upsert({store:data.store,id:data.id,owner_id:ownerId,supervisor_id:supervisorId,payload:payload as Json,updated_at:new Date().toISOString()});
    if(error) throw new Error(error.message);
  }
  if(data.store==='notifications' && data.operation==='put' && !old && ownerId!==context.userId && payload['read']!==true) {
    try { const {sendPushToUser}=await import('@/lib/push.server'); await sendPushToUser(ownerId,{title:String(payload['title']??'Plants & Pure'),body:String(payload['message']??''),url:'/',tag:data.id}); } catch { /* push is best-effort */ }
  }
  return {success:true};
});
const subscriptionSchema = z.object({ endpoint: z.string().url().startsWith('https://'), p256dh: z.string().min(10), auth: z.string().min(5) });
export const savePushSubscription = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).validator((input:unknown)=>subscriptionSchema.parse(input)).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await (supabaseAdmin as any).from('push_subscriptions').upsert({ endpoint:data.endpoint, user_id:context.userId, p256dh:data.p256dh, auth:data.auth });
  if (error) throw new Error(error.message);
  return { success:true };
});
export const removePushSubscription = createServerFn({ method:'POST' }).middleware([requireSupabaseAuth]).validator((input:unknown)=>z.object({ endpoint:z.string().min(10) }).parse(input)).handler(async ({ data, context }) => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  await (supabaseAdmin as any).from('push_subscriptions').delete().eq('endpoint', data.endpoint).eq('user_id', context.userId);
  return { success:true };
});
