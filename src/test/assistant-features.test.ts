import { describe, expect, it } from 'vitest';
import type { DailyReport } from '@/types';
import { dismissSuggestion, getActivitySuggestions, suggestionStorageKey } from '@/services/activitySuggestions';
import { extractExplicitTime, mergeNarrationDraft, normalizeActivityTime, parseNarrationLocally, snapshotForAi, type ReportState } from '@/services/narrationParser';
import type { StructuredNarrationDraft } from '@/types';

const report = (employeeId: string, date: string, activityTask: string, status: DailyReport['status'] = 'submitted', id = `${employeeId}-${date}-${activityTask}`): DailyReport => ({
  id,
  reportCode: 'PP-TEST', employeeId, employeeName: 'Staff', employeeCode: 'ST-1', roleTitle: 'Employee',
  department: 'Operations', date, dayOfWeek: 'Monday', reportingPeriod: 'Week 1', submittedToId: 'manager', submittedToName: 'Manager',
  startTime: '08:00', endTime: '17:00', status, objectives: [],
  activities: [{ id: 'activity', time: '', activityTask, placePersonPlatform: '', quantityFigures: '', outcome: '' }],
  challenges: [], tomorrowPlans: [], attachments: [], reviews: [], createdAt: date, updatedAt: date,
});

describe('activity suggestions', () => {
  it('only uses the authenticated employee history and ranks repeated activities', () => {
    const suggestions = getActivitySuggestions([
      report('employee-a', '2026-11-20', 'Inspect plants'),
      report('employee-a', '2026-11-21', ' inspect   plants '),
      report('employee-a', '2026-11-22', 'Prepare stock report'),
      report('employee-b', '2026-11-23', 'Approve payroll'),
    ], 'employee-a', new Date('2026-11-24T12:00:00Z'));

    expect(suggestions.map((item) => item.normalized)).toEqual(['inspect plants', 'prepare stock report']);
    expect(suggestions[0]?.frequency).toBe(2);
    expect(suggestions.some((item) => item.value === 'Approve payroll')).toBe(false);
  });

  it('ignores unsubmitted drafts, the report being edited, and dismissed items; counts once per report', () => {
    const twice = report('a', '2026-11-20', 'Edit videos');
    twice.activities.push({ ...twice.activities[0]!, id: 'dup', activityTask: 'edit videos.' });
    const suggestions = getActivitySuggestions([
      twice,
      report('a', '2026-11-21', 'Draft only task', 'draft'),
      report('a', '2026-11-22', 'Editing now', 'submitted', 'current'),
      report('a', '2026-11-19', 'Post on Facebook'),
    ], 'a', { now: new Date('2026-11-24T12:00:00Z'), excludeReportId: 'current', dismissed: ['post on facebook'] });
    expect(suggestions.map((s) => s.normalized)).toEqual(['edit videos']);
    expect(suggestions[0]?.frequency).toBe(1);
  });

  it('ranks by frequency first and recency second', () => {
    const suggestions = getActivitySuggestions([
      report('a', '2026-10-01', 'Old but frequent', 'submitted', 'r1'),
      report('a', '2026-10-02', 'Old but frequent', 'submitted', 'r2'),
      report('a', '2026-11-23', 'Recent once', 'submitted', 'r3'),
    ], 'a', { now: new Date('2026-11-24T12:00:00Z') });
    expect(suggestions[0]?.normalized).toBe('old but frequent');
  });

  it('supports stable per-employee dismissal keys without requiring an AI service', () => {
    expect(suggestionStorageKey('employee-a')).not.toBe(suggestionStorageKey('employee-b'));
    expect(dismissSuggestion('employee-a', 'inspect plants')).toEqual(['inspect plants']);
  });
});

