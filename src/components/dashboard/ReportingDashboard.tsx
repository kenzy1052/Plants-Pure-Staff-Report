import { ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, Clock3, FileText, Leaf, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { User, DailyReport, WeeklyReport, Employee } from '@/types';

const statusLabel: Record<string, string> = { submitted: 'Pending', approved: 'Approved', returned: 'Returned', draft: 'Draft' };

export function ReportingDashboard({ currentUser, dailyReports, weeklyReports, employees, onNavigate }: { currentUser: User; dailyReports: DailyReport[]; weeklyReports: WeeklyReport[]; employees: Employee[]; onNavigate: (view: string, id?: string) => void }) {
  const employee = currentUser.role === 'employee';
  const visibleReports = employee ? dailyReports.filter(r => r.employeeId === currentUser.id) : dailyReports;
  const objectives = visibleReports.flatMap(r => r.objectives || []);
  const completed = objectives.filter(o => o.status === 'Done').length;
  const pending = [...visibleReports, ...weeklyReports].filter(r => r.status === 'submitted').length;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const firstName = currentUser.name.replace(/^Dr\.?\s*/, '').split(' ')[0];
  const completion = objectives.length ? Math.round(completed / objectives.length * 100) : 0;
  const stats = [
    { label: employee ? 'My reports' : 'Total reports', value: visibleReports.length, detail: 'This reporting period', icon: FileText, tone: 'lime' },
    { label: 'Weekly summaries', value: weeklyReports.length, detail: 'Compiled reports', icon: CalendarDays, tone: 'blue' },
    { label: 'Pending approvals', value: pending, detail: pending ? 'Needs your attention' : 'All caught up', icon: Clock3, tone: 'orange' },
    { label: employee ? 'My completion' : 'Active staff', value: employee ? `${completion}%` : employees.filter(e => e.status === 'active').length, detail: employee ? `${completed} objectives complete` : 'Currently reporting', icon: employee ? CheckCircle2 : Users, tone: 'dark' },
  ];
  const byMonth = Array.from({ length: 6 }, (_, index) => { const d = new Date(); d.setMonth(d.getMonth() - 5 + index); const month = d.toLocaleDateString('en-GB', { month: 'short' }); return { month, value: visibleReports.filter(r => new Date(r.date).getMonth() === d.getMonth()).length }; });
  const max = Math.max(...byMonth.map(item => item.value), 1);

  return <div className="dashboard-v2 fade-up">
    <section className="dashboard-intro"><div><div className="eyebrow"><Leaf size={14} /> Plants & Pure · {employee ? 'Personal overview' : 'Management overview'}</div><h1>Hello, {firstName}</h1><p>{today} · Here is your reporting workspace at a glance.</p></div><div className="intro-actions"><Button variant="outline" onClick={() => onNavigate('analytics')}><BarChart3 size={16} /> Analytics</Button><Button onClick={() => onNavigate(employee ? 'daily_report_new' : 'approvals')}><Plus size={16} /> {employee ? 'New report' : 'Review approvals'}</Button></div></section>
    <section className="dashboard-stat-grid">{stats.map(stat => <article className="dashboard-stat" key={stat.label}><div className={`stat-symbol stat-${stat.tone}`}><stat.icon size={17} /></div><span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.detail}</small></article>)}</section>
    <section className="dashboard-main-grid"><article className="dashboard-panel chart-panel"><div className="panel-heading"><div><span className="panel-kicker">Reporting activity</span><h2>Statistics</h2></div><span className="panel-period">Last 6 months</span></div><div className="chart-legend"><span><i className="legend-lime" /> Daily reports</span><span><i className="legend-orange" /> Weekly summaries</span></div><div className="bar-chart" aria-label="Reports by month">{byMonth.map(item => <div className="bar-column" key={item.month}><div className="bar-value" style={{ height: `${Math.max(item.value / max * 100, item.value ? 12 : 3)}%` }}><span>{item.value}</span></div><small>{item.month}</small></div>)}</div></article>
      <article className="dashboard-panel approvals-panel"><div className="panel-heading"><div><span className="panel-kicker">Action queue</span><h2>Pending approvals</h2></div><Button variant="ghost" size="icon" aria-label="Open approvals" onClick={() => onNavigate('approvals')}><ArrowUpRight size={17} /></Button></div>{pending ? visibleReports.filter(r => r.status === 'submitted').slice(0, 4).map(report => <button className="approval-row" key={report.id} onClick={() => onNavigate('daily_report_detail', report.id)}><span className="approval-avatar">{report.employeeName.split(' ').map(part => part[0]).join('').slice(0, 2)}</span><span><strong>{report.employeeName}</strong><small>{report.date} · {report.reportCode}</small></span><em>{statusLabel[report.status]}</em></button>) : <div className="panel-empty"><CheckCircle2 size={24} /><p>Nothing waiting for review.</p></div>}</article>
    </section>
    <section className="dashboard-panel recent-panel"><div className="panel-heading"><div><span className="panel-kicker">Workspace records</span><h2>{employee ? 'My recent reports' : 'Recent reports'}</h2></div><Button variant="outline" size="sm" onClick={() => onNavigate('daily_reports')}>View all <ArrowUpRight size={14} /></Button></div><div className="report-table"><div className="report-table-head"><span>Report</span><span>Department</span><span>Status</span><span>Date</span><span /></div>{visibleReports.slice(0, 5).map(report => <button className="report-table-row" key={report.id} onClick={() => onNavigate('daily_report_detail', report.id)}><span><strong>{report.reportCode}</strong><small>{report.employeeName}</small></span><span>{report.department}</span><span className={`table-status table-status-${report.status}`}>{statusLabel[report.status]}</span><span>{report.date}</span><ArrowUpRight size={15} /></button>)}</div>{!visibleReports.length && <div className="panel-empty"><FileText size={24} /><p>No reports have been submitted yet.</p><Button variant="outline" size="sm" onClick={() => onNavigate('daily_report_new')}>Create first report</Button></div>}</section>
  </div>;
}
