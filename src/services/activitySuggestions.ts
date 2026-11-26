import type { DailyReport } from "@/types";

export interface ActivitySuggestion {
  value: string;
  normalized: string;
  frequency: number;
  lastUsedAt: string;
  score: number;
}

export function normalizeActivity(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function daysSince(date: string, now: Date): number {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return 3650;
  return Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 86_400_000));
}

export interface SuggestionOptions {
  now?: Date;
  limit?: number;
  /** Normalized keys the employee dismissed. */
  dismissed?: string[];
  /** A report being edited right now never feeds its own suggestions. */
  excludeReportId?: string | undefined;
}

/**
 * Build suggestions from one employee's own report history (never anyone else's).
 * Only reports that were actually submitted count, so unreviewed drafts cannot
 * teach the system. An activity counts once per report. Frequency is the
 * strongest signal, with a small recency bonus so a recently repeated activity
 * can outrank an old activity with the same count. Pure and offline: no AI call.
 */
export function getActivitySuggestions(
  reports: DailyReport[],
  employeeId: string,
  options: SuggestionOptions | Date = {},
  legacyLimit?: number,
): ActivitySuggestion[] {
  // Backwards compatible with the earlier (reports, employeeId, now, limit) signature.
  const opts: SuggestionOptions = options instanceof Date ? { now: options, ...(legacyLimit !== undefined ? { limit: legacyLimit } : {}) } : options;
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 8;
  const dismissed = new Set(opts.dismissed ?? []);
  const grouped = new Map<string, ActivitySuggestion>();
  for (const report of reports) {
    if (report.employeeId !== employeeId) continue;
    if (report.status === "draft") continue;
    if (opts.excludeReportId && report.id === opts.excludeReportId) continue;
    const countedInThisReport = new Set<string>();
    for (const activity of report.activities ?? []) {
      const value = activity.activityTask.trim();
      const normalized = normalizeActivity(value);
      if (!normalized || dismissed.has(normalized) || countedInThisReport.has(normalized)) continue;
      countedInThisReport.add(normalized);
      const current = grouped.get(normalized);
      const candidate: ActivitySuggestion = current ?? { value, normalized, frequency: 0, lastUsedAt: report.date, score: 0 };
      candidate.frequency += 1;
      if (report.date >= candidate.lastUsedAt) {
        candidate.lastUsedAt = report.date;
        candidate.value = value;
      }
      const recencyBonus = 1 / (1 + daysSince(candidate.lastUsedAt, now) / 14);
      candidate.score = candidate.frequency * 10 + recencyBonus;
      grouped.set(normalized, candidate);
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.score - a.score || b.frequency - a.frequency || b.lastUsedAt.localeCompare(a.lastUsedAt) || a.value.localeCompare(b.value))
    .slice(0, limit);
}

export function suggestionStorageKey(employeeId: string): string {
  return `pp_dismissed_activity_suggestions_${employeeId}`;
}

export function readDismissedSuggestions(employeeId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(suggestionStorageKey(employeeId)) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function dismissSuggestion(employeeId: string, normalized: string): string[] {
  const next = [...new Set([...readDismissedSuggestions(employeeId), normalized])];
  if (typeof window !== "undefined") window.localStorage.setItem(suggestionStorageKey(employeeId), JSON.stringify(next));
  return next;
}