describe('offline narration parser', () => {
  it('copies explicit completed, pending, blocker, achievement, and tomorrow facts only', () => {
    const draft = parseNarrationLocally('I designed the product flyer successfully. The second video is pending because product images are missing. Tomorrow I will edit the second video.');

    expect(draft.activities.map((item) => item.task)).toContain('Designed the product flyer successfully.');
    expect(draft.pendingTasks.join(' ')).toMatch(/The second video is pending/i);
    expect(draft.challenges[0]?.problem).toMatch(/product images are missing/i);
    expect(draft.tomorrowPlans[0]?.task).toMatch(/edit the second video/i);
    expect(draft.achievements.join(' ')).toMatch(/designed.*successfully/i);
  });

  it('does not invent missing details, times, or default activity times', () => {
    const draft = parseNarrationLocally('I reviewed the report.');
    expect(draft.activities[0]).toMatchObject({ task: 'Reviewed the report.', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' });
    expect(draft.challenges).toEqual([]);
    expect(draft.tomorrowPlans).toEqual([]);
    expect(JSON.stringify(draft)).not.toContain('08:00');
  });

  it('records pending work as a Not Done objective, never as a completed activity or a tomorrow plan', () => {
    const draft = parseNarrationLocally("I edited the first video. I couldn't finish the second video because I was waiting for the product images.");
    expect(draft.activities.map((a) => a.task).join(' ')).not.toMatch(/second video/i);
    expect(draft.objectives).toHaveLength(1);
    expect(draft.objectives[0]).toMatchObject({ status: 'Not Done' });
    expect(draft.objectives[0]?.reasonIfNotCompleted).toMatch(/waiting for the product images/i);
    expect(draft.tomorrowPlans).toEqual([]);
  });

  it('only keeps a time the employee literally wrote', () => {
    expect(extractExplicitTime('held the meeting from 9am to 11am')).toMatchObject({ time: '09:00 - 11:00' });
    expect(extractExplicitTime('called the supplier at 2:30pm')).toMatchObject({ time: '14:30 - ' });
    expect(extractExplicitTime('packed 12 boxes').time).toBe('');
    expect(extractExplicitTime('met 3 suppliers at the depot').time).toBe('');
    expect(parseNarrationLocally('I held the team meeting from 9am to 11am.').activities[0]?.time).toBe('09:00 - 11:00');
  });

  it('normalizes or discards activity times', () => {
    expect(normalizeActivityTime('08:00 - 09:00')).toBe('08:00 - 09:00');
    expect(normalizeActivityTime('9:05')).toBe('09:05 - ');
    expect(normalizeActivityTime('morning')).toBe('');
    expect(normalizeActivityTime('25:00 - 26:00')).toBe('');
    expect(normalizeActivityTime(undefined)).toBe('');
  });
});

const blankState = (): ReportState => ({
  objectives: [{ id: 'o0', objective: '', status: 'Done', resultsFigures: '', reasonIfNotCompleted: '' }],
  activities: [{ id: 'a0', time: '', activityTask: '', placePersonPlatform: '', quantityFigures: '', outcome: '' }],
  challenges: [],
  tomorrowPlans: [{ id: 'p0', plannedTask: '', resourcesNeeded: '', approvalsRequired: '' }],
});
const draft = (over: Partial<StructuredNarrationDraft>): StructuredNarrationDraft => ({ objectives: [], activities: [], pendingTasks: [], challenges: [], tomorrowPlans: [], achievements: [], removeIds: [], clarification: '', cleanedNarration: '', ...over });
let n = 0;
const ids = (prefix: string) => `${prefix}_${(n += 1)}`;

describe('applying chat drafts to the existing report fields', () => {
  it('fills the report from a first message and replaces the blank starter rows', () => {
    const { next, summary } = mergeNarrationDraft(blankState(), draft({
      activities: [{ task: 'Designed a promotional flyer', outcome: '', placePersonPlatform: 'Facebook', quantityFigures: '', time: '' }, { task: 'Edited the product video', outcome: '', placePersonPlatform: '', quantityFigures: '1 video', time: '' }],
      objectives: [{ objective: 'Finish the second video', status: 'Not Done', resultsFigures: '', reasonIfNotCompleted: 'Waiting for product images' }],
      challenges: [{ problem: 'Waiting for product images', whenHappened: '', actionTaken: '', resolved: false }],
    }), ids);
    expect(next.activities.map((a) => a.activityTask)).toEqual(['Designed a promotional flyer', 'Edited the product video']);
    expect(next.activities.every((a) => a.time === '')).toBe(true);
    expect(next.objectives).toHaveLength(1);
    expect(next.objectives[0]).toMatchObject({ status: 'Not Done', reasonIfNotCompleted: 'Waiting for product images' });
    expect(summary.added).toBe(4);
    expect(summary.needsAttention).toEqual([]);
  });

  it('adds follow-up information without losing earlier rows', () => {
    const first = mergeNarrationDraft(blankState(), draft({ activities: [{ task: 'Designed a flyer', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' }] }), ids).next;
    const second = mergeNarrationDraft(first, draft({ activities: [{ task: 'Posted the flyer on Facebook', outcome: '', placePersonPlatform: 'Facebook', quantityFigures: '', time: '' }] }), ids).next;
    expect(second.activities.map((a) => a.activityTask)).toEqual(['Designed a flyer', 'Posted the flyer on Facebook']);
  });

  it('applies a correction to the matching row by id ("three videos, not one")', () => {
    const state = mergeNarrationDraft(blankState(), draft({ activities: [{ task: 'Edited videos', outcome: '', placePersonPlatform: '', quantityFigures: '1 video', time: '' }] }), ids).next;
    const id = state.activities[0]!.id;
    const { next, summary } = mergeNarrationDraft(state, draft({ activities: [{ id, task: 'Edited videos', outcome: '', placePersonPlatform: '', quantityFigures: '3 videos', time: '' }] }), ids);
    expect(next.activities).toHaveLength(1);
    expect(next.activities[0]?.quantityFigures).toBe('3 videos');
    expect(summary).toMatchObject({ added: 0, updated: 1, removed: 0 });
  });

  it('never blanks out what the employee already typed and never duplicates a repeated item', () => {
    const state = blankState();
    state.activities = [{ id: 'a1', time: '10:00 - 11:00', activityTask: 'Packed orders', placePersonPlatform: 'Warehouse', quantityFigures: '40 boxes', outcome: 'Done' }];
    const { next, summary } = mergeNarrationDraft(state, draft({ activities: [{ id: 'a1', task: 'Packed orders', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' }, { task: 'packed orders.', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' }] }), ids);
    expect(next.activities).toEqual(state.activities);
    expect(summary.added + summary.updated + summary.removed).toBe(0);
    expect(summary.lines).toEqual([]);
  });

  it('removes a row only when its id is explicitly listed', () => {
    const state = blankState();
    state.activities = [{ id: 'a1', time: '', activityTask: 'Packed orders', placePersonPlatform: '', quantityFigures: '', outcome: '' }, { id: 'a2', time: '', activityTask: 'Cleaned the lab', placePersonPlatform: '', quantityFigures: '', outcome: '' }];
    const { next, summary } = mergeNarrationDraft(state, draft({ removeIds: ['a2'] }), ids);
    expect(next.activities.map((a) => a.id)).toEqual(['a1']);
    expect(summary.removed).toBe(1);
  });

  it('flags what the existing validation still needs (objective, reason when not done)', () => {
    const empty = mergeNarrationDraft(blankState(), draft({ activities: [{ task: 'Edited a video', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' }] }), ids).summary;
    expect(empty.needsAttention.join(' ')).toMatch(/at least one objective/i);
    const noReason = mergeNarrationDraft(blankState(), draft({ objectives: [{ objective: 'Finish the second video', status: 'Not Done', resultsFigures: '', reasonIfNotCompleted: '' }] }), ids).summary;
    expect(noReason.needsAttention.join(' ')).toMatch(/reason/i);
  });

  it('sends the AI only filled rows, with ids, so it can update them', () => {
    const state = blankState();
    state.activities = [{ id: 'a1', time: '', activityTask: 'Packed orders', placePersonPlatform: '', quantityFigures: '', outcome: '' }];
    const snap = snapshotForAi(state);
    expect(snap.activities).toEqual([{ id: 'a1', task: 'Packed orders', placePersonPlatform: '', quantityFigures: '', outcome: '', time: '' }]);
    expect(snap.objectives).toEqual([]);
  });
});
