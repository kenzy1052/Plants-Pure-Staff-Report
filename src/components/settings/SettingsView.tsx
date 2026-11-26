import { isDemoSession } from '@/services/session';
import { toast } from 'sonner';
import { confirmAction } from '../common/ConfirmDialog';
import { Button } from "@/components/ui/button";
import React, { useState } from 'react';
import { 
  Settings, 
  Building2, 
  Clock, 
  ShieldCheck, 
  Database, 
  FileText, 
  Save, 
  RefreshCw, 
  Download, 
  Upload, 
  Plus, 
  Edit2, 
  X, 
  Check, 
  AlertTriangle,
  History,
  FileSpreadsheet,
  Sliders,
  Type,
  Layout,
  Eye
} from 'lucide-react';
import { 
  OrganisationSettings, 
  RoleDesignation, 
  AuditLog, 
  User as UserType 
} from '../../types';
import { 
  SettingsService, 
  RoleService, 
  BackupService, 
  resetToDemoData 
} from '../../services/storageService';
import { DisplaySettingsService, DisplaySettings } from '../../services/displaySettings';

interface SettingsViewProps {
  currentUser: UserType;
  settings: OrganisationSettings;
  roles: RoleDesignation[];
  auditLogs: AuditLog[];
  onRefreshAll: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  settings,
  roles,
  auditLogs,
  onRefreshAll
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'reporting' | 'roles' | 'backup' | 'audit' | 'display'>('general');
  const [displayPrefs, setDisplayPrefs] = useState<DisplaySettings>(() => DisplaySettingsService.getSettings());

  const handleUpdateDisplay = (upd: Partial<DisplaySettings>) => {
    const next = { ...displayPrefs, ...upd };
    setDisplayPrefs(next);
    DisplaySettingsService.saveSettings(next);
  };

