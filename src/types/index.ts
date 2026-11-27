export type UserRole = 'employee' | 'manager' | 'admin' | 'ceo';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  employeeId: string;
  department: string;
  roleTitle: string;
  supervisorId?: string | undefined;
  supervisorName?: string | undefined;
  avatarUrl?: string | undefined;
  password?: string | undefined;
}

export interface Employee {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  roleTitle: string;
  department: string;
  supervisorId?: string | undefined;
  supervisorName?: string | undefined;
  status: 'active' | 'inactive';
  dateAdded: string;
  avatarUrl?: string | undefined;
}

export interface RoleDesignation {
  id: string;
  title: string;
  department: string;
  description: string;
  active: boolean;
}

export type ObjectiveStatus = 'Done' | 'Partly Done' | 'Not Done';

export interface DailyObjective {
  id: string;
  objective: string;
  status: ObjectiveStatus;
  resultsFigures: string;
  reasonIfNotCompleted?: string | undefined;
}

export interface DailyActivity {
  id: string;
  time: string;
  activityTask: string;
  placePersonPlatform: string;
  quantityFigures: string;
  outcome: string;
  /**
   * Optional link to the assigned objective this activity contributed to (an id from
   * `DailyReport.objectives`). Stored inside the existing JSON payload, so no database
   * change is needed, and older reports simply do not have it.
   */
  objectiveId?: string | undefined;
}

export interface DailyChallenge {
  id: string;
  problemEncountered: string;
  whenHappened: string;
  actionTaken: string;
  resolved: boolean;
}

export interface TomorrowPlan {
  id: string;
  plannedTask: string;
  resourcesNeeded: string;
  approvalsRequired: string;
}

export interface EvidenceAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string; // base64 representation stored in IndexedDB
  uploadedAt: string;
}

export type ReportStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export interface ReportReview {
  id: string;
  reviewerId: string;
  reviewerName: string;
  reviewerRole: string;
  decision: 'approved' | 'returned';
  comments: string;
  rating?: number | undefined; // 1-5 rating for weekly reviews
  reviewedAt: string;
}

