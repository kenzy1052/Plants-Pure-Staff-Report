import { Button } from "@/components/ui/button";
import React, { useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ArrowRight,
  Download
} from 'lucide-react';
import { DailyReport, User } from '../../types';
import { exportDailyReportsToCSV, exportReportsToExcel, exportReportsToWord } from '../../utils/exportUtils';

interface DailyReportsListProps {
  reports: DailyReport[];
  currentUser: User;
  onNavigate: (view: string, param?: string) => void;
}

export const DailyReportsList: React.FC<DailyReportsListProps> = ({
  reports,
  currentUser,
  onNavigate
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'submitted' | 'approved' | 'returned' | 'draft'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');

  const isEmployee = currentUser.role === 'employee';

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      // Tab filter
      if (activeTab === 'mine' && r.employeeId !== currentUser.id) return false;
      if (activeTab === 'submitted' && r.status !== 'submitted') return false;
      if (activeTab === 'approved' && r.status !== 'approved') return false;
      if (activeTab === 'returned' && r.status !== 'returned') return false;
      if (activeTab === 'draft' && r.status !== 'draft') return false;

      // If regular employee, only show their own reports by default unless viewing general list
      if (isEmployee && activeTab === 'all' && r.employeeId !== currentUser.id) {
        return false;
      }

      // Role filter
      if (selectedRole !== 'all' && r.roleTitle !== selectedRole) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchCode = r.reportCode.toLowerCase().includes(query);
        const matchName = r.employeeName.toLowerCase().includes(query);
        const matchDate = r.date.toLowerCase().includes(query);
        const matchDept = r.department.toLowerCase().includes(query);
        const matchActivities = r.activities?.some(a => a.activityTask.toLowerCase().includes(query));
        if (!matchCode && !matchName && !matchDate && !matchDept && !matchActivities) {
          return false;
        }
      }

      return true;
    });
  }, [reports, activeTab, currentUser, isEmployee, selectedRole, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card  p-6 rounded-lg border border-border  shadow-xs">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal">
            Daily Operational Records
          </span>
          <h1 className="text-2xl font-bold text-foreground  mt-0.5">
            Daily Report Logs
          </h1>
          <p className="text-xs text-muted-foreground  mt-0.5">
            Browse, review, and retrieve verified daily reporting submissions across Plants & Pure.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="legacy"
            onClick={() => exportReportsToExcel(filteredReports, [])}
            className="flex items-center gap-1.5 px-3 py-2 bg-success-soft  border border-success  hover:bg-brand-wash  text-success  text-xs font-semibold rounded-lg transition-colors"
            title="Download multi-tab Excel (.xlsx) workbook with weekly & daily breakdown"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-success " />
            <span>Export Excel (.xlsx)</span>
          </Button>
          <Button variant="legacy"
            onClick={() => exportReportsToWord(filteredReports, [])}
            className="flex items-center gap-1.5 px-3 py-2 bg-info-soft border border-info hover:bg-brand-wash text-info text-xs font-semibold rounded-lg transition-colors"
            title="Download a formatted Word (.docx) document, grouped by week"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Word (.docx)</span>
          </Button>
          <Button variant="legacy"
            onClick={() => exportDailyReportsToCSV(filteredReports)}
            className="flex items-center gap-1.5 px-3 py-2 border border-border  hover:bg-muted  text-foreground  text-xs font-semibold rounded-lg transition-colors"
            title="Export filtered reports to CSV"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Export CSV</span>
          </Button>
          <Button variant="legacy"
            onClick={() => onNavigate('daily_report_new')}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Submit Daily Report</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card  p-4 rounded-lg border border-border  shadow-xs space-y-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-xs">
          <Button variant="legacy"
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'all' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            All Reports ({reports.length})
          </Button>
          <Button variant="legacy"
            onClick={() => setActiveTab('mine')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'mine' 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground  hover:bg-muted '
            }`}
          >
            My Reports ({reports.filter(r => r.employeeId === currentUser.id).length})
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
            Returned for Fix ({reports.filter(r => r.status === 'returned').length})
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

        {/* Search Input & Role Dropdown */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 border-t border-border ">
          <div className="sm:col-span-8 relative">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by report ID, staff name, date, activity keyword..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground "
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium"
            >
              <option value="all">All Staff Designations</option>
              <option value="Agriculture Officer">Agriculture Officer</option>
              <option value="Production Officer">Production Officer</option>
              <option value="Marketing Officer">Marketing Officer</option>
              <option value="IT / Social Media Officer">IT / Social Media Officer</option>
            </select>
          </div>
        </div>
      </div>

      {/* Reports Table Card */}
      <div className="bg-card  rounded-lg border border-border  shadow-xs overflow-hidden">
        {filteredReports.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground ">
            <FileText className="w-8 h-8 text-muted-foreground  mx-auto mb-2" />
            <p className="font-semibold text-foreground ">
              No daily reports match the current filter criteria.
            </p>
            <p className="mt-1">
              Try adjusting the tab selection or search keyword.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted  border-b border-border  text-muted-foreground  font-semibold uppercase tracking-normal text-[11px]">
                <tr>
                  <th className="py-3 px-4">Report Code</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Role & Department</th>
                  <th className="py-3 px-4">Date & Day</th>
                  <th className="py-3 px-4">Objectives</th>
                  <th className="py-3 px-4">Tasks</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Reviewer</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border ">
                {filteredReports.map(report => (
                  <tr 
                    key={report.id}
                    className="hover:bg-muted/70  transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-foreground ">
                      {report.reportCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground ">
                      <div>{report.employeeName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{report.employeeCode}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      <div>{report.roleTitle}</div>
                      <div className="text-[11px] text-muted-foreground">{report.department}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      <div className="font-mono tabular-nums">{report.date}</div>
                      <div className="text-[11px] text-muted-foreground">{report.dayOfWeek}</div>
                    </td>
                    <td className="py-3 px-4 tabular-nums">
                      {report.objectives?.length || 0} objective(s)
                    </td>
                    <td className="py-3 px-4 tabular-nums">
                      {report.activities?.length || 0} task(s)
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
                    <td className="py-3 px-4 text-muted-foreground ">
                      {report.submittedToName || 'Supervisor'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="legacy"
                        onClick={() => onNavigate('daily_report_detail', report.id)}
                        className="text-xs font-semibold text-primary  hover:underline"
                      >
                        Open Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
