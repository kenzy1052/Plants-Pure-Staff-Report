import { reportingWeekNumber } from '@/utils/reportingWeek';
import { startOfISOWeek, format as formatDate } from 'date-fns';
import { toast } from 'sonner';
import { readLocalDraft, writeLocalDraft, clearLocalDraft } from '@/lib/localDraft';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DailyReportChat } from './DailyReportChat';
import { KenzyFloating } from './KenzyMascot';
import { VoiceInput, VoiceTextarea } from './VoiceField';
import { AddButton, Disclosure, Field, RowShell, Segmented, SectionCard, type SectionStatus } from './ReportFormParts';
import { dismissSuggestion, getActivitySuggestions, readDismissedSuggestions } from '@/services/activitySuggestions';
import type { NarrationResult, StructuredNarrationDraft } from '@/services/narrationAssistant';
import { mergeNarrationDraft, undoMerge, type MergeRecord, type MergeSummary, type ReportState, type RowKind } from '@/services/narrationParser';
import { getReportRecipient, type ReportRecipient } from '@/services/reportRecipient';
import { ArrowLeft, AlertCircle, FileCheck, Lock, Save, Send, Sparkles, Undo2, X } from 'lucide-react';
import {
  User,
  DailyReport,
  DailyObjective,
  DailyActivity,
  DailyChallenge,
  TomorrowPlan,
  ObjectiveStatus,
} from '../../types';
import { DailyReportService } from '../../services/storageService';

interface DailyReportFormProps {
  currentUser: User;
  existingReport?: DailyReport | null | undefined;
  initialDate?: string | undefined;
  dailyReports?: DailyReport[];
  onNavigate: (view: string, param?: string) => void;
  onSaved: () => void;
}

/** The five sections of the approved daily report template, in order. */
const SECTION_IDS = ['report-step-0', 'report-step-1', 'report-step-2', 'report-step-3', 'report-step-4'];
const SECTION_NAMES = ['Report information', 'Assigned objectives and results', 'Activities performed', 'Challenges and actions taken', 'Plans for tomorrow'];
const KIND_SECTION: Record<RowKind, number> = { objective: 1, activity: 2, challenge: 3, plan: 4 };

const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
const blankObjective = (): DailyObjective => ({ id: newId('obj'), objective: '', status: 'Done', resultsFigures: '', reasonIfNotCompleted: '' });
const blankActivity = (): DailyActivity => ({ id: newId('act'), time: '', activityTask: '', placePersonPlatform: '', quantityFigures: '', outcome: '' });
const blankChallenge = (): DailyChallenge => ({ id: newId('ch'), problemEncountered: '', whenHappened: '', actionTaken: '', resolved: false });
const blankPlan = (): TomorrowPlan => ({ id: newId('pl'), plannedTask: '', resourcesNeeded: '', approvalsRequired: '' });

interface Issue { key: string; section: number; message: string }

const STATUS_OPTIONS: { value: ObjectiveStatus; label: string }[] = [
  { value: 'Done', label: 'Done' },
  { value: 'Partly Done', label: 'Partly done' },
  { value: 'Not Done', label: 'Not done' },
];

