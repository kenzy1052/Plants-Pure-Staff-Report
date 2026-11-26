import type { User } from '../types';

/**
 * Managers and the CEO can see and review every employee's submitted reports,
 * whoever the report was addressed to (daily reports are all addressed to
 * Madam Ursula, but any manager or the CEO must still see the approvals queue).
 * Employees only ever see their own reports. This matches the database policy
 * `reporting_read`, which already lets every active manager/CEO read daily and
 * weekly reports.
 */
const isReviewerRole = (actor: User) => actor.role === 'ceo' || actor.role === 'manager';

export function canReadReport(actor: User, report: { employeeId: string; submittedToId: string }) {
  return actor.id === report.employeeId || isReviewerRole(actor);
}
export function canReviewReport(actor: User, report: { employeeId: string; submittedToId: string; status: string }) {
  return actor.id !== report.employeeId && report.status === 'submitted' && isReviewerRole(actor);
}
