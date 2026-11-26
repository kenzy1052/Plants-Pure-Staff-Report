import { dbService } from './db';
import { 
  Employee, 
  RoleDesignation, 
  DailyReport, 
  WeeklyReport, 
  Notification, 
  AuditLog, 
  OrganisationSettings, 
  User, 
  ReportReview,
  EvidenceAttachment
} from '../types';
import { 
  INITIAL_ROLES, 
  INITIAL_EMPLOYEES, 
  INITIAL_SETTINGS, 
  INITIAL_DAILY_REPORTS, 
  INITIAL_WEEKLY_REPORTS, 
  INITIAL_NOTIFICATIONS, 
  INITIAL_AUDIT_LOGS,
  DEMO_USERS 
} from './seedData';

import { supabase } from '@/integrations/supabase/client';
import { getCloudUser } from './cloud.functions';
import { getSessionUser, setSessionUser, isDemoSession } from './session';
import { getReportRecipient } from './reportRecipient';
import { canReadReport, canReviewReport } from './access';

export async function initializeDatabase(): Promise<void> {
  if (!isDemoSession()) return;
  if (!(await dbService.getAll('roles')).length) {
    await dbService.bulkPut('employees', INITIAL_EMPLOYEES);
    await dbService.bulkPut('roles', INITIAL_ROLES);
    await dbService.put('settings', {key:'main', ...INITIAL_SETTINGS});
  }
}
export async function resetToDemoData(): Promise<void> {
  if (!isDemoSession()) throw new Error('Live records cannot be reset to demo data.');
  for (const store of ['employees','roles','settings','daily_reports','weekly_reports','notifications','audit_logs','evidence_attachments'] as const) await dbService.clearStore(store);
  await initializeDatabase();
}
export const AuthService = {
  getCurrentUser: getSessionUser,
  setCurrentUser(user: User | null) { setSessionUser(user, true); },
  async login(email: string, password: string): Promise<{success:boolean; user?:User; error?:string}> {
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error) return {success:false,error:error.message};
    try { const user=await getCloudUser(); setSessionUser(user,false); return {success:true,user}; }
    catch(e) { return {success:false,error:e instanceof Error?e.message:'Could not load staff profile.'}; }
  },
  async logout() { try { const { unsubscribePush } = await import('@/lib/pushClient'); await unsubscribePush(); } catch { /* ignore */ } setSessionUser(null,true); await supabase.auth.signOut(); },
  getAllDemoUsers() { return DEMO_USERS; }
};

