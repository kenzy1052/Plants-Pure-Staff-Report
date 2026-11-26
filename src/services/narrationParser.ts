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
 * Pure helpers for the chat-first daily report: the conservative offline parser
 * and the merge that applies a chat message's proposed changes to the existing
 * report fields. No framework or network imports, so everything here is unit
 * testable and runs identically in the browser and on the server.
 */

export const MAX_NARRATION_LENGTH = 8_000;

const pendingPattern = /\b(couldn['’]?t|could not|didn['’]?t|did not|unable|pending|still need|waiting for|unfinished|not finish|not completed|will finish|plan to|planning to|tomorrow|next working day|next day)\b/i;
const challengePattern = /\b(because|blocked|blocker|delay|delayed|issue|problem|challenge|shortage|missing|waiting for|failed|error|couldn['’]?t|unable)\b/i;
const completedVerbPattern = /\b(designed|edited|posted|published|created|completed|finished|reviewed|prepared|inspected|packed|processed|sent|updated|delivered|attended|called|met|organised|organized|trained|tested|submitted|worked on)\b/i;

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

function localActivity(value: string): NarrationDraftActivity {
  const task = clean(value).replace(/^(today|this morning|this afternoon|i)\s+/i, "");
  const { time, rest } = extractExplicitTime(task);
  return { task: sentenceCase(rest), outcome: "", placePersonPlatform: "", quantityFigures: "", time };
}

/**
 * Conservative offline parser. It only copies sentences or clauses explicitly
 * present in the employee's narration; it does not infer missing details, never
 * supplies a default time, and never treats a pending item as completed.
 */
export function parseNarrationLocally(narration: string): StructuredNarrationDraft {
  const cleanedNarration = clean(narration);
  const sentences = cleanedNarration.split(/(?<=[.!?])\s+/).map(clean).filter(Boolean);
  const activities: NarrationDraftActivity[] = [];
  const pendingTasks: string[] = [];
  const objectives: NarrationDraftObjective[] = [];
  const challenges: NarrationDraftChallenge[] = [];
  const tomorrowPlans: NarrationDraftPlan[] = [];
  const achievements: string[] = [];

  for (const sentence of sentences) {
    const clauses = sentence.split(/\s+(?:but|although|while)\s+/i).map(clean).filter(Boolean);
    for (const clause of clauses) {
      const lower = clause.toLocaleLowerCase();
      const isTomorrow = /\b(tomorrow|next working day|next day|plan to|planning to|will)\b/i.test(clause);
      const isPending = pendingPattern.test(clause);
      const isChallenge = challengePattern.test(clause);
      const blockerReason = clause.match(/\b(?:because|due to|as)\s+(.+)$/i)?.[1];

      if (isTomorrow) {
        const task = clean(clause.replace(/^(tomorrow|next working day|next day)[,:]?\s*/i, "").replace(/^(i\s+)?(will|plan to|am planning to)\s+/i, ""));
        if (task) tomorrowPlans.push({ task, resourcesNeeded: "", approvalsRequired: "" });
        continue;
      }
      if (isChallenge || blockerReason) {
        const problem = blockerReason ? clean(blockerReason) : clean(clause.replace(/^(today\s+)?i\s+/i, ""));
        if (problem) challenges.push({ problem, whenHappened: "", actionTaken: "", resolved: false });
      }
      if (isPending) {
        const task = clean(clause.replace(/^(today\s+)?i\s+/i, "").replace(/\b(because|due to|as)\b.*$/i, ""));
        if (task) {
          pendingTasks.push(task);
          objectives.push({ objective: sentenceCase(task), status: "Not Done", resultsFigures: "", reasonIfNotCompleted: blockerReason ? sentenceCase(blockerReason) : "" });
        }
        continue;
      }
      if (completedVerbPattern.test(clause) || /^today\s+i\b/i.test(clause) || /^i\s+/i.test(clause)) {
        const task = clean(clause.replace(/^(today\s+)?i\s+/i, ""));
        if (task) {
          activities.push(localActivity(task));
          if (/\b(successfully|achievement|achieved|milestone|exceeded|completed)\b/i.test(lower)) achievements.push(task);
        }
      }
    }
  }

  const dedupe = <T,>(items: T[], pick: (item: T) => string) => items.filter((item, index, all) => all.findIndex((other) => itemKey(pick(other)) === itemKey(pick(item))) === index);
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

export interface MergeSummary {
  added: number;
  updated: number;
  removed: number;
  lines: string[];
  /** Things the employee still has to complete before the existing validation will accept the report. */
  needsAttention: string[];
}

let idCounter = 0;
export function makeRowId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_ai_${Date.now()}_${idCounter}_${Math.random().toString(36).slice(2, 6)}`;
}

const isBlankObjective = (o: DailyObjective) => !o.objective.trim() && !o.resultsFigures.trim() && !(o.reasonIfNotCompleted ?? "").trim();
const isBlankActivity = (a: DailyActivity) => !a.activityTask.trim() && !a.placePersonPlatform.trim() && !a.quantityFigures.trim() && !a.outcome.trim();
const isBlankPlan = (p: TomorrowPlan) => !p.plannedTask.trim() && !p.resourcesNeeded.trim() && !p.approvalsRequired.trim();

/** Overwrite only with a non-empty value, so the AI can never blank out what the employee typed. */
const pick = (next: string, previous: string) => (next.trim() ? next.trim() : previous);

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function mergeNarrationDraft(current: ReportState, draft: StructuredNarrationDraft, newId: (prefix: string) => string = makeRowId): { next: ReportState; summary: MergeSummary } {
  const counts = { objective: { a: 0, u: 0, r: 0 }, activity: { a: 0, u: 0, r: 0 }, challenge: { a: 0, u: 0, r: 0 }, plan: { a: 0, u: 0, r: 0 } };
  const removeIds = new Set(draft.removeIds);

  const removeFrom = <T extends { id: string }>(rows: T[], bucket: { r: number }) => rows.filter((row) => {
    if (!removeIds.has(row.id)) return true;
    bucket.r += 1;
    return false;
  });

  let objectives = removeFrom(current.objectives, counts.objective);
  let activities = removeFrom(current.activities, counts.activity);
  let challenges = removeFrom(current.challenges, counts.challenge);
  let tomorrowPlans = removeFrom(current.tomorrowPlans, counts.plan);

  const findIndex = <T extends { id: string }>(rows: T[], id: string | undefined, key: string, keyOf: (row: T) => string): number => {
    if (id) {
      const byId = rows.findIndex((row) => row.id === id);
      if (byId >= 0) return byId;
    }
    return key ? rows.findIndex((row) => itemKey(keyOf(row)) === key) : -1;
  };

  // --- objectives
  for (const item of draft.objectives) {
    const text = item.objective.trim();
    if (!text) continue;
    const index = findIndex(objectives, item.id, itemKey(text), (row) => row.objective);
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
      if (JSON.stringify(updated) !== JSON.stringify(existing)) {
        objectives = objectives.map((row, i) => (i === index ? updated : row));
        counts.objective.u += 1;
      }
    } else {
      objectives = [...objectives, { id: newId("obj"), objective: text, status: item.status, resultsFigures: item.resultsFigures.trim(), reasonIfNotCompleted: item.status === "Done" ? "" : item.reasonIfNotCompleted.trim() }];
      counts.objective.a += 1;
    }
  }

  // --- activities
  for (const item of draft.activities) {
    const text = item.task.trim();
    if (!text) continue;
    const index = findIndex(activities, item.id, itemKey(text), (row) => row.activityTask);
    const time = normalizeActivityTime(item.time);
    if (index >= 0) {
      const existing = activities[index]!;
      const updated: DailyActivity = {
        ...existing,
        activityTask: item.id && existing.id === item.id ? pick(item.task, existing.activityTask) : existing.activityTask,
        placePersonPlatform: pick(item.placePersonPlatform, existing.placePersonPlatform),
        quantityFigures: pick(item.quantityFigures, existing.quantityFigures),
        outcome: pick(item.outcome, existing.outcome),
        time: time || existing.time,
      };
      if (JSON.stringify(updated) !== JSON.stringify(existing)) {
        activities = activities.map((row, i) => (i === index ? updated : row));
        counts.activity.u += 1;
      }
    } else {
      activities = [...activities, { id: newId("act"), time, activityTask: text, placePersonPlatform: item.placePersonPlatform.trim(), quantityFigures: item.quantityFigures.trim(), outcome: item.outcome.trim() }];
      counts.activity.a += 1;
    }
  }

  // --- challenges
  for (const item of draft.challenges) {
    const text = item.problem.trim();
    if (!text) continue;
    const index = findIndex(challenges, item.id, itemKey(text), (row) => row.problemEncountered);
    if (index >= 0) {
      const existing = challenges[index]!;
      const matchedById = Boolean(item.id && existing.id === item.id);
      const updated: DailyChallenge = {
        ...existing,
        problemEncountered: item.id && existing.id === item.id ? pick(item.problem, existing.problemEncountered) : existing.problemEncountered,
        whenHappened: pick(item.whenHappened, existing.whenHappened),
        actionTaken: pick(item.actionTaken, existing.actionTaken),
        resolved: matchedById ? item.resolved : existing.resolved || item.resolved,
      };
      if (JSON.stringify(updated) !== JSON.stringify(existing)) {
        challenges = challenges.map((row, i) => (i === index ? updated : row));
        counts.challenge.u += 1;
      }
    } else {
      challenges = [...challenges, { id: newId("ch"), problemEncountered: text, whenHappened: item.whenHappened.trim(), actionTaken: item.actionTaken.trim(), resolved: item.resolved }];
      counts.challenge.a += 1;
    }
  }

  // --- plans for the next working day
  for (const item of draft.tomorrowPlans) {
    const text = item.task.trim();
    if (!text) continue;
    const index = findIndex(tomorrowPlans, item.id, itemKey(text), (row) => row.plannedTask);
    if (index >= 0) {
      const existing = tomorrowPlans[index]!;
      const updated: TomorrowPlan = {
        ...existing,
        plannedTask: item.id && existing.id === item.id ? pick(item.task, existing.plannedTask) : existing.plannedTask,
        resourcesNeeded: pick(item.resourcesNeeded, existing.resourcesNeeded),
        approvalsRequired: pick(item.approvalsRequired, existing.approvalsRequired),
      };
      if (JSON.stringify(updated) !== JSON.stringify(existing)) {
        tomorrowPlans = tomorrowPlans.map((row, i) => (i === index ? updated : row));
        counts.plan.u += 1;
      }
    } else {
      tomorrowPlans = [...tomorrowPlans, { id: newId("pl"), plannedTask: text, resourcesNeeded: item.resourcesNeeded.trim(), approvalsRequired: item.approvalsRequired.trim() }];
      counts.plan.a += 1;
    }
  }

  // Drop the untouched blank starter rows once real rows exist, then make sure a row remains.
  if (counts.objective.a) objectives = objectives.filter((row) => !isBlankObjective(row));
  if (counts.activity.a) activities = activities.filter((row) => !isBlankActivity(row));
  if (counts.plan.a) tomorrowPlans = tomorrowPlans.filter((row) => !isBlankPlan(row));
  if (!objectives.length) objectives = [{ id: newId("obj"), objective: "", status: "Done", resultsFigures: "", reasonIfNotCompleted: "" }];
  if (!activities.length) activities = [{ id: newId("act"), time: "", activityTask: "", placePersonPlatform: "", quantityFigures: "", outcome: "" }];
  if (!tomorrowPlans.length) tomorrowPlans = [{ id: newId("pl"), plannedTask: "", resourcesNeeded: "", approvalsRequired: "" }];

  const lines: string[] = [];
  const describe = (label: string, bucket: { a: number; u: number; r: number }) => {
    if (bucket.a) lines.push(`Added ${plural(bucket.a, label)}`);
    if (bucket.u) lines.push(`Updated ${plural(bucket.u, label)}`);
    if (bucket.r) lines.push(`Removed ${plural(bucket.r, label)}`);
  };
  describe("objective", counts.objective);
  describe("activity", counts.activity);
  describe("challenge", counts.challenge);
  describe("next-day plan", counts.plan);
  const needsAttention: string[] = [];
  const filledObjectives = objectives.filter((row) => row.objective.trim());
  if (!filledObjectives.length) needsAttention.push("Add at least one objective (it is required to submit).");
  for (const row of filledObjectives) if (row.status !== "Done" && !(row.reasonIfNotCompleted ?? "").trim()) needsAttention.push(`Add the reason “${row.objective.trim().slice(0, 60)}” was not completed (required).`);

  const total = Object.values(counts).reduce((sum, b) => sum + b.a + b.u + b.r, 0);
  return {
    next: { objectives, activities, challenges, tomorrowPlans },
    summary: { added: Object.values(counts).reduce((s, b) => s + b.a, 0), updated: Object.values(counts).reduce((s, b) => s + b.u, 0), removed: Object.values(counts).reduce((s, b) => s + b.r, 0), lines: total ? lines : [], needsAttention },
  };
}

/** Compact snapshot of the report, sent to the AI so it can update rows by id. */
export function snapshotForAi(state: ReportState) {
  const t = (v: string | undefined, n = 300) => (v ?? "").trim().slice(0, n);
  return {
    objectives: state.objectives.filter((o) => !isBlankObjective(o)).slice(0, 20).map((o) => ({ id: o.id, objective: t(o.objective), status: o.status, resultsFigures: t(o.resultsFigures), reasonIfNotCompleted: t(o.reasonIfNotCompleted) })),
    activities: state.activities.filter((a) => !isBlankActivity(a)).slice(0, 30).map((a) => ({ id: a.id, task: t(a.activityTask), placePersonPlatform: t(a.placePersonPlatform), quantityFigures: t(a.quantityFigures), outcome: t(a.outcome), time: t(a.time, 30) })),
    challenges: state.challenges.filter((c) => c.problemEncountered.trim()).slice(0, 20).map((c) => ({ id: c.id, problem: t(c.problemEncountered), whenHappened: t(c.whenHappened), actionTaken: t(c.actionTaken), resolved: c.resolved })),
    tomorrowPlans: state.tomorrowPlans.filter((p) => !isBlankPlan(p)).slice(0, 20).map((p) => ({ id: p.id, task: t(p.plannedTask), resourcesNeeded: t(p.resourcesNeeded), approvalsRequired: t(p.approvalsRequired) })),
  };
}

export type ReportSnapshot = ReturnType<typeof snapshotForAi>;
