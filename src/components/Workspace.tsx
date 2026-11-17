import { useState, useEffect, useCallback, useRef } from 'react';
import { startOfISOWeek } from 'date-fns';
import { reportingWeekNumber, setReportingStart } from '@/utils/reportingWeek';
import { dbService } from '@/services/db';
import { syncPushSubscription, pushSupported } from '@/lib/pushClient';
import { startUpdateWatcher } from '@/lib/appUpdate';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { Sidebar } from './layout/Sidebar';
import { Header } from './layout/Header';
import { ReportingDashboard } from './dashboard/ReportingDashboard';
import { DailyReportsList } from './reports/DailyReportsList';
import { DailyReportForm } from './reports/DailyReportForm';
import { DailyReportDetail } from './reports/DailyReportDetail';
import { WeeklyReportsList } from './weekly/WeeklyReportsList';
import { WeeklyReportDetail } from './weekly/WeeklyReportDetail';
import { ApprovalsHub } from './approvals/ApprovalsHub';
import { EmployeeManagement } from './employees/EmployeeManagement';
import { ReportRecordsSearch } from './records/ReportRecordsSearch';
import { AnalyticsView } from './analytics/AnalyticsView';
import { SettingsView } from './settings/SettingsView';
import { LoginPage } from './auth/LoginPage';
import { AuthService, initializeDatabase, DailyReportService, WeeklyReportService, EmployeeService, RoleService, SettingsService, NotificationService, AuditService } from '@/services/storageService';
import { setSessionUser, isDemoSession } from '@/services/session';
import { getCloudUser } from '@/services/cloud.functions';
import { supabase } from '@/integrations/supabase/client';
import { DisplaySettingsService, watchSystemTheme } from '@/services/displaySettings';
import { ConfirmHost } from './common/ConfirmDialog';
import logo from '@/assets/logo.png';
import type { User, DailyReport, WeeklyReport, Employee, RoleDesignation, OrganisationSettings, Notification, AuditLog } from '@/types';
import { Button } from './ui/button';
import { toast } from 'sonner';