// ---------------------------------------------------------------------------
// Employee Service
// ---------------------------------------------------------------------------
export const EmployeeService = {
  async getAllEmployees(): Promise<Employee[]> {
    return await dbService.getAll<Employee>('employees');
  },

  async getEmployeeById(id: string): Promise<Employee | null> {
    return await dbService.get<Employee>('employees', id);
  },

  async createEmployee(employee: Omit<Employee, 'id'>, actor: User): Promise<Employee> {
    const newEmp: Employee = {
      ...employee,
      id: `emp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    };
    await dbService.put('employees', newEmp);
    await AuditService.logAction(actor, 'EMPLOYEE_CREATED', `Created employee ${newEmp.name} (${newEmp.employeeId})`, newEmp.id, 'employee');
    await NotificationService.createNotification({
      recipientId: actor.id,
      title: 'Employee Profile Created',
      message: `Staff record for ${newEmp.name} (${newEmp.roleTitle}) was successfully registered.`,
      type: 'account'
    });
    return newEmp;
  },

  async updateEmployee(id: string, updates: Partial<Employee>, actor: User): Promise<Employee> {
    const existing = await this.getEmployeeById(id);
    if (!existing) throw new Error('Employee not found');
    const updated: Employee = { ...existing, ...updates };
    await dbService.put('employees', updated);
    await AuditService.logAction(actor, 'EMPLOYEE_UPDATED', `Updated record for ${updated.name}`, id, 'employee');
    return updated;
  },

  async toggleEmployeeStatus(id: string, actor: User): Promise<Employee> {
    const existing = await this.getEmployeeById(id);
    if (!existing) throw new Error('Employee not found');
    const newStatus = existing.status === 'active' ? 'inactive' : 'active';
    const updated: Employee = { ...existing, status: newStatus };
    await dbService.put('employees', updated);
    await AuditService.logAction(actor, 'EMPLOYEE_STATUS_CHANGED', `Changed status of ${existing.name} to ${newStatus}`, id, 'employee');
    return updated;
  }
};

// ---------------------------------------------------------------------------
// Role Service
// ---------------------------------------------------------------------------
export const RoleService = {
  async getAllRoles(): Promise<RoleDesignation[]> {
    return await dbService.getAll<RoleDesignation>('roles');
  },

  async createRole(role: Omit<RoleDesignation, 'id'>, actor: User): Promise<RoleDesignation> {
    const newRole: RoleDesignation = {
      ...role,
      id: `role_${Date.now()}`
    };
    await dbService.put('roles', newRole);
    await AuditService.logAction(actor, 'ROLE_CREATED', `Created designation ${newRole.title}`, newRole.id, 'role');
    return newRole;
  },

  async updateRole(id: string, updates: Partial<RoleDesignation>, actor: User): Promise<RoleDesignation> {
    const existing = await dbService.get<RoleDesignation>('roles', id);
    if (!existing) throw new Error('Role not found');
    const updated: RoleDesignation = { ...existing, ...updates };
    await dbService.put('roles', updated);
    await AuditService.logAction(actor, 'ROLE_UPDATED', `Updated designation ${updated.title}`, id, 'role');
    return updated;
  }
};

// ---------------------------------------------------------------------------
// Daily Report Service
// ---------------------------------------------------------------------------
export const DailyReportService = {
  async getAllDailyReports(): Promise<DailyReport[]> {
    const reports = await dbService.getAll<DailyReport>('daily_reports');
    const actor=getSessionUser();
    return reports.filter(r => actor && canReadReport(actor,r)).sort((a, b) => b.date.localeCompare(a.date));
  },

  async getReportsByEmployee(employeeId: string): Promise<DailyReport[]> {
    const all = await this.getAllDailyReports();
    return all.filter(r => r.employeeId === employeeId);
  },

  async getReportsForSupervisor(supervisorId: string): Promise<DailyReport[]> {
    const all = await this.getAllDailyReports();
    return all.filter(r => r.submittedToId === supervisorId);
  },

  async getReportById(id: string): Promise<DailyReport | null> {
    return await dbService.get<DailyReport>('daily_reports', id);
  },

  async saveDraft(report: Partial<DailyReport>, actor: User): Promise<DailyReport> {
    const isNew = !report.id;
    const now = new Date().toISOString();
    const id = report.id || `dr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    
    // Auto generate code if new
    let reportCode = report.reportCode;
    if (!reportCode) {
      const all = await this.getAllDailyReports();
      const count = all.length + 1;
      const monthStr = (report.date || now.slice(0,10)).substring(0, 7);
      reportCode = `PP-DR-${monthStr}-${String(count).padStart(3, '0')}`;
    }

    // Daily reports always go to the fixed recipient (Madam Ursula). Callers cannot override it.
    // If the employee is the recipient herself, fall back to her own supervisor.
    const resolved = await getReportRecipient();
    const recipient = resolved.id === actor.id
      ? { id: actor.supervisorId || '', name: actor.supervisorName || '' }
      : resolved;

    const draftReport: DailyReport = {
      id,
      reportCode,
      employeeId: report.employeeId || actor.id,
      employeeName: report.employeeName || actor.name,
      employeeCode: report.employeeCode || actor.employeeId,
      roleTitle: report.roleTitle || actor.roleTitle,
      department: report.department || actor.department,
      date: report.date || now.slice(0,10),
      dayOfWeek: report.dayOfWeek || 'Monday',
      reportingPeriod: report.reportingPeriod || 'Current Week',
      submittedToId: recipient.id,
      submittedToName: recipient.name,
      startTime: report.startTime || '08:00',
      endTime: report.endTime || '17:00',
      status: 'draft',
      objectives: report.objectives || [],
      activities: report.activities || [],
      challenges: report.challenges || [],
      tomorrowPlans: report.tomorrowPlans || [],
      attachments: report.attachments || [],
      reviews: report.reviews || [],
      revisionHistory: report.revisionHistory || [],
      createdAt: report.createdAt || now,
      updatedAt: now
    };

    await dbService.put('daily_reports', draftReport);
    if (draftReport.attachments?.length) {
      await dbService.bulkPut('evidence_attachments', draftReport.attachments);
    }

    await AuditService.logAction(actor, isNew ? 'DAILY_REPORT_DRAFTED' : 'DAILY_REPORT_DRAFT_UPDATED', `Drafted report ${reportCode}`, id, 'daily_report');
    return draftReport;
  },

  async submitReport(id: string, actor: User): Promise<DailyReport> {
    const report = await this.getReportById(id);
    if (!report) throw new Error('Report not found');
    // Idempotent: a repeated click or a network retry must not submit or notify twice.
    if (report.status === 'submitted' || report.status === 'approved') return report;

    const now = new Date().toISOString();
    const wasReturned = report.status === 'returned';

    const revisionHistory = report.revisionHistory || [];
    if (wasReturned) {
      revisionHistory.push({
        editedAt: now,
        previousStatus: 'returned',
        notes: 'Resubmitted after employee addressed supervisor corrections.'
      });
    }

    const updated: DailyReport = {
      ...report,
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
      revisionHistory
    };

    await dbService.put('daily_reports', updated);
    await AuditService.logAction(
      actor, 
      wasReturned ? 'DAILY_REPORT_RESUBMITTED' : 'DAILY_REPORT_SUBMITTED', 
      `Submitted daily report ${updated.reportCode} (${updated.date})`, 
      id, 
      'daily_report'
    );

    // Notify supervisor/manager
    if (updated.submittedToId) {
      await NotificationService.createNotification({
        recipientId: updated.submittedToId,
        title: 'Daily Report Submitted',
        message: `${updated.employeeName} submitted daily report ${updated.reportCode} for ${updated.date}.`,
        type: 'submission',
        linkReportId: updated.id,
        linkReportType: 'daily'
      });
    }

    return updated;
  },

  async reviewReport(id: string, decision: 'approved' | 'returned', comments: string, actor: User): Promise<DailyReport> {
    const report = await this.getReportById(id);
    if (!report) throw new Error('Report not found');

    if (!canReviewReport(actor, report)) throw new Error('You cannot review this report.');
    const now = new Date().toISOString();
    const review: ReportReview = {
      id: `rev_${Date.now()}`,
      reviewerId: actor.id,
      reviewerName: actor.name,
      reviewerRole: actor.roleTitle,
      decision,
      comments,
      reviewedAt: now
    };

    const updated: DailyReport = {
      ...report,
      status: decision,
      updatedAt: now,
      reviews: [...(report.reviews || []), review]
    };

    await dbService.put('daily_reports', updated);
    await AuditService.logAction(
      actor,
      decision === 'approved' ? 'DAILY_REPORT_APPROVED' : 'DAILY_REPORT_RETURNED',
      `${decision === 'approved' ? 'Approved' : 'Returned'} report ${report.reportCode}: "${comments.substring(0, 80)}"`,
      id,
      'daily_report'
    );

    // Notify employee
    await NotificationService.createNotification({
      recipientId: report.employeeId,
      title: decision === 'approved' ? 'Daily Report Approved' : 'Daily Report Returned for Correction',
      message: `${actor.name} ${decision === 'approved' ? 'approved' : 'returned'} your report ${report.reportCode}. Feedback: "${comments}"`,
      type: decision === 'approved' ? 'approval' : 'correction',
      linkReportId: report.id,
      linkReportType: 'daily'
    });

    return updated;
  }
};

// ---------------------------------------------------------------------------
// Weekly Report Service
// ---------------------------------------------------------------------------
export const WeeklyReportService = {
  async getAllWeeklyReports(): Promise<WeeklyReport[]> {
    const reports = await dbService.getAll<WeeklyReport>('weekly_reports');
    const actor=getSessionUser();
    return reports.filter(r => actor && canReadReport(actor,r)).sort((a, b) => b.year !== a.year ? b.year - a.year : b.weekNumber - a.weekNumber);
  },

  async getReportsByEmployee(employeeId: string): Promise<WeeklyReport[]> {
    const all = await this.getAllWeeklyReports();
    return all.filter(r => r.employeeId === employeeId);
  },

  async getReportById(id: string): Promise<WeeklyReport | null> {
    return await dbService.get<WeeklyReport>('weekly_reports', id);
  },

  async saveReport(report: WeeklyReport, actor: User): Promise<WeeklyReport> {
    report.updatedAt = new Date().toISOString();
    await dbService.put('weekly_reports', report);
    await AuditService.logAction(actor, 'WEEKLY_REPORT_SAVED', `Saved weekly report ${report.reportCode}`, report.id, 'weekly_report');
    return report;
  },

  async submitReport(id: string, actor: User): Promise<WeeklyReport> {
    const report = await this.getReportById(id);
    if (!report) throw new Error('Weekly report not found');

    const now = new Date().toISOString();
    const updated: WeeklyReport = {
      ...report,
      status: 'submitted',
      employeeConfirmation: true,
      employeeSubmittedAt: now,
      updatedAt: now
    };

    await dbService.put('weekly_reports', updated);
    await AuditService.logAction(actor, 'WEEKLY_REPORT_SUBMITTED', `Submitted weekly report ${updated.reportCode} (Week ${updated.weekNumber})`, id, 'weekly_report');

    // Notify supervisor
    if (updated.submittedToId) {
      await NotificationService.createNotification({
        recipientId: updated.submittedToId,
        title: 'Weekly Report Submitted',
        message: `${updated.employeeName} submitted Weekly Report ${updated.reportCode} for Week ${updated.weekNumber}.`,
        type: 'submission',
        linkReportId: updated.id,
        linkReportType: 'weekly'
      });
    }

    return updated;
  },

  async reviewReport(id: string, decision: 'approved' | 'returned', comments: string, rating: number | undefined, actor: User): Promise<WeeklyReport> {
    const report = await this.getReportById(id);
    if (!report) throw new Error('Weekly report not found');

    if (!canReviewReport(actor, report)) throw new Error('You cannot review this report.');
    const now = new Date().toISOString();
    const review: ReportReview = {
      id: `rev_w_${Date.now()}`,
      reviewerId: actor.id,
      reviewerName: actor.name,
      reviewerRole: actor.roleTitle,
      decision,
      comments,
      rating,
      reviewedAt: now
    };

    const updated: WeeklyReport = {
      ...report,
      status: decision,
      updatedAt: now,
      reviews: [...(report.reviews || []), review]
    };

    await dbService.put('weekly_reports', updated);
    await AuditService.logAction(
      actor,
      decision === 'approved' ? 'WEEKLY_REPORT_APPROVED' : 'WEEKLY_REPORT_RETURNED',
      `${decision === 'approved' ? 'Approved' : 'Returned'} weekly report ${report.reportCode}`,
      id,
      'weekly_report'
    );

    // Notify employee
    await NotificationService.createNotification({
      recipientId: report.employeeId,
      title: decision === 'approved' ? 'Weekly Report Approved' : 'Weekly Report Returned for Correction',
      message: `${actor.name} ${decision === 'approved' ? 'approved' : 'returned'} your Weekly Report ${report.reportCode}. Feedback: "${comments}"`,
      type: decision === 'approved' ? 'approval' : 'correction',
      linkReportId: report.id,
      linkReportType: 'weekly'
    });

    return updated;
  }
};

// ---------------------------------------------------------------------------
// Notification Service
// ---------------------------------------------------------------------------
export const NotificationService = {
  async getNotifications(recipientId: string): Promise<Notification[]> {
    const all = await dbService.getAll<Notification>('notifications');
    return all
      .filter(n => n.recipientId === recipientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createNotification(notif: Omit<Notification, 'id' | 'createdAt' | 'read'>): Promise<Notification> {
    const item: Notification = {
      ...notif,
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      read: false,
      createdAt: new Date().toISOString()
    };
    await dbService.put('notifications', item);
    return item;
  },

  async markAsRead(id: string): Promise<void> {
    const item = await dbService.get<Notification>('notifications', id);
    if (item) {
      item.read = true;
      await dbService.put('notifications', item);
    }
  },

  async markAllAsRead(recipientId: string): Promise<void> {
    const all = await this.getNotifications(recipientId);
    for (const notif of all) {
      if (!notif.read) {
        notif.read = true;
        await dbService.put('notifications', notif);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Audit Service
// ---------------------------------------------------------------------------
export const AuditService = {
  async getAllAuditLogs(): Promise<AuditLog[]> {
    const logs = await dbService.getAll<AuditLog>('audit_logs');
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  async logAction(
    actor: User,
    action: string,
    details: string,
    relatedRecordId?: string,
    relatedRecordType?: 'employee' | 'daily_report' | 'weekly_report' | 'settings' | 'role'
  ): Promise<AuditLog> {
    const log: AuditLog = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action,
      relatedRecordId,
      relatedRecordType,
      details,
      timestamp: new Date().toISOString()
    };
    await dbService.put('audit_logs', log);
    return log;
  }
};

// ---------------------------------------------------------------------------
// Settings Service
// ---------------------------------------------------------------------------
export const SettingsService = {
  async getSettings(): Promise<OrganisationSettings> {
    const item = await dbService.get<{ key: string } & OrganisationSettings>('settings', 'main');
    if (!item) return INITIAL_SETTINGS;
    const { key, ...rest } = item;
    return rest;
  },

  async updateSettings(settings: Partial<OrganisationSettings>, actor: User): Promise<OrganisationSettings> {
    const current = await this.getSettings();
    const updated: OrganisationSettings = { ...current, ...settings };
    await dbService.put('settings', { key: 'main', ...updated });
    await AuditService.logAction(actor, 'SETTINGS_UPDATED', `Organisation settings updated`, 'main', 'settings');
    return updated;
  }
};

// ---------------------------------------------------------------------------
// Backup & Recovery Service
// ---------------------------------------------------------------------------
export const BackupService = {
  async exportBackup(includeAttachments: boolean = true): Promise<string> {
    const employees = await dbService.getAll('employees');
    const roles = await dbService.getAll('roles');
    const settings = await dbService.getAll('settings');
    const dailyReports = await dbService.getAll('daily_reports');
    const weeklyReports = await dbService.getAll('weekly_reports');
    const notifications = await dbService.getAll('notifications');
    const auditLogs = await dbService.getAll('audit_logs');
    const evidenceAttachments = includeAttachments ? await dbService.getAll('evidence_attachments') : [];

    const payload = {
      version: '1.0',
      system: 'Plants & Pure Staff Reporting System',
      exportedAt: new Date().toISOString(),
      includeAttachments,
      data: {
        employees,
        roles,
        settings,
        dailyReports,
        weeklyReports,
        notifications,
        auditLogs,
        evidenceAttachments
      }
    };

    return JSON.stringify(payload, null, 2);
  },

  async importBackup(jsonString: string, actor: User): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed.data || !parsed.system) {
        return { success: false, message: 'Invalid backup file structure: missing signature or data payload.' };
      }

      const { data } = parsed;

      if (data.employees) await dbService.bulkPut('employees', data.employees);
      if (data.roles) await dbService.bulkPut('roles', data.roles);
      if (data.settings && data.settings.length) await dbService.bulkPut('settings', data.settings);
      if (data.dailyReports) await dbService.bulkPut('daily_reports', data.dailyReports);
      if (data.weeklyReports) await dbService.bulkPut('weekly_reports', data.weeklyReports);
      if (data.notifications) await dbService.bulkPut('notifications', data.notifications);
      if (data.auditLogs) await dbService.bulkPut('audit_logs', data.auditLogs);
      if (data.evidenceAttachments && data.evidenceAttachments.length) {
        await dbService.bulkPut('evidence_attachments', data.evidenceAttachments);
      }

      await AuditService.logAction(actor, 'BACKUP_RESTORED', `Imported backup dataset generated at ${parsed.exportedAt || 'Unknown'}`);
      return { success: true, message: 'Backup restored successfully.' };
    } catch (err: any) {
      return { success: false, message: `Restoration failed: ${err.message}` };
    }
  }
};
