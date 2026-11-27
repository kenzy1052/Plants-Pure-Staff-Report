import type {
  DailyActivity,
  DailyChallenge,
  DailyObjective,
  NarrationDraftActivity,
  NarrationDraftChallenge,
  NarrationDraftObjective,
  NarrationDraftPlan,
  ObjectiveStatus,
  StructuredNarrationDraft,
  TomorrowPlan,
} from "../types";

/**
 * Pure helpers for the daily report assistant (Kenzy): the conservative offline parser,
 * the merge that applies a chat message's proposed changes to the existing report
 * fields, and a field-level undo. No framework or network imports, so everything here is
 * unit testable and runs identically in the browser and on the server.
 */

export const MAX_NARRATION_LENGTH = 8_000;

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[-•\s]+/, "").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(clean).filter(Boolean).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Lower-cased, punctuation-free key used to recognise "the same" item. */
export function itemKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", fifteen: "15", twenty: "20", thirty: "30", forty: "40", fifty: "50", hundred: "100",
};
const NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORDS).join("|");

const STOP_WORDS = new Set([
  "the", "a", "an", "to", "of", "for", "and", "on", "in", "at", "with", "my", "our", "i", "was", "were", "is", "are", "be", "been",
  "new", "some", "that", "this", "it", "them", "from", "by", "as", "then", "also", "today", "again", "more", "another", "about",
]);

function stem(word: string): string {
  if (word.length <= 3 || /^\d/.test(word)) return word;
  let w = word;
  if (/ies$/.test(w) && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (/(sses|xes|zes|ches|shes)$/.test(w)) w = w.slice(0, -2);
  else if (/ing$/.test(w) && w.length > 5) w = w.slice(0, -3);
  else if (/ed$/.test(w) && w.length > 4) w = w.slice(0, -2);
  else if (/s$/.test(w) && !/ss$/.test(w)) w = w.slice(0, -1);
  return w.length > 3 ? w.replace(/e$/, "") : w;
}

function tokens(value: string): string[] {
  return itemKey(value)
    .split(" ")
    .filter(Boolean)
    .map((word) => NUMBER_WORDS[word] ?? word)
    .filter((word) => !STOP_WORDS.has(word))
    .map(stem);
}

/**
 * True when two short descriptions are clearly about the same piece of work
 * ("Designed 3 flyers" / "designed three promotional flyers for Christmas"). Quantities must
 * not disagree, so a correction such as "three videos, not one" is never silently merged by
 * wording alone; the AI returns that kind of correction with a row id instead.
 */
export function isSameItem(a: string, b: string): boolean {
  const keyA = itemKey(a);
  const keyB = itemKey(b);
  if (!keyA || !keyB) return false;
  if (keyA === keyB) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (Math.min(ta.length, tb.length) < 2) return false;
  const numsA = ta.filter((t) => /^\d/.test(t));
  const numsB = tb.filter((t) => /^\d/.test(t));
  if (numsA.length && numsB.length && numsA.join(",") !== numsB.join(",")) return false;
  const setB = new Set(tb);
  const shared = [...new Set(ta)].filter((t) => setB.has(t)).length;
  const containment = shared / Math.min(new Set(ta).size, setB.size);
  const dice = (2 * shared) / (new Set(ta).size + setB.size);
  return containment >= 0.85 && dice >= 0.5;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Accepts "HH:MM - HH:MM", "HH:MM - " or "HH:MM" (24h) and returns the canonical
 * stored form. Anything else (including placeholders) becomes an empty string,
 * which is the existing "no time given" representation.
 */
export function normalizeActivityTime(value: string | undefined | null): string {
  if (!value) return "";
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(?:[-–—]\s*(?:(\d{1,2}):(\d{2}))?)?$/);
  if (!match) return "";
  const sh = Number(match[1]);
  const sm = Number(match[2]);
  if (sh > 23 || sm > 59) return "";
  const start = `${pad2(sh)}:${pad2(sm)}`;
  if (match[3] === undefined || match[4] === undefined) return `${start} - `;
  const eh = Number(match[3]);
  const em = Number(match[4]);
  if (eh > 23 || em > 59) return `${start} - `;
  return `${start} - ${pad2(eh)}:${pad2(em)}`;
}

function to24h(hour: number, minute: number, meridiem: string | undefined): string | null {
  if (minute > 59) return null;
  let h = hour;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase() === "pm";
    h = hour % 12 + (pm ? 12 : 0);
  } else if (hour > 23) return null;
  return `${pad2(h)}:${pad2(minute)}`;
}

/**
 * Only extracts a time the employee literally wrote ("from 9am to 11am", "at 2:30pm",
 * "at 14:00"). A bare number is never treated as a time.
 */