const paths:Record<string,string>={dashboard:'/',daily_reports:'/daily-reports',daily_report_new:'/daily-reports/new',daily_report_detail:'/daily-reports/detail',daily_report_edit:'/daily-reports/edit',weekly_reports:'/weekly-reports',weekly_report_detail:'/weekly-reports/detail',approvals:'/approvals',records:'/records',employees:'/staff',analytics:'/performance',settings:'/settings',auth:'/auth'};
export default function Workspace() {
 const location=useRouterState({select:s=>s.location}); const navigate=useNavigate();
 const activeView=Object.keys(paths).find(k=>paths[k]===location.pathname)??'dashboard';
 const param=new URLSearchParams(location.searchStr).get('id')??undefined;
 const [user,setUser]=useState<User|null>(null); const [ready,setReady]=useState(false);const [mobile,setMobile]=useState(false);const [error,setError]=useState('');const [collapsed,setCollapsed]=useState(false);
 const [daily,setDaily]=useState<DailyReport[]>([]);const [weekly,setWeekly]=useState<WeeklyReport[]>([]);const [employees,setEmployees]=useState<Employee[]>([]);const [roles,setRoles]=useState<RoleDesignation[]>([]);const [settings,setSettings]=useState<OrganisationSettings|null>(null);const [notifications,setNotifications]=useState<Notification[]>([]);const [audit,setAudit]=useState<AuditLog[]>([]);
 const go=(view:string,id?:string)=> { const path=paths[view]??'/'; void navigate({to:path,search:id?{id}:{} } as Parameters<typeof navigate>[0]);setMobile(false); };
 const seenNotifs=useRef<Set<string>|null>(null);const remindedRef=useRef<Set<string>>(new Set());
 const announceNew=(list:Notification[])=>{const seen=seenNotifs.current;if(seen){for(const x of list){if(!x.read&&!seen.has(x.id)){toast(x.title,{description:x.message});try{if('Notification' in window&&Notification.permission==='granted'&&document.hidden){void navigator.serviceWorker?.getRegistration().then(r=>r?.showNotification(x.title,{body:x.message,icon:'/icons/icon-192.png',badge:'/icons/badge-96.png',tag:x.id}));}}catch{/* ignore */}}}}seenNotifs.current=new Set(list.map(x=>x.id));};
 const refresh=useCallback(async()=> { if(!user)return;try{await initializeDatabase();const [d,w,e,r,s,n,a]=await Promise.all([DailyReportService.getAllDailyReports(),WeeklyReportService.getAllWeeklyReports(),EmployeeService.getAllEmployees(),RoleService.getAllRoles(),SettingsService.getSettings(),NotificationService.getNotifications(user.id),AuditService.getAllAuditLogs()]);setDaily(d);setWeekly(w);setEmployees(e);setRoles(r);setSettings(s);announceNew(n);setNotifications(n);setAudit(a);setError('');}catch(e){const message=e instanceof Error?e.message:'Reports could not be loaded.';setError(message);toast.error('Workspace could not refresh',{description:message});}},[user]);
 useEffect(()=>{ if('serviceWorker' in navigator && (window.location.protocol!=='http:' || window.location.hostname==='localhost')) void navigator.serviceWorker?.register('/sw.js').catch(()=>{}); },[]);
 useEffect(()=> { DisplaySettingsService.applySettings(DisplaySettingsService.getSettings());watchSystemTheme();setCollapsed(localStorage.getItem('pp_sidebar_collapsed')==='1'); let active=true;void (async()=> {const {data}=await supabase.auth.getSession();let u:User|null=null;try{u=data.session?await getCloudUser():null;setSessionUser(u,!data.session);}catch(e){setError(e instanceof Error?e.message:'Sign-in failed.');}if(active){setUser(u);setReady(true);}})();return()=>{active=false};},[]);
 useEffect(()=>{void refresh()},[refresh]);
 // Live updates: new submissions, approvals and returns appear instantly; polling is the safety net.
 useEffect(()=>{ if(!user||isDemoSession()) return; let timer:number|undefined; const soon=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>{void refresh()},700);};
  const channel=supabase.channel('pp-live-'+user.id).on('postgres_changes',{event:'*',schema:'public',table:'reporting_records'},soon).subscribe();
  const poll=window.setInterval(()=>{if(!document.hidden)void refresh();},60000); const wake=()=>{if(!document.hidden)void refresh();};
  document.addEventListener('visibilitychange',wake);window.addEventListener('online',wake);
  return()=>{window.clearTimeout(timer);window.clearInterval(poll);document.removeEventListener('visibilitychange',wake);window.removeEventListener('online',wake);void supabase.removeChannel(channel);}; },[user,refresh]);
 // Phone alerts (work even when the app is closed): keep this device registered, and ask again after a week if skipped.
 useEffect(()=>{ if(!user||isDemoSession()||!pushSupported())return; if(Notification.permission==='granted'){void syncPushSubscription(false);return;} if(Notification.permission!=='default')return; const asked=Number(localStorage.getItem('pp_notif_asked')||0); if(asked&&Date.now()-asked<7*864e5)return; const t=window.setTimeout(()=>{localStorage.setItem('pp_notif_asked',String(Date.now()));toast('Get report alerts on your phone',{description:'Know straight away when a report is submitted, approved or returned — even when the app is closed.',duration:20000,action:{label:'Turn on',onClick:()=>{void syncPushSubscription(true).then(ok=>ok?toast.success('Alerts are on for this device'):toast.error('Alerts were not turned on',{description:'Allow notifications for this site in your browser settings.'}));}}});},4000); return()=>window.clearTimeout(t); },[user]);
 useEffect(()=>{ setReportingStart(settings?.reportingStartDate); },[settings]);
 useEffect(()=>startUpdateWatcher(),[]);
 // Deadline reminders: from one hour before the daily / weekly deadline, if nothing has been submitted.
 useEffect(()=>{ if(!user||!settings||isDemoSession()||!seenNotifs.current)return; const now=new Date();const pad=(x:number)=>String(x).padStart(2,'0');const today=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const dayName=now.toLocaleDateString('en-GB',{weekday:'long'});const mins=(t:string)=>{const [h,m]=t.split(':').map(Number);return (h||0)*60+(m||0);};const nowMin=now.getHours()*60+now.getMinutes();
  const exists=(id:string)=>notifications.some(n=>n.id===id)||remindedRef.current.has(id);
  const send=async(id:string,title:string,message:string,type:'daily'|'weekly')=>{remindedRef.current.add(id);try{await dbService.put('notifications',{id,recipientId:user.id,title,message,type:'reminder',read:false,linkReportType:type,createdAt:new Date().toISOString()});void refresh();}catch{remindedRef.current.delete(id);}};
  const workday=settings.reportingDays.includes(dayName)&&!settings.publicHolidays.some(h=>h.date===today);
  const dailyId=`rem_daily_${today}_${user.id}`;
  if(workday&&nowMin>=mins(settings.dailyDeadlineTime)-60&&!exists(dailyId)&&!daily.some(r=>r.employeeId===user.id&&r.date===today&&(r.status==='submitted'||r.status==='approved')))void send(dailyId,'Daily report due',`Your daily report for today is due by ${settings.dailyDeadlineTime}.`,'daily');
  const wk=reportingWeekNumber(now),wy=startOfISOWeek(now).getFullYear();const weeklyId=`rem_weekly_${wy}-W${pad(wk)}_${user.id}`;
  if(dayName===settings.weeklyDeadlineDay&&nowMin>=mins(settings.weeklyDeadlineTime)-60&&!exists(weeklyId)&&!weekly.some(r=>r.employeeId===user.id&&r.weekNumber===wk&&r.year===wy&&(r.status==='submitted'||r.status==='approved')))void send(weeklyId,'Weekly report due',`Your weekly report is due by ${settings.weeklyDeadlineTime} today.`,'weekly'); },[user,settings,daily,weekly,notifications,refresh]);
 const switchUser=(u:User)=> {AuthService.setCurrentUser(u);setUser(u);go('dashboard')};
 if(!ready)return <div className="app-loader" role="status" aria-label="Loading"><img src={logo} alt="" className="app-loader-mark" /><span className="sr-only">Loading</span></div>;
 if(!user||activeView==='auth')return <LoginPage onLoginSuccess={u=>{setUser(u);go('dashboard')}}/>;
 const dailyReport=daily.find(r=>r.id===param);const weeklyReport=weekly.find(r=>r.id===param);
 const title:Record<string,string>={dashboard:'Reporting overview',daily_reports:'Daily reports',daily_report_new:'New daily report',daily_report_edit:'Edit daily report',daily_report_detail:'Daily report',weekly_reports:'Weekly reports',weekly_report_detail:'Weekly report',approvals:'Approvals & reviews',records:'Report records',employees:'Staff directory',analytics:'Performance',settings:'Settings & data'};
 const section:Record<string,string>={daily_reports:'Reporting',daily_report_new:'Reporting',daily_report_edit:'Reporting',daily_report_detail:'Reporting',weekly_reports:'Reporting',weekly_report_detail:'Reporting',records:'Reporting',approvals:'Management',employees:'Management',analytics:'Insights',settings:'Preferences'};
 const toggleCollapsed=()=>{const n=!collapsed;setCollapsed(n);localStorage.setItem('pp_sidebar_collapsed',n?'1':'0');};
 const logout=()=>{AuthService.logout();setUser(null);go('auth');};
 return <div className="min-h-screen flex bg-background"><ConfirmHost/><Sidebar currentUser={user} activeView={activeView} onNavigate={go} pendingApprovalsCount={[...daily,...weekly].filter(r=>r.status==='submitted').length} unreadNotificationsCount={notifications.filter(n=>!n.read).length} isMobileOpen={mobile} onCloseMobile={()=>setMobile(false)} onUserSwitched={switchUser} onLogout={()=>{setUser(null);go('auth')}} collapsed={collapsed} onToggleCollapsed={toggleCollapsed}/><div className={`flex-1 min-w-0 transition-[padding] duration-200 ${collapsed?'lg:pl-[76px]':'lg:pl-72'}`}>{isDemoSession()&&<div className="no-print flex justify-between items-center gap-3 px-4 sm:px-8 py-1.5 border-b border-border bg-brand-wash text-[12px] text-accent-foreground"><span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary"/>Demonstration workspace — data stays in this browser tab</span><Button variant="link" size="sm" className="h-auto p-0 text-[12px]" onClick={()=>go('auth')}>Staff sign in</Button></div>}<Header currentUser={user} onOpenMobile={()=>setMobile(true)} activeViewTitle={title[activeView]??'Plants & Pure'} section={section[activeView]} onNavigate={go} notifications={notifications} onRefreshNotifications={()=>void refresh()} onLogout={logout}/><main className="workspace-main">
 {error&&<div role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-destructive/30 bg-destructive-soft text-destructive px-4 py-3 rounded-lg mb-6 text-sm">{error}<Button variant="ghost" onClick={()=>void refresh()}>Try again</Button></div>}
 {activeView==='dashboard'&&<ReportingDashboard currentUser={user} dailyReports={daily} weeklyReports={weekly} employees={employees} onNavigate={go}/>}
 {activeView==='daily_reports'&&<DailyReportsList reports={daily} currentUser={user} onNavigate={go}/>}
 {(activeView==='daily_report_new'||activeView==='daily_report_edit')&&<DailyReportForm key={param??'new'} currentUser={user} existingReport={activeView==='daily_report_edit'?dailyReport:undefined} initialDate={param} onNavigate={go} onSaved={()=>void refresh()}/>}
 {activeView==='daily_report_detail'&&(dailyReport?<DailyReportDetail key={dailyReport.id} report={dailyReport} currentUser={user} onNavigate={go} onReportUpdated={()=>void refresh()}/>:<p className="empty-state">Report not found.</p>)}
 {activeView==='weekly_reports'&&<WeeklyReportsList reports={weekly} dailyReports={daily} employees={employees} currentUser={user} onNavigate={go} onRefreshData={()=>void refresh()}/>}
 {activeView==='weekly_report_detail'&&(weeklyReport?<WeeklyReportDetail key={weeklyReport.id} report={weeklyReport} dailyReports={daily.filter(r=>r.employeeId===weeklyReport.employeeId && r.date>=weeklyReport.startDate && r.date<=weeklyReport.endDate)} currentUser={user} onNavigate={go} onReportUpdated={()=>void refresh()}/>:<p className="empty-state">Report not found.</p>)}
 {activeView==='approvals'&&user.role!=='employee'&&<ApprovalsHub currentUser={user} dailyReports={daily} weeklyReports={weekly} onNavigate={go} onRefreshData={()=>void refresh()}/>}
 {activeView==='records'&&<ReportRecordsSearch currentUser={user} dailyReports={daily} weeklyReports={weekly} employees={employees} onNavigate={go}/>}
 {activeView==='employees'&&user.role!=='employee'&&<EmployeeManagement currentUser={user} employees={employees} roles={roles} dailyReports={daily} onNavigate={go} onRefreshEmployees={()=>void refresh()}/>}
 {activeView==='analytics'&&<AnalyticsView currentUser={user} dailyReports={daily} weeklyReports={weekly} employees={employees}/>} 
 {activeView==='settings'&&settings&&<SettingsView currentUser={user} settings={settings} roles={roles} auditLogs={audit} onRefreshAll={()=>void refresh()}/>}
 </main></div></div>;
}
