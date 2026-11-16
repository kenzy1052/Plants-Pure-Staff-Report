import logo from '@/assets/logo.png';
import React, { useState } from 'react';
import { LayoutDashboard, FileText, CalendarCheck, CheckSquare, Users, Search, BarChart3, Settings, LogOut, X, ChevronsLeft, ChevronsRight, Repeat2, Check, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { User } from '../../types';
import { isDemoSession } from '../../services/session';
import { AuthService } from '../../services/storageService';

interface SidebarProps {
  currentUser: User;
  activeView: string;
  onNavigate: (view: string, param?: string) => void;
  pendingApprovalsCount: number;
  unreadNotificationsCount: number;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  onUserSwitched: (user: User) => void;
  onLogout?: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

type Item = { id: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: string[]; count?: number; match?: string[] };
const ALL = ['employee', 'manager', 'admin', 'ceo'];
const MGMT = ['manager', 'admin', 'ceo'];

export function initials(name: string) {
  return name.replace(/^Dr\.?\s*/, '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export const Sidebar: React.FC<SidebarProps> = ({ currentUser, activeView, onNavigate, pendingApprovalsCount, isMobileOpen, onCloseMobile, onUserSwitched, onLogout, collapsed, onToggleCollapsed }) => {
  const [switchOpen, setSwitchOpen] = useState(false);
  const demo = isDemoSession();
  const groups: { label: string; items: Item[] }[] = [
    { label: 'Overview', items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ALL }] },
    { label: 'Reporting', items: [
      { id: 'daily_reports', label: 'Daily Reports', icon: FileText, roles: ALL, match: ['daily_report'] },
      { id: 'weekly_reports', label: 'Weekly Reports', icon: CalendarCheck, roles: ALL, match: ['weekly_report'] },
      { id: 'records', label: currentUser.role === 'employee' ? 'My Report History' : 'Report Records', icon: currentUser.role === 'employee' ? History : Search, roles: ALL },
    ] },
    { label: 'Management', items: [
      { id: 'approvals', label: 'Approvals', icon: CheckSquare, roles: MGMT, count: pendingApprovalsCount },
      { id: 'employees', label: 'Staff Directory', icon: Users, roles: MGMT },
    ] },
    { label: 'Insights', items: [{ id: 'analytics', label: currentUser.role === 'employee' ? 'My Analytics' : 'Performance Analytics', icon: BarChart3, roles: ALL }] },
    { label: 'Preferences', items: [{ id: 'settings', label: 'Settings', icon: Settings, roles: ALL }] },
  ].map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(currentUser.role)) })).filter(g => g.items.length);

  const isActive = (i: Item) => activeView === i.id || (i.match ?? []).some(m => activeView.startsWith(m));
  const mini = collapsed && !isMobileOpen;
  const go = (id: string) => { onNavigate(id); onCloseMobile(); };
  const logout = () => { AuthService.logout(); onLogout ? onLogout() : window.location.reload(); };

  return (
    <TooltipProvider delayDuration={150}>
      {isMobileOpen && <div className="fixed inset-0 z-40 bg-overlay/50 backdrop-blur-[2px] lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        aria-label="Main navigation"
        className={cn(
          'no-print fixed inset-y-0 left-0 z-50 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-[width,transform] duration-200 ease-out',
          mini ? 'lg:w-[76px]' : 'lg:w-72', 'w-[18rem]',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className={cn('flex h-16 items-center gap-3 border-b border-sidebar-border', mini ? 'justify-center px-2' : 'px-5')}>
          <img src={logo} alt="Plants & Pure" className="size-9 shrink-0 object-contain" />
          {!mini && <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold leading-tight text-sidebar-accent-foreground">Plants <span className="text-primary">&</span> Pure</p><p className="text-[11px] text-[color:var(--sidebar-muted)]">Staff reporting</p></div>}
          <button onClick={onCloseMobile} className="lg:hidden rounded-md p-1.5 text-[color:var(--sidebar-muted)] hover:bg-sidebar-accent" aria-label="Close menu"><X className="size-5" /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
          {groups.map(g => (
            <div key={g.label}>
              {!mini ? <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--sidebar-muted)]">{g.label}</p> : <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />}
              <ul className="space-y-0.5">
                {g.items.map(item => {
                  const active = isActive(item); const Icon = item.icon;
                  const btn = (
                    <button
                      onClick={() => go(item.id)}
                      aria-current={active ? 'page' : undefined}
                      aria-label={mini ? item.label : undefined}
                      className={cn(
                        'group relative flex w-full items-center gap-3 rounded-lg text-[13.5px] transition-colors',
                        mini ? 'justify-center h-11' : 'px-3 h-10',
                        active ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'text-[color:var(--sidebar-muted)] hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )}
                    >
                      {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary" />}
                      <Icon className={cn('size-[18px] shrink-0', active ? 'text-primary' : '')} />
                      {!mini && <span className="flex-1 truncate text-left">{item.label}</span>}
                      {!!item.count && <span className={cn('rounded-full bg-primary px-1.5 text-[10.5px] font-semibold leading-5 text-primary-foreground', mini && 'absolute -right-0.5 -top-0.5 min-w-5 text-center')}>{item.count}</span>}
                    </button>
                  );
                  return <li key={item.id}>{mini ? <Tooltip><TooltipTrigger asChild>{btn}</TooltipTrigger><TooltipContent side="right">{item.label}</TooltipContent></Tooltip> : btn}</li>;
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-2">
          {demo && !mini && (
            <button onClick={() => setSwitchOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-sidebar-border px-3 py-2 text-xs text-[color:var(--sidebar-muted)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Repeat2 className="size-3.5 text-primary" /> Switch demo account
            </button>
          )}
          <div className={cn('flex items-center gap-2.5 rounded-lg p-1.5', mini && 'flex-col')}>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-accent-foreground ring-2 ring-sidebar-border">{initials(currentUser.name)}</div>
            {!mini && <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-sidebar-accent-foreground">{currentUser.name}</p><p className="truncate text-[11px] text-[color:var(--sidebar-muted)]">{currentUser.roleTitle}</p></div>}
            <Tooltip><TooltipTrigger asChild><button onClick={logout} aria-label="Log out" className="rounded-md p-2 text-[color:var(--sidebar-muted)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"><LogOut className="size-4" /></button></TooltipTrigger><TooltipContent side="right">Log out</TooltipContent></Tooltip>
          </div>
          <button onClick={onToggleCollapsed} className="hidden lg:flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-[11px] text-[color:var(--sidebar-muted)] hover:bg-sidebar-accent" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
          </button>
        </div>
      </aside>

      <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Switch demonstration account</DialogTitle><DialogDescription>Explore the workspace as each role. Demo data stays in this browser tab.</DialogDescription></DialogHeader>
          <div className="space-y-1.5">
            {AuthService.getAllDemoUsers().map(u => {
              const current = u.id === currentUser.id;
              return (
                <button key={u.id} onClick={() => { AuthService.setCurrentUser(u); onUserSwitched(u); setSwitchOpen(false); }} className={cn('flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors', current ? 'border-primary/50 bg-brand-wash' : 'border-border hover:bg-muted')}>
                  <div className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-accent-foreground">{initials(u.name)}</div>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{u.name}</p><p className="text-xs text-muted-foreground">{u.roleTitle} · <span className="capitalize">{u.role === 'ceo' ? 'CEO' : u.role}</span></p></div>
                  {current && <Check className="size-4 text-primary" />}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end"><Button variant="outline" onClick={() => setSwitchOpen(false)}>Close</Button></div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};