export const DailyReportForm: React.FC<DailyReportFormProps> = ({
  currentUser,
  existingReport,
  initialDate,
  dailyReports = [],
  onNavigate,
  onSaved,
}) => {
  const isEditing = !!existingReport;
  const isReturned = existingReport?.status === 'returned';

  // A. Report information
  const [date, setDate] = useState<string>(existingReport?.date || initialDate || new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState<string>(existingReport?.startTime || '08:00');
  const [endTime, setEndTime] = useState<string>(existingReport?.endTime || '17:00');
  // The recipient is fixed (Madam Ursula) and resolved from the staff directory; employees cannot change it.
  const [recipient, setRecipient] = useState<ReportRecipient | null>(null);
  const [recipientError, setRecipientError] = useState('');
  const submittedToName = recipient?.name ?? '';
  useEffect(() => {
    let active = true;
    getReportRecipient().then((value) => { if (active) { setRecipient(value); setRecipientError(''); } }).catch((error: unknown) => {
      if (active) setRecipientError(error instanceof Error ? error.message : 'The report recipient could not be loaded.');
    });
    return () => { active = false; };
  }, []);

  // B-E. The four repeatable lists of the approved template
  const [objectives, setObjectives] = useState<DailyObjective[]>(existingReport?.objectives?.length ? existingReport.objectives : [blankObjective()]);
  const [activities, setActivities] = useState<DailyActivity[]>(existingReport?.activities?.length ? existingReport.activities : [blankActivity()]);
  const [challenges, setChallenges] = useState<DailyChallenge[]>(existingReport?.challenges || []);
  // One empty plan to start with; more are added one at a time with "+ Add another plan".
  const [tomorrowPlans, setTomorrowPlans] = useState<TomorrowPlan[]>(existingReport?.tomorrowPlans?.length ? existingReport.tomorrowPlans : [blankPlan()]);

  // Kenzy: the form state is the single source of truth, Kenzy only proposes changes to it.
  const [chatOpen, setChatOpen] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);
  const [bannerOpen, setBannerOpen] = useState(false);
  const undoStack = useRef<MergeRecord[]>([]);
  const [flash, setFlash] = useState<ReadonlySet<string>>(new Set());
  const flashTimer = useRef<number | undefined>(undefined);
  const [openSignals, setOpenSignals] = useState<number[]>([0, 0, 0, 0, 0]);
  const fabRef = useRef<HTMLButtonElement>(null);
  const reportRef = useRef<ReportState>({ objectives, activities, challenges, tomorrowPlans });
  reportRef.current = { objectives, activities, challenges, tomorrowPlans };
  const submitLockRef = useRef(false);
  const savedRef = useRef<{ id: string; reportCode: string } | null>(existingReport ? { id: existingReport.id, reportCode: existingReport.reportCode } : null);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<string[]>(() => readDismissedSuggestions(currentUser.id));

  const [attempted, setAttempted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // ---- Autosave on this device: nothing is lost if data or the phone goes off ----
  const draftKey = `pp_draft_daily_${currentUser.id}_${existingReport?.id ?? `new_${initialDate ?? 'today'}`}`;
  const [hydrated, setHydrated] = useState(false);
  const [lastLocalSave, setLastLocalSave] = useState<string | null>(null);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    const d = readLocalDraft<any>(draftKey);
    if (d && (!existingReport || d.savedAt > (existingReport.updatedAt ?? ''))) {
      if (d.date) setDate(d.date);
      if (d.startTime) setStartTime(d.startTime);
      if (d.endTime) setEndTime(d.endTime);
      if (d.objectives?.length) setObjectives(d.objectives);
      if (d.activities?.length) setActivities(d.activities);
      if (d.challenges) setChallenges(d.challenges);
      if (d.tomorrowPlans?.length) setTomorrowPlans(d.tomorrowPlans);
      toast.info('Your unsaved report was restored', { description: 'You can continue exactly where you stopped.' });
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const hasContent = objectives.some(o => o.objective.trim() || o.resultsFigures.trim()) || activities.some(a => a.activityTask.trim() || a.outcome.trim()) || challenges.length > 0 || tomorrowPlans.some(p => p.plannedTask.trim());
    if (!existingReport && !hasContent) return;
    const t = setTimeout(() => {
      if (writeLocalDraft(draftKey, { date, startTime, endTime, objectives, activities, challenges, tomorrowPlans })) setLastLocalSave(new Date().toISOString());
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated, date, startTime, endTime, objectives, activities, challenges, tomorrowPlans]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // Determine day of week & ISO week
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeekName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
  // Back-dating is allowed for earlier days of the CURRENT reporting week only; future dates are never allowed.
  const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
  const weekStartStr = formatDate(startOfISOWeek(new Date()), 'yyyy-MM-dd');
  const minDate = existingReport && existingReport.date < weekStartStr ? existingReport.date : weekStartStr;
  const weekNum = reportingWeekNumber(dateObj);
  const reportingPeriod = `Week ${weekNum}, ${dateObj.getFullYear()}`;
  const activitySuggestions = getActivitySuggestions(dailyReports, currentUser.id, { dismissed: dismissedSuggestions, excludeReportId: existingReport?.id });

  // ---- What is still missing (same rules the form has always enforced) ----
  const issues: Issue[] = [];
  if (!date) issues.push({ key: 'date', section: 0, message: 'Choose the date of this report.' });
  else if (date > todayStr) issues.push({ key: 'date', section: 0, message: 'A report cannot be dated in the future.' });
  else if (date < minDate) issues.push({ key: 'date', section: 0, message: `You can only back-date reports within the current reporting week (Week ${reportingWeekNumber(new Date())}).` });
  else if (isWeekend) issues.push({ key: 'date', section: 0, message: 'Choose a weekday. Daily reports are accepted Monday to Friday.' });
  if (!startTime || !endTime) issues.push({ key: 'hours', section: 0, message: 'Add both a start time and an end time.' });
  else if (startTime >= endTime) issues.push({ key: 'hours', section: 0, message: 'The end time must be after the start time.' });
  const filledObjectives = objectives.filter((o) => o.objective.trim());
  if (!filledObjectives.length) issues.push({ key: 'objectives', section: 1, message: 'Add at least one objective you were assigned today.' });
  for (const o of filledObjectives) {
    if ((o.status === 'Partly Done' || o.status === 'Not Done') && !o.reasonIfNotCompleted?.trim()) issues.push({ key: `reason:${o.id}`, section: 1, message: 'Tell us why this was not finished.' });
  }
  if (!activities.some((a) => a.activityTask.trim())) issues.push({ key: 'activities', section: 2, message: 'Add at least one thing you did today.' });
  const issueFor = (key: string) => (attempted ? issues.find((i) => i.key === key)?.message : undefined);

  const hasIssue = (section: number) => issues.some((i) => i.section === section);
  const statuses: SectionStatus[] = [
    hasIssue(0) ? 'incomplete' : 'complete',
    hasIssue(1) ? 'incomplete' : 'complete',
    hasIssue(2) ? 'incomplete' : 'complete',
    challenges.length === 0 ? 'optional' : challenges.every((c) => c.problemEncountered.trim()) ? 'complete' : 'incomplete',
    tomorrowPlans.some((p) => p.plannedTask.trim()) ? 'complete' : 'optional',
  ];
  const navState = (index: number) => (statuses[index] === 'complete' ? 'complete' : statuses[index] === 'incomplete' && attempted ? 'warn' : 'idle');

  // ---- Row handlers ----
  const addObjective = () => setObjectives((rows) => [...rows, blankObjective()]);
  const removeObjective = (id: string) => {
    setObjectives((rows) => (rows.length > 1 ? rows.filter((o) => o.id !== id) : rows));
    // An activity linked to a removed objective is simply unlinked.
    setActivities((rows) => rows.map((a) => (a.objectiveId === id ? { ...a, objectiveId: undefined } : a)));
  };
  const updateObjective = (id: string, patch: Partial<DailyObjective>) => setObjectives((rows) => rows.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  const addActivity = () => setActivities((rows) => [...rows, blankActivity()]);
  const removeActivity = (id: string) => setActivities((rows) => (rows.length > 1 ? rows.filter((a) => a.id !== id) : rows));
  const updateActivity = (id: string, patch: Partial<DailyActivity>) => setActivities((rows) => rows.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const addSuggestedActivity = (value: string) => {
    const normalized = value.trim().toLocaleLowerCase();
    if (activities.some((activity) => activity.activityTask.trim().toLocaleLowerCase() === normalized)) {
      toast.info('Already added', { description: 'That activity is already in this report.' });
      return;
    }
    setActivities((current) => {
      const blankIndex = current.findIndex((activity) => !activity.activityTask.trim());
      if (blankIndex >= 0) return current.map((activity, index) => (index === blankIndex ? { ...activity, activityTask: value } : activity));
      return [...current, { ...blankActivity(), activityTask: value }];
    });
  };

  const addChallenge = () => setChallenges((rows) => [...rows, blankChallenge()]);
  const removeChallenge = (id: string) => setChallenges((rows) => rows.filter((c) => c.id !== id));
  const updateChallenge = (id: string, patch: Partial<DailyChallenge>) => setChallenges((rows) => rows.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addTomorrowPlan = () => setTomorrowPlans((rows) => [...rows, blankPlan()]);
  const removeTomorrowPlan = (id: string) => setTomorrowPlans((rows) => (rows.length > 1 ? rows.filter((p) => p.id !== id) : rows));
  const updateTomorrowPlan = (id: string, patch: Partial<TomorrowPlan>) => setTomorrowPlans((rows) => rows.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // ---- Kenzy <-> form ----
  const applyState = (next: ReportState) => {
    setObjectives(next.objectives);
    setActivities(next.activities);
    setChallenges(next.challenges);
    setTomorrowPlans(next.tomorrowPlans);
  };

  const highlight = (ids: string[], kinds: Set<RowKind>) => {
    window.clearTimeout(flashTimer.current);
    setFlash(new Set(ids));
    setOpenSignals((signals) => signals.map((value, index) => ([...kinds].some((kind) => KIND_SECTION[kind] === index) ? value + 1 : value)));
    flashTimer.current = window.setTimeout(() => setFlash(new Set()), 5000);
  };

  const applyChatDraft = (draft: StructuredNarrationDraft, _result: NarrationResult): MergeSummary => {
    const { next, summary } = mergeNarrationDraft(reportRef.current, draft);
    if (summary.added + summary.updated + summary.removed > 0) {
      undoStack.current.push(summary.record);
      setUndoDepth(undoStack.current.length);
      setBannerOpen(true);
      applyState(next);
      const kinds = new Set<RowKind>([...summary.record.added, ...summary.record.updated].map((change) => change.kind));
      highlight(summary.touched, kinds);
    }
    return summary;
  };

  const undoLastKenzyChange = useCallback((): string => {
    const record = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!record) return '';
    const { next, keptEdited } = undoMerge(reportRef.current, record);
    applyState(next);
    setFlash(new Set());
    if (!undoStack.current.length) setBannerOpen(false);
    const kept = keptEdited ? ` I kept ${keptEdited === 1 ? 'one item' : `${keptEdited} items`} you edited yourself afterwards.` : '';
    toast.info('Kenzy\'s last change was undone', { description: keptEdited ? 'Items you edited yourself were kept.' : 'Everything you typed yourself is unchanged.' });
    return `Done. I've undone my last change.${kept}`;
  }, []);

  const openChat = () => setChatOpen(true);
  const closeChat = () => { setChatOpen(false); window.requestAnimationFrame(() => fabRef.current?.focus()); };

  const reviewReport = () => {
    if (window.matchMedia?.('(max-width: 639px)').matches) setChatOpen(false);
    window.setTimeout(() => {
      const firstFlashed = [...flash][0];
      const target = (firstFlashed && document.getElementById(`row-${firstFlashed}`)) || document.getElementById(SECTION_IDS[1] ?? 'report-step-1');
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  // ---- Validation, saving and submitting ----
  const scrollToIssue = (issue: Issue) => {
    setOpenSignals((signals) => signals.map((value, index) => (index === issue.section ? value + 1 : value)));
    window.setTimeout(() => document.getElementById(SECTION_IDS[issue.section] ?? 'report-step-0')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const requestSubmit = () => {
    setAttempted(true);
    const first = issues[0];
    if (first) {
      toast.error('A few things still need your attention', { description: first.message });
      scrollToIssue(first);
      return;
    }
    setShowSubmitConfirm(true);
  };

  const buildPayload = (filterBlank: boolean): Partial<DailyReport> => ({
    ...(savedRef.current ?? {}),
    employeeId: currentUser.id,
    employeeName: currentUser.name,
    employeeCode: currentUser.employeeId,
    roleTitle: currentUser.roleTitle,
    department: currentUser.department,
    date,
    dayOfWeek: dayOfWeekName,
    reportingPeriod,
    submittedToId: recipient?.id ?? '',
    submittedToName,
    startTime,
    endTime,
    objectives: filterBlank ? objectives.filter((o) => o.objective.trim().length > 0) : objectives,
    activities: filterBlank ? activities.filter((a) => a.activityTask.trim().length > 0) : activities,
    challenges: filterBlank ? challenges.filter((c) => c.problemEncountered.trim().length > 0) : challenges,
    tomorrowPlans: filterBlank ? tomorrowPlans.filter((p) => p.plannedTask.trim().length > 0) : tomorrowPlans,
    // Evidence upload was removed from the form, but attachments already stored on an existing report are kept untouched.
    attachments: existingReport?.attachments ?? [],
  });

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const draftSaved = await DailyReportService.saveDraft(buildPayload(false), currentUser);
      savedRef.current = { id: draftSaved.id, reportCode: draftSaved.reportCode };
      clearLocalDraft(draftKey);
      toast.success('Draft saved', { description: 'Your daily report is safely saved and ready to continue.' });
      onSaved();
      onNavigate('daily_reports');
    } catch (err: any) {
      toast.error('Draft could not be saved', { description: err.message || 'Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmSubmit = async () => {
    // Ignore repeated clicks while a submission is already in flight.
    if (submitLockRef.current) return;
    if (!recipient) { toast.error('Recipient not available', { description: recipientError || 'Madam Ursula could not be loaded. Please try again.' }); return; }
    if (issues.length) { setShowSubmitConfirm(false); requestSubmit(); return; }
    submitLockRef.current = true;
    setIsSaving(true);
    try {
      const saved = await DailyReportService.saveDraft(buildPayload(true), currentUser);
      // Remember the saved id so a retry after a network failure updates this report instead of creating a second one.
      savedRef.current = { id: saved.id, reportCode: saved.reportCode };
      // Then submit (idempotent: an already-submitted report is not submitted or notified twice)
      await DailyReportService.submitReport(saved.id, currentUser);
      clearLocalDraft(draftKey);
      toast.success('Daily report submitted', { description: `Your report has been sent to ${submittedToName || 'Madam Ursula'} for review.` });
      setShowSubmitConfirm(false);
      onSaved();
      onNavigate('daily_report_detail', saved.id);
    } catch (err: any) {
      toast.error('Submission failed', { description: err.message || 'Please review the form and try again.' });
      submitLockRef.current = false;
    } finally {
      setIsSaving(false);
    }
  };

  const filledObjectiveOptions = objectives.filter((o) => o.objective.trim());
  const isFlashed = (id: string) => flash.has(id);

  return (
    <div className="daily-report-page mx-auto w-full max-w-4xl space-y-5 pb-32 md:pb-28">
      {!online && <div role="status" className="rounded-lg border border-border bg-brand-wash px-4 py-3 text-sm text-foreground">You are offline. Keep typing — your work is saved on this device. Press Submit once your data is back.</div>}

      {/* Title and main actions */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <button type="button" onClick={() => onNavigate('daily_reports')} className="pp-btn pp-btn-ghost pp-btn-sm -ml-2 mb-1"><ArrowLeft className="size-4" aria-hidden="true" />Back to my reports</button>
          <p className="text-xs font-bold uppercase tracking-wide text-brand-strong">{isReturned ? 'Returned for correction' : isEditing ? 'Editing your report' : 'New daily report'}</p>
          <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">Plants &amp; Pure Daily Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">{dayOfWeekName}, {dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {reportingPeriod}</p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={handleSaveDraft} disabled={isSaving} className="pp-btn pp-btn-outline"><Save className="size-4" aria-hidden="true" />Save draft</button>
          <button type="button" onClick={requestSubmit} disabled={isSaving} className="pp-btn pp-btn-primary"><Send className="size-4" aria-hidden="true" />{isReturned ? 'Resubmit' : 'Submit report'}</button>
        </div>
      </div>

      {isReturned && existingReport?.reviews && existingReport.reviews.length > 0 && (
        <div className="rounded-xl border border-warning bg-warning-soft p-4">
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-warning"><AlertCircle className="size-4" aria-hidden="true" /><span>Correction note from {existingReport.reviews.at(-1)?.reviewerName}</span></div>
          <p className="text-sm italic text-foreground">“{existingReport.reviews.at(-1)?.comments}”</p>
        </div>
      )}

      {/* Where to start + section navigation */}
      <nav aria-label="Report sections" className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-[var(--shadow-soft)] backdrop-blur">
        <p className="mb-2 hidden text-[13px] text-muted-foreground sm:block">
          {isEditing ? 'Update any section below.' : <>Start at section 1 and work down. Or tap <strong className="text-foreground">Kenzy</strong> at the bottom right and just tell him about your day.</>}
        </p>
        <div className="pp-nav">
          {SECTION_NAMES.map((name, index) => (
            <a key={name} href={`#${SECTION_IDS[index]}`} data-state={navState(index)} className="pp-nav-chip" onClick={(event) => { event.preventDefault(); document.getElementById(SECTION_IDS[index] ?? '')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
              <span aria-hidden="true">{statuses[index] === 'complete' ? '✓' : index + 1}</span>
              {name.split(' and ')[0]}
              <span className="sr-only">{statuses[index] === 'complete' ? ' — complete' : statuses[index] === 'optional' ? ' — optional' : ' — still to do'}</span>
            </a>
          ))}
        </div>
      </nav>

      {bannerOpen && undoDepth > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-brand-wash px-4 py-3">
          <Sparkles className="size-5 shrink-0 text-brand-strong" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm font-medium text-foreground">Kenzy updated your report. Please check it. Changed items are marked below.</p>
          <button type="button" onClick={() => { undoLastKenzyChange(); }} className="pp-btn pp-btn-outline pp-btn-sm"><Undo2 className="size-4" aria-hidden="true" />Undo Kenzy's change</button>
          <button type="button" onClick={() => setBannerOpen(false)} className="pp-btn pp-btn-ghost pp-btn-sm" aria-label="Hide this message"><X className="size-4" aria-hidden="true" /></button>
        </div>
      )}

      {/* A. REPORT INFORMATION */}
      <SectionCard id={SECTION_IDS[0]!} step={1} title="Report information" description="Check the date and your working hours. Everything else is filled in for you." status={statuses[0]!} attempted={attempted} summary={`${dayOfWeekName} · ${startTime} to ${endTime}`} error={issueFor('date') ?? issueFor('hours')} openSignal={openSignals[0] ?? 0}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employee</dt><dd className="font-medium text-foreground">{currentUser.name}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff ID and role</dt><dd className="font-medium text-foreground">{currentUser.employeeId} · {currentUser.roleTitle}</dd></div>
          <div><dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Department</dt><dd className="font-medium text-foreground">{currentUser.department}</dd></div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Report goes to</dt>
            <dd className="flex items-center gap-1.5 font-medium text-foreground" aria-live="polite"><Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />{recipient ? recipient.name : recipientError ? 'Madam Ursula (not available)' : 'Loading…'}</dd>
            {recipientError && <p role="alert" className="text-[13px] text-destructive">{recipientError}</p>}
          </div>
        </dl>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date of this report" htmlFor="report-date" required hint={`You can fill in earlier days of this week (Week ${reportingWeekNumber(new Date())}).`} error={issueFor('date')}>
            <input id="report-date" type="date" value={date} min={minDate} max={todayStr} onChange={(e) => setDate(e.target.value)} required aria-invalid={Boolean(issueFor('date'))} className="w-full" />
          </Field>
          <Field label="Working hours" required hint="When did your working day start and end?" error={issueFor('hours')}>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="mb-0.5 block text-xs text-muted-foreground">From</span><input type="time" aria-label="Start time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required aria-invalid={Boolean(issueFor('hours'))} className="w-full" /></div>
              <div><span className="mb-0.5 block text-xs text-muted-foreground">To</span><input type="time" aria-label="End time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required aria-invalid={Boolean(issueFor('hours'))} className="w-full" /></div>
            </div>
          </Field>
        </div>
      </SectionCard>

      {/* B. ASSIGNED OBJECTIVES AND RESULTS */}
      <SectionCard id={SECTION_IDS[1]!} step={2} title="Assigned objectives and results" description="What you were asked to achieve today, and how it went. Write the task, say if it was finished, and give the result." status={statuses[1]!} attempted={attempted} summary={`${filledObjectives.length} objective${filledObjectives.length === 1 ? '' : 's'}`} error={issueFor('objectives')} openSignal={openSignals[1] ?? 0}>
        {objectives.map((obj, index) => (
          <RowShell key={obj.id} rowId={`row-${obj.id}`} index={index} total={objectives.length} label="Objective" flashed={isFlashed(obj.id)} onRemove={objectives.length > 1 ? () => removeObjective(obj.id) : undefined} removeLabel={`Remove objective ${index + 1}`}>
            <Field label="What were you asked to do?" htmlFor={`${obj.id}-objective`} required hint="The task given to you by your supervisor or manager.">
              <VoiceInput id={`${obj.id}-objective`} voiceLabel="objective" value={obj.objective} onValueChange={(v) => updateObjective(obj.id, { objective: v })} placeholder="e.g. Prepare promotional materials for the Christmas campaign" className="w-full" />
            </Field>
            <Field label="Was it finished?" required>
              <Segmented label="Was this objective finished?" value={obj.status} onChange={(status) => updateObjective(obj.id, { status, ...(status === 'Done' ? { reasonIfNotCompleted: '' } : {}) })} options={STATUS_OPTIONS} />
            </Field>
            {(obj.status === 'Partly Done' || obj.status === 'Not Done') && (
              <Field label="Why was it not finished?" htmlFor={`${obj.id}-reason`} required error={issueFor(`reason:${obj.id}`)}>
                <VoiceInput id={`${obj.id}-reason`} voiceLabel="reason" value={obj.reasonIfNotCompleted || ''} onValueChange={(v) => updateObjective(obj.id, { reasonIfNotCompleted: v })} placeholder="e.g. Waiting for the final product images" aria-invalid={Boolean(issueFor(`reason:${obj.id}`))} className="w-full" />
              </Field>
            )}
            <Field label="Result achieved" htmlFor={`${obj.id}-results`} hint="What came out of it? Numbers help. You can leave this empty if there is nothing to add.">
              <VoiceInput id={`${obj.id}-results`} voiceLabel="results or figures" value={obj.resultsFigures} onValueChange={(v) => updateObjective(obj.id, { resultsFigures: v })} placeholder="e.g. 3 flyers and 2 videos completed and published" className="w-full" />
            </Field>
          </RowShell>
        ))}
        <AddButton onClick={addObjective}>Add another objective</AddButton>
      </SectionCard>

      {/* C. ACTIVITIES PERFORMED */}
      <SectionCard id={SECTION_IDS[2]!} step={3} title="Activities performed" description="Everything you actually did today. Add each task separately." status={statuses[2]!} attempted={attempted} summary={`${activities.filter((a) => a.activityTask.trim()).length} activit${activities.filter((a) => a.activityTask.trim()).length === 1 ? 'y' : 'ies'}`} error={issueFor('activities')} openSignal={openSignals[2] ?? 0}>
        {activitySuggestions.length > 0 && (
          <div className="rounded-lg bg-brand-wash/70 p-3">
            <p className="mb-2 text-[13px] font-semibold text-foreground">Did you do any of these again today? Tap to add.</p>
            <div className="flex flex-wrap gap-2">
              {activitySuggestions.map((suggestion) => (
                <span key={suggestion.normalized} className="inline-flex max-w-full items-center rounded-full border border-primary/30 bg-card text-[13px] text-foreground">
                  <button type="button" onClick={() => addSuggestedActivity(suggestion.value)} className="min-h-9 truncate rounded-l-full py-1 pl-3 pr-2 text-left font-semibold hover:bg-muted" title={`Add “${suggestion.value}”`}>{suggestion.value}</button>
                  <button type="button" onClick={() => setDismissedSuggestions(dismissSuggestion(currentUser.id, suggestion.normalized))} className="grid size-9 place-items-center rounded-r-full text-muted-foreground hover:bg-muted" aria-label={`Hide the suggestion ${suggestion.value}`}><X className="size-3.5" aria-hidden="true" /></button>
                </span>
              ))}
            </div>
          </div>
        )}
        {activities.map((act, index) => {
          const [startPart = '', endPart = ''] = (act.time || '').split('-').map((x) => x.trim());
          const setTime = (start: string, end: string) => updateActivity(act.id, { time: start || end ? `${start} - ${end}` : '' });
          const detailSummary = [act.placePersonPlatform, act.quantityFigures, act.outcome, act.time && `at ${act.time.replace(/\s*-\s*$/, '')}`].filter(Boolean).join(' · ');
          return (
            <RowShell key={act.id} rowId={`row-${act.id}`} index={index} total={activities.length} label="Activity" flashed={isFlashed(act.id)} onRemove={activities.length > 1 ? () => removeActivity(act.id) : undefined} removeLabel={`Remove activity ${index + 1}`}>
              <Field label="What did you do?" htmlFor={`${act.id}-task`} required>
                <VoiceTextarea id={`${act.id}-task`} voiceLabel="activity description" rows={2} value={act.activityTask} onValueChange={(v) => updateActivity(act.id, { activityTask: v })} placeholder="e.g. Designed three promotional flyers for the Christmas campaign" className="min-h-14 w-full" />
              </Field>
              <Disclosure label="Add details (where, how many, result, time)" summary={detailSummary} autoOpen={Boolean(detailSummary) && (isFlashed(act.id) || false)}>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Where, who or which platform?" htmlFor={`${act.id}-place`}>
                    <input id={`${act.id}-place`} type="text" value={act.placePersonPlatform} onChange={(e) => updateActivity(act.id, { placePersonPlatform: e.target.value })} placeholder="e.g. Production department, or Facebook" className="w-full" />
                  </Field>
                  <Field label="How many?" htmlFor={`${act.id}-qty`} hint="Only if it can be counted.">
                    <input id={`${act.id}-qty`} type="text" value={act.quantityFigures} onChange={(e) => updateActivity(act.id, { quantityFigures: e.target.value })} placeholder="e.g. 3 flyers" className="w-full" />
                  </Field>
                </div>
                <Field label="Result or outcome" htmlFor={`${act.id}-outcome`} hint="Only if there is something to add beyond the task itself.">
                  <input id={`${act.id}-outcome`} type="text" value={act.outcome} onChange={(e) => updateActivity(act.id, { outcome: e.target.value })} placeholder="e.g. Approved by the manager" className="w-full" />
                </Field>
                <Field label="Time (optional)">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="mb-0.5 block text-xs text-muted-foreground">From</span><input type="time" aria-label={`Activity ${index + 1} start time`} value={startPart} onChange={(e) => setTime(e.target.value, endPart)} className="w-full" /></div>
                    <div><span className="mb-0.5 block text-xs text-muted-foreground">To</span><input type="time" aria-label={`Activity ${index + 1} end time`} value={endPart} onChange={(e) => setTime(startPart, e.target.value)} className="w-full" /></div>
                  </div>
                </Field>
                {filledObjectiveOptions.length > 0 && (
                  <Field label="Which objective was this for? (optional)" htmlFor={`${act.id}-objective`} hint="Links this activity to one of the objectives in section 2, so you do not have to repeat yourself.">
                    <select id={`${act.id}-objective`} value={act.objectiveId && filledObjectiveOptions.some((o) => o.id === act.objectiveId) ? act.objectiveId : ''} onChange={(e) => updateActivity(act.id, { objectiveId: e.target.value || undefined })} className="w-full">
                      <option value="">Not linked to an objective</option>
                      {filledObjectiveOptions.map((o) => <option key={o.id} value={o.id}>{o.objective.length > 70 ? `${o.objective.slice(0, 70)}…` : o.objective}</option>)}
                    </select>
                  </Field>
                )}
              </Disclosure>
            </RowShell>
          );
        })}
        <AddButton onClick={addActivity}>Add another activity</AddButton>
      </SectionCard>

      {/* D. CHALLENGES AND ACTIONS TAKEN */}
      <SectionCard id={SECTION_IDS[3]!} step={4} title="Challenges and actions taken" description="Did anything go wrong or get in your way? Say what happened and what you did about it. You can skip this if there were no problems." status={statuses[3]!} attempted={attempted} summary={challenges.length ? `${challenges.length} challenge${challenges.length === 1 ? '' : 's'}` : 'No challenges today'} openSignal={openSignals[3] ?? 0}>
        {challenges.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/50 px-4 py-5 text-center">
            <p className="text-sm font-medium text-foreground">No challenges reported for today.</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">If something delayed you or went wrong, add it here.</p>
          </div>
        ) : challenges.map((ch, index) => (
          <RowShell key={ch.id} rowId={`row-${ch.id}`} index={index} total={challenges.length} label="Challenge" flashed={isFlashed(ch.id)} onRemove={() => removeChallenge(ch.id)} removeLabel={`Remove challenge ${index + 1}`}>
            <Field label="What went wrong or got in your way?" htmlFor={`${ch.id}-problem`} required>
              <VoiceTextarea id={`${ch.id}-problem`} voiceLabel="problem encountered" rows={2} value={ch.problemEncountered} onValueChange={(v) => updateChallenge(ch.id, { problemEncountered: v })} placeholder="e.g. Could not finish the catalogue because the product images were late" className="min-h-14 w-full" />
            </Field>
            <Field label="What did you do about it?" htmlFor={`${ch.id}-action`} hint="Leave this empty if you have not done anything yet.">
              <VoiceInput id={`${ch.id}-action`} voiceLabel="action taken" value={ch.actionTaken} onValueChange={(v) => updateChallenge(ch.id, { actionTaken: v })} placeholder="e.g. Asked the photographer to send them first thing tomorrow" className="w-full" />
            </Field>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
              <Field label="When did it happen? (optional)" htmlFor={`${ch.id}-when`}>
                <input id={`${ch.id}-when`} type="text" value={ch.whenHappened} onChange={(e) => updateChallenge(ch.id, { whenHappened: e.target.value })} placeholder="e.g. Around 2 pm" className="w-full" />
              </Field>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground">
                <input type="checkbox" checked={ch.resolved} onChange={(e) => updateChallenge(ch.id, { resolved: e.target.checked })} className="size-5" />
                This problem is solved
              </label>
            </div>
          </RowShell>
        ))}
        <AddButton onClick={addChallenge}>{challenges.length ? 'Add another challenge' : 'Add a challenge'}</AddButton>
      </SectionCard>

      {/* E. PLANS FOR TOMORROW */}
      <SectionCard id={SECTION_IDS[4]!} step={5} title="Plans for tomorrow" description="What do you intend to work on tomorrow? Add one plan at a time." status={statuses[4]!} attempted={attempted} summary={`${tomorrowPlans.filter((p) => p.plannedTask.trim()).length} plan${tomorrowPlans.filter((p) => p.plannedTask.trim()).length === 1 ? '' : 's'}`} openSignal={openSignals[4] ?? 0}>
        {tomorrowPlans.map((plan, index) => (
          <RowShell key={plan.id} rowId={`row-${plan.id}`} index={index} total={tomorrowPlans.length} label="Plan" flashed={isFlashed(plan.id)} onRemove={tomorrowPlans.length > 1 ? () => removeTomorrowPlan(plan.id) : undefined} removeLabel={`Remove plan ${index + 1}`}>
            <Field label="What do you intend to work on tomorrow?" htmlFor={`${plan.id}-task`}>
              <VoiceInput id={`${plan.id}-task`} voiceLabel="planned task" value={plan.plannedTask} onValueChange={(v) => updateTomorrowPlan(plan.id, { plannedTask: v })} placeholder="e.g. Complete the product catalogue" className="w-full" />
            </Field>
            <Disclosure label="Add support or approval needed (optional)" summary={[plan.resourcesNeeded, plan.approvalsRequired].filter(Boolean).join(' · ')} autoOpen={Boolean(plan.resourcesNeeded.trim() || plan.approvalsRequired.trim())}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Resources or support needed" htmlFor={`${plan.id}-res`}>
                  <input id={`${plan.id}-res`} type="text" value={plan.resourcesNeeded} onChange={(e) => updateTomorrowPlan(plan.id, { resourcesNeeded: e.target.value })} placeholder="e.g. Final product images" className="w-full" />
                </Field>
                <Field label="Approval needed, and from whom" htmlFor={`${plan.id}-appr`}>
                  <input id={`${plan.id}-appr`} type="text" value={plan.approvalsRequired} onChange={(e) => updateTomorrowPlan(plan.id, { approvalsRequired: e.target.value })} placeholder="e.g. Manager sign-off" className="w-full" />
                </Field>
              </div>
            </Disclosure>
          </RowShell>
        ))}
        <AddButton onClick={addTomorrowPlan}>Add another plan</AddButton>
      </SectionCard>

      {/* Final actions */}
      <div className="pp-action-bar">
        <p className="text-[13px] text-muted-foreground">
          {lastLocalSave ? `Saved on this device at ${new Date(lastLocalSave).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. ` : ''}
          {issues.length ? `${issues.length} thing${issues.length === 1 ? '' : 's'} left before you can submit.` : 'Everything required is filled in.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleSaveDraft} disabled={isSaving} className="pp-btn pp-btn-outline"><Save className="size-4" aria-hidden="true" />Save draft</button>
          <button type="button" onClick={requestSubmit} disabled={isSaving} className="pp-btn pp-btn-primary"><Send className="size-4" aria-hidden="true" />{isReturned ? 'Resubmit report' : 'Submit report'}</button>
        </div>
      </div>

      {/* Kenzy: small floating helper, plus the chat overlay. The form above is never replaced by it. */}
      {!chatOpen && <KenzyFloating ref={fabRef} onOpen={openChat} liftOnMobile />}
      <DailyReportChat
        open={chatOpen}
        onClose={closeChat}
        employeeName={currentUser.name}
        department={currentUser.department}
        recipientName={submittedToName}
        recipientError={recipientError}
        getReport={() => reportRef.current}
        knownActivities={activitySuggestions.map((s) => s.value)}
        onApplyDraft={applyChatDraft}
        undoDepth={undoDepth}
        onUndo={undoLastKenzyChange}
        onReview={reviewReport}
      />

      {/* Pre-submit confirmation */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-4 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="submit-confirm-title">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-success-soft text-success"><FileCheck className="size-5" aria-hidden="true" /></div>
              <div>
                <h3 id="submit-confirm-title" className="text-base font-bold text-foreground">Submit your daily report?</h3>
                <p className="text-sm text-muted-foreground">{dayOfWeekName}, {date}</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">Once submitted, this report is locked for review by {submittedToName}. You will get a notification when it has been reviewed.</p>
            <dl className="space-y-1.5 rounded-lg border border-border bg-muted p-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Objectives</dt><dd className="font-bold text-foreground">{filledObjectives.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Activities</dt><dd className="font-bold text-foreground">{activities.filter((a) => a.activityTask.trim()).length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Challenges</dt><dd className="font-bold text-foreground">{challenges.filter((c) => c.problemEncountered.trim()).length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Plans for tomorrow</dt><dd className="font-bold text-foreground">{tomorrowPlans.filter((p) => p.plannedTask.trim()).length}</dd></div>
            </dl>
            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setShowSubmitConfirm(false)} className="pp-btn pp-btn-outline">Go back and edit</button>
              <button type="button" onClick={handleConfirmSubmit} disabled={isSaving} className="pp-btn pp-btn-primary">{isSaving ? 'Submitting…' : 'Yes, submit report'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
