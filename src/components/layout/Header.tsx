import React, { useEffect, useState } from 'react';
import { Menu, Bell, Search, Plus, Check, FileText, AlertCircle, Sun, Moon, Monitor, Sliders, Clock, Info, CheckCheck, LogOut, Settings, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { User, Notification } from '../../types';
import { NotificationService } from '../../services/storageService';
import { DisplaySettingsService, type ThemePreference } from '../../services/displaySettings';
import { DisplaySettingsModal } from '../common/DisplaySettingsModal';
import { initials } from './Sidebar';
import { PhoneAlertsRow } from './PhoneAlertsRow';
import { InstallAppButton } from '@/components/common/InstallAppButton';

interface HeaderProps {
  currentUser: User;
  onOpenMobile: () => void;
  activeViewTitle: string;
  section?: string | undefined;
  onNavigate: (view: string, param?: string) => void;
  notifications: Notification[];
  onRefreshNotifications: () => void;
  onLogout?: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

const kind = (t: Notification['type']) => t === 'approval'
  ? { Icon: Check, cls: 'bg-success-soft text-success', label: 'Approval' }
  : t === 'correction' ? { Icon: AlertCircle, cls: 'bg-destructive-soft text-destructive', label: 'Correction' }
  : t === 'submission' ? { Icon: FileText, cls: 'bg-brand-soft text-primary', label: 'Submission' }
  : t === 'reminder' ? { Icon: Clock, cls: 'bg-warning-soft text-warning', label: 'Reminder' }
  : { Icon: Info, cls: 'bg-info-soft text-info', label: 'System' };

function timeAgo(iso: string) {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onOpenMobile, activeViewTitle, section, onNavigate, notifications, onRefreshNotifications, onLogout }) => {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>('system');
  useEffect(() => { setTheme(DisplaySettingsService.getSettings().theme); }, [display]);
  const unread = notifications.filter(n => !n.read).length;
  const changeTheme = (t: string) => { const next = { ...DisplaySettingsService.getSettings(), theme: t as ThemePreference }; DisplaySettingsService.saveSettings(next); setTheme(next.theme); };
  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  const openNotif = async (n: Notification) => {
    if (!n.read) { await NotificationService.markAsRead(n.id); onRefreshNotifications(); }
    setOpen(false);
    if (n.linkReportId) onNavigate(n.linkReportType === 'weekly' ? 'weekly_report_detail' : 'daily_report_detail', n.linkReportId);
  };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-8">
        <Button variant="ghost" size="icon" onClick={onOpenMobile} className="lg:hidden -ml-2" aria-label="Open navigation"><Menu className="size-5" /></Button>
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <span>Plants & Pure</span>{section && <><ChevronRight className="size-3" /><span>{section}</span></>}
          </nav>
          <h2 className="truncate text-[15px] sm:text-lg font-semibold leading-tight text-foreground">{activeViewTitle}</h2>
        </div>

        <button onClick={() => onNavigate('records')} className="hidden md:flex h-9 w-56 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] text-muted-foreground transition-colors hover:border-input hover:text-foreground">
          <Search className="size-4" /> Search records…
        </button>
        <Button size="sm" onClick={() => onNavigate('daily_report_new')} className="h-9 gap-1.5">
          <Plus className="size-4" /><span className="hidden sm:inline">Daily report</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Theme"><ThemeIcon className="size-[18px]" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground font-medium">Appearance</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={theme} onValueChange={changeTheme}>
              <DropdownMenuRadioItem value="light"><Sun className="mr-2 size-4" />Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon className="mr-2 size-4" />Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system"><Monitor className="mr-2 size-4" />System</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDisplay(true)}><Sliders className="mr-2 size-4" />Display & accessibility</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
              <Bell className="size-[18px]" />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground ring-2 ring-background">{unread > 9 ? '9+' : unread}</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={10} className="w-[min(92vw,380px)] p-0 overflow-hidden rounded-xl shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div><p className="text-sm font-semibold">Notifications</p><p className="text-[11.5px] text-muted-foreground">{unread ? `${unread} unread` : 'You’re all caught up'}</p></div>
              {unread > 0 && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={async () => { await NotificationService.markAllAsRead(currentUser.id); onRefreshNotifications(); }}><CheckCheck className="size-3.5" />Mark all read</Button>}
            </div>
            <InstallAppButton variant="row" />
            <PhoneAlertsRow />
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-6 py-10 text-center"><div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-muted"><Bell className="size-4 text-muted-foreground" /></div><p className="text-sm font-medium">No notifications yet</p><p className="mt-1 text-xs text-muted-foreground">Report submissions and reviews will appear here.</p></div>
              ) : notifications.slice(0, 20).map(n => { const k = kind(n.type); return (
                <button key={n.id} onClick={() => void openNotif(n)} className={cn('flex w-full gap-3 border-b border-border/70 px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted', !n.read && 'bg-brand-wash/60')}>
                  <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', k.cls)}><k.Icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="truncate text-[13px] font-semibold">{n.title}</span>{!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Unread" />}</span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">{k.label} · {timeAgo(n.createdAt)}</span>
                  </span>
                </button>); })}
            </div>
            {notifications.length > 0 && <div className="border-t border-border p-2"><Button variant="ghost" className="w-full h-9 text-xs" onClick={() => { setOpen(false); onNavigate(currentUser.role === 'employee' ? 'daily_reports' : 'approvals'); }}>View all activity</Button></div>}
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hidden sm:flex items-center gap-2 rounded-full p-0.5 pr-2 hover:bg-muted" aria-label="Account menu">
              <span className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-accent-foreground">{initials(currentUser.name)}</span>
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel><p className="text-sm font-semibold">{currentUser.name}</p><p className="text-xs font-normal text-muted-foreground">{currentUser.roleTitle}</p></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onNavigate('settings')}><Settings className="mr-2 size-4" />Settings</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDisplay(true)}><Sliders className="mr-2 size-4" />Display & accessibility</DropdownMenuItem>
            {onLogout && <><DropdownMenuSeparator /><DropdownMenuItem onSelect={onLogout} className="text-destructive focus:text-destructive"><LogOut className="mr-2 size-4" />Log out</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {display && <DisplaySettingsModal onClose={() => setDisplay(false)} />}
    </header>
  );
};
