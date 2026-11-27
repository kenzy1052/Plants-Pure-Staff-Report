import { describe, expect, it } from 'vitest';
import type { DailyReport } from '@/types';
import { dismissSuggestion, getActivitySuggestions, suggestionStorageKey } from '@/services/activitySuggestions';
import { describeMerge, extractExplicitTime, isSameItem, mergeNarrationDraft, normalizeActivityTime, parseNarrationLocally, snapshotForAi, undoMerge, type ReportState } from '@/services/narrationParser';
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

    expect(draft.activities.map((item) => item.task)).toContain('Designed the product flyer successfully');
    expect(draft.pendingTasks.join(' ')).toMatch(/The second video is pending/i);
    expect(draft.challenges[0]?.problem).toMatch(/product images are missing/i);
    expect(draft.tomorrowPlans[0]?.task).toMatch(/edit the second video/i);
    expect(draft.achievements.join(' ')).toMatch(/designed.*successfully/i);
  });

  it('does not invent missing details, times, or default activity times', () => {
    const draft = parseNarrationLocally('I reviewed the report.');
    expect(draft.activities[0]).toMatchObject({ task: 'Reviewed the report', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' });
    expect(draft.challenges).toEqual([]);
    expect(draft.tomorrowPlans).toEqual([]);
    expect(JSON.stringify(draft)).not.toContain('08:00');
  });

  it('records pending work as a challenge, never as a completed activity, an invented objective or a tomorrow plan', () => {
    const draft = parseNarrationLocally("I edited the first video. I couldn't finish the second video because I was waiting for the product images.");
    expect(draft.activities.map((a) => a.task).join(' ')).not.toMatch(/second video/i);
    expect(draft.objectives).toEqual([]);
    expect(draft.challenges[0]?.problem).toMatch(/could not finish the second video because I was waiting for the product images/i);
    expect(draft.tomorrowPlans).toEqual([]);
  });

  it('only updates an objective that already exists in the report', () => {
    const state: ReportState = { objectives: [{ id: 'o1', objective: 'Finish the second promotional video', status: 'Done', resultsFigures: '', reasonIfNotCompleted: '' }], activities: [], challenges: [], tomorrowPlans: [] };
    const draft = parseNarrationLocally("I couldn't finish the second promotional video because I was waiting for the product images.", state);
    expect(draft.objectives).toHaveLength(1);
    expect(draft.objectives[0]).toMatchObject({ id: 'o1', status: 'Not Done' });
    expect(draft.objectives[0]?.reasonIfNotCompleted).toMatch(/waiting for the product images/i);
  });

  it('splits a long narration into separate activities, challenge and plans', () => {
    const draft = parseNarrationLocally("Today I designed three promotional flyers for the Christmas campaign. I also visited the production department to take photographs of the new spice products. I edited two promotional videos and uploaded them to the company's social media pages. However, I couldn't complete the product catalogue because I was waiting for the final product images. Tomorrow, I intend to complete the catalogue and prepare another promotional video.");
    expect(draft.activities).toHaveLength(4);
    expect(draft.activities[0]).toMatchObject({ task: 'Designed three promotional flyers for the Christmas campaign', quantityFigures: '3 promotional flyers' });
    expect(draft.activities[1]?.placePersonPlatform).toBe('Production department');
    expect(draft.activities[2]).toMatchObject({ task: 'Edited two promotional videos', quantityFigures: '2 promotional videos' });
    expect(draft.activities[3]?.task).toMatch(/^Uploaded/);
    expect(draft.challenges).toHaveLength(1);
    expect(draft.challenges[0]?.problem).toMatch(/final product images/i);
    expect(draft.challenges[0]?.actionTaken).toBe('');
    expect(draft.tomorrowPlans.map((p) => p.task)).toEqual(['Complete the catalogue', 'Prepare another promotional video']);
    expect(draft.objectives).toEqual([]);
  });

  it('uses the form labels read aloud to put each answer in its own field (never everything in Activities)', () => {
    const draft = parseNarrationLocally('Objective assigned. Finish the delivery post. was it finished yes just done results achieved three so one video sorry one video activities performed design the videos using cup cat pc details who on which platform cup cat pc How many? One. Result or outcome? Complete. Time. No need to go there. No challenges were taken. Plans for tomorrow. Finish the Afia garlic post.');
    expect(draft.objectives).toEqual([{ objective: 'Finish the delivery post', status: 'Done', resultsFigures: '1 video', reasonIfNotCompleted: '' }]);
    expect(draft.activities).toEqual([{ task: 'Design the videos using CapCut PC', placePersonPlatform: 'CapCut PC', quantityFigures: '1', outcome: 'Complete', time: '' }]);
    expect(draft.challenges).toEqual([]);
    expect(draft.tomorrowPlans.map((p) => p.task)).toEqual(['Finish the Afia garlic post']);
  });

  it('reads "not finished" with its reason and a challenge with its action when labels are used', () => {
    const draft = parseNarrationLocally('Objective. Post the Christmas flyer. Was it finished? No because the images were late. Activities. Designed the flyer. How many? Two. Challenges. Images came late. What did you do about it? Called the photographer. Plans for tomorrow. Post the flyer.');
    expect(draft.objectives[0]).toMatchObject({ objective: 'Post the Christmas flyer', status: 'Not Done', reasonIfNotCompleted: 'The images were late' });
    expect(draft.challenges[0]).toMatchObject({ problem: 'Images came late', actionTaken: 'Called the photographer' });
    expect(draft.activities[0]).toMatchObject({ task: 'Designed the flyer', quantityFigures: '2' });
  });

  it('does not treat ordinary words such as "time" or "details" as form labels in normal narration', () => {
    const draft = parseNarrationLocally('I spent a lot of time on the details today. I edited two videos.');
    expect(draft.objectives).toEqual([]);
    expect(draft.activities.map((a) => a.task)).toContain('Edited two videos');
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
    expect(snap.activities).toEqual([{ id: 'a1', task: 'Packed orders', placePersonPlatform: '', quantityFigures: '', outcome: '', time: '', objectiveId: '' }]);
    expect(snap.objectives).toEqual([]);
  });
});