export function extractExplicitTime(text: string): { time: string; rest: string } {
  const range = text.match(/\b(?:from|between)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|and|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (range) {
    const endMeridiem = range[6];
    const startMeridiem = range[3] ?? endMeridiem;
    const start = to24h(Number(range[1]), Number(range[2] ?? 0), startMeridiem);
    const end = to24h(Number(range[4]), Number(range[5] ?? 0), endMeridiem);
    if (start && end) return { time: `${start} - ${end}`, rest: clean(text.replace(range[0], "")) };
  }
  const single = text.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ?? text.match(/\bat\s+(\d{1,2}):(\d{2})()\b/i);
  if (single) {
    const start = to24h(Number(single[1]), Number(single[2] ?? 0), single[3] || undefined);
    if (start) return { time: `${start} - `, rest: clean(text.replace(single[0], "")) };
  }
  return { time: "", rest: text };
}

function sentenceCase(value: string): string {
  const task = clean(value);
  return task.charAt(0).toUpperCase() + task.slice(1);
}

// ---------------------------------------------------------------------------
// Offline parser (used only when no AI provider is reachable, and in demo mode)
// ---------------------------------------------------------------------------

const pendingPattern = /\b(couldn['’]?t|could not|didn['’]?t|did not|unable|pending|still need|waiting for|unfinished|not finish|not complete|not completed|yet to)\b/i;
const challengePattern = /\b(blocked|blocker|delay|delayed|issue|problem|challenge|shortage|missing|waiting for|failed|error|couldn['’]?t|could not|unable|broke|broken|breakdown|unavailable)\b/i;
const futurePattern = /\b(tomorrow|next working day|next day|plan to|planning to|intend to|intending to|will|going to)\b/i;
const completedVerbPattern = /\b(designed|edited|posted|published|created|completed|finished|reviewed|prepared|inspected|packed|processed|sent|updated|delivered|attended|called|met|organised|organized|trained|tested|submitted|worked on|visited|photographed|uploaded|filmed|recorded|printed|cleaned|collected|counted|labelled|labeled|wrote|made|held|checked|cooked|bottled|packaged)\b/i;

const PAST_VERB = "(?:[a-z]{3,}ed|made|took|wrote|sent|met|ran|built|held|gave|did|went|spoke|began|drew|sold|bought|paid|put|got|left|kept|found|led|saw)";
const BASE_VERB = "(?:complete|prepare|finish|edit|design|send|call|visit|post|upload|review|submit|order|deliver|pack|meet|update|create|start|continue|follow|check|collect|clean|test|print|photograph|film|record|publish|follow up|attend|draft|write|make|take|hold|bottle|package|label)";

/** "Visited the production department and photographed X" -> two separate pieces of work. */
function splitCompound(clause: string, verb: string): string[] {
  const splitter = new RegExp(`\\s*,?\\s+(?:and|then)\\s+(?:also\\s+|then\\s+)?(?=(?:i\\s+)?${verb}\\b)`, "i");
  return clause.split(splitter).map(clean).filter(Boolean);
}

function numberToDigits(text: string): string {
  return text.replace(new RegExp(`\\b(${NUMBER_WORD_PATTERN})\\b`, "gi"), (m) => NUMBER_WORDS[m.toLowerCase()] ?? m);
}

const QUANTITY_STOP = new Set(["for", "to", "of", "in", "on", "at", "with", "and", "from", "by", "the", "a", "an", "that", "which", "so", "because", "but", "after", "before", "into"]);

/** A quantity is only taken when a number is literally written ("three promotional flyers"). */
function extractQuantity(text: string): string {
  const re = new RegExp(`\\b(\\d[\\d,]*(?:\\.\\d+)?|${NUMBER_WORD_PATTERN})\\s+([a-z][a-z'’-]*(?:\\s+[a-z][a-z'’-]*){0,2})`, "i");
  const match = text.match(re);
  if (!match) return "";
  const number = match[1] ?? "";
  if (/^one$/i.test(number) && /^(of|day|more|another|else)\b/i.test(match[2] ?? "")) return "";
  const words: string[] = [];
  for (const word of (match[2] ?? "").split(/\s+/)) {
    if (QUANTITY_STOP.has(word.toLowerCase())) break;
    words.push(word);
  }
  if (!words.length) return "";
  return numberToDigits(`${number} ${words.join(" ")}`);
}

const PLACE_PATTERN = /\b(?:visited|went to|travelled to|traveled to|at|in|to)\s+(?:the\s+)?((?:[A-Za-z]+\s+){0,2}(?:department|office|store|warehouse|factory|lab|laboratory|shop|farm|site|market|depot|plant|nursery|branch|studio|kitchen|workshop))\b/i;
const PLATFORM_PATTERN = /\b(social media(?: pages| platforms| accounts)?|facebook|instagram|whatsapp|tiktok|twitter|linkedin|youtube|website|email)\b/i;

function extractPlace(text: string): string {
  const place = text.match(PLACE_PATTERN)?.[1];
  if (place) return sentenceCase(place.replace(/^(the|a)\s+/i, ""));
  const platform = text.match(PLATFORM_PATTERN)?.[1];
  return platform ? sentenceCase(platform) : "";
}

function localActivity(value: string, report?: ReportState): NarrationDraftActivity {
  const task = clean(value).replace(/^(today|this morning|this afternoon|i)\s+/i, "");
  const { time, rest } = extractExplicitTime(task);
  const activity: NarrationDraftActivity = { task: sentenceCase(rest), outcome: "", placePersonPlatform: extractPlace(rest), quantityFigures: extractQuantity(rest), time };
  const objectiveId = report ? matchObjectiveId(report, rest) : undefined;
  if (objectiveId) activity.objectiveId = objectiveId;
  return activity;
}

/** Only links to an objective that already exists and clearly shares the activity's wording. */
function matchObjectiveId(report: ReportState, text: string): string | undefined {
  const words = new Set(tokens(text));
  let best: { id: string; score: number } | undefined;
  for (const objective of report.objectives) {
    if (!objective.objective.trim()) continue;
    const objectiveWords = [...new Set(tokens(objective.objective))];
    if (objectiveWords.length < 2) continue;
    const shared = objectiveWords.filter((w) => words.has(w)).length;
    const score = shared / objectiveWords.length;
    if (shared >= 2 && score >= 0.6 && (!best || score > best.score)) best = { id: objective.id, score };
  }
  return best?.id;
}

function toPlanTasks(clause: string): string[] {
  const body = clean(
    clause
      .replace(/^(?:however|but|also|and)[,\s]+/i, "")
      .replace(/^(tomorrow|next working day|next day)[,:]?\s*/i, "")
      .replace(/^(i\s+)?(will|plan to|am planning to|intend to|am going to|want to|hope to|need to|have to)\s+/i, "")
      .replace(/[.!?]+$/, ""),
  );
  return splitCompound(body, BASE_VERB).map(sentenceCase).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Dictation that reads the form's field names aloud
// ---------------------------------------------------------------------------

type LabelKind = "objective" | "finished" | "results" | "reason" | "activity" | "details" | "quantity" | "outcome" | "time" | "challenge" | "noChallenge" | "action" | "plan";

/**
 * The form's own field names, as people say them. "weak" labels are ordinary words ("time",
 * "details") and only count at the start of a sentence or when followed by ? . or : so that normal
 * sentences are never mistaken for labels.
 */
const LABELS: { kind: LabelKind; pattern: string; weak?: boolean }[] = [
  { kind: "plan", pattern: "plans?\\s+(?:for\\s+)?tomorrow|tomorrow['’]?s\\s+plans?" },
  { kind: "outcome", pattern: "results?\\s+or\\s+outcomes?" },
  { kind: "reason", pattern: "why\\s+(?:was\\s+it\\s+)?not\\s+(?:finished|done|completed)|reason\\s+(?:it\\s+)?(?:was\\s+)?not\\s+(?:finished|done|completed)" },
  { kind: "finished", pattern: "(?:was|is)\\s+(?:it|this(?:\\s+objective)?)\\s+(?:finished|done|completed)" },
  { kind: "results", pattern: "results?\\s+achieved|result\\s+of\\s+the\\s+objective" },
  { kind: "objective", pattern: "objectives?\\s+assigned|assigned\\s+objectives?|what\\s+were\\s+you\\s+asked\\s+to\\s+do" },
  { kind: "action", pattern: "what\\s+did\\s+you\\s+do\\s+about\\s+it|actions?\\s+taken" },
  { kind: "activity", pattern: "activit(?:y|ies)\\s+performed|what\\s+did\\s+you\\s+do" },
  { kind: "details", pattern: "details?\\s+(?:who|where)(?:\\s+(?:on|or|and))?(?:\\s+which\\s+platform)?|where,?\\s+who(?:\\s+or\\s+which\\s+platform)?" },
  { kind: "quantity", pattern: "how\\s+many" },
  { kind: "noChallenge", pattern: "no\\s+(?:challenges?|problems?)" },
  { kind: "objective", pattern: "objectives?", weak: true },
  { kind: "activity", pattern: "activit(?:y|ies)", weak: true },
  { kind: "details", pattern: "details?|(?:on\\s+)?which\\s+platform", weak: true },
  { kind: "outcome", pattern: "outcomes?", weak: true },
  { kind: "time", pattern: "time", weak: true },
  { kind: "challenge", pattern: "challenges?|problems?\\s+encountered", weak: true },
];

/** Common speech-to-text mistakes for the tools and platforms this company uses. */
const SPEECH_FIXES: [RegExp, string][] = [
  [/\b(?:cup\s*cat|cap\s*cut|capcut)\b/gi, "CapCut"],
  [/\bface\s+book\b/gi, "Facebook"],
  [/\binsta\s+gram\b/gi, "Instagram"],
  [/\bwhat'?s\s*app\b/gi, "WhatsApp"],
  [/\btick\s*tock\b/gi, "TikTok"],
  [/\byou\s+tube\b/gi, "YouTube"],
  [/\bpc\b/gi, "PC"],
];

const NEGATIVE_ANSWER = /^(?:no|none|nothing|nil|nope|skip|n\/a|not\s+applicable)\b/i;

interface FoundLabel { kind: LabelKind; start: number; end: number }
interface LabelSegment { kind: LabelKind; value: string }

function findLabels(text: string): FoundLabel[] {
  const all: FoundLabel[] = [];
  for (const { kind, pattern, weak } of LABELS) {
    for (const match of text.matchAll(new RegExp(`\\b(?:${pattern})\\b`, "gi"))) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (weak) {
        const atSentenceStart = start === 0 || /[.?!:;\n]\s*$/.test(text.slice(0, start));
        const followedByMark = /^\s*[.?:]/.test(text.slice(end));
        if (!atSentenceStart && !followedByMark) continue;
      }
      all.push({ kind, start, end });
    }
  }
  // Longest label wins where two overlap ("results or outcomes" beats "outcomes").
  all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept: FoundLabel[] = [];
  for (const label of all) if (!kept.length || label.start >= kept[kept.length - 1]!.end) kept.push(label);
  return kept;
}

/** Cleans one spoken answer: repairs known mis-hearings and keeps only the last version of a self-correction. */
function refineAnswer(value: string): string {
  let out = value.replace(/^[\s.?:,;!-]+/, "").replace(/[\s.?,;!-]+$/, "");
  const parts = out.split(/\b(?:sorry|i\s+mean|i\s+meant|no\s+wait|correction)\b[\s,.]*/i).map((part) => part.trim()).filter(Boolean);
  if (parts.length) out = parts[parts.length - 1]!;
  for (const [pattern, replacement] of SPEECH_FIXES) out = out.replace(pattern, replacement);
  return clean(out);
}

function statusFromAnswer(answer: string): ObjectiveStatus {
  if (/\b(?:partly|partially|half|some\s+of\s+it|in\s+progress)\b/i.test(answer)) return "Partly Done";
  if (/\b(?:no|not|nope|unfinished|incomplete)\b/i.test(answer)) return "Not Done";
  return "Done";
}

/**
 * Handles dictation that reads the form top to bottom ("Objective assigned ... was it finished yes
 * ... activities performed ... how many ..."). The labels say which field each answer belongs to.
 * Returns null unless at least three different labels are present, so ordinary narration is never
 * treated this way.
 */
export function parseLabelledNarration(narration: string): StructuredNarrationDraft | null {
  const text = clean(narration);
  const labels = findLabels(text);
  if (new Set(labels.map((label) => label.kind)).size < 3) return null;

  const segments: LabelSegment[] = labels.map((label, index) => ({
    kind: label.kind,
    value: label.kind === "noChallenge" ? "" : refineAnswer(text.slice(label.end, labels[index + 1]?.start ?? text.length)),
  }));
  const rawAnswer = (index: number) => text.slice(labels[index]!.end, labels[index + 1]?.start ?? text.length);

  const objectives: NarrationDraftObjective[] = [];
  const activities: NarrationDraftActivity[] = [];
  const challenges: NarrationDraftChallenge[] = [];
  const tomorrowPlans: NarrationDraftPlan[] = [];
  let objective: NarrationDraftObjective | undefined;
  let activity: NarrationDraftActivity | undefined;
  let challenge: NarrationDraftChallenge | undefined;

  segments.forEach(({ kind, value }, index) => {
    const empty = !value || NEGATIVE_ANSWER.test(value);
    switch (kind) {
      case "objective":
        objective = empty ? undefined : { objective: sentenceCase(value), status: "Done", resultsFigures: "", reasonIfNotCompleted: "" };
        if (objective) objectives.push(objective);
        break;
      case "finished":
        if (objective) {
          objective.status = statusFromAnswer(rawAnswer(index));
          const reason = rawAnswer(index).match(/\b(?:because|due to|since)\s+(.+)$/i)?.[1];
          if (objective.status !== "Done" && reason) objective.reasonIfNotCompleted = sentenceCase(refineAnswer(reason));
        }
        break;
      case "results":
        if (objective && !empty) objective.resultsFigures = numberToDigits(value);
        break;
      case "reason":
        if (objective && !empty) objective.reasonIfNotCompleted = sentenceCase(value);
        break;
      case "activity":
        activity = empty ? undefined : { task: sentenceCase(value), outcome: "", placePersonPlatform: "", quantityFigures: "", time: "" };
        if (activity) activities.push(activity);
        break;
      case "details":
        if (activity && !empty) activity.placePersonPlatform = sentenceCase(value);
        break;
      case "quantity":
        if (activity && !empty) activity.quantityFigures = numberToDigits(value);
        break;
      case "outcome":
        if (activity && !empty) activity.outcome = sentenceCase(value);
        break;
      case "time":
        if (activity && !empty) activity.time = normalizeActivityTime(value) || extractExplicitTime(`at ${value}`).time;
        break;
      case "noChallenge":
        challenge = undefined;
        break;
      case "challenge":
        challenge = empty ? undefined : { problem: sentenceCase(value), whenHappened: "", actionTaken: "", resolved: false };
        if (challenge) challenges.push(challenge);
        break;
      case "action":
        if (challenge && !empty) challenge.actionTaken = sentenceCase(value);
        break;
      case "plan":
        if (!empty) for (const task of toPlanTasks(value)) tomorrowPlans.push({ task, resourcesNeeded: "", approvalsRequired: "" });
        break;
    }
  });

  // Anything said before the first label is ordinary narration; parse it the normal way.
  const preamble = clean(text.slice(0, labels[0]!.start));
  const extra = preamble.split(/\s+/).length >= 3 ? parseNarrationLocally(preamble) : undefined;
  return {
    objectives,
    activities: [...(extra?.activities ?? []), ...activities],
    pendingTasks: extra?.pendingTasks ?? [],
    challenges: [...(extra?.challenges ?? []), ...challenges],
    tomorrowPlans: [...(extra?.tomorrowPlans ?? []), ...tomorrowPlans],
    achievements: extra?.achievements ?? [],
    removeIds: [],
    clarification: "",
    cleanedNarration: text,
  };
}

/**
 * Conservative offline parser. It only copies sentences or clauses explicitly present in
 * the employee's narration; it does not infer missing details, never supplies a default
 * time, never invents an assigned objective, and never treats a pending item as completed.
 * Pending work becomes a challenge, and only updates an objective that already exists in
 * the report and clearly matches. When the employee reads the form's field names aloud, those
 * labels decide which field each answer goes to (see parseLabelledNarration).
 */
export function parseNarrationLocally(narration: string, report?: ReportState): StructuredNarrationDraft {
  const labelled = parseLabelledNarration(narration);
  if (labelled) return labelled;
  const cleanedNarration = clean(narration);
  const sentences = cleanedNarration.split(/(?<=[.!?])\s+/).map(clean).filter(Boolean);
  const activities: NarrationDraftActivity[] = [];
  const pendingTasks: string[] = [];
  const objectives: NarrationDraftObjective[] = [];
  const challenges: NarrationDraftChallenge[] = [];
  const tomorrowPlans: NarrationDraftPlan[] = [];
  const achievements: string[] = [];

  for (const sentence of sentences) {
    const clauses = sentence.split(/\s+(?:but|although|while|however)[,\s]+/i).map(clean).filter(Boolean);
    for (const rawClause of clauses) {
      const clause = clean(rawClause.replace(/^(?:however|but|unfortunately|also)[,\s]+/i, "").replace(/[.!?]+$/, ""));
      if (!clause) continue;
      if (futurePattern.test(clause) && !pendingPattern.test(clause)) {
        for (const task of toPlanTasks(clause)) tomorrowPlans.push({ task, resourcesNeeded: "", approvalsRequired: "" });
        continue;
      }
      if (pendingPattern.test(clause)) {
        const reason = clause.match(/\b(?:because|due to|as)\s+(.+)$/i)?.[1];
        const task = clean(clause.replace(/^(today\s+)?i\s+/i, "").replace(/\b(because|due to|as)\b.*$/i, ""));
        const problem = sentenceCase(clause.replace(/^(today\s+)?i\s+/i, "").replace(/\bcouldn['’]?t\b/i, "could not").replace(/\bdidn['’]?t\b/i, "did not"));
        if (problem) challenges.push({ problem, whenHappened: "", actionTaken: "", resolved: false });
        if (task) pendingTasks.push(task);
        const objectiveId = report ? matchObjectiveId(report, task) : undefined;
        const existing = objectiveId ? report?.objectives.find((o) => o.id === objectiveId) : undefined;
        if (existing) objectives.push({ id: existing.id, objective: existing.objective, status: "Not Done", resultsFigures: existing.resultsFigures, reasonIfNotCompleted: reason ? sentenceCase(reason) : "" });
        continue;
      }
      if (challengePattern.test(clause) && !completedVerbPattern.test(clause)) {
        challenges.push({ problem: sentenceCase(clause.replace(/^(today\s+)?i\s+/i, "")), whenHappened: "", actionTaken: "", resolved: false });
        continue;
      }
      if (completedVerbPattern.test(clause) || /^today\s+i\b/i.test(clause) || /^i\s+/i.test(clause)) {
        const body = clean(clause.replace(/^(today\s+)?i\s+(also\s+)?/i, ""));
        for (const part of splitCompound(body, PAST_VERB)) {
          const task = clean(part.replace(/^(i\s+)?(also\s+|then\s+)/i, "").replace(/^i\s+/i, ""));
          if (!task) continue;
          activities.push(localActivity(task, report));
          if (/\b(successfully|achievement|achieved|milestone|exceeded|completed)\b/i.test(task)) achievements.push(task);
        }
      }
    }
  }

  const dedupe = <T,>(items: T[], pick: (item: T) => string) => items.filter((item, index, all) => all.findIndex((other) => isSameItem(pick(other), pick(item))) === index);
  return {
    objectives: dedupe(objectives, (item) => item.objective),
    activities: dedupe(activities, (item) => item.task),
    pendingTasks: unique(pendingTasks),
    challenges: dedupe(challenges, (item) => item.problem),
    tomorrowPlans: dedupe(tomorrowPlans, (item) => item.task),
    achievements: unique(achievements),
    removeIds: [],
    clarification: "",
    cleanedNarration,
  };
}

// ---------------------------------------------------------------------------
// Applying a draft to the report that is already on screen
// ---------------------------------------------------------------------------

export interface ReportState {
  objectives: DailyObjective[];
  activities: DailyActivity[];
  challenges: DailyChallenge[];
  tomorrowPlans: TomorrowPlan[];
}

export type RowKind = "objective" | "activity" | "challenge" | "plan";
type Row = DailyObjective | DailyActivity | DailyChallenge | TomorrowPlan;
type ListKey = keyof ReportState;
const LIST_KEY: Record<RowKind, ListKey> = { objective: "objectives", activity: "activities", challenge: "challenges", plan: "tomorrowPlans" };

export interface MergeChange {
  kind: RowKind;
  id: string;
  /** The row as it was before this AI change (updated / removed rows). */
  before?: Row;
  /** The row as the AI left it (added / updated rows). */
  after?: Row;
  /** Position the row had (removed rows), so undo can put it back. */
  index?: number;
}

/** Everything needed to undo one AI change without touching the employee's other edits. */
export interface MergeRecord {
  added: MergeChange[];
  updated: MergeChange[];
  removed: MergeChange[];
}

type Counts = { added: number; updated: number; removed: number };

export interface MergeSummary {
  added: number;
  updated: number;
  removed: number;
  lines: string[];
  /** Things the employee still has to complete before the existing validation will accept the report. */
  needsAttention: string[];
  byKind: Record<RowKind, Counts>;
  /** Ids of rows that were added or updated, used for the brief "Kenzy updated this" highlight. */
  touched: string[];
  record: MergeRecord;
}

let idCounter = 0;
export function makeRowId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_ai_${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

export const isBlankObjective = (o: DailyObjective) => !o.objective.trim() && !o.resultsFigures.trim() && !(o.reasonIfNotCompleted ?? "").trim();
export const isBlankActivity = (a: DailyActivity) => !a.activityTask.trim() && !a.placePersonPlatform.trim() && !a.quantityFigures.trim() && !a.outcome.trim();
export const isBlankPlan = (p: TomorrowPlan) => !p.plannedTask.trim() && !p.resourcesNeeded.trim() && !p.approvalsRequired.trim();

/** Overwrite only with a non-empty value, so the AI can never blank out what the employee typed. */
const pick = (next: string, previous: string) => (next.trim() ? next.trim() : previous);

const NOUNS: Record<RowKind, [string, string]> = {
  objective: ["objective", "objectives"],
  activity: ["activity", "activities"],
  challenge: ["challenge", "challenges"],
  plan: ["plan for tomorrow", "plans for tomorrow"],
};

const sameRow = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ensureStarterRows(state: ReportState, newId: (prefix: string) => string): ReportState {
  return {
    ...state,
    objectives: state.objectives.length ? state.objectives : [{ id: newId("obj"), objective: "", status: "Done", resultsFigures: "", reasonIfNotCompleted: "" }],
    activities: state.activities.length ? state.activities : [{ id: newId("act"), time: "", activityTask: "", placePersonPlatform: "", quantityFigures: "", outcome: "" }],
    tomorrowPlans: state.tomorrowPlans.length ? state.tomorrowPlans : [{ id: newId("pl"), plannedTask: "", resourcesNeeded: "", approvalsRequired: "" }],
  };
}

export function mergeNarrationDraft(current: ReportState, draft: StructuredNarrationDraft, newId: (prefix: string) => string = makeRowId): { next: ReportState; summary: MergeSummary } {
  const counts: Record<RowKind, Counts> = {
    objective: { added: 0, updated: 0, removed: 0 },
    activity: { added: 0, updated: 0, removed: 0 },
    challenge: { added: 0, updated: 0, removed: 0 },
    plan: { added: 0, updated: 0, removed: 0 },
  };
  const removeIds = new Set(draft.removeIds);
  const changes = new Map<string, MergeChange>();
  const track = (kind: RowKind, id: string, change: Partial<MergeChange>) => {
    const key = `${kind}:${id}`;
    const previous = changes.get(key);
    changes.set(key, { ...previous, ...change, kind, id } as MergeChange);
  };

  const removeFrom = <T extends { id: string }>(rows: T[], kind: RowKind) => rows.filter((row, index) => {
    if (!removeIds.has(row.id)) return true;
    counts[kind].removed += 1;
    track(kind, row.id, { before: row as unknown as Row, index });
    return false;
  });

  let objectives = removeFrom(current.objectives, "objective");
  let activities = removeFrom(current.activities, "activity");
  let challenges = removeFrom(current.challenges, "challenge");
  let tomorrowPlans = removeFrom(current.tomorrowPlans, "plan");
  const removedKeys = new Set([...changes.keys()]);

  const findIndex = <T extends { id: string }>(rows: T[], id: string | undefined, text: string, keyOf: (row: T) => string): number => {
    if (id) {
      const byId = rows.findIndex((row) => row.id === id);
      if (byId >= 0) return byId;
    }
    return text ? rows.findIndex((row) => isSameItem(keyOf(row), text)) : -1;
  };

  // --- objectives
  for (const item of draft.objectives) {
    const text = item.objective.trim();
    if (!text) continue;
    const index = findIndex(objectives, item.id, text, (row) => row.objective);
    if (index >= 0) {
      const existing = objectives[index]!;
      const status: ObjectiveStatus = item.status;
      const updated: DailyObjective = {
        ...existing,
        objective: item.id && existing.id === item.id ? pick(item.objective, existing.objective) : existing.objective,
        status,
        resultsFigures: pick(item.resultsFigures, existing.resultsFigures),
        reasonIfNotCompleted: status === "Done" ? "" : pick(item.reasonIfNotCompleted, existing.reasonIfNotCompleted ?? ""),
      };
      if (!sameRow(updated, existing)) {
        objectives = objectives.map((row, i) => (i === index ? updated : row));
        counts.objective.updated += 1;
        track("objective", existing.id, { before: changes.get(`objective:${existing.id}`)?.before ?? existing, after: updated });
      }
    } else {
      const row: DailyObjective = { id: newId("obj"), objective: text, status: item.status, resultsFigures: item.resultsFigures.trim(), reasonIfNotCompleted: item.status === "Done" ? "" : item.reasonIfNotCompleted.trim() };
      objectives = [...objectives, row];
      counts.objective.added += 1;
      track("objective", row.id, { after: row });
    }
  }
  const objectiveIds = new Set(objectives.map((row) => row.id));
  const validObjectiveId = (id: string | undefined) => (id && objectiveIds.has(id) ? id : undefined);

  // --- activities
  for (const item of draft.activities) {
    const text = item.task.trim();
    if (!text) continue;
    const index = findIndex(activities, item.id, text, (row) => row.activityTask);
    const time = normalizeActivityTime(item.time);
    const objectiveId = validObjectiveId(item.objectiveId);
    if (index >= 0) {
      const existing = activities[index]!;
      const linked = existing.objectiveId && objectiveIds.has(existing.objectiveId) ? existing.objectiveId : objectiveId;
      const updated: DailyActivity = {
        ...existing,
        activityTask: item.id && existing.id === item.id ? pick(item.task, existing.activityTask) : existing.activityTask,
        placePersonPlatform: pick(item.placePersonPlatform, existing.placePersonPlatform),
        quantityFigures: pick(item.quantityFigures, existing.quantityFigures),
        outcome: pick(item.outcome, existing.outcome),
        time: time || existing.time,
        ...(linked ? { objectiveId: linked } : {}),
      };
      if (!sameRow(updated, existing)) {
        activities = activities.map((row, i) => (i === index ? updated : row));
        counts.activity.updated += 1;
        track("activity", existing.id, { before: changes.get(`activity:${existing.id}`)?.before ?? existing, after: updated });
      }
    } else {
      const row: DailyActivity = { id: newId("act"), time, activityTask: text, placePersonPlatform: item.placePersonPlatform.trim(), quantityFigures: item.quantityFigures.trim(), outcome: item.outcome.trim(), ...(objectiveId ? { objectiveId } : {}) };
      activities = [...activities, row];
      counts.activity.added += 1;
      track("activity", row.id, { after: row });
    }
  }

  // --- challenges
  for (const item of draft.challenges) {
    const text = item.problem.trim();
    if (!text) continue;
    const index = findIndex(challenges, item.id, text, (row) => row.problemEncountered);
    if (index >= 0) {
      const existing = challenges[index]!;
      const matchedById = Boolean(item.id && existing.id === item.id);
      const updated: DailyChallenge = {
        ...existing,
        problemEncountered: matchedById ? pick(item.problem, existing.problemEncountered) : existing.problemEncountered,
        whenHappened: pick(item.whenHappened, existing.whenHappened),
        actionTaken: pick(item.actionTaken, existing.actionTaken),
        resolved: matchedById ? item.resolved : existing.resolved || item.resolved,
      };
      if (!sameRow(updated, existing)) {
        challenges = challenges.map((row, i) => (i === index ? updated : row));
        counts.challenge.updated += 1;
        track("challenge", existing.id, { before: changes.get(`challenge:${existing.id}`)?.before ?? existing, after: updated });
      }
    } else {
      const row: DailyChallenge = { id: newId("ch"), problemEncountered: text, whenHappened: item.whenHappened.trim(), actionTaken: item.actionTaken.trim(), resolved: item.resolved };
      challenges = [...challenges, row];
      counts.challenge.added += 1;
      track("challenge", row.id, { after: row });
    }
  }

  // --- plans for the next working day
  for (const item of draft.tomorrowPlans) {
    const text = item.task.trim();
    if (!text) continue;
    const index = findIndex(tomorrowPlans, item.id, text, (row) => row.plannedTask);
    if (index >= 0) {
      const existing = tomorrowPlans[index]!;
      const updated: TomorrowPlan = {
        ...existing,
        plannedTask: item.id && existing.id === item.id ? pick(item.task, existing.plannedTask) : existing.plannedTask,
        resourcesNeeded: pick(item.resourcesNeeded, existing.resourcesNeeded),
        approvalsRequired: pick(item.approvalsRequired, existing.approvalsRequired),
      };
      if (!sameRow(updated, existing)) {
        tomorrowPlans = tomorrowPlans.map((row, i) => (i === index ? updated : row));
        counts.plan.updated += 1;
        track("plan", existing.id, { before: changes.get(`plan:${existing.id}`)?.before ?? existing, after: updated });
      }
    } else {
      const row: TomorrowPlan = { id: newId("pl"), plannedTask: text, resourcesNeeded: item.resourcesNeeded.trim(), approvalsRequired: item.approvalsRequired.trim() };
      tomorrowPlans = [...tomorrowPlans, row];
      counts.plan.added += 1;
      track("plan", row.id, { after: row });
    }
  }

  // Drop the untouched blank starter rows once real rows exist, then make sure a row remains.
  if (counts.objective.added) objectives = objectives.filter((row) => !isBlankObjective(row));
  if (counts.activity.added) activities = activities.filter((row) => !isBlankActivity(row));
  if (counts.plan.added) tomorrowPlans = tomorrowPlans.filter((row) => !isBlankPlan(row));
  const next = ensureStarterRows({ objectives, activities, challenges, tomorrowPlans }, newId);

  const lines: string[] = [];
  for (const kind of ["objective", "activity", "challenge", "plan"] as RowKind[]) {
    const bucket = counts[kind];
    const noun = (n: number) => `${n} ${NOUNS[kind][n === 1 ? 0 : 1]}`;
    if (bucket.added) lines.push(`Added ${noun(bucket.added)}`);
    if (bucket.updated) lines.push(`Updated ${noun(bucket.updated)}`);
    if (bucket.removed) lines.push(`Removed ${noun(bucket.removed)}`);
  }

  const needsAttention = reportNeedsAttention(next);

  // Final row state for the undo record (a row can be touched more than once in one draft).
  const finalRow = (kind: RowKind, id: string) => (next[LIST_KEY[kind]] as { id: string }[]).find((row) => row.id === id) as Row | undefined;
  const record: MergeRecord = { added: [], updated: [], removed: [] };
  const touched: string[] = [];
  for (const change of changes.values()) {
    const key = `${change.kind}:${change.id}`;
    if (removedKeys.has(key)) { record.removed.push(change); continue; }
    const after = finalRow(change.kind, change.id);
    if (!after) continue;
    touched.push(change.id);
    if (change.before) record.updated.push({ ...change, after });
    else record.added.push({ ...change, after });
  }

  const sum = (field: keyof Counts) => Object.values(counts).reduce((s, b) => s + b[field], 0);
  const total = sum("added") + sum("updated") + sum("removed");
  return { next, summary: { added: sum("added"), updated: sum("updated"), removed: sum("removed"), lines: total ? lines : [], needsAttention, byKind: counts, touched, record } };
}

/** What the existing validation will still require before the report can be submitted. */
export function reportNeedsAttention(state: ReportState): string[] {
  const needsAttention: string[] = [];
  const filledObjectives = state.objectives.filter((row) => row.objective.trim());
  if (!filledObjectives.length) needsAttention.push("Add at least one objective (it is required to submit).");
  for (const row of filledObjectives) if (row.status !== "Done" && !(row.reasonIfNotCompleted ?? "").trim()) needsAttention.push(`Add the reason “${row.objective.trim().slice(0, 60)}” was not completed (required).`);
  return needsAttention;
}

// ---------------------------------------------------------------------------
// Undo (field level, so the employee's own later edits survive)
// ---------------------------------------------------------------------------

export interface UndoResult {
  next: ReportState;
  /** Rows Kenzy added that were kept because the employee edited them afterwards. */
  keptEdited: number;
  restored: number;
}

/**
 * Reverses ONE AI change.
 * - Rows Kenzy added are removed, unless the employee has edited them since.
 * - Rows Kenzy updated get back only the fields Kenzy changed, and only where the field
 *   still holds Kenzy's value. Anything typed afterwards is left alone.
 * - Rows Kenzy removed are put back.
 */
export function undoMerge(current: ReportState, record: MergeRecord, newId: (prefix: string) => string = makeRowId): UndoResult {
  const lists: Record<ListKey, Record<string, unknown>[]> = {
    objectives: current.objectives.map((r) => ({ ...r })),
    activities: current.activities.map((r) => ({ ...r })),
    challenges: current.challenges.map((r) => ({ ...r })),
    tomorrowPlans: current.tomorrowPlans.map((r) => ({ ...r })),
  };
  let keptEdited = 0;
  let restored = 0;

  for (const change of record.added) {
    const list = lists[LIST_KEY[change.kind]];
    const index = list.findIndex((row) => row["id"] === change.id);
    if (index < 0) continue;
    if (sameRow(list[index], change.after)) { list.splice(index, 1); restored += 1; } else keptEdited += 1;
  }
  for (const change of record.updated) {
    const list = lists[LIST_KEY[change.kind]];
    const row = list.find((r) => r["id"] === change.id);
    const before = change.before as unknown as Record<string, unknown> | undefined;
    const after = change.after as unknown as Record<string, unknown> | undefined;
    if (!row || !before || !after) continue;
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (sameRow(before[key], after[key])) continue;
      if (!sameRow(row[key], after[key])) continue;
      if (before[key] === undefined) delete row[key]; else row[key] = before[key];
      restored += 1;
    }
  }
  for (const change of [...record.removed].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
    const list = lists[LIST_KEY[change.kind]];
    if (!change.before || list.some((r) => r["id"] === change.id)) continue;
    list.splice(Math.min(change.index ?? list.length, list.length), 0, { ...(change.before as unknown as Record<string, unknown>) });
    restored += 1;
  }

  // An objective that no longer exists cannot stay linked.
  const objectiveIds = new Set(lists.objectives.map((r) => r["id"]));
  for (const activity of lists.activities) if (activity["objectiveId"] && !objectiveIds.has(activity["objectiveId"])) delete activity["objectiveId"];

  const next = ensureStarterRows({
    objectives: lists.objectives as unknown as DailyObjective[],
    activities: lists.activities as unknown as DailyActivity[],
    challenges: lists.challenges as unknown as DailyChallenge[],
    tomorrowPlans: lists.tomorrowPlans as unknown as TomorrowPlan[],
  }, newId);
  return { next, keptEdited, restored };
}

// ---------------------------------------------------------------------------
// Plain-English wording of what changed
// ---------------------------------------------------------------------------

const SMALL_NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const numberWord = (n: number) => SMALL_NUMBERS[n] ?? String(n);

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** e.g. "I've added four activities, one challenge and two plans for tomorrow. Please review your report." */
export function describeMerge(summary: MergeSummary): string {
  const phrase = (field: keyof Counts) => joinList((Object.keys(NOUNS) as RowKind[]).filter((kind) => summary.byKind[kind][field] > 0).map((kind) => `${numberWord(summary.byKind[kind][field])} ${NOUNS[kind][summary.byKind[kind][field] === 1 ? 0 : 1]}`));
  const sentences = [
    ["added", phrase("added")],
    ["updated", phrase("updated")],
    ["removed", phrase("removed")],
  ].filter(([, text]) => text);
  if (!sentences.length) return "";
  return `I've ${joinList(sentences.map(([verb, text]) => `${verb} ${text}`))}. Please review your report.`;
}

/** Compact snapshot of the report, sent to the AI so it can update rows by id. */
export function snapshotForAi(state: ReportState) {
  const t = (v: string | undefined, n = 300) => (v ?? "").trim().slice(0, n);
  return {
    objectives: state.objectives.filter((o) => !isBlankObjective(o)).slice(0, 20).map((o) => ({ id: o.id, objective: t(o.objective), status: o.status, resultsFigures: t(o.resultsFigures), reasonIfNotCompleted: t(o.reasonIfNotCompleted) })),
    activities: state.activities.filter((a) => !isBlankActivity(a)).slice(0, 30).map((a) => ({ id: a.id, task: t(a.activityTask), placePersonPlatform: t(a.placePersonPlatform), quantityFigures: t(a.quantityFigures), outcome: t(a.outcome), time: t(a.time, 30), objectiveId: a.objectiveId ?? "" })),
    challenges: state.challenges.filter((c) => c.problemEncountered.trim()).slice(0, 20).map((c) => ({ id: c.id, problem: t(c.problemEncountered), whenHappened: t(c.whenHappened), actionTaken: t(c.actionTaken), resolved: c.resolved })),
    tomorrowPlans: state.tomorrowPlans.filter((p) => !isBlankPlan(p)).slice(0, 20).map((p) => ({ id: p.id, task: t(p.plannedTask), resourcesNeeded: t(p.resourcesNeeded), approvalsRequired: t(p.approvalsRequired) })),
  };
}

export type ReportSnapshot = ReturnType<typeof snapshotForAi>;
