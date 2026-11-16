import { Button } from "@/components/ui/button";
import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Search, 
  Filter, 
  Download, 
  CalendarCheck, 
  Star, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  FileSpreadsheet
} from 'lucide-react';
import { WeeklyReport, User, DailyReport, Employee } from '../../types';
import { WeeklyReportGeneratorModal } from './WeeklyReportGeneratorModal';
import { exportWeeklyReportsToCSV, exportReportsToExcel } from '../../utils/exportUtils';

interface WeeklyReportsListProps {
  reports: WeeklyReport[];
  dailyReports: DailyReport[];
  employees?: Employee[];
  currentUser: User;
  onNavigate: (view: string, param?: string) => void;
  onRefreshData: () => void;
}

export const WeeklyReportsList: React.FC<WeeklyReportsListProps> = ({
  reports,
  dailyReports,
  employees = [],
  currentUser,
  onNavigate,
  onRefreshData
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'submitted' | 'approved' | 'returned' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);

  const isEmployee = currentUser.role === 'employee';

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      // Tab filter
      if (activeTab === 'mine' && r.employeeId !== currentUser.id) return false;
      if (activeTab === 'submitted' && r.status !== 'submitted') return false;
      if (activeTab === 'approved' && r.status !== 'approved') return false;
      if (activeTab === 'returned' && r.status !== 'returned') return false;
      if (activeTab === 'draft' && r.status !== 'draft') return false;

      // Regular employee constraint
      if (isEmployee && activeTab === 'all' && r.employeeId !== currentUser.id) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCode = r.reportCode.toLowerCase().includes(query);
        const matchName = r.employeeName.toLowerCase().includes(query);
        const matchWeek = `week ${r.weekNumber}`.includes(query);
        const matchDept = r.department.toLowerCase().includes(query);
        if (!matchCode && !matchName && !matchWeek && !matchDept) {
          return false;
        }
      }

      return true;
    });
  }, [reports, activeTab, currentUser, isEmployee, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card  p-6 rounded-lg border border-border  shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-primary uppercase tracking-normal">
              Weekly Performance Compilations
            </span>
            <span className="text-[10px] bg-success-soft  text-success  font-bold px-1.5 py-0.2 rounded">
              Smart Assistant
            </span>
          </div>
          <h1 className="text-2xl font-bold text-foreground  mt-0.5">
            Weekly Report Summaries
          </h1>
          <p className="text-xs text-muted-foreground  mt-0.5">
            Automatically compiled from Monday-to-Friday daily reporting submissions without manual Word doc compiling.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="legacy"
            onClick={() => exportReportsToExcel(dailyReports, filteredReports)}
            className="flex items-center gap-1.5 px-3 py-2 bg-success-soft  border border-success  hover:bg-brand-wash  text-success  text-xs font-semibold rounded-lg transition-colors"
            title="Download multi-tab Excel (.xlsx) workbook with weekly & daily breakdown"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-success " />
            <span>Export Excel (.xlsx)</span>
          </Button>
          <Button variant="legacy"
            onClick={() => exportWeeklyReportsToCSV(filteredReports)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border  hover:bg-muted  text-foreground  text-xs font-semibold rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Export CSV</span>
          </Button>
          <Button variant="legacy"
            onClick={() => setShowGeneratorModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Sparkles className="w-4 h-4 text-success" />
            <span>Generate Weekly Report</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card  p-4 rounded-lg border border-border  shadow-xs space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
          <Button variant="legacy"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'all' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            All Summaries ({reports.length})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('mine')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'mine' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            My Weekly Reports ({reports.filter(r => r.employeeId === currentUser.id).length})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('submitted')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'submitted' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            Pending Review ({reports.filter(r => r.status === 'submitted').length})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('approved')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'approved' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            Approved ({reports.filter(r => r.status === 'approved').length})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('returned')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'returned' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            Returned ({reports.filter(r => r.status === 'returned').length})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('draft')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'draft' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            Drafts ({reports.filter(r => r.status === 'draft').length})
          </Button>
        </div>

        {/* Search Input */}
        <div className="relative pt-1 border-t border-border ">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by weekly report code, staff name, week number, department..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
          />
        </div>
      </div>

      {/* Reports Table Card */}
      <div className="bg-card  rounded-lg border border-border  shadow-xs overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground ">
            <CalendarCheck className="w-8 h-8 text-muted-foreground  mx-auto mb-2" />
            <p className="font-semibold text-foreground ">
              No weekly reports found for the selected tab.
            </p>
            <p className="mt-1">
              Click "Generate Weekly Report" to automatically compile this week's daily logs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted  border-b border-border  text-muted-foreground  font-semibold uppercase tracking-normal text-[11px]">
                <tr>
                  <th className="py-3 px-4">Report Code</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Daily Logs</th>
                  <th className="py-3 px-4">Objective Rate</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Rating</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border ">
                {filteredReports.map(report => (
                  <tr key={report.id} className="hover:bg-muted/70  transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-foreground ">
                      {report.reportCode}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      <div className="font-semibold text-foreground ">
                        Week {report.weekNumber}, {report.year}
                      </div>
                      <div className="text-[11px] font-mono text-muted-foreground">
                        {report.startDate} - {report.endDate}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground ">
                      <div>{report.employeeName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{report.employeeCode}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      {report.department}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono tabular-nums font-semibold text-foreground ">
                        {report.dailyReportsCount} / {report.totalDaysExpected}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-primary  tabular-nums">
                        {report.completionRate}%
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        ({report.totalObjectivesCompleted}/{report.totalObjectivesAssigned})
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`
                        font-bold text-[11px] uppercase
                        ${report.status === 'approved' ? 'text-success ' : ''}
                        ${report.status === 'submitted' ? 'text-info ' : ''}
                        ${report.status === 'returned' ? 'text-destructive ' : ''}
                        ${report.status === 'draft' ? 'text-warning ' : ''}
                      `}>
                        {report.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {report.reviews && report.reviews[0]?.rating ? (
                        <div className="flex items-center gap-1 text-warning">
                          <Star className="w-3.5 h-3.5 fill-warning" />
                          <span className="font-bold text-foreground  text-xs">
                            {report.reviews[0].rating}/5
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="legacy"
                        onClick={() => onNavigate('weekly_report_detail', report.id)}
                        className="text-xs font-semibold text-primary  hover:underline"
                      >
                        Open Summary
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generator Modal */}
      {showGeneratorModal && (
        <WeeklyReportGeneratorModal
          currentUser={currentUser}
          dailyReports={dailyReports}
          employees={employees}
          onClose={() => setShowGeneratorModal(false)}
          onGenerated={(gen) => {
            setShowGeneratorModal(false);
            onRefreshData();
            onNavigate('weekly_report_detail', gen.id);
          }}
        />
      )}
    </div>
  );
};
