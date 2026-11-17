import { Button } from "@/components/ui/button";
import { toast } from 'sonner';
import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  FileText, 
  CalendarCheck, 
  Calendar, 
  RotateCcw, 
  ArrowRight,
  SlidersHorizontal,
  FileSpreadsheet
} from 'lucide-react';
import { DailyReport, WeeklyReport, User as UserType, Employee } from '../../types';
import { downloadCSV, exportReportsToExcel, exportReportsToWord } from '../../utils/exportUtils';

interface UnifiedRecord {
  id: string;
  reportCode: string;
  type: 'daily' | 'weekly';
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  roleTitle: string;
  department: string;
  dateOrPeriod: string;
  rawDate: string;
  status: string;
  detailsSummary: string;
}

interface ReportRecordsSearchProps {
  currentUser: UserType;
  dailyReports: DailyReport[];
  weeklyReports: WeeklyReport[];
  employees: Employee[];
  onNavigate: (view: string, param?: string) => void;
}

export const ReportRecordsSearch: React.FC<ReportRecordsSearchProps> = ({
  currentUser,
  dailyReports,
  weeklyReports,
  employees,
  onNavigate
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'daily' | 'weekly'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'dateDesc' | 'dateAsc' | 'nameAsc'>('dateDesc');

  // Build unified search records
  const allRecords: UnifiedRecord[] = useMemo(() => {
    const list: UnifiedRecord[] = [];

    // Daily reports
    dailyReports.forEach(r => {
      const activitiesSummary = r.activities?.map(a => a.activityTask).join(', ') || '';
      list.push({
        id: r.id,
        reportCode: r.reportCode,
        type: 'daily',
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        employeeCode: r.employeeCode,
        roleTitle: r.roleTitle,
        department: r.department,
        dateOrPeriod: `${r.date} (${r.dayOfWeek})`,
        rawDate: r.date,
        status: r.status,
        detailsSummary: activitiesSummary
      });
    });

    // Weekly reports
    weeklyReports.forEach(w => {
      list.push({
        id: w.id,
        reportCode: w.reportCode,
        type: 'weekly',
        employeeId: w.employeeId,
        employeeName: w.employeeName,
        employeeCode: w.employeeCode,
        roleTitle: w.roleTitle,
        department: w.department,
        dateOrPeriod: `Week ${w.weekNumber}, ${w.year} (${w.startDate} - ${w.endDate})`,
        rawDate: w.startDate,
        status: w.status,
        detailsSummary: `${w.dailyReportsCount}/${w.totalDaysExpected} days · ${w.completionRate}% completion · ${w.totalActivitiesRecorded} activities`
      });
    });

    return list;
  }, [dailyReports, weeklyReports]);

  // Apply filters
  const filteredRecords = useMemo(() => {
    return allRecords.filter(rec => {
      if (typeFilter !== 'all' && rec.type !== typeFilter) return false;
      if (statusFilter !== 'all' && rec.status !== statusFilter) return false;
      if (departmentFilter !== 'all' && !rec.department.toLowerCase().includes(departmentFilter.toLowerCase())) return false;
      if (employeeFilter !== 'all' && rec.employeeId !== employeeFilter) return false;

      if (startDate && rec.rawDate < startDate) return false;
      if (endDate && rec.rawDate > endDate) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchCode = rec.reportCode.toLowerCase().includes(q);
        const matchName = rec.employeeName.toLowerCase().includes(q);
        const matchEmpId = rec.employeeCode.toLowerCase().includes(q);
        const matchRole = rec.roleTitle.toLowerCase().includes(q);
        const matchPeriod = rec.dateOrPeriod.toLowerCase().includes(q);
        const matchSummary = rec.detailsSummary.toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchEmpId && !matchRole && !matchPeriod && !matchSummary) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'dateDesc') return b.rawDate.localeCompare(a.rawDate);
      if (sortBy === 'dateAsc') return a.rawDate.localeCompare(b.rawDate);
      if (sortBy === 'nameAsc') return a.employeeName.localeCompare(b.employeeName);
      return 0;
    });
  }, [allRecords, typeFilter, statusFilter, departmentFilter, employeeFilter, startDate, endDate, searchTerm, sortBy]);

  const handleExportSearchResults = () => {
    const headers = ['Report Code', 'Type', 'Employee Name', 'Staff ID', 'Role', 'Department', 'Date / Period', 'Status', 'Summary'];
    const rows = filteredRecords.map(r => [
      r.reportCode,
      r.type.toUpperCase(),
      r.employeeName,
      r.employeeCode,
      r.roleTitle,
      r.department,
      r.dateOrPeriod,
      r.status.toUpperCase(),
      r.detailsSummary
    ]);
    downloadCSV(`PlantsAndPure_SearchResults_${new Date().toISOString().split('T')[0]}.csv`, [headers, ...rows]);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
    setDepartmentFilter('all');
    setEmployeeFilter('all');
    setStartDate('');
    setEndDate('');
    setSortBy('dateDesc');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal">
            Central Information Retrieval
          </span>
          <h1 className="text-2xl font-bold text-foreground  mt-0.5">
            Report Records & Archive
          </h1>
          <p className="text-xs text-muted-foreground  mt-0.5">
            Instant search across all historical daily and weekly records with multi-dimensional filtering.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="legacy"
            onClick={() => {
              const approvedDaily = dailyReports.filter(r => r.status === 'approved');
              const approvedWeekly = weeklyReports.filter(r => r.status === 'approved');
              if (!approvedDaily.length && !approvedWeekly.length) { toast.info('No approved reports yet', { description: 'Approved reports will be available here as a single Excel workbook.' }); return; }
              exportReportsToExcel(approvedDaily, approvedWeekly, undefined, `PlantsAndPure_Approved_Reports_${new Date().toISOString().split('T')[0]}.xlsx`);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg transition-colors hover:opacity-90"
            title="Download every approved report in one Excel workbook, one tab per week"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Approved reports (Excel)</span>
          </Button>
          <Button variant="legacy"
            onClick={() => {
              const approvedDaily = dailyReports.filter(r => r.status === 'approved');
              const approvedWeekly = weeklyReports.filter(r => r.status === 'approved');
              if (!approvedDaily.length && !approvedWeekly.length) { toast.info('No approved reports yet'); return; }
              void exportReportsToWord(approvedDaily, approvedWeekly, undefined, `PlantsAndPure_Approved_Reports_${new Date().toISOString().split('T')[0]}.docx`);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg transition-colors hover:opacity-90"
            title="Download every approved report as one formatted Word document, grouped by week"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Approved reports (Word)</span>
          </Button>
          <Button variant="legacy"
            onClick={() => {
              const matchedDailyIds = new Set(filteredRecords.filter(r => r.type === 'daily').map(r => r.id));
              const matchedWeeklyIds = new Set(filteredRecords.filter(r => r.type === 'weekly').map(r => r.id));
              const dailyToExport = dailyReports.filter(d => matchedDailyIds.has(d.id));
              const weeklyToExport = weeklyReports.filter(w => matchedWeeklyIds.has(w.id));
              exportReportsToExcel(
                dailyToExport,
                weeklyToExport,
                undefined,
                `PlantsAndPure_Records_${new Date().toISOString().split('T')[0]}.xlsx`
              );
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-success-soft  border border-success  hover:bg-brand-wash  text-success  text-xs font-semibold rounded-lg transition-colors"
            title="Download multi-tab Excel (.xlsx) workbook with weekly tabs & daily breakdown"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-success " />
            <span>Export Excel (.xlsx)</span>
          </Button>
          <Button variant="legacy"
            onClick={() => {
              const matchedDailyIds = new Set(filteredRecords.filter(r => r.type === 'daily').map(r => r.id));
              const matchedWeeklyIds = new Set(filteredRecords.filter(r => r.type === 'weekly').map(r => r.id));
              void exportReportsToWord(dailyReports.filter(d => matchedDailyIds.has(d.id)), weeklyReports.filter(w => matchedWeeklyIds.has(w.id)), undefined, `PlantsAndPure_Records_${new Date().toISOString().split('T')[0]}.docx`);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-info-soft border border-info hover:bg-brand-wash text-info text-xs font-semibold rounded-lg transition-colors"
            title="Download the filtered records as a formatted Word document"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export Word (.docx)</span>
          </Button>
          <Button variant="legacy"
            onClick={handleExportSearchResults}
            className="flex items-center gap-1.5 px-3 py-2 border border-border  hover:bg-muted  text-foreground  text-xs font-semibold rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-muted-foreground" />
            <span>Export CSV ({filteredRecords.length})</span>
          </Button>
        </div>
      </div>

      {/* Prominent Multi-Filter Control Console */}
      <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs space-y-4">
        {/* Prominent Main Search Input */}
        <div className="relative">
          <Search className="w-5 h-5 text-muted-foreground absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Report ID (e.g. PP-DR-...), employee name, activity keyword, week number, or department..."
            className="w-full pl-11 pr-4 py-2.5 text-sm rounded-lg border border-border  bg-muted/50  text-foreground  focus:ring-2 focus:ring-primary focus:bg-card"
          />
        </div>

        {/* Multi-Dimensional Filter Selectors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs pt-1">
          {/* Report Type */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground  mb-1">
              Report Type
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
            >
              <option value="all">All Types</option>
              <option value="daily">Daily Reports</option>
              <option value="weekly">Weekly Summaries</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground  mb-1">
              Approval Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
            >
              <option value="all">All Statuses</option>
              <option value="approved">Approved</option>
              <option value="submitted">Pending Review</option>
              <option value="returned">Returned</option>
              <option value="draft">Drafts</option>
            </select>
          </div>

          {/* Employee */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground  mb-1">
              Staff Member
            </label>
            <select
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
            >
              <option value="all">All Employees</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground  mb-1">
              Department
            </label>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
            >
              <option value="all">All Departments</option>
              <option value="Agriculture">Agriculture & Cultivation</option>
              <option value="Production">Production & Processing</option>
              <option value="Marketing">Commercial & Marketing</option>
              <option value="Digital">Digital & Communications</option>
            </select>
          </div>

          {/* Date Range Start */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground  mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-1.5 rounded-lg border border-border  bg-card  text-foreground  font-mono"
            />
          </div>

          {/* Date Range End */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground  mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-1.5 rounded-lg border border-border  bg-card  text-foreground  font-mono"
            />
          </div>
        </div>

        {/* Clear Filters & Sort Options */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-border ">
          <Button variant="legacy"
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground  font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Filters</span>
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="p-1 rounded border border-border  bg-card  text-foreground  font-medium"
            >
              <option value="dateDesc">Newest Date First</option>
              <option value="dateAsc">Oldest Date First</option>
              <option value="nameAsc">Staff Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-card  rounded-lg border border-border  shadow-xs overflow-hidden">
        {filteredRecords.length === 0 ? (
          <div className="p-16 text-center text-xs text-muted-foreground ">
            <Search className="w-8 h-8 text-muted-foreground  mx-auto mb-2" />
            <p className="font-semibold text-foreground ">
              No historical records match your search criteria.
            </p>
            <p className="mt-1">
              Try broadening your date range or clearing specific filter toggles.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted  border-b border-border  text-muted-foreground  font-semibold uppercase tracking-normal text-[11px]">
                <tr>
                  <th className="py-3 px-4">Report Code</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Role & Dept</th>
                  <th className="py-3 px-4">Date / Week Period</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Key Content</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border ">
                {filteredRecords.map(rec => (
                  <tr key={rec.id} className="hover:bg-muted/70 ">
                    <td className="py-3 px-4 font-mono font-bold text-foreground ">
                      {rec.reportCode}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`
                        font-bold text-[10px] uppercase px-1.5 py-0.5 rounded
                        ${rec.type === 'daily' ? 'bg-success-soft text-success  ' : 'bg-info-soft text-info  '}
                      `}>
                        {rec.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-foreground ">
                      <div>{rec.employeeName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{rec.employeeCode}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      <div>{rec.roleTitle}</div>
                      <div className="text-[11px] text-muted-foreground">{rec.department}</div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground ">
                      {rec.dateOrPeriod}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`
                        font-bold text-[11px] uppercase
                        ${rec.status === 'approved' ? 'text-success ' : ''}
                        ${rec.status === 'submitted' ? 'text-info ' : ''}
                        ${rec.status === 'returned' ? 'text-destructive ' : ''}
                        ${rec.status === 'draft' ? 'text-warning ' : ''}
                      `}>
                        {rec.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground  max-w-xs truncate">
                      {rec.detailsSummary || 'Operational log entry'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button variant="legacy"
                        onClick={() => {
                          if (rec.type === 'daily') onNavigate('daily_report_detail', rec.id);
                          else onNavigate('weekly_report_detail', rec.id);
                        }}
                        className="text-xs font-semibold text-primary  hover:underline"
                      >
                        Retrieve
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
