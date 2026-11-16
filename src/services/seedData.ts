import { Employee, RoleDesignation, DailyReport, WeeklyReport, Notification, AuditLog, OrganisationSettings, User } from '../types';

export const INITIAL_ROLES: RoleDesignation[] = [
  {
    id: 'role_agri',
    title: 'Agriculture Officer',
    department: 'Agriculture & Cultivation',
    description: 'Oversees nursery management, crop health, organic fertilization, greenhouse climate, and harvesting operations.',
    active: true
  },
  {
    id: 'role_mgr',
    title: 'Operations & Cultivation Manager',
    department: 'Field Operations & Cultivation',
    description: 'Directs agricultural operations, reviews daily staff reports, evaluates weekly output, and manages farm resources.',
    active: true
  },
  {
    id: 'role_ceo',
    title: 'Chief Executive Officer',
    department: 'Executive Leadership',
    description: 'Directs strategic growth, organisation-wide performance, executive oversight, and corporate operations.',
    active: true
  }
];

// Exactly 3 Demo Accounts: CEO, Manager, Employee
export const DEMO_USERS: User[] = [
  {
    id: 'user_ceo',
    name: 'Dr. Tariq Al-Mansoor',
    email: 'ceo@plantsandpure.com',
    role: 'ceo',
    employeeId: 'PP-EXEC-001',
    department: 'Executive Leadership',
    roleTitle: 'Chief Executive Officer',
  },
  {
    id: 'user_mgr',
    name: 'Sarah Jenkins',
    email: 'sarah.j@plantsandpure.com',
    role: 'manager',
    employeeId: 'PP-MGR-002',
    department: 'Field Operations & Cultivation',
    roleTitle: 'Operations & Cultivation Manager',
    supervisorId: 'user_ceo',
    supervisorName: 'Dr. Tariq Al-Mansoor',
  },
  {
    id: 'user_emp',
    name: 'David Kalu',
    email: 'david.k@plantsandpure.com',
    role: 'employee',
    employeeId: 'PP-EMP-101',
    department: 'Agriculture & Cultivation',
    roleTitle: 'Agriculture Officer',
    supervisorId: 'user_mgr',
    supervisorName: 'Sarah Jenkins',
  }
];

export const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'user_emp',
    employeeId: 'PP-EMP-101',
    name: 'David Kalu',
    email: 'david.k@plantsandpure.com',
    phone: '+234 803 112 4589',
    roleId: 'role_agri',
    roleTitle: 'Agriculture Officer',
    department: 'Agriculture & Cultivation',
    supervisorId: 'user_mgr',
    supervisorName: 'Sarah Jenkins',
    status: 'active',
    dateAdded: '2026-01-15'
  },
  {
    id: 'user_mgr',
    employeeId: 'PP-MGR-002',
    name: 'Sarah Jenkins',
    email: 'sarah.j@plantsandpure.com',
    phone: '+234 802 884 9012',
    roleId: 'role_mgr',
    roleTitle: 'Operations & Cultivation Manager',
    department: 'Field Operations & Cultivation',
    supervisorId: 'user_ceo',
    supervisorName: 'Dr. Tariq Al-Mansoor',
    status: 'active',
    dateAdded: '2025-11-01'
  },
  {
    id: 'user_ceo',
    employeeId: 'PP-EXEC-001',
    name: 'Dr. Tariq Al-Mansoor',
    email: 'ceo@plantsandpure.com',
    phone: '+234 809 110 0001',
    roleId: 'role_ceo',
    roleTitle: 'Chief Executive Officer',
    department: 'Executive Leadership',
    status: 'active',
    dateAdded: '2025-01-01'
  }
];

export const INITIAL_SETTINGS: OrganisationSettings = {
  organisationName: 'Plants and Pure',
  tagline: 'Staff Reporting & Performance Management System',
  contactEmail: 'operations@plantsandpure.com',
  contactPhone: '+234 1 800 PLANTS',
  address: 'Abokobi, Accra, Ghana',
  reportingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  dailyDeadlineTime: '17:30',
  weeklyDeadlineDay: 'Friday',
  weeklyDeadlineTime: '18:00',
  requireObjectivesBeforeSubmit: true,
  allowWeekendSubmissions: false,
  publicHolidays: [
    { date: '2026-10-01', name: 'National Independence Day' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: 'Boxing Day' }
  ],
  leaves: []
};


export const INITIAL_DAILY_REPORTS: DailyReport[] = [];
export const INITIAL_WEEKLY_REPORTS: WeeklyReport[] = [];
export const INITIAL_NOTIFICATIONS: Notification[] = [];
export const INITIAL_AUDIT_LOGS: AuditLog[] = [];
