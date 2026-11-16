import { toast } from 'sonner';
import { readLocalDraft, writeLocalDraft, clearLocalDraft } from '@/lib/localDraft';
import { ReportDownloads } from '@/components/reports/ReportDownloads';
import { canReviewReport } from '@/services/access';
import { Button } from "@/components/ui/button";
import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Printer, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Sparkles, 
  Edit3, 
  ShieldCheck, 
  Send, 
  Check, 
  RotateCcw, 
  Star,
  ExternalLink,
  Save,
  Download,
  FileSpreadsheet
} from 'lucide-react';
import { WeeklyReport, DailyReport, User } from '../../types';
import { WeeklyReportService } from '../../services/storageService';
import { downloadCSV, exportReportWord, exportReportPdf, exportReportsToExcel } from '../../utils/exportUtils';

interface WeeklyReportDetailProps {
  report: WeeklyReport;
  dailyReports: DailyReport[];
  currentUser: User;
  onNavigate: (view: string, param?: string) => void;
  onReportUpdated: () => void;
}

export const WeeklyReportDetail: React.FC<WeeklyReportDetailProps> = ({
  report,
  dailyReports,
  currentUser,
  onNavigate,
  onReportUpdated
}) => {
  const isOwner = currentUser.id === report.employeeId;
  const isManagerOrAbove = currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'ceo';
  const canReview = canReviewReport(currentUser, report);
  const canEdit = isOwner && (report.status === 'draft' || report.status === 'returned');

  // Narrative text edit states (allows employee to refine Smart Assistant generated text before final submission)
  const [isEditingNarrative, setIsEditingNarrative] = useState(false);
  const [overview, setOverview] = useState(report.summaryOfWeek.overview);
  const [achievements, setAchievements] = useState(report.summaryOfWeek.achievements);
  const [shortfalls, setShortfalls] = useState(report.summaryOfWeek.shortfalls);
  const [keyFigures, setKeyFigures] = useState(report.summaryOfWeek.keyFigures);
  const [majorActivities, setMajorActivities] = useState(report.summaryOfWeek.majorActivities);
  const [additionalRecommendations, setAdditionalRecommendations] = useState(report.additionalRecommendations || '');
  const [employeeConfirmed, setEmployeeConfirmed] = useState(report.employeeConfirmation);

  // Review states
  // ---- Autosave the weekly narrative on this device ----
  const wkKey = `pp_draft_weekly_${currentUser.id}_${report.id}`;
  const canEditWeekly = report.employeeId === currentUser.id && (report.status === 'draft' || report.status === 'returned');
  const [wkHydrated, setWkHydrated] = useState(false);
  useEffect(() => {
    if (canEditWeekly) {
      const d = readLocalDraft<any>(wkKey);
      if (d && d.savedAt > (report.updatedAt ?? '')) {
        setOverview(d.overview ?? ''); setAchievements(d.achievements ?? ''); setShortfalls(d.shortfalls ?? ''); setKeyFigures(d.keyFigures ?? ''); setMajorActivities(d.majorActivities ?? '');
        setAdditionalRecommendations(d.additionalRecommendations ?? ''); setEmployeeConfirmed(!!d.employeeConfirmed); setIsEditingNarrative(true);
        toast.info('Your unsaved weekly changes were restored');
      }
    }
    setWkHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!wkHydrated || !canEditWeekly) return;
    const changed = overview !== report.summaryOfWeek.overview || achievements !== report.summaryOfWeek.achievements || shortfalls !== report.summaryOfWeek.shortfalls || keyFigures !== report.summaryOfWeek.keyFigures || majorActivities !== report.summaryOfWeek.majorActivities || additionalRecommendations !== (report.additionalRecommendations || '') || employeeConfirmed !== report.employeeConfirmation;
    if (!changed) return;
    const t = setTimeout(() => { writeLocalDraft(wkKey, { overview, achievements, shortfalls, keyFigures, majorActivities, additionalRecommendations, employeeConfirmed }); }, 600);
    return () => clearTimeout(t);
  }, [wkHydrated, overview, achievements, shortfalls, keyFigures, majorActivities, additionalRecommendations, employeeConfirmed]);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'returned'>('approved');
  const [reviewComments, setReviewComments] = useState('');
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Save changes to draft
  const handleSaveNarrativeChanges = async () => {
    const updated: WeeklyReport = {
      ...report,
      summaryOfWeek: {
        overview,
        achievements,
        shortfalls,
        keyFigures,
        majorActivities
      },
      additionalRecommendations,
      employeeConfirmation: employeeConfirmed
    };
    await WeeklyReportService.saveReport(updated, currentUser);
    clearLocalDraft(wkKey);
    setIsEditingNarrative(false);
    onReportUpdated();
  };

  // Submit weekly report for management review
  const handleSubmitWeeklyReport = async () => {
    if (!employeeConfirmed) {
      toast.warning('Confirmation required', { description: 'Tick the confirmation box to confirm this report reflects your week.' });
      return;
    }
    // Save latest narrative edits first
    await handleSaveNarrativeChanges();
    await WeeklyReportService.submitReport(report.id, currentUser);
    onReportUpdated();
  };

  // Supervisor Review handler
  const handleSubmitReview = async () => {
    setReviewError(null);
    if (reviewDecision === 'returned' && !reviewComments.trim()) {
      setReviewError('A detailed reason is required when returning a weekly report for correction.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      await WeeklyReportService.reviewReport(
        report.id,
        reviewDecision,
        reviewComments.trim() || 'Weekly report verified and approved in accordance with operational objectives.',
        reviewRating,
        currentUser
      );
      setShowReviewModal(false);
      onReportUpdated();
    } catch (err: any) {
      setReviewError(err.message || 'Failed to submit review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleExportWord = () => { void exportReportWord(report); };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Navigation & Controls Bar (hidden during print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card  p-4 sm:p-6 rounded-lg border border-border  shadow-xs">
        <div className="flex items-center gap-3">
          <Button variant="legacy"
            onClick={() => onNavigate('weekly_reports')}
            className="p-2 text-muted-foreground hover:text-foreground  rounded-lg hover:bg-muted  transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted-foreground ">
                {report.reportCode}
              </span>
              <span className={`
                text-[10px] font-bold uppercase px-2 py-0.5 rounded
                ${report.status === 'approved' ? 'bg-success-soft text-success  ' : ''}
                ${report.status === 'submitted' ? 'bg-info-soft text-info  ' : ''}
                ${report.status === 'returned' ? 'bg-destructive-soft text-destructive  ' : ''}
                ${report.status === 'draft' ? 'bg-warning-soft text-warning  ' : ''}
              `}>
                {report.status}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground  leading-tight mt-0.5">
              Week {report.weekNumber} Report · {report.employeeName}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ReportDownloads report={report} dailyReports={dailyReports} />
          {/* Edit Narrative Toggle for Employee */}
          {canEdit && (
            <Button variant="legacy"
              onClick={() => setIsEditingNarrative(!isEditingNarrative)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-success  text-primary  hover:bg-brand-wash  text-xs font-semibold rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingNarrative ? 'Lock Narrative' : 'Edit Narrative'}</span>
            </Button>
          )}

          {/* Submit Action for Draft */}
          {canEdit && (
            <Button variant="legacy"
              onClick={handleSubmitWeeklyReport}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit Weekly Report</span>
            </Button>
          )}

          {/* Review Action for Manager/Admin */}
          {canReview && (
            <Button variant="legacy"
              onClick={() => setShowReviewModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Review & Grade</span>
            </Button>
          )}
        </div>
      </div>

      {/* Official Weekly Report Sheet View */}
      <div className="bg-card  rounded-lg border border-border  report-document shadow-md p-6 sm:p-10 space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="border-b-2 border-primary pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-primary uppercase tracking-normal">
              Plants and Pure
            </div>
            <h2 className="text-2xl font-extrabold text-primary  mt-1">
              STAFF WEEKLY REPORT SHEET
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated Aggregation from Verified Monday–Friday Daily Logs
            </p>
          </div>
          <div className="sm:text-right font-mono text-xs">
            <div className="font-bold text-foreground ">
              {report.reportCode}
            </div>
            <div className="text-muted-foreground">
              Week {report.weekNumber}, {report.year} ({report.startDate} to {report.endDate})
            </div>
          </div>
        </div>

        {/* Section 1: Staff Profile Meta Grid & Completeness Status */}
        <div className="bg-background  p-5 rounded-lg border border-border  grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground block font-medium">Employee Name:</span>
            <span className="font-bold text-foreground ">{report.employeeName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Staff ID & Designation:</span>
            <span className="font-bold text-foreground  font-mono">{report.employeeCode} · {report.roleTitle}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Department:</span>
            <span className="font-bold text-foreground ">{report.department}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Dates Covered:</span>
            <span className="font-bold text-foreground ">
              {report.startDate} (Mon) to {report.endDate} (Fri)
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Daily Reports Available:</span>
            <span className="font-bold text-success  tabular-nums">
              {report.dailyReportsCount} of {report.totalDaysExpected} Days Logged
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Objective Completion Rate:</span>
            <span className="font-bold text-primary  tabular-nums">
              {report.completionRate}% Met ({report.totalObjectivesCompleted}/{report.totalObjectivesAssigned})
            </span>
          </div>
        </div>

        {/* Missing Days Alert if incomplete */}
        {!report.completenessStatus?.isComplete && report.completenessStatus?.missingDates?.length > 0 && (
          <div className="p-3 bg-warning-soft  border border-warning  rounded-lg text-xs text-warning  flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            <span>
              <strong>Note on incomplete submission:</strong> Daily reports were not logged for {report.completenessStatus.missingDates.join(', ')}. Available records were compiled.
            </span>
          </div>
        )}

        {/* Section 2: Summary of the Week (Executive Narrative) */}
        <div className="space-y-4">
          <div className="border-b border-border  pb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary  flex items-center gap-2">
              <span>2. Summary of the Week</span>
              <span className="text-[10px] bg-success-soft text-success   font-semibold px-1.5 py-0.2 rounded font-sans">
                Smart Assistant Engine
              </span>
            </h3>
            {isEditingNarrative && (
              <Button variant="legacy"
                onClick={handleSaveNarrativeChanges}
                className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Narrative Edits</span>
              </Button>
            )}
          </div>

          <div className="space-y-3 text-xs leading-relaxed">
            {/* Overview */}
            <div className="p-4 rounded-lg bg-muted  border border-border/80 ">
              <span className="font-bold text-foreground  block mb-1">
                Weekly Operational Overview
              </span>
              {isEditingNarrative ? (
                <textarea
                  rows={2}
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                  className="w-full p-2 text-xs rounded border border-border  bg-card "
                />
              ) : (
                <p className="text-foreground ">{overview}</p>
              )}
            </div>

            {/* Achievements */}
            <div className="p-4 rounded-lg bg-success-soft/40  border border-success/60 ">
              <span className="font-bold text-success  block mb-1">
                Key Achievements & Deliverables
              </span>
              {isEditingNarrative ? (
                <textarea
                  rows={2}
                  value={achievements}
                  onChange={(e) => setAchievements(e.target.value)}
                  className="w-full p-2 text-xs rounded border border-border  bg-card "
                />
              ) : (
                <p className="text-foreground ">{achievements}</p>
              )}
            </div>

            {/* Shortfalls */}
            <div className="p-4 rounded-lg bg-muted  border border-border/80 ">
              <span className="font-bold text-foreground  block mb-1">
                Shortfalls & Non-Accomplishments
              </span>
              {isEditingNarrative ? (
                <textarea
                  rows={2}
                  value={shortfalls}
                  onChange={(e) => setShortfalls(e.target.value)}
                  className="w-full p-2 text-xs rounded border border-border  bg-card "
                />
              ) : (
                <p className="text-foreground ">{shortfalls}</p>
              )}
            </div>

            {/* Key Figures & Major Activities */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-muted  border border-border/80 ">
                <span className="font-bold text-foreground  block mb-1">
                  Key Aggregated Figures
                </span>
                {isEditingNarrative ? (
                  <textarea
                    rows={2}
                    value={keyFigures}
                    onChange={(e) => setKeyFigures(e.target.value)}
                    className="w-full p-2 text-xs rounded border border-border  bg-card "
                  />
                ) : (
                  <p className="text-foreground  font-mono text-[11px]">{keyFigures}</p>
                )}
              </div>

              <div className="p-4 rounded-lg bg-muted  border border-border/80 ">
                <span className="font-bold text-foreground  block mb-1">
                  Primary Focus Areas
                </span>
                {isEditingNarrative ? (
                  <textarea
                    rows={2}
                    value={majorActivities}
                    onChange={(e) => setMajorActivities(e.target.value)}
                    className="w-full p-2 text-xs rounded border border-border  bg-card "
                  />
                ) : (
                  <p className="text-foreground ">{majorActivities}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Daily Objectives Review (Monday to Friday Breakdown) */}
        <div className="space-y-3">
          <div className="border-b border-border  pb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
              3. Daily Objectives Review (Monday to Friday)
            </h3>
            <span className="text-xs text-muted-foreground">
              Pulled directly from verified daily reports
            </span>
          </div>

          <div className="space-y-3">
            {report.dailyObjectivesReview?.map(day => (
              <div 
                key={day.date} 
                className="p-3.5 rounded-lg border border-border  bg-background  text-xs"
              >
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/60 ">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground ">
                      {day.dayName} ({day.date})
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      · {day.items.length} Objective(s)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-semibold text-[11px]">
                    <span className="text-success ">
                      Done: {day.objectivesAchieved}
                    </span>
                    <span className="text-warning ">
                      Partly: {day.objectivesPartlyAchieved}
                    </span>
                    <span className="text-destructive ">
                      Not Done: {day.objectivesNotAchieved}
                    </span>
                  </div>
                </div>

                {day.items.length === 0 ? (
                  <div className="text-muted-foreground italic py-1">
                    No daily report filed for this date.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {day.items.map((item, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-3 text-foreground ">
                        <div className="flex-1">
                          <span className="font-medium">{item.objective}</span>
                          {item.results && (
                            <span className="text-muted-foreground block text-[11px]">Results: {item.results}</span>
                          )}
                          {item.reason && (
                            <span className="text-destructive  italic block text-[11px]">Reason: {item.reason}</span>
                          )}
                        </div>
                        <span className={`
                          font-bold text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0
                          ${item.status === 'Done' ? 'bg-success-soft text-success  ' : ''}
                          ${item.status === 'Partly Done' ? 'bg-warning-soft text-warning  ' : ''}
                          ${item.status === 'Not Done' ? 'bg-destructive-soft text-destructive  ' : ''}
                        `}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Key Results and Figures Consolidated Cards */}
        <div className="space-y-3">
          <div className="border-b border-border  pb-2">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
              4. Key Results & Figures
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {report.keyResultsFigures?.map((res, i) => (
              <div key={i} className="p-4 rounded-lg border border-border  bg-card  shadow-2xs space-y-2">
                <div className="text-xs font-bold text-foreground  leading-tight">
                  {res.itemActivity}
                </div>
                <div className="flex items-baseline justify-between pt-1 border-t border-border ">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Actual Output</span>
                    <span className="text-sm font-bold font-mono text-primary ">{res.actual}</span>
                  </div>
                  {res.target && res.target !== 'Not specified' && (
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground block">Target</span>
                      <span className="text-xs text-muted-foreground  font-medium">{res.target}</span>
                    </div>
                  )}
                </div>
                {res.comments && (
                  <div className="text-[11px] text-muted-foreground  bg-muted  p-2 rounded-lg border border-border ">
                    {res.comments}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Section 5: Challenges & Resolution Cards */}
        <div className="space-y-3">
          <div className="border-b border-border  pb-2">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
              5. Challenges & Incident Management
            </h3>
          </div>

          {report.challengesGrouped && report.challengesGrouped.length > 0 ? (
            <div className="space-y-3">
              {report.challengesGrouped.map((c, i) => (
                <div key={i} className="p-4 rounded-lg border border-warning  bg-warning-soft/40  space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-normal text-warning  bg-warning-soft  px-2 py-0.5 rounded">
                        {c.category}
                      </span>
                      <h4 className="text-xs font-bold text-foreground  mt-1.5">
                        {c.problem}
                      </h4>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                      c.resolved ? 'bg-success text-primary-foreground' : 'bg-warning text-primary-foreground'
                    }`}>
                      {c.resolved ? 'Resolved' : 'Pending'}
                    </span>
                  </div>
                  <div className="text-xs text-foreground  bg-card/70  p-2.5 rounded-lg border border-warning/50">
                    <span className="font-semibold text-muted-foreground ">Action Taken: </span>
                    <span>{c.actionTaken}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 text-xs text-muted-foreground bg-muted  rounded-lg">
              No operational challenges or incidents recorded during the active reporting days.
            </div>
          )}
        </div>

        {/* Section 6: Recommendations & Plan for Next Week Cards */}
        <div className="space-y-3">
          <div className="border-b border-border  pb-2">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
              6. Recommendations & Plan for Next Week
            </h3>
          </div>

          <div className="space-y-3">
            {report.recommendationsNextWeek?.map((r, i) => (
              <div key={i} className="p-4 rounded-lg border border-border  bg-card  shadow-2xs space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-muted  text-muted-foreground  text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <h4 className="text-xs font-bold text-foreground ">
                      {r.plannedActivity}
                    </h4>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-muted  p-2.5 rounded-lg border border-border ">
                    <span className="font-semibold text-muted-foreground block text-[10px] uppercase tracking-normal mb-0.5">Recommendation</span>
                    <span className="text-foreground  font-medium">{r.recommendation}</span>
                  </div>
                  <div className="bg-muted  p-2.5 rounded-lg border border-border ">
                    <span className="font-semibold text-muted-foreground block text-[10px] uppercase tracking-normal mb-0.5">Resources Needed</span>
                    <span className="text-foreground  font-medium">{r.resourcesNeeded || 'Standard departmental tools'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Additional employee recommendations */}
          <div className="mt-2">
            <label className="block text-xs font-semibold text-foreground  mb-1">
              Additional Notes or Strategic Recommendations:
            </label>
            {isEditingNarrative ? (
              <textarea
                rows={2}
                value={additionalRecommendations}
                onChange={(e) => setAdditionalRecommendations(e.target.value)}
                placeholder="Add special equipment requests, process improvement suggestions..."
                className="w-full p-2 text-xs rounded border border-border  bg-card "
              />
            ) : (
              <p className="text-xs text-foreground  p-2.5 bg-muted  rounded border border-border  italic">
                {report.additionalRecommendations || 'None recorded.'}
              </p>
            )}
          </div>
        </div>

        {/* Section 7: Employee Confirmation & Digital Signoff */}
        <div className="p-4 rounded-lg border border-border  bg-background  space-y-3">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="confirmCheck"
              disabled={!canEdit}
              checked={employeeConfirmed}
              onChange={(e) => setEmployeeConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="confirmCheck" className="text-xs text-foreground  cursor-pointer">
              <span className="font-bold text-foreground  block">
                Employee Confirmation & Accountability Sign-off
              </span>
              I, <strong>{report.employeeName}</strong>, hereby confirm that the objectives, metrics, and activities compiled in this weekly report accurately represent my actual operational output for Week {report.weekNumber}.
            </label>
          </div>

          {report.employeeSubmittedAt && (
            <div className="text-[11px] text-muted-foreground font-mono">
              Digitally confirmed & submitted at {new Date(report.employeeSubmittedAt).toLocaleString()}
            </div>
          )}
        </div>

        {/* Supervisor Review Ratings & Comments */}
        {report.reviews && report.reviews.length > 0 && (
          <div className="p-5 rounded-lg border border-success  bg-success-soft/40  space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-success" />
                <span className="font-bold text-xs uppercase tracking-normal text-success ">
                  Supervisor Performance Evaluation
                </span>
              </div>
              {report.reviews[0]?.rating && (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${star <= (report.reviews[0]?.rating || 0) ? 'text-warning fill-warning' : 'text-muted-foreground'}`}
                    />
                  ))}
                  <span className="text-xs font-bold text-foreground  ml-1">
                    {report.reviews[0]?.rating} / 5
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs sm:text-sm text-foreground  italic">
              "{report.reviews[0]?.comments}"
            </p>

            <div className="text-[11px] text-muted-foreground pt-1 border-t border-success/40  flex justify-between">
              <span>Evaluated by {report.reviews[0]?.reviewerName} ({report.reviews[0]?.reviewerRole})</span>
              <span>{new Date(report.reviews[0]?.reviewedAt ?? report.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Print-Only Signature Blocks */}
        <div className="print-only pt-8 grid grid-cols-2 gap-12 text-xs border-t border-border">
          <div>
            <div className="border-b border-border pb-12 mb-1"></div>
            <div className="font-bold">{report.employeeName}</div>
            <div className="text-muted-foreground">Employee Signature & Date</div>
          </div>
          <div>
            <div className="border-b border-border pb-12 mb-1"></div>
            <div className="font-bold">{report.submittedToName || 'Supervisor'}</div>
            <div className="text-muted-foreground">Supervisor / CEO Sign-off</div>
          </div>
        </div>
      </div>

      {/* Supervisor Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card  rounded-lg shadow-2xl max-w-lg w-full border border-border  p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground ">
                  Review Weekly Report: {report.reportCode}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {report.employeeName} · Week {report.weekNumber}
                </p>
              </div>
            </div>

            {reviewError && (
              <div className="p-3 bg-destructive-soft text-xs text-destructive rounded-lg">
                {reviewError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-foreground  mb-2">
                Evaluation Decision *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="legacy"
                  type="button"
                  onClick={() => setReviewDecision('approved')}
                  className={`
                    p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2
                    ${reviewDecision === 'approved' 
                      ? 'bg-success-soft  border-success text-success  ring-2 ring-success/20' 
                      : 'border-border  text-muted-foreground'}
                  `}
                >
                  <Check className="w-4 h-4 text-success" />
                  <span>Accept Weekly Report</span>
                </Button>

                <Button variant="legacy"
                  type="button"
                  onClick={() => setReviewDecision('returned')}
                  className={`
                    p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2
                    ${reviewDecision === 'returned' 
                      ? 'bg-destructive-soft  border-destructive text-destructive  ring-2 ring-destructive/20' 
                      : 'border-border  text-muted-foreground'}
                  `}
                >
                  <RotateCcw className="w-4 h-4 text-destructive" />
                  <span>Return for Revisions</span>
                </Button>
              </div>
            </div>

            {reviewDecision === 'approved' && (
              <div>
                <label className="block text-xs font-semibold text-foreground  mb-1">
                  Weekly Performance Rating (1 to 5 Stars):
                </label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Button variant="legacy"
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-6 h-6 ${star <= reviewRating ? 'text-warning fill-warning' : 'text-muted-foreground'}`}
                      />
                    </Button>
                  ))}
                  <span className="text-xs font-bold text-muted-foreground  ml-2">
                    {reviewRating === 5 ? 'Exemplary' : reviewRating === 4 ? 'Exceeds Standards' : reviewRating === 3 ? 'Meets Standards' : 'Needs Support'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-foreground  mb-1">
                {reviewDecision === 'returned' ? 'Mandatory Revision Feedback *' : 'Supervisor Comments & Commendation:'}
              </label>
              <textarea
                rows={3}
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder={reviewDecision === 'returned' 
                  ? 'Detail what figures, objectives, or activities must be clarified before sign-off...' 
                  : 'Well organized deliverables, strong adherence to field targets...'}
                className="w-full p-2.5 text-xs rounded-lg border border-border  bg-card  text-foreground "
                required={reviewDecision === 'returned'}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="legacy"
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground  hover:bg-muted rounded-lg"
              >
                Cancel
              </Button>
              <Button variant="legacy"
                type="button"
                onClick={handleSubmitReview}
                disabled={isSubmittingReview}
                className="px-5 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-lg shadow-sm"
              >
                {isSubmittingReview ? 'Submitting...' : 'Confirm Evaluation'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