describe('duplicate detection, linking and undo', () => {
  it('recognises the same piece of work worded differently, but not a changed quantity', () => {
    expect(isSameItem('Designed 3 promotional flyers', 'designed three promotional flyers for Christmas campaign')).toBe(true);
    expect(isSameItem('Edited one video', 'Edited three videos')).toBe(false);
    expect(isSameItem('Uploaded videos', 'Edited videos')).toBe(false);
  });

  it('updates an existing activity instead of duplicating it when the narration is repeated', () => {
    const first = mergeNarrationDraft(blankState(), draft({ activities: [{ task: 'Designed three promotional flyers', outcome: '', placePersonPlatform: '', quantityFigures: '3 flyers', time: '' }] }), ids).next;
    const again = mergeNarrationDraft(first, draft({ activities: [{ task: 'Designed three promotional flyers for the Christmas campaign', outcome: '', placePersonPlatform: 'Design studio', quantityFigures: '', time: '' }] }), ids);
    expect(again.next.activities).toHaveLength(1);
    expect(again.next.activities[0]).toMatchObject({ activityTask: 'Designed three promotional flyers', quantityFigures: '3 flyers', placePersonPlatform: 'Design studio' });
    expect(again.summary).toMatchObject({ added: 0, updated: 1 });
  });

  it('links an activity only to an objective that exists', () => {
    const state = blankState();
    state.objectives = [{ id: 'o1', objective: 'Prepare Christmas promotional materials', status: 'Done', resultsFigures: '', reasonIfNotCompleted: '' }];
    const { next } = mergeNarrationDraft(state, draft({ activities: [{ task: 'Designed flyers', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '', objectiveId: 'o1' }, { task: 'Edited a video', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '', objectiveId: 'made-up' }] }), ids);
    expect(next.activities.find((a) => a.activityTask === 'Designed flyers')?.objectiveId).toBe('o1');
    expect(next.activities.find((a) => a.activityTask === 'Edited a video')?.objectiveId).toBeUndefined();
  });

  it('describes what changed in plain words', () => {
    const { summary } = mergeNarrationDraft(blankState(), draft({
      activities: [1, 2, 3, 4].map((i) => ({ task: `Activity number ${i} alpha${i}`, outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' })),
      challenges: [{ problem: 'Images were late', whenHappened: '', actionTaken: '', resolved: false }],
      tomorrowPlans: [{ task: 'Finish the catalogue', resourcesNeeded: '', approvalsRequired: '' }, { task: 'Prepare another video', resourcesNeeded: '', approvalsRequired: '' }],
    }), ids);
    expect(describeMerge(summary)).toBe("I've added four activities, one challenge and two plans for tomorrow. Please review your report.");
  });

  it('undoes only what Kenzy changed and keeps the employee\'s later edits', () => {
    const state = blankState();
    state.activities = [{ id: 'a1', time: '', activityTask: 'Packed orders', placePersonPlatform: '', quantityFigures: '', outcome: '' }];
    const { next, summary } = mergeNarrationDraft(state, draft({
      activities: [{ id: 'a1', task: 'Packed orders', outcome: '', placePersonPlatform: 'Warehouse', quantityFigures: '40 boxes', time: '' }, { task: 'Cleaned the lab thoroughly', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' }],
      tomorrowPlans: [{ task: 'Restock the shelves', resourcesNeeded: '', approvalsRequired: '' }],
    }), ids);
    // The employee then edits one field Kenzy set, one field of their own, and adds their own challenge.
    const edited: ReportState = JSON.parse(JSON.stringify(next));
    edited.activities[0]!.quantityFigures = '45 boxes';
    edited.activities[0]!.outcome = 'Checked by supervisor';
    edited.challenges.push({ id: 'mine', problemEncountered: 'Forklift broke down', whenHappened: '', actionTaken: '', resolved: false });
    const { next: undone, keptEdited } = undoMerge(edited, summary.record, ids);
    expect(undone.activities.map((a) => a.activityTask)).toEqual(['Packed orders']);
    expect(undone.activities[0]).toMatchObject({ placePersonPlatform: '', quantityFigures: '45 boxes', outcome: 'Checked by supervisor' });
    expect(undone.challenges.map((c) => c.id)).toEqual(['mine']);
    expect(undone.tomorrowPlans.every((p) => !p.plannedTask)).toBe(true);
    expect(keptEdited).toBe(0);
  });

  it('keeps an AI-added row the employee has edited, and restores removed rows', () => {
    const state = blankState();
    state.activities = [{ id: 'a1', time: '', activityTask: 'Packed orders', placePersonPlatform: '', quantityFigures: '', outcome: '' }, { id: 'a2', time: '', activityTask: 'Cleaned the lab', placePersonPlatform: '', quantityFigures: '', outcome: '' }];
    const { next, summary } = mergeNarrationDraft(state, draft({ removeIds: ['a2'], activities: [{ task: 'Counted the stock', outcome: '', placePersonPlatform: '', quantityFigures: '', time: '' }] }), ids);
    const edited: ReportState = JSON.parse(JSON.stringify(next));
    edited.activities.find((a) => a.activityTask === 'Counted the stock')!.outcome = 'Matched the ledger';
    const { next: undone, keptEdited } = undoMerge(edited, summary.record, ids);
    expect(keptEdited).toBe(1);
    expect(undone.activities.map((a) => a.id)).toContain('a2');
    expect(undone.activities.map((a) => a.activityTask)).toContain('Counted the stock');
  });
});

