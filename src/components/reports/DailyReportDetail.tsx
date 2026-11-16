import { ReportDownloads } from '@/components/reports/ReportDownloads';
import { canReviewReport } from '@/services/access';
import { Button } from "@/components/ui/button";
import React, { useState } from 'react';
import { 
  ArrowLeft, 
  Printer, 
  FileText, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Paperclip, 
  Edit3, 
  ShieldCheck, 
  Send,
  Eye,
  Check,
  RotateCcw,
  UserCheck
} from 'lucide-react';
import { DailyReport, User } from '../../types';
import { DailyReportService } from '../../services/storageService';
import { downloadCSV, exportReportWord, exportReportPdf, exportReportsToExcel } from '../../utils/exportUtils';

interface DailyReportDetailProps {
  report: DailyReport;
  currentUser: User;
  onNavigate: (view: string, param?: string) => void;
  onReportUpdated: () => void;
}

export const DailyReportDetail: React.FC<DailyReportDetailProps> = ({
  report,
  currentUser,
  onNavigate,
  onReportUpdated
}) => {
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'returned'>('approved');
  const [reviewComments, setReviewComments] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const isOwner = currentUser.id === report.employeeId;
  const isManagerOrAbove = currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'ceo';
  const canReview = canReviewReport(currentUser, report);
  const canEdit = isOwner && (report.status === 'draft' || report.status === 'returned');

  // Submit Review Handler
  const handleSubmitReview = async () => {
    setReviewError(null);
    if (reviewDecision === 'returned' && !reviewComments.trim()) {
      setReviewError('A detailed reason is required when returning a report for correction.');
      return;
    }

    setIsSubmittingReview(true);
    try {
      await DailyReportService.reviewReport(
        report.id, 
        reviewDecision, 
        reviewComments.trim() || 'Approved. Report conforms to quality guidelines.', 
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
      {/* Top Navigation & Action Controls Bar (hidden during print) */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card  p-4 sm:p-6 rounded-lg border border-border  shadow-xs">
        <div className="flex items-center gap-3">
          <Button variant="legacy"
            onClick={() => onNavigate('daily_reports')}
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
              {report.employeeName} · {report.date} ({report.dayOfWeek})
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ReportDownloads report={report} />
          {/* Edit Button if allowed */}
          {canEdit && (
            <Button variant="legacy"
              onClick={() => onNavigate('daily_report_edit', report.id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{report.status === 'returned' ? 'Fix and Resubmit' : 'Edit Draft'}</span>
            </Button>
          )}

          {/* Review Button if Manager/Admin */}
          {canReview && (
            <Button variant="legacy"
              onClick={() => setShowReviewModal(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Review Report</span>
            </Button>
          )}
        </div>
      </div>

      {/* Official Report Document Sheet (Styled for Screen and High Fidelity Print) */}
      <div className="bg-card  rounded-lg border border-border  report-document shadow-md p-6 sm:p-10 space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Document Header */}
        <div className="border-b-2 border-primary pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-primary uppercase tracking-normal">
              Plants and Pure
            </div>
            <h2 className="text-2xl font-extrabold text-primary  mt-1">
              STAFF DAILY REPORT SHEET
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Official Operational Activity & Objective Performance Log
            </p>
          </div>
          <div className="sm:text-right font-mono text-xs">
            <div className="font-bold text-foreground ">
              {report.reportCode}
            </div>
            <div className="text-muted-foreground">
              Submitted: {report.submittedAt ? new Date(report.submittedAt).toLocaleString() : 'Draft Mode'}
            </div>
          </div>
        </div>

        {/* Section 1: Staff Profile Meta Grid */}
        <div className="bg-background  p-5 rounded-lg border border-border  grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground block font-medium">Employee Name:</span>
            <span className="font-bold text-foreground ">{report.employeeName}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Employee ID:</span>
            <span className="font-bold text-foreground  font-mono">{report.employeeCode}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Designation / Role:</span>
            <span className="font-bold text-foreground ">{report.roleTitle}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Department:</span>
            <span className="font-bold text-foreground ">{report.department}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Reporting Date & Period:</span>
            <span className="font-bold text-foreground ">
              {report.date} ({report.dayOfWeek}) · {report.reportingPeriod}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Submitted To:</span>
            <span className="font-bold text-foreground ">{report.submittedToName || 'Supervisor'}</span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Working Hours:</span>
            <span className="font-bold text-foreground  font-mono tabular-nums">
              {report.startTime} — {report.endTime}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block font-medium">Current Status:</span>
            <span className="font-bold text-primary uppercase tracking-normal">
              {report.status}
            </span>
          </div>
        </div>

        {/* Section 2: Objectives Cards */}
        <div className="space-y-3">
          <div className="border-b border-border  pb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
              1. Today's Objectives
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              {report.objectives?.length || 0} Objective(s) Recorded
            </span>
          </div>

          <div className="space-y-3">
            {report.objectives?.map((obj, i) => (
              <div key={obj.id} className="p-4 rounded-lg border border-border  bg-card  shadow-2xs space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-accent  text-primary  font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <h4 className="text-xs font-bold text-foreground  leading-relaxed">
                      {obj.objective}
                    </h4>
                  </div>
                  <span className={`
                    px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0
                    ${obj.status === 'Done' ? 'bg-success-soft  text-success ' : ''}
                    ${obj.status === 'Partly Done' ? 'bg-warning-soft  text-warning ' : ''}
                    ${obj.status === 'Not Done' ? 'bg-destructive-soft  text-destructive ' : ''}
                  `}>
                    {obj.status}
                  </span>
                </div>

                {obj.resultsFigures && (
                  <div className="text-xs text-foreground  bg-muted  p-2.5 rounded-lg border border-border  flex items-baseline gap-2">
                    <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-normal shrink-0">Results / Output:</span>
                    <span className="font-medium text-foreground ">{obj.resultsFigures}</span>
                  </div>
                )}

                {obj.reasonIfNotCompleted && (
                  <div className="text-xs text-destructive  bg-destructive-soft/60  p-2.5 rounded-lg border border-destructive ">
                    <span className="font-semibold">Reason incomplete:</span> {obj.reasonIfNotCompleted}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Section 3: Activity Details Cards */}
        <div className="space-y-3">
          <div className="border-b border-border  pb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
              2. Activity Details
            </h3>
            <span className="text-xs text-muted-foreground font-mono">
              {report.activities?.length || 0} Task(s) Documented
            </span>
          </div>

          <div className="space-y-3">
            {report.activities?.map((act, i) => (
              <div key={act.id} className="p-4 rounded-lg border border-border  bg-card  shadow-2xs space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-foreground ">
                    {act.activityTask}
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-md bg-muted  text-foreground  font-mono text-[11px] font-semibold border border-border ">
                    {act.time}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {act.placePersonPlatform && (
                    <div className="text-muted-foreground ">
                      <span className="font-semibold text-muted-foreground">Location / Platform: </span>
                      <span className="text-foreground  font-medium">{act.placePersonPlatform}</span>
                    </div>
                  )}
                  {act.quantityFigures && (
                    <div className="text-muted-foreground ">
                      <span className="font-semibold text-muted-foreground">Quantity / Figures: </span>
                      <span className="text-foreground  font-mono font-bold">{act.quantityFigures}</span>
                    </div>
                  )}
                </div>

                {act.outcome && (
                  <div className="text-xs text-foreground  bg-background  p-2.5 rounded-lg border border-border ">
                    <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-normal block mb-0.5">Outcome:</span>
                    <span>{act.outcome}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Challenges Cards (if any) */}
        {report.challenges && report.challenges.length > 0 && (
          <div className="space-y-3">
            <div className="border-b border-border  pb-2">
              <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
                3. Challenges or Incidents Encountered
              </h3>
            </div>

            <div className="space-y-3">
              {report.challenges.map(ch => (
                <div key={ch.id} className="p-4 rounded-lg border border-warning  bg-warning-soft/40  space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-bold text-xs text-warning ">
                      {ch.problemEncountered}
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                      ch.resolved ? 'bg-success text-primary-foreground' : 'bg-warning text-primary-foreground'
                    }`}>
                      {ch.resolved ? 'Resolved' : 'Pending Action'}
                    </span>
                  </div>
                  {ch.whenHappened && (
                    <div className="text-[11px] text-muted-foreground font-mono">
                      Time Encountered: {ch.whenHappened}
                    </div>
                  )}
                  <div className="text-xs text-foreground  bg-card/70  p-2.5 rounded-lg border border-warning/50">
                    <span className="font-semibold text-muted-foreground ">Action Taken: </span>
                    <span>{ch.actionTaken}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 5: Tomorrow's Plans Cards */}
        <div className="space-y-3">
          <div className="border-b border-border  pb-2">
            <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
              4. Plan / Needs for Tomorrow
            </h3>
          </div>

          <div className="space-y-3">
            {report.tomorrowPlans?.map((p, i) => (
              <div key={p.id} className="p-4 rounded-lg border border-border  bg-card  shadow-2xs space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-muted  text-muted-foreground  text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <h4 className="text-xs font-bold text-foreground ">
                    {p.plannedTask}
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-muted  p-2.5 rounded-lg border border-border ">
                    <span className="font-semibold text-muted-foreground block text-[10px] uppercase tracking-normal mb-0.5">Resources Needed</span>
                    <span className="text-foreground  font-medium">{p.resourcesNeeded || 'Standard departmental tools'}</span>
                  </div>
                  <div className="bg-muted  p-2.5 rounded-lg border border-border ">
                    <span className="font-semibold text-muted-foreground block text-[10px] uppercase tracking-normal mb-0.5">Approvals Required</span>
                    <span className="text-foreground  font-medium">{p.approvalsRequired || 'None required'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 6: Evidence Gallery */}
        {report.attachments && report.attachments.length > 0 && (
          <div className="space-y-3 print-break-inside-avoid">
            <div className="border-b border-border  pb-2">
              <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
                5. Attached Evidence & Records ({report.attachments.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {report.attachments.map(att => (
                <div
                  key={att.id}
                  className="p-3 rounded-lg border border-border  bg-background  flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Paperclip className="w-4 h-4 text-success shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground  truncate">
                        {att.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        {(att.size / 1024).toFixed(1)} KB · {att.type}
                      </div>
                    </div>
                  </div>
                  {att.dataUrl && (
                    <a
                      href={att.dataUrl}
                      download={att.name}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary font-bold hover:underline shrink-0 ml-2"
                    >
                      Download
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Supervisor Reviews & Audit Trail */}
        {report.reviews && report.reviews.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-border  print-break-inside-avoid">
            <div className="border-b border-border  pb-2">
              <h3 className="text-sm font-bold uppercase tracking-normal text-primary ">
                Management Review History
              </h3>
            </div>

            <div className="space-y-3">
              {report.reviews.map(rev => (
                <div
                  key={rev.id}
                  className={`
                    p-4 rounded-lg border text-xs
                    ${rev.decision === 'approved' 
                      ? 'bg-success-soft/50  border-success ' 
                      : 'bg-destructive-soft/50  border-destructive '}
                  `}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground ">
                        {rev.reviewerName}
                      </span>
                      <span className="text-muted-foreground">({rev.reviewerRole})</span>
                    </div>
                    <span className={`
                      font-bold uppercase text-[10px] px-2 py-0.5 rounded
                      ${rev.decision === 'approved' ? 'bg-success text-primary-foreground' : 'bg-destructive text-primary-foreground'}
                    `}>
                      {rev.decision}
                    </span>
                  </div>
                  <p className="text-foreground  italic">
                    "{rev.comments}"
                  </p>
                  <div className="mt-2 text-[10px] text-muted-foreground">
                    Reviewed on {new Date(rev.reviewedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Printable Official Sign-Off Line */}
        <div className="print-only pt-8 grid grid-cols-2 gap-12 text-xs border-t border-border">
          <div>
            <div className="border-b border-border pb-12 mb-1"></div>
            <div className="font-bold">{report.employeeName}</div>
            <div className="text-muted-foreground">Employee Signature & Date</div>
          </div>
          <div>
            <div className="border-b border-border pb-12 mb-1"></div>
            <div className="font-bold">{report.submittedToName || 'Supervisor'}</div>
            <div className="text-muted-foreground">Reviewing Officer Signature & Date</div>
          </div>
        </div>
      </div>

      {/* Review Modal for Manager / Admin */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card  rounded-lg shadow-2xl max-w-lg w-full border border-border  p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground ">
                  Review Report: {report.reportCode}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {report.employeeName} · {report.date}
                </p>
              </div>
              <span className="text-xs font-semibold text-primary">
                Reviewer: {currentUser.name}
              </span>
            </div>

            {reviewError && (
              <div className="p-3 bg-destructive-soft  border border-destructive text-xs text-destructive  rounded-lg">
                {reviewError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-foreground  mb-2">
                Review Decision *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="legacy"
                  type="button"
                  onClick={() => setReviewDecision('approved')}
                  className={`
                    p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all
                    ${reviewDecision === 'approved' 
                      ? 'bg-success-soft  border-success text-success  ring-2 ring-success/20' 
                      : 'border-border  text-muted-foreground  hover:bg-muted '}
                  `}
                >
                  <Check className="w-4 h-4 text-success" />
                  <span>Accept & Approve</span>
                </Button>

                <Button variant="legacy"
                  type="button"
                  onClick={() => setReviewDecision('returned')}
                  className={`
                    p-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 transition-all
                    ${reviewDecision === 'returned' 
                      ? 'bg-destructive-soft  border-destructive text-destructive  ring-2 ring-destructive/20' 
                      : 'border-border  text-muted-foreground  hover:bg-muted '}
                  `}
                >
                  <RotateCcw className="w-4 h-4 text-destructive" />
                  <span>Return for Correction</span>
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground  mb-1">
                {reviewDecision === 'returned' 
                  ? 'Correction Comments * (Explain what must be revised before approval)' 
                  : 'Supervisor Comments (Optional feedback or commendation)'}
              </label>
              <textarea
                rows={3}
                value={reviewComments}
                onChange={(e) => setReviewComments(e.target.value)}
                placeholder={reviewDecision === 'returned' 
                  ? 'Please specify missing information, unclear tasks, or missing evidence...' 
                  : 'Great consistency on tasks today...'}
                className="w-full p-2.5 text-xs rounded-lg border border-border  bg-card  text-foreground "
                required={reviewDecision === 'returned'}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="legacy"
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-muted-foreground  hover:bg-muted  rounded-lg"
              >
                Cancel
              </Button>
              <Button variant="legacy"
                type="button"
                onClick={handleSubmitReview}
                disabled={isSubmittingReview}
                className="px-5 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-lg shadow-sm"
              >
                {isSubmittingReview ? 'Submitting...' : 'Confirm Decision'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