export interface DailyReport {
  id: string;
  reportCode: string; // e.g. PP-DR-2026-11-001
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  roleTitle: string;
  department: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // Monday, Tuesday, etc.
  reportingPeriod: string; // e.g. "Week 46, 2026"
  submittedToId: string;
  submittedToName: string;
  startTime: string; // e.g. "08:00"
  endTime: string; // e.g. "17:00"
  status: ReportStatus;
  objectives: DailyObjective[];
  activities: DailyActivity[];
  challenges: DailyChallenge[];
  tomorrowPlans: TomorrowPlan[];
  attachments: EvidenceAttachment[];
  submittedAt?: string | undefined;
  reviews: ReportReview[];
  revisionHistory?: {
    editedAt: string;
    previousStatus: string;
    notes?: string | undefined;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface NarrationDraftObjective {
  /** Present when the AI is updating an item that already exists in the report. */
  id?: string | undefined;
  objective: string;
  status: ObjectiveStatus;
  resultsFigures: string;
  reasonIfNotCompleted: string;
}

export interface NarrationDraftActivity {
  id?: string | undefined;
  task: string;
  outcome: string;
  placePersonPlatform: string;
  quantityFigures: string;
  /** Empty unless the employee explicitly gave a time. Format: "HH:MM - HH:MM" or "HH:MM - ". */
  time: string;
  /** Id of an EXISTING objective in the report that this activity belongs to. Never a new objective. */
  objectiveId?: string | undefined;
}

export interface NarrationDraftChallenge {
  id?: string | undefined;
  problem: string;
  whenHappened: string;
  actionTaken: string;
  resolved: boolean;
}

export interface NarrationDraftPlan {
  id?: string | undefined;
  task: string;
  resourcesNeeded: string;
  approvalsRequired: string;
}

/**
 * Changes proposed by one chat message. Items with an `id` update the matching
 * existing report row; items without an `id` are new rows. Nothing is removed
 * unless its id is listed in `removeIds`.
 */
export interface StructuredNarrationDraft {
  objectives: NarrationDraftObjective[];
  activities: NarrationDraftActivity[];
  pendingTasks: string[];
  challenges: NarrationDraftChallenge[];
  tomorrowPlans: NarrationDraftPlan[];
  achievements: string[];
  removeIds: string[];
  /** A question for the employee when the message was ambiguous. Empty otherwise. */
  clarification: string;
  cleanedNarration: string;
}

export interface WeeklyObjectiveReview {
  date: string;
  dayName: string;
  objectivesAssigned: number;
  objectivesAchieved: number;
  objectivesPartlyAchieved: number;
  objectivesNotAchieved: number;
  items: {
    objective: string;
    status: ObjectiveStatus;
    results: string;
    reason?: string | undefined;
  }[];
}

export interface WeeklyResult {
  itemActivity: string;
  target: string;
  actual: string;
  variance: string;
  comments: string;
}

export interface WeeklyChallenge {
  category: string;
  problem: string;
  cause?: string | undefined;
  actionTaken: string;
  resolved: boolean;
  sourceDates: string[];
}

export interface WeeklyRecommendation {
  plannedActivity: string;
  recommendation: string;
  resourcesNeeded: string;
  targetDate: string;
}

export interface WeeklyReport {
  id: string;
  reportCode: string; // e.g. PP-WR-2026-W46-001
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  roleTitle: string;
  department: string;
  weekNumber: number;
  year: number;
  startDate: string; // Monday YYYY-MM-DD
  endDate: string; // Friday YYYY-MM-DD
  submittedToId: string;
  submittedToName: string;
  status: ReportStatus;
  dailyReportIds: string[];
  dailyReportsCount: number; // e.g. 5
  totalDaysExpected: number; // 5 (Mon-Fri)
  completionRate: number; // percentage (0-100)
  totalObjectivesAssigned: number;
  totalObjectivesCompleted: number;
  totalObjectivesPartlyCompleted: number;
  totalObjectivesNotCompleted: number;
  totalActivitiesRecorded: number;
  summaryOfWeek: {
    overview: string;
    achievements: string;
    shortfalls: string;
    keyFigures: string;
    majorActivities: string;
  };
  dailyObjectivesReview: WeeklyObjectiveReview[];
  keyResultsFigures: WeeklyResult[];
  challengesGrouped: WeeklyChallenge[];
  recommendationsNextWeek: WeeklyRecommendation[];
  additionalRecommendations?: string | undefined;
  employeeConfirmation: boolean;
  employeeSubmittedAt?: string | undefined;
  reviews: ReportReview[];
  completenessStatus: {
    totalDaysExpected: number;
    availableDays: number;
    missingDates: string[];
    isComplete: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  recipientId: string;
  title: string;
  message: string;
  type: 'submission' | 'approval' | 'correction' | 'reminder' | 'account' | 'system';
  read: boolean;
  linkReportId?: string | undefined;
  linkReportType?: 'daily' | 'weekly' | undefined;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  relatedRecordId?: string | undefined;
  relatedRecordType?: 'employee' | 'daily_report' | 'weekly_report' | 'settings' | 'role' | undefined;
  details: string;
  timestamp: string;
}

export interface PublicHoliday {
  date: string;
  name: string;
}

export interface LeaveRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  reason: string;
  approved: boolean;
}

export interface OrganisationSettings {
  organisationName: string;
  tagline: string;
  logoUrl?: string | undefined;
  contactEmail: string;
  contactPhone: string;
  address: string;
  reportingDays: string[]; // ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  dailyDeadlineTime: string; // "17:30"
  weeklyDeadlineDay: string; // "Friday"
  weeklyDeadlineTime: string; // "18:00"
  reportingStartDate?: string; // Monday-based date that starts "Week 1", e.g. "2026-10-26"
  requireObjectivesBeforeSubmit: boolean;
  allowWeekendSubmissions: boolean;
  publicHolidays: PublicHoliday[];
  leaves: LeaveRecord[];
}
