import { reportingWeekNumber } from '@/utils/reportingWeek';
import { startOfISOWeek, format as formatDate } from 'date-fns';
import { toast } from 'sonner';
import { readLocalDraft, writeLocalDraft, clearLocalDraft } from '@/lib/localDraft';
import { Button } from "@/components/ui/button";
import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Save, 
  Send, 
  Plus, 
  Trash2, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Paperclip, 
  X,
  FileCheck
} from 'lucide-react';
import { 
  User, 
  DailyReport, 
  DailyObjective, 
  DailyActivity, 
  DailyChallenge, 
  TomorrowPlan, 
  EvidenceAttachment,
  ObjectiveStatus 
} from '../../types';
import { DailyReportService } from '../../services/storageService';

interface DailyReportFormProps {
  currentUser: User;
  existingReport?: DailyReport | null | undefined;
  initialDate?: string | undefined;
  onNavigate: (view: string, param?: string) => void;
  onSaved: () => void;
}

const REPORT_STEPS = ['Employee', 'Objectives', 'Activities', 'Challenges', 'Tomorrow', 'Evidence', 'Review'];

export const DailyReportForm: React.FC<DailyReportFormProps> = ({
  currentUser,
  existingReport,
  initialDate,
  onNavigate,
  onSaved
}) => {
  const isEditing = !!existingReport;
  const isReturned = existingReport?.status === 'returned';

  // Section 1: Employee info
  const [date, setDate] = useState<string>(
    existingReport?.date || initialDate || new Date().toISOString().slice(0,10)
  );
  const [step, setStep] = useState(0);
  const [startTime, setStartTime] = useState<string>(existingReport?.startTime || '08:00');
  const [endTime, setEndTime] = useState<string>(existingReport?.endTime || '17:00');
  const [submittedToName, setSubmittedToName] = useState<string>(
    existingReport?.submittedToName || currentUser.supervisorName || ''
  );

  // Section 2: Objectives
  const [objectives, setObjectives] = useState<DailyObjective[]>(
    existingReport?.objectives?.length 
      ? existingReport.objectives 
      : [{ id: `obj_${Date.now()}_1`, objective: '', status: 'Done', resultsFigures: '', reasonIfNotCompleted: '' }]
  );

  // Section 3: Activities
  const [activities, setActivities] = useState<DailyActivity[]>(
    existingReport?.activities?.length 
      ? existingReport.activities 
      : [{ id: `act_${Date.now()}_1`, time: '08:30 - 10:30', activityTask: '', placePersonPlatform: '', quantityFigures: '', outcome: '' }]
  );

  // Section 4: Challenges
  const [challenges, setChallenges] = useState<DailyChallenge[]>(
    existingReport?.challenges || []
  );

  // Section 5: Tomorrow Plans
  const [tomorrowPlans, setTomorrowPlans] = useState<TomorrowPlan[]>(
    existingReport?.tomorrowPlans?.length 
      ? existingReport.tomorrowPlans 
      : [{ id: `pl_${Date.now()}_1`, plannedTask: '', resourcesNeeded: '', approvalsRequired: '' }]
  );

  // Section 6: Evidence Attachments
  const [attachments, setAttachments] = useState<EvidenceAttachment[]>(
    existingReport?.attachments || []
  );

  const [validationError, setValidationError] = useState<string | null>(null);
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
      setStep(d.step ?? 0);
      if (d.startTime) setStartTime(d.startTime);
      if (d.endTime) setEndTime(d.endTime);
      if (d.submittedToName !== undefined) setSubmittedToName(d.submittedToName);
      if (d.objectives?.length) setObjectives(d.objectives);
      if (d.activities?.length) setActivities(d.activities);
      if (d.challenges) setChallenges(d.challenges);
      if (d.tomorrowPlans?.length) setTomorrowPlans(d.tomorrowPlans);
      if (d.attachments) setAttachments(d.attachments);
      toast.info('Your unsaved report was restored', { description: 'You can continue exactly where you stopped.' });
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const hasContent = objectives.some(o => o.objective.trim() || o.resultsFigures.trim()) || activities.some(a => a.activityTask.trim() || a.outcome.trim()) || challenges.length > 0 || tomorrowPlans.some(p => p.plannedTask.trim()) || attachments.length > 0;
    if (!existingReport && !hasContent) return;
    const t = setTimeout(() => {
      if (writeLocalDraft(draftKey, { date, step, startTime, endTime, submittedToName, objectives, activities, challenges, tomorrowPlans, attachments })) setLastLocalSave(new Date().toISOString());
    }, 600);
    return () => clearTimeout(t);
  }, [hydrated, date, step, startTime, endTime, submittedToName, objectives, activities, challenges, tomorrowPlans, attachments]);
  // Determine day of week & ISO week
  const dateObj = new Date(date + 'T00:00:00');
  const dayOfWeekName = dateObj.toLocaleDateString('en-GB', { weekday: 'long' });
  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
  // Back-dating is allowed for earlier days of the CURRENT reporting week only; future dates are never allowed.
  const todayStr = formatDate(new Date(), 'yyyy-MM-dd');
  const weekStartStr = formatDate(startOfISOWeek(new Date()), 'yyyy-MM-dd');
  const minDate = existingReport && existingReport.date < weekStartStr ? existingReport.date : weekStartStr;

  // Calculate week number
  const getWeekNumber = (d: Date) => reportingWeekNumber(d);
  const weekNum = getWeekNumber(dateObj);
  const reportingPeriod = `Week ${weekNum}, ${dateObj.getFullYear()}`;

  const sectionProgress = [
    ['Employee', [date, startTime, endTime, submittedToName].map(Boolean)],
    ['Objectives', objectives.length ? objectives.map(objective => Boolean(objective.objective.trim()) && Boolean(objective.resultsFigures.trim()) && (objective.status === 'Done' || Boolean(objective.reasonIfNotCompleted?.trim()))) : [false]],
    ['Activities', activities.length ? activities.map(activity => Boolean(activity.activityTask.trim()) && Boolean(activity.placePersonPlatform.trim()) && Boolean(activity.quantityFigures.trim()) && Boolean(activity.outcome.trim())) : [false]],
    ['Challenges', challenges.length ? challenges.map(challenge => Boolean(challenge.problemEncountered.trim()) && Boolean(challenge.actionTaken.trim())) : [true]],
    ['Tomorrow', tomorrowPlans.length ? tomorrowPlans.map(plan => Boolean(plan.plannedTask.trim()) && Boolean(plan.resourcesNeeded.trim()) && Boolean(plan.approvalsRequired.trim())) : [false]],
    ['Evidence', [true]],
  ].map(([label, checks]) => {
    const values = checks as boolean[];
    return { label: label as string, percent: Math.round((values.filter(Boolean).length / values.length) * 100) };
  });

  // Objectives handlers
  const addObjective = () => {
    setObjectives([
      ...objectives,
      { id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, objective: '', status: 'Done', resultsFigures: '', reasonIfNotCompleted: '' }
    ]);
  };

  const removeObjective = (id: string) => {
    if (objectives.length > 1) {
      setObjectives(objectives.filter(o => o.id !== id));
    }
  };

  const updateObjective = (id: string, field: keyof DailyObjective, value: any) => {
    setObjectives(objectives.map(o => o.id === id ? { ...o, [field]: value } : o));
  };

  // Activities handlers
  const addActivity = () => {
    setActivities([
      ...activities,
      { id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, time: '11:00 - 13:00', activityTask: '', placePersonPlatform: '', quantityFigures: '', outcome: '' }
    ]);
  };

  const removeActivity = (id: string) => {
    if (activities.length > 1) {
      setActivities(activities.filter(a => a.id !== id));
    }
  };

  const updateActivity = (id: string, field: keyof DailyActivity, value: any) => {
    setActivities(activities.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  // Challenges handlers
  const addChallenge = () => {
    setChallenges([
      ...challenges,
      { id: `ch_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, problemEncountered: '', whenHappened: 'Afternoon', actionTaken: '', resolved: false }
    ]);
  };

  const removeChallenge = (id: string) => {
    setChallenges(challenges.filter(c => c.id !== id));
  };

  const updateChallenge = (id: string, field: keyof DailyChallenge, value: any) => {
    setChallenges(challenges.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  // Tomorrow Plans handlers
  const addTomorrowPlan = () => {
    setTomorrowPlans([
      ...tomorrowPlans,
      { id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`, plannedTask: '', resourcesNeeded: '', approvalsRequired: '' }
    ]);
  };

  const removeTomorrowPlan = (id: string) => {
    if (tomorrowPlans.length > 1) {
      setTomorrowPlans(tomorrowPlans.filter(p => p.id !== id));
    }
  };

  const updateTomorrowPlan = (id: string, field: keyof TomorrowPlan, value: any) => {
    setTomorrowPlans(tomorrowPlans.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  // File upload handler (IndexedDB dataUrl)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach(file => {
      // Validate file size (< 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large', { description: `${file.name} is over the 10 MB limit.` });
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const newAttachment: EvidenceAttachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          dataUrl,
          uploadedAt: new Date().toISOString()
        };
        setAttachments(prev => [...prev, newAttachment]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  // Validation logic
  const validate = (): boolean => {
    setValidationError(null);

    if (date > todayStr) {
      toast.error('Date not allowed', { description: 'A report cannot be dated in the future.' });
      return false;
    }
    if (date < minDate) {
      toast.error('Date not allowed', { description: `You can only back-date reports within the current reporting week (Week ${reportingWeekNumber(new Date())}).` });
      return false;
    }

    if (isWeekend) {
      toast.error('Choose a weekday', { description: 'Ordinary daily reports are accepted Monday through Friday.' });
      return false;
    }

    if (!startTime || !endTime) {
      toast.error('Working hours required', { description: 'Add both a start and end time before submitting.' });
      return false;
    }

    if (startTime >= endTime) {
      toast.error('Check working hours', { description: 'End time must be after start time.' });
      return false;
    }

    // Check at least one objective has a description
    const validObjectives = objectives.filter(o => o.objective.trim().length > 0);
    if (validObjectives.length === 0) {
      toast.error('Objective required', { description: 'Record at least one assigned objective for today.' });
      return false;
    }

    // Check reason if incomplete
    for (const obj of validObjectives) {
      if ((obj.status === 'Partly Done' || obj.status === 'Not Done') && !obj.reasonIfNotCompleted?.trim()) {
        toast.error('Add an incomplete reason', { description: `Explain why “${obj.objective}” was not completed.` });
        return false;
      }
    }

    // Check activities
    const validActivities = activities.filter(a => a.activityTask.trim().length > 0);
    if (validActivities.length === 0) {
      toast.error('Activity required', { description: 'Document at least one completed activity.' });
      return false;
    }

    return true;
  };

  // Save as Draft
  const handleSaveDraft = async () => {
    setIsSaving(true);
    setValidationError(null);
    try {
      const payload: Partial<DailyReport> = {
        ...(existingReport ? {id:existingReport.id,reportCode:existingReport.reportCode} : {}),

        employeeId: currentUser.id,
        employeeName: currentUser.name,
        employeeCode: currentUser.employeeId,
        roleTitle: currentUser.roleTitle,
        department: currentUser.department,
        date,
        dayOfWeek: dayOfWeekName,
        reportingPeriod,
        submittedToId: currentUser.supervisorId || '',
        submittedToName,
        startTime,
        endTime,
        objectives,
        activities,
        challenges,
        tomorrowPlans,
        attachments
      };

      await DailyReportService.saveDraft(payload, currentUser);
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

  // Submit Daily Report
  const handleConfirmSubmit = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      // First save draft state
      const payload: Partial<DailyReport> = {
        ...(existingReport ? {id:existingReport.id,reportCode:existingReport.reportCode} : {}),

        employeeId: currentUser.id,
        employeeName: currentUser.name,
        employeeCode: currentUser.employeeId,
        roleTitle: currentUser.roleTitle,
        department: currentUser.department,
        date,
        dayOfWeek: dayOfWeekName,
        reportingPeriod,
        submittedToId: currentUser.supervisorId || '',
        submittedToName,
        startTime,
        endTime,
        objectives: objectives.filter(o => o.objective.trim().length > 0),
        activities: activities.filter(a => a.activityTask.trim().length > 0),
        challenges: challenges.filter(c => c.problemEncountered.trim().length > 0),
        tomorrowPlans: tomorrowPlans.filter(p => p.plannedTask.trim().length > 0),
        attachments
      };

      const saved = await DailyReportService.saveDraft(payload, currentUser);
      // Then submit
      await DailyReportService.submitReport(saved.id, currentUser);
      clearLocalDraft(draftKey);
      toast.success('Daily report submitted', { description: 'Your report has been sent to your supervisor for review.' });
      setShowSubmitConfirm(false);
      onSaved();
      onNavigate('daily_report_detail', saved.id);
    } catch (err: any) {
      toast.error('Submission failed', { description: err.message || 'Please review the form and try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="daily-report-page w-full max-w-none space-y-6 pb-12">
      {!online && <div role="status" className="rounded-lg border border-border bg-brand-wash px-4 py-3 text-sm text-foreground">You are offline. Keep typing — your work is saved on this device. Press Submit once your data is back.</div>}
      {lastLocalSave && <p className="-mb-3 text-xs text-muted-foreground">Autosaved on this device at {new Date(lastLocalSave).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>}
      {/* Top Navigation & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card  p-4 sm:p-6 rounded-lg border border-border  shadow-xs">
        <div className="flex items-center gap-3">
          <Button variant="legacy"
            onClick={() => onNavigate('daily_reports')}
            className="p-2 text-muted-foreground hover:text-foreground  rounded-lg hover:bg-muted  transition-colors"
            title="Back to Reports"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <span className="text-xs font-semibold text-primary uppercase tracking-normal">
              {isReturned ? 'Returned for Revision' : isEditing ? 'Edit Draft Report' : 'New Report Entry'}
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground  leading-tight">
              Plants & Pure Daily Report Sheet
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button variant="legacy"
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 border border-border  hover:bg-muted  text-foreground  text-xs sm:text-sm font-semibold rounded-lg transition-colors"
          >
            <Save className="w-4 h-4 text-muted-foreground" />
            <span>Save Draft</span>
          </Button>
          <Button variant="legacy"
            type="button"
            onClick={() => {
              if (validate()) {
                setShowSubmitConfirm(true);
              } else { setStep(6); }
            }}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-5 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Send className="w-4 h-4" />
            <span>{isReturned ? 'Resubmit Corrected Report' : 'Submit Daily Report'}</span>
          </Button>
        </div>
      </div>

      {/* Validation Alert */}
      {validationError && (
        <div className="p-4 bg-destructive-soft  border border-destructive  rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive  shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-destructive  font-medium">
            {validationError}
          </div>
        </div>
      )}

      {/* Returned Feedback Banner if report was returned */}
      {isReturned && existingReport?.reviews && existingReport.reviews.length > 0 && (
        <div className="p-4 bg-warning-soft  border border-warning  rounded-lg">
          <div className="flex items-center gap-2 text-xs font-bold text-warning  uppercase tracking-normal mb-1">
            <AlertCircle className="w-4 h-4 text-warning" />
            <span>Supervisor Correction Note from {existingReport.reviews.at(-1)?.reviewerName}</span>
          </div>
          <p className="text-xs sm:text-sm text-warning  italic">
            "{existingReport.reviews.at(-1)?.comments}"
          </p>
        </div>
      )}

      {/* Single-page section index */}
      <nav aria-label="Report sections" className="report-section-index sticky top-[64px] z-20 -mx-1 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-3 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-foreground mr-1">Complete all sections on this page:</span>{sectionProgress.map((section, i) => <a key={section.label} href={`#report-step-${i}`} className={`report-section-chip ${section.percent === 100 ? 'is-complete' : ''}`}><span>{i + 1}. {section.label}</span><span className="report-section-percent">{section.percent === 100 ? '✓' : `${section.percent}%`}</span></a>)}</div>
      </nav>

      {/* SECTION 1: EMPLOYEE INFORMATION */}
      <div id="report-step-0" className="bg-card p-5 sm:p-7 rounded-xl border border-border shadow-[var(--shadow-soft)] space-y-5 fade-up">
        <div className="border-b border-border  pb-3">
          <span className="text-xs font-bold uppercase tracking-normal text-primary">Section 1</span>
          <h2 className="text-base font-bold text-foreground ">
            Employee & Shift Information
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground  mb-1">
              Employee Name (Auto)
            </label>
            <input
              type="text"
              readOnly
              value={currentUser.name}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-muted  text-foreground  font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground  mb-1">
              Staff ID & Role (Auto)
            </label>
            <input
              type="text"
              readOnly
              value={`${currentUser.employeeId} · ${currentUser.roleTitle}`}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-muted  text-foreground  font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground  mb-1">
              Department (Auto)
            </label>
            <input
              type="text"
              readOnly
              value={currentUser.department}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-muted  text-foreground  font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground  mb-1">
              Reporting Date *
            </label>
            <input
              type="date"
              value={date}
              min={minDate}
              max={todayStr}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium focus:ring-2 focus:ring-primary"
              required
            />
            {isWeekend && (
              <span className="text-[11px] text-destructive font-medium mt-1 block">
                Weekend dates are non-reporting days.
              </span>
            )}
            <span className="text-[11px] text-muted-foreground mt-1 block">
              You can fill in earlier days of this week (Week {reportingWeekNumber(new Date())}).
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground  mb-1">
              Day & Reporting Period (Auto)
            </label>
            <input
              type="text"
              readOnly
              value={`${dayOfWeekName} · ${reportingPeriod}`}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-muted  text-foreground  font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground  mb-1">
              Submitted To (Supervisor/Manager)
            </label>
            <input
              type="text"
              value={submittedToName}
              onChange={(e) => setSubmittedToName(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-muted-foreground ">
                Official Working Hours *
              </label>
              <span className="text-[11px] text-muted-foreground">Tap to choose a time</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  type="time"
                  aria-label="Start time"
                                    value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <input
                  type="time"
                  aria-label="End time"
                                    value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: TODAY'S OBJECTIVES */}
      <div id="report-step-1" className="bg-card p-5 sm:p-7 rounded-xl border border-border shadow-[var(--shadow-soft)] space-y-5 fade-up">
        <div className="flex items-center justify-between border-b border-border  pb-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-normal text-primary">Section 2</span>
            <h2 className="text-base font-bold text-foreground ">
              Today's Objectives
            </h2>
            <p className="text-xs text-muted-foreground ">
              Objectives assigned by the CEO, Administrator, or departmental supervisor.
            </p>
          </div>
          <Button variant="legacy"
            type="button"
            onClick={addObjective}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary  hover:bg-brand-wash  rounded-lg border border-primary/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Objective</span>
          </Button>
        </div>

        <div className="space-y-4">
          {objectives.map((obj, index) => (
            <div key={obj.id} className="p-4 rounded-lg border border-border  bg-muted/50  space-y-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold text-muted-foreground mt-2">
                  #{index + 1}
                </span>
                <div className="flex-1 space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Objective Assigned *
                    </label>
                    <input
                      type="text"
                      value={obj.objective}
                      onChange={(e) => updateObjective(obj.id, 'objective', e.target.value)}
                      placeholder="e.g. Pack and label spice orders for Friday delivery"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-foreground  mb-1">
                        Completion Status *
                      </label>
                      <select
                        value={obj.status}
                        onChange={(e) => updateObjective(obj.id, 'status', e.target.value as ObjectiveStatus)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium"
                      >
                        <option value="Done">Done (Completed)</option>
                        <option value="Partly Done">Partly Done</option>
                        <option value="Not Done">Not Done</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-foreground  mb-1">
                        Results / Figures / Quantity
                      </label>
                      <input
                        type="text"
                        value={obj.resultsFigures}
                        onChange={(e) => updateObjective(obj.id, 'resultsFigures', e.target.value)}
                        placeholder="e.g. 100% inspected, 24 bed trays verified"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                      />
                    </div>
                  </div>

                  {(obj.status === 'Partly Done' || obj.status === 'Not Done') && (
                    <div>
                      <label className="block text-xs font-semibold text-destructive  mb-1">
                        Reason if not completed * (Mandatory for compliance review)
                      </label>
                      <input
                        type="text"
                        value={obj.reasonIfNotCompleted || ''}
                        onChange={(e) => updateObjective(obj.id, 'reasonIfNotCompleted', e.target.value)}
                        placeholder="Explain constraints, weather disruption, or material shortages..."
                        className="w-full px-3 py-2 text-xs rounded-lg border border-destructive  bg-destructive-soft/40  text-foreground "
                        required
                      />
                    </div>
                  )}
                </div>

                {objectives.length > 1 && (
                  <Button variant="legacy"
                    type="button"
                    onClick={() => removeObjective(obj.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove objective"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: ACTIVITY DETAILS */}
      <div id="report-step-2" className="bg-card p-5 sm:p-7 rounded-xl border border-border shadow-[var(--shadow-soft)] space-y-5 fade-up">
        <div className="flex items-center justify-between border-b border-border  pb-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-normal text-primary">Section 3</span>
            <h2 className="text-base font-bold text-foreground ">
              Activity Details
            </h2>
            <p className="text-xs text-muted-foreground ">
              Record what you did, where, when and how much.
            </p>
          </div>
          <Button variant="legacy"
            type="button"
            onClick={addActivity}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary  hover:bg-brand-wash  rounded-lg border border-primary/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Activity</span>
          </Button>
        </div>

        <div className="space-y-4">
          {activities.map((act, index) => (
            <div key={act.id} className="p-4 rounded-lg border border-border  bg-muted/50  space-y-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold text-muted-foreground mt-2">
                  #{index + 1}
                </span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-12 lg:col-span-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-foreground ">
                        Time Range
                      </label>
                    </div>
                    {(() => { const [st = '', en = ''] = (act.time || '').split('-').map(x => x.trim()); const set = (ns: string, ne: string) => updateActivity(act.id, 'time', ns || ne ? `${ns} - ${ne}` : ''); return (
                      <div className="grid grid-cols-2 gap-2">
                        <input type="time" aria-label={`Activity ${index + 1} start time`} value={st} onChange={e => set(e.target.value, en)} className="w-full" />
                        <input type="time" aria-label={`Activity ${index + 1} end time`} value={en} onChange={e => set(st, e.target.value)} className="w-full" />
                      </div>); })()}
                  </div>

                  <div className="sm:col-span-6 lg:col-span-4">
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Activity / Task Description *
                    </label>
                    <input
                      type="text"
                      value={act.activityTask}
                      onChange={(e) => updateActivity(act.id, 'activityTask', e.target.value)}
                      placeholder="e.g. Botanical formulation mix Batch #42"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                      required
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Place / Person / Platform
                    </label>
                    <input
                      type="text"
                      value={act.placePersonPlatform}
                      onChange={(e) => updateActivity(act.id, 'placePersonPlatform', e.target.value)}
                      placeholder="e.g. Extraction Lab / Marcus Chen"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Quantity / Figures
                    </label>
                    <input
                      type="text"
                      value={act.quantityFigures}
                      onChange={(e) => updateActivity(act.id, 'quantityFigures', e.target.value)}
                      placeholder="e.g. 50 liters, 120 units"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                    />
                  </div>

                  <div className="sm:col-span-8">
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Outcome / Deliverable
                    </label>
                    <input
                      type="text"
                      value={act.outcome}
                      onChange={(e) => updateActivity(act.id, 'outcome', e.target.value)}
                      placeholder="e.g. Passed specific gravity quality test"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                    />
                  </div>
                </div>

                {activities.length > 1 && (
                  <Button variant="legacy"
                    type="button"
                    onClick={() => removeActivity(act.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove activity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: CHALLENGES OR INCIDENTS */}
      <div id="report-step-3" className="bg-card p-5 sm:p-7 rounded-xl border border-border shadow-[var(--shadow-soft)] space-y-5 fade-up">
        <div className="flex items-center justify-between border-b border-border  pb-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-normal text-primary">Section 4</span>
            <h2 className="text-base font-bold text-foreground ">
              Challenges or Incidents (Optional)
            </h2>
            <p className="text-xs text-muted-foreground ">
              Document problems encountered, field incidents, machine breakdowns, or delays.
            </p>
          </div>
          <Button variant="legacy"
            type="button"
            onClick={addChallenge}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary  hover:bg-brand-wash  rounded-lg border border-primary/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Incident / Challenge</span>
          </Button>
        </div>

        {challenges.length === 0 ? (
          <div className="p-4 rounded-lg bg-muted  text-xs text-muted-foreground text-center">
            No incidents or challenges logged for today. Click "Add Incident / Challenge" if problems occurred.
          </div>
        ) : (
          <div className="space-y-4">
            {challenges.map((ch, index) => (
              <div key={ch.id} className="p-4 rounded-lg border border-border  bg-muted/50  space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-bold text-muted-foreground mt-2">
                    #{index + 1}
                  </span>
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      <div className="sm:col-span-8">
                        <label className="block text-xs font-semibold text-foreground  mb-1">
                          Problem Encountered
                        </label>
                        <input
                          type="text"
                          value={ch.problemEncountered}
                          onChange={(e) => updateChallenge(ch.id, 'problemEncountered', e.target.value)}
                          placeholder="e.g. Sudden generator power dip paused distillation rig"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="block text-xs font-semibold text-foreground  mb-1">
                          When It Happened
                        </label>
                        <input
                          type="text"
                          value={ch.whenHappened}
                          onChange={(e) => updateChallenge(ch.id, 'whenHappened', e.target.value)}
                          placeholder="e.g. 14:15 during second boil"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                      <div className="sm:col-span-8">
                        <label className="block text-xs font-semibold text-foreground  mb-1">
                          Action Taken
                        </label>
                        <input
                          type="text"
                          value={ch.actionTaken}
                          onChange={(e) => updateChallenge(ch.id, 'actionTaken', e.target.value)}
                          placeholder="e.g. Switched to backup inverter and secured pressure valves"
                          className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                        />
                      </div>
                      <div className="sm:col-span-4 pt-4">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground ">
                          <input
                            type="checkbox"
                            checked={ch.resolved}
                            onChange={(e) => updateChallenge(ch.id, 'resolved', e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <span>Challenge was resolved</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <Button variant="legacy"
                    type="button"
                    onClick={() => removeChallenge(ch.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 5: PLAN / NEEDS FOR TOMORROW */}
      <div id="report-step-4" className="bg-card p-5 sm:p-7 rounded-xl border border-border shadow-[var(--shadow-soft)] space-y-5 fade-up">
        <div className="flex items-center justify-between border-b border-border  pb-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-normal text-primary">Section 5</span>
            <h2 className="text-base font-bold text-foreground ">
              Plan / Needs for Tomorrow
            </h2>
            <p className="text-xs text-muted-foreground ">
              Advance planning helps supervisors allocate tools, materials, and approvals.
            </p>
          </div>
          <Button variant="legacy"
            type="button"
            onClick={addTomorrowPlan}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-primary  hover:bg-brand-wash  rounded-lg border border-primary/40 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Plan Item</span>
          </Button>
        </div>

        <div className="space-y-4">
          {tomorrowPlans.map((plan, index) => (
            <div key={plan.id} className="p-4 rounded-lg border border-border  bg-muted/50  space-y-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-bold text-muted-foreground mt-2">
                  #{index + 1}
                </span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Planned Task
                    </label>
                    <input
                      type="text"
                      value={plan.plannedTask}
                      onChange={(e) => updateTomorrowPlan(plan.id, 'plannedTask', e.target.value)}
                      placeholder="e.g. Bottle 100 units of eucalyptus oil"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                    />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Resources Needed
                    </label>
                    <input
                      type="text"
                      value={plan.resourcesNeeded}
                      onChange={(e) => updateTomorrowPlan(plan.id, 'resourcesNeeded', e.target.value)}
                      placeholder="e.g. 100 amber bottles, tamper seals"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-foreground  mb-1">
                      Approvals Required
                    </label>
                    <input
                      type="text"
                      value={plan.approvalsRequired}
                      onChange={(e) => updateTomorrowPlan(plan.id, 'approvalsRequired', e.target.value)}
                      placeholder="e.g. Sarah Jenkins sign-off"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
                    />
                  </div>
                </div>

                {tomorrowPlans.length > 1 && (
                  <Button variant="legacy"
                    type="button"
                    onClick={() => removeTomorrowPlan(plan.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 6: SUPPORTING EVIDENCE */}
      <div id="report-step-5" className="bg-card p-5 sm:p-7 rounded-xl border border-border shadow-[var(--shadow-soft)] space-y-5 fade-up">
        <div className="border-b border-border  pb-3">
          <span className="text-xs font-bold uppercase tracking-normal text-primary">Section 6</span>
          <h2 className="text-base font-bold text-foreground ">
            Supporting Evidence & Attachments
          </h2>
          <p className="text-xs text-muted-foreground ">
            Upload photographs, test logs, receipts, or field survey notes. 
          </p>
        </div>

        <div>
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border  hover:border-primary rounded-lg p-6 cursor-pointer bg-muted/50  transition-colors">
            <Upload className="w-7 h-7 text-muted-foreground mb-2" />
            <span className="text-xs font-semibold text-foreground ">
              Click to select evidence files (Images, PDFs, Documents)
            </span>
            <span className="text-[11px] text-muted-foreground mt-1">
              Max 10MB per file · Evidence attachments
            </span>
            <input
              type="file"
              multiple
              accept="image/*,application/pdf,text/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>

        {attachments.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
            {attachments.map(att => (
              <div
                key={att.id}
                className="p-3 rounded-lg border border-border  bg-muted  flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground  truncate">
                      {att.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {(att.size / 1024).toFixed(1)} KB · {att.type.split('/')[1]?.toUpperCase() || 'FILE'}
                    </div>
                  </div>
                </div>
                <Button variant="legacy"
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title="Remove attachment"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Final Actions */}
      <div className="report-submit-actions flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4 bg-card/95 rounded-xl border border-border shadow-[var(--shadow-soft)]">
        <div><span className="text-xs text-muted-foreground">Review each section above, then save or submit.</span></div>
        <div className="flex items-center gap-3">
          <Button variant="legacy"
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="px-4 py-2 border border-border  text-foreground  text-xs font-semibold rounded-lg hover:bg-muted "
          >
            Save Draft
          </Button>
          <Button variant="legacy"
            type="button"
            onClick={() => {
              if (validate()) {
                setShowSubmitConfirm(true);
              } else { setStep(6); }
            }}
            disabled={isSaving}
            className="px-5 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm"
          >
            {isReturned ? 'Resubmit Report' : 'Submit Daily Report'}
          </Button>
        </div>
      </div>

      {/* Pre-Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card  rounded-lg shadow-2xl max-w-md w-full border border-border  p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success-soft  flex items-center justify-center text-primary">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-foreground  text-base">
                  Confirm Daily Report Submission
                </h3>
                <p className="text-xs text-muted-foreground">
                  {date} · {dayOfWeekName}
                </p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground  leading-relaxed">
              Once submitted, this daily report will be locked for review by {submittedToName}. You will receive a notification when the review is completed.
            </p>

            <div className="bg-muted  p-3 rounded-lg text-xs space-y-1.5 border border-border  font-medium">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Objectives Logged:</span>
                <span className="text-foreground  font-bold">{objectives.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Activities Logged:</span>
                <span className="text-foreground  font-bold">{activities.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Evidence Files:</span>
                <span className="text-foreground  font-bold">{attachments.length}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="legacy"
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground  hover:bg-muted  rounded-lg"
              >
                Back to Editing
              </Button>
              <Button variant="legacy"
                type="button"
                onClick={handleConfirmSubmit}
                disabled={isSaving}
                className="px-5 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-lg shadow-sm"
              >
                {isSaving ? 'Submitting...' : 'Yes, Submit Report'}
              </Button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};