  // General Settings Form
  const [orgName, setOrgName] = useState(settings.organisationName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [contactEmail, setContactEmail] = useState(settings.contactEmail);
  const [contactPhone, setContactPhone] = useState(settings.contactPhone);
  const [address, setAddress] = useState(settings.address);

  // Reporting Settings Form
  const [dailyDeadlineTime, setDailyDeadlineTime] = useState(settings.dailyDeadlineTime || '17:30');
  const [reportingStartDate, setReportingStartDateState] = useState(settings.reportingStartDate || '2026-11-02');
  const [weeklyDeadlineTime, setWeeklyDeadlineTime] = useState(settings.weeklyDeadlineTime || '18:00');
  const [requireObjectives, setRequireObjectives] = useState(settings.requireObjectivesBeforeSubmit ?? true);
  const [allowWeekend, setAllowWeekend] = useState(settings.allowWeekendSubmissions ?? false);

  // Status banners
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Roles modal
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDesignation | null>(null);
  const [roleTitle, setRoleTitle] = useState('');
  const [roleDept, setRoleDept] = useState('');
  const [roleDesc, setRoleDesc] = useState('');

  // Backup state
  const [includeAttachmentsInBackup, setIncludeAttachmentsInBackup] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const isAdminOrCeo = currentUser.role === 'admin' || currentUser.role === 'ceo';

  // Save General / Reporting Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await SettingsService.updateSettings({
        organisationName: orgName,
        tagline,
        contactEmail,
        contactPhone,
        address,
        dailyDeadlineTime,
        reportingStartDate,
        weeklyDeadlineTime,
        requireObjectivesBeforeSubmit: requireObjectives,
        allowWeekendSubmissions: allowWeekend
      }, currentUser);
      setSaveSuccessMsg('Organisation settings updated successfully.');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
      onRefreshAll();
    } catch (err: any) {
      toast.error('Could not complete action', { description: `Error saving settings: ${err.message}` });
    }
  };

  // Roles handlers
  const handleOpenAddRole = () => {
    setEditingRole(null);
    setRoleTitle('');
    setRoleDept('Agriculture & Cultivation');
    setRoleDesc('');
    setShowRoleModal(true);
  };

  const handleOpenEditRole = (r: RoleDesignation) => {
    setEditingRole(r);
    setRoleTitle(r.title);
    setRoleDept(r.department);
    setRoleDesc(r.description);
    setShowRoleModal(true);
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await RoleService.updateRole(editingRole.id, {
          title: roleTitle,
          department: roleDept,
          description: roleDesc
        }, currentUser);
      } else {
        await RoleService.createRole({
          title: roleTitle,
          department: roleDept,
          description: roleDesc,
          active: true
        }, currentUser);
      }
      setShowRoleModal(false);
      onRefreshAll();
    } catch (err: any) {
      toast.error('Could not complete action', { description: `Error saving role: ${err.message}` });
    }
  };

  // Backup Export
  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const json = await BackupService.exportBackup(includeAttachmentsInBackup);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PlantsAndPure_Backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error('Backup failed', { description: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  // Backup Import
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!(await confirmAction({ title: 'Restore this backup?', description: 'Current records will be replaced with the contents of the backup file.', confirmLabel: 'Restore backup', destructive: true }))) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const res = await BackupService.importBackup(text, currentUser);
      if (res.success) {
        setImportStatus('Backup restored successfully!');
        onRefreshAll();
      } else {
        setImportStatus(`Restore error: ${res.message}`);
      }
      setTimeout(() => setImportStatus(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Reset Demo Data
  const handleResetData = async () => {
    if (await confirmAction({ title: 'Reset demonstration data?', description: 'All demonstration records in this browser session will be cleared. This cannot be undone.', confirmLabel: 'Reset data', destructive: true })) {
      setIsResetting(true);
      await resetToDemoData();
      setIsResetting(false);
      onRefreshAll();
      toast.success('Demonstration data reset', { description: 'The workspace is back to its starting state.' });
    }
  };

  if (currentUser.role === 'employee') {
    const fontOptions = [
      { id: 'normal', label: 'Standard', desc: '16px' },
      { id: 'large', label: 'Large', desc: '18px' },
      { id: 'xlarge', label: 'Extra large', desc: '20px' },
      { id: 'xxlarge', label: 'Very large', desc: '22px' },
      { id: 'huge', label: 'Maximum', desc: '24px' },
    ];
    return <div className="space-y-6 max-w-4xl mx-auto fade-up"><div className="bg-card p-6 rounded-2xl border border-border shadow-[var(--shadow-soft)]"><span className="text-xs font-bold uppercase tracking-[.12em] text-primary">Personal preferences</span><h1 className="text-2xl font-bold mt-2">Your settings</h1><p className="text-sm text-muted-foreground mt-2">Only settings that affect your own reading experience are shown here.</p></div><div className="bg-card p-6 rounded-2xl border border-border shadow-[var(--shadow-soft)] space-y-6"><div><h2 className="font-bold flex items-center gap-2"><Type className="w-4 h-4 text-primary" /> Text size</h2><p className="text-sm text-muted-foreground mt-1">Choose a comfortable size for phone and desktop screens.</p><div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">{fontOptions.map(option => <Button variant="legacy" key={option.id} type="button" onClick={() => handleUpdateDisplay({ fontSize: option.id as DisplaySettings['fontSize'] })} className={`h-auto p-3 rounded-xl border text-left ${displayPrefs.fontSize === option.id ? 'border-primary bg-brand-wash text-primary font-bold' : 'border-border bg-card'}`}><span className="block text-sm">{option.label}</span><span className="block text-xs text-muted-foreground mt-1">{option.desc}</span></Button>)}</div></div><div className="pt-5 border-t border-border"><h2 className="font-bold flex items-center gap-2"><Layout className="w-4 h-4 text-primary" /> Breathing room</h2><p className="text-sm text-muted-foreground mt-1">Increase space between cards, rows, and controls.</p><div className="grid grid-cols-3 gap-2 mt-4">{(['compact', 'comfortable', 'spacious'] as const).map(density => <Button variant="legacy" key={density} type="button" onClick={() => handleUpdateDisplay({ displayDensity: density })} className={`h-auto p-3 rounded-xl border capitalize ${displayPrefs.displayDensity === density ? 'border-primary bg-brand-wash text-primary font-bold' : 'border-border bg-card'}`}>{density}</Button>)}</div></div><label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-muted/40"><span><span className="block font-semibold text-sm">High contrast borders</span><span className="block text-xs text-muted-foreground mt-1">Make cards and controls easier to distinguish.</span></span><input type="checkbox" checked={displayPrefs.highContrast} onChange={event => handleUpdateDisplay({ highContrast: event.target.checked })} className="size-5 rounded border-border text-primary focus:ring-primary" /></label></div></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-normal">
            System Configuration & Storage
          </span>
          <h1 className="text-2xl font-bold text-foreground  mt-0.5">
            Settings & Data Management
          </h1>
          <p className="text-xs text-muted-foreground  mt-0.5">
            Configure reporting policies, staff designations, backup exports, and inspect audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono bg-muted  text-foreground  px-2.5 py-1 rounded border border-border ">
            Reporting workspace
          </span>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-4 bg-success-soft  border border-success  rounded-lg text-xs font-medium text-success ">
          {saveSuccessMsg}
        </div>
      )}

      {/* Tabs Bar */}
      <div className="bg-card  p-3 rounded-lg border border-border  shadow-xs flex items-center gap-2 overflow-x-auto text-xs">
        <Button variant="legacy"
          onClick={() => setActiveTab('general')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'general' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground  hover:bg-muted '
          }`}
        >
          Organisation Profile
        </Button>
        <Button variant="legacy"
          onClick={() => setActiveTab('reporting')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'reporting' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground  hover:bg-muted '
          }`}
        >
          Reporting Deadlines & Schedule
        </Button>
        <Button variant="legacy"
          onClick={() => setActiveTab('roles')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'roles' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground  hover:bg-muted '
          }`}
        >
          Staff Designations ({roles.length})
        </Button>
        <Button variant="legacy"
          onClick={() => setActiveTab('backup')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'backup' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground  hover:bg-muted '
          }`}
        >
          Backup & Data Persistence
        </Button>
        <Button variant="legacy"
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'audit' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground  hover:bg-muted '
          }`}
        >
          System Audit Trail ({auditLogs.length})
        </Button>
        <Button variant="legacy"
          onClick={() => setActiveTab('display')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap ${
            activeTab === 'display' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground  hover:bg-muted '
          }`}
        >
          Display & Customization
        </Button>
      </div>

      {/* Tab 1: General Organisation Profile */}
      {activeTab === 'general' && (
        <form onSubmit={handleSaveSettings} className="bg-card  p-6 rounded-lg border border-border  shadow-xs space-y-4">
          <div className="border-b border-border  pb-3">
            <h3 className="text-base font-bold text-foreground ">
              Organisation Identity & Brand Information
            </h3>
            <p className="text-xs text-muted-foreground ">
              Appears on generated PDF, Word, and official report sheet headers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-foreground  mb-1">
                Company Legal Name
              </label>
              <input
                type="text"
                disabled={!isAdminOrCeo}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground "
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground  mb-1">
                System Tagline
              </label>
              <input
                type="text"
                disabled={!isAdminOrCeo}
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground "
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground  mb-1">
                Operations Email
              </label>
              <input
                type="email"
                disabled={!isAdminOrCeo}
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground "
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground  mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                disabled={!isAdminOrCeo}
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground "
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-foreground  mb-1">
                Headquarters Address
              </label>
              <input
                type="text"
                disabled={!isAdminOrCeo}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground "
              />
            </div>
          </div>

          {isAdminOrCeo && (
            <div className="pt-3 border-t border-border  flex justify-end">
              <Button variant="legacy"
                type="submit"
                className="px-5 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm"
              >
                Save Organisation Profile
              </Button>
            </div>
          )}
        </form>
      )}

      {/* Tab 2: Reporting Deadlines & Schedule */}
      {activeTab === 'reporting' && (
        <form onSubmit={handleSaveSettings} className="bg-card  p-6 rounded-lg border border-border  shadow-xs space-y-4">
          <div className="border-b border-border  pb-3">
            <h3 className="text-base font-bold text-foreground ">
              Reporting Rules & Submission Deadlines
            </h3>
            <p className="text-xs text-muted-foreground ">
              Configure daily and weekly report cutoffs and compliance parameters.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-foreground  mb-1">
                Week 1 starts on
              </label>
              <input
                type="date"
                disabled={!isAdminOrCeo}
                value={reportingStartDate}
                onChange={(e) => setReportingStartDateState(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground  font-mono"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Pick the Monday of your first reporting week. Every week after it is numbered Week 2, Week 3 and so on.
              </span>
            </div>
            <div>
              <label className="block font-semibold text-foreground  mb-1">
                Daily Report Submission Cutoff Time
              </label>
              <input
                type="time"
                disabled={!isAdminOrCeo}
                value={dailyDeadlineTime}
                onChange={(e) => setDailyDeadlineTime(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground  font-mono"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Reports submitted after this time are flagged as late on compliance dashboards.
              </span>
            </div>

            <div>
              <label className="block font-semibold text-foreground  mb-1">
                Weekly Report Submission Cutoff (Friday)
              </label>
              <input
                type="time"
                disabled={!isAdminOrCeo}
                value={weeklyDeadlineTime}
                onChange={(e) => setWeeklyDeadlineTime(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-border  bg-card  text-foreground  font-mono"
              />
              <span className="text-[11px] text-muted-foreground mt-1 block">
                Standard Friday deadline for compiling daily logs via Smart Report Assistant.
              </span>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdminOrCeo}
                checked={requireObjectives}
                onChange={(e) => setRequireObjectives(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="font-medium text-foreground ">
                Enforce mandatory objectives entry before allowing daily submission
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                disabled={!isAdminOrCeo}
                checked={allowWeekend}
                onChange={(e) => setAllowWeekend(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span className="font-medium text-foreground ">
                Allow optional weekend submissions (Disabled by default; Monday to Friday is the official work week)
              </span>
            </label>
          </div>

          {isAdminOrCeo && (
            <div className="pt-3 border-t border-border  flex justify-end">
              <Button variant="legacy"
                type="submit"
                className="px-5 py-2 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm"
              >
                Save Reporting Settings
              </Button>
            </div>
          )}
        </form>
      )}

      {/* Tab 3: Staff Designations Configuration */}
      {activeTab === 'roles' && (
        <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border  pb-3">
            <div>
              <h3 className="text-base font-bold text-foreground ">
                Central Staff Designation Registry
              </h3>
              <p className="text-xs text-muted-foreground ">
                Central role configuration rather than hardcoded component strings.
              </p>
            </div>
            {isAdminOrCeo && (
              <Button variant="legacy"
                onClick={handleOpenAddRole}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Designation</span>
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roles.map(r => (
              <div 
                key={r.id} 
                className="p-4 rounded-lg border border-border  bg-muted/50  flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-foreground ">
                      {r.title}
                    </h4>
                    <span className="text-[10px] uppercase font-bold text-success  bg-success-soft  px-2 py-0.5 rounded">
                      Active
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-primary  mt-1">
                    {r.department}
                  </div>
                  <p className="text-xs text-muted-foreground  mt-2 leading-relaxed">
                    {r.description}
                  </p>
                </div>

                {isAdminOrCeo && (
                  <div className="mt-4 pt-3 border-t border-border/60  flex justify-end">
                    <Button variant="legacy"
                      onClick={() => handleOpenEditRole(r)}
                      className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit Designation</span>
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Backup & Data Persistence */}
      {activeTab === 'backup' && (
        <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs space-y-6">
          <div className="border-b border-border  pb-3">
            <h3 className="text-base font-bold text-foreground ">
              Report backup
            </h3>
            <p className="text-xs text-muted-foreground ">
              
            </p>
          </div>

          {importStatus && (
            <div className="p-3 rounded-lg bg-success-soft  border border-success text-xs font-medium text-success ">
              {importStatus}
            </div>
          )}

          {/* Backup Options Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* Export Backup Card */}
            <div className="p-5 rounded-lg border border-border  bg-background  flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2 text-foreground  font-bold text-sm">
                  <Download className="w-4 h-4 text-primary" />
                  <span>Export JSON Application Backup</span>
                </div>
                <p className="text-muted-foreground mt-1 leading-relaxed">
                  Downloads a complete structured snapshot of all employees, roles, daily reports, weekly summaries, audit logs, and notification records.
                </p>

                <div className="mt-4">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground ">
                    <input
                      type="checkbox"
                      checked={includeAttachmentsInBackup}
                      onChange={(e) => setIncludeAttachmentsInBackup(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Include evidence attachments & photographs</span>
                  </label>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    Uncheck if you prefer a compact lightweight JSON text backup.
                  </span>
                </div>
              </div>

              <Button variant="legacy"
                type="button"
                onClick={handleExportBackup}
                disabled={isExporting}
                className="w-full py-2.5 px-4 bg-primary hover:bg-primary text-primary-foreground font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>{isExporting ? 'Generating Archive...' : 'Download JSON Backup'}</span>
              </Button>
            </div>

            {/* Restore Backup Card */}
            <div className="p-5 rounded-lg border border-border  bg-background  flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center gap-2 text-foreground  font-bold text-sm">
                  <Upload className="w-4 h-4 text-primary" />
                  <span>Restore from JSON Backup</span>
                </div>
                <p className="text-muted-foreground mt-1 leading-relaxed">
                  Upload an existing Plants & Pure JSON backup file to restore records across browser sessions or import from another computer.
                </p>
              </div>

              <label className="w-full py-2.5 px-4 bg-card  border border-border  hover:bg-muted  text-foreground  font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                <span>Select Backup File (.json)</span>
                <input
                  type="file"
                  accept="application/json"
                  onChange={handleImportBackup}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {isDemoSession() && <div className="p-5 rounded-lg border border-destructive  bg-destructive-soft/40  flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-destructive  font-bold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Reset Demonstration Data</span>
              </div>
              <p className="text-xs text-destructive/80  mt-0.5">
                Restores pre-seeded employees, sample multi-week daily reports, and approved weekly summaries to initial factory state.
              </p>
            </div>

            <Button variant="legacy"
              type="button"
              onClick={handleResetData}
              disabled={isResetting}
              className="px-4 py-2 bg-destructive hover:bg-destructive text-primary-foreground text-xs font-semibold rounded-lg shadow-xs shrink-0"
            >
              {isResetting ? 'Resetting...' : 'Reset to Demo State'}
            </Button>
          </div>}
        </div>
      )}

      {/* Tab 5: Audit Log Trail */}
      {activeTab === 'audit' && (
        <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border  pb-3">
            <div>
              <h3 className="text-base font-bold text-foreground ">
                Audit trail
              </h3>
              <p className="text-xs text-muted-foreground ">
                Immutable records of report submissions, approvals, profile creations, and settings updates.
              </p>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {auditLogs.length} Events Logged
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted  border-b border-border  text-muted-foreground uppercase tracking-normal text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Event Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border  font-mono text-[11px]">
                {auditLogs.slice(0, 20).map(log => (
                  <tr key={log.id} className="hover:bg-muted/50 ">
                    <td className="py-2.5 px-3 text-muted-foreground tabular-nums">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium text-foreground ">
                      {log.userName} ({log.userRole})
                    </td>
                    <td className="py-2.5 px-3 text-primary font-bold">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-foreground ">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 6: Display & Accessibility Customization */}
      {activeTab === 'display' && (
        <div className="bg-card  p-6 rounded-lg border border-border  shadow-xs space-y-6">
          <div className="border-b border-border  pb-3">
            <h3 className="text-sm font-bold text-foreground  flex items-center gap-2">
              <Sliders className="w-4 h-4 text-primary" />
              <span>Interface & Display Customization</span>
            </h3>
            <p className="text-xs text-muted-foreground  mt-0.5">
              Personalize font sizing, layout density, and interface contrast. All preferences persist in your browser.
            </p>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-foreground  flex items-center gap-1.5">
              <Type className="w-4 h-4 text-primary" />
              <span>Preferred Font Size</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'small', label: 'Small (13px)', desc: 'Compact font for high information density' },
                { id: 'normal', label: 'Normal (14px)', desc: 'Balanced standard corporate typography' },
                { id: 'large', label: 'Large (16px)', desc: 'Enhanced legibility and generous sizing' }
              ].map(f => (
                <Button variant="legacy"
                  key={f.id}
                  type="button"
                  onClick={() => handleUpdateDisplay({ fontSize: f.id as any })}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    displayPrefs.fontSize === f.id
                      ? 'border-primary bg-brand-wash  text-primary  font-bold shadow-xs'
                      : 'border-border  bg-card  text-foreground  hover:border-border'
                  }`}
                >
                  <div className="text-sm font-semibold">{f.label}</div>
                  <div className="text-xs text-muted-foreground  mt-1">{f.desc}</div>
                </Button>
              ))}
            </div>
          </div>

          {/* Spacing & Density */}
          <div className="space-y-2 pt-3 border-t border-border ">
            <label className="block text-xs font-bold text-foreground  flex items-center gap-1.5">
              <Layout className="w-4 h-4 text-primary" />
              <span>Interface Spacing & Density</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { id: 'compact', label: 'Compact', desc: 'Tighter row gaps, more items per screen' },
                { id: 'comfortable', label: 'Comfortable', desc: 'Standard balanced spacing for daily work' },
                { id: 'spacious', label: 'Spacious', desc: 'Generous breathing room and larger touch areas' }
              ].map(d => (
                <Button variant="legacy"
                  key={d.id}
                  type="button"
                  onClick={() => handleUpdateDisplay({ displayDensity: d.id as any })}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    displayPrefs.displayDensity === d.id
                      ? 'border-primary bg-brand-wash  text-primary  font-bold shadow-xs'
                      : 'border-border  bg-card  text-foreground  hover:border-border'
                  }`}
                >
                  <div className="text-sm font-semibold">{d.label}</div>
                  <div className="text-xs text-muted-foreground  mt-1">{d.desc}</div>
                </Button>
              ))}
            </div>
          </div>

          {/* Contrast & Accessibility */}
          <div className="space-y-3 pt-3 border-t border-border ">
            <label className="flex items-center justify-between p-3.5 rounded-lg border border-border  bg-muted/50  cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-success-soft  text-primary  flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground ">
                    High Contrast Border Enhancement
                  </div>
                  <div className="text-xs text-muted-foreground ">
                    Reinforces table lines, boundaries, and button perimeters for maximum legibility
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={displayPrefs.highContrast}
                onChange={(e) => handleUpdateDisplay({ highContrast: e.target.checked })}
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
              />
            </label>
          </div>
        </div>
      )}

      {/* Role Add/Edit Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-card  rounded-lg shadow-2xl max-w-md w-full border border-border  p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border  pb-3">
              <h3 className="text-base font-bold text-foreground ">
                {editingRole ? 'Edit Staff Designation' : 'Add New Designation'}
              </h3>
              <Button variant="legacy" onClick={() => setShowRoleModal(false)} className="text-muted-foreground hover:text-muted-foreground">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <form onSubmit={handleSaveRole} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-foreground  mb-1">
                  Designation Title *
                </label>
                <input
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g. Quality Assurance Specialist"
                  className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-foreground  mb-1">
                  Department *
                </label>
                <select
                  value={roleDept}
                  onChange={(e) => setRoleDept(e.target.value)}
                  className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
                >
                  <option value="Agriculture & Cultivation">Agriculture & Cultivation</option>
                  <option value="Production & Processing">Production & Processing</option>
                  <option value="Commercial & Marketing">Commercial & Marketing</option>
                  <option value="Digital Systems & Communications">Digital Systems & Communications</option>
                  <option value="Quality Assurance & Regulatory">Quality Assurance & Regulatory</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-foreground  mb-1">
                  Role Description & Core Responsibilities
                </label>
                <textarea
                  rows={3}
                  value={roleDesc}
                  onChange={(e) => setRoleDesc(e.target.value)}
                  placeholder="Summarize key reporting areas..."
                  className="w-full p-2 rounded-lg border border-border  bg-card  text-foreground "
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border ">
                <Button variant="legacy"
                  type="button"
                  onClick={() => setShowRoleModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-muted-foreground  hover:bg-muted rounded-lg"
                >
                  Cancel
                </Button>
                <Button variant="legacy"
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-lg shadow-sm"
                >
                  Save Designation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
