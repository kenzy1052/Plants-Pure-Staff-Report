import { Button } from "@/components/ui/button";
import React, { useState } from 'react';
import { 
  CheckSquare, 
  FileText, 
  CalendarCheck, 
  Clock, 
  Check, 
  RotateCcw, 
  AlertCircle, 
  User, 
  ArrowRight,
  Filter
} from 'lucide-react';
import { DailyReport, WeeklyReport, User as UserType } from '../../types';
import { DailyReportService, WeeklyReportService } from '../../services/storageService';

interface ApprovalsHubProps {
  currentUser: UserType;
  dailyReports: DailyReport[];
  weeklyReports: WeeklyReport[];
  onNavigate: (view: string, param?: string) => void;
  onRefreshData: () => void;
}

export const ApprovalsHub: React.FC<ApprovalsHubProps> = ({
  currentUser,
  dailyReports,
  weeklyReports,
  onNavigate,
  onRefreshData
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'daily' | 'weekly'>('all');
  const [selectedDept, setSelectedDept] = useState('all');

  const pendingDaily = dailyReports.filter(r => r.status === 'submitted');
  const pendingWeekly = weeklyReports.filter(w => w.status === 'submitted');

  const filteredDaily = pendingDaily.filter(r => {
    if (selectedDept !== 'all' && !r.department.toLowerCase().includes(selectedDept.toLowerCase())) return false;
    return true;
  });

  const filteredWeekly = pendingWeekly.filter(w => {
    if (selectedDept !== 'all' && !w.department.toLowerCase().includes(selectedDept.toLowerCase())) return false;
    return true;
  });

  const totalPending = pendingDaily.length + pendingWeekly.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal">
            Supervisory Review Portal
          </span>
          <h1 className="text-2xl font-bold text-foreground  mt-0.5">
            Pending Submissions & Approvals
          </h1>
          <p className="text-xs text-muted-foreground  mt-0.5">
            Review daily operational submissions and compiled weekly summaries submitted by your team.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-1.5 rounded-lg bg-warning-soft  border border-warning  text-xs font-bold text-warning ">
            {totalPending} Report(s) Awaiting Review
          </div>
        </div>
      </div>

      {/* Filter and Tab bar */}
      <div className="bg-card  p-4 rounded-lg border border-border  shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          <Button variant="legacy"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'all' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            All Pending ({totalPending})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('daily')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'daily' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            Daily Reports ({pendingDaily.length})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('weekly')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              activeTab === 'weekly' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            Weekly Summaries ({pendingWeekly.length})
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Department:</span>
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium"
          >
            <option value="all">All Departments</option>
            <option value="Agriculture">Agriculture & Cultivation</option>
            <option value="Production">Production & Processing</option>
            <option value="Marketing">Commercial & Marketing</option>
            <option value="Digital">Digital & IT Systems</option>
          </select>
        </div>
      </div>

      {totalPending === 0 ? (
        <div className="bg-card  rounded-lg p-16 text-center border border-border  shadow-xs">
          <CheckSquare className="w-10 h-10 text-success mx-auto mb-3" />
          <h3 className="text-base font-bold text-foreground ">
            You're all caught up!
          </h3>
          <p className="text-xs text-muted-foreground  mt-1 max-w-sm mx-auto">
            There are currently no staff reports waiting for your supervisory evaluation.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Pending Daily Reports Section */}
          {(activeTab === 'all' || activeTab === 'daily') && filteredDaily.length > 0 && (
            <div className="bg-card  rounded-lg border border-border  shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 bg-muted  border-b border-border  flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground ">
                    Daily Reports Awaiting Verification ({filteredDaily.length})
                  </h3>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                {filteredDaily.map(report => (
                  <div
                    key={report.id}
                    className="p-4 sm:p-5 rounded-lg border border-border  bg-card  hover:border-success  transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary  bg-success-soft  px-2.5 py-0.5 rounded border border-success ">
                          {report.reportCode}
                        </span>
                        <span className="text-xs text-muted-foreground ">
                          {report.date} ({report.dayOfWeek}) · {report.startTime} - {report.endTime}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-normal px-2 py-0.5 rounded bg-info-soft text-info  ">
                          {report.status}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-foreground ">
                          {report.employeeName}
                        </h4>
                        <p className="text-xs text-muted-foreground ">
                          {report.roleTitle} · <span className="text-muted-foreground">{report.department}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground  pt-1">
                        <span className="flex items-center gap-1 font-medium">
                          <CheckSquare className="w-3.5 h-3.5 text-success" />
                          {report.objectives?.length || 0} Objectives Assigned
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          {report.activities?.length || 0} Activities Executed
                        </span>
                        {report.attachments && report.attachments.length > 0 && (
                          <span className="font-medium text-success ">
                            {report.attachments.length} Evidence Attachment(s)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-border ">
                      <Button variant="legacy"
                        onClick={() => onNavigate('daily_report_detail', report.id)}
                        className="w-full md:w-auto px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>Review & Verify Report</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Weekly Reports Section */}
          {(activeTab === 'all' || activeTab === 'weekly') && filteredWeekly.length > 0 && (
            <div className="bg-card  rounded-lg border border-border  shadow-xs overflow-hidden">
              <div className="p-4 sm:p-5 bg-muted  border-b border-border  flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground ">
                    Weekly Summaries Awaiting Final Evaluation ({filteredWeekly.length})
                  </h3>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-4">
                {filteredWeekly.map(report => (
                  <div
                    key={report.id}
                    className="p-4 sm:p-5 rounded-lg border border-border  bg-card  hover:border-success  transition-all shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary  bg-success-soft  px-2.5 py-0.5 rounded border border-success ">
                          {report.reportCode}
                        </span>
                        <span className="text-xs font-semibold text-foreground ">
                          Week {report.weekNumber}, {report.year} ({report.startDate} to {report.endDate})
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-normal px-2 py-0.5 rounded bg-info-soft text-info  ">
                          {report.status}
                        </span>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-foreground ">
                          {report.employeeName}
                        </h4>
                        <p className="text-xs text-muted-foreground ">
                          {report.roleTitle} · <span className="text-muted-foreground">{report.department}</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground  pt-1">
                        <span className="font-medium">
                          Daily Logs Available: <strong className="text-foreground ">{report.dailyReportsCount} / {report.totalDaysExpected}</strong>
                        </span>
                        <span className="font-medium">
                          Completion Rate: <strong className="text-primary ">{report.completionRate}%</strong>
                        </span>
                        <span className="font-medium">
                          Activities Recorded: <strong className="text-foreground ">{report.totalActivitiesRecorded}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-border ">
                      <Button variant="legacy"
                        onClick={() => onNavigate('weekly_report_detail', report.id)}
                        className="w-full md:w-auto px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
                      >
                        <span>Evaluate & Review Weekly Report</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
