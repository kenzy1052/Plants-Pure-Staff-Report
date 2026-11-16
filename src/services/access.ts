import type { User } from '../types';
export function canReadReport(actor: User, report: { employeeId: string; submittedToId: string }) {
  return actor.id === report.employeeId || actor.role === 'ceo' || (actor.role === 'manager' && report.submittedToId === actor.id);
}
export function canReviewReport(actor: User, report: { employeeId: string; submittedToId: string; status: string }) {
  return actor.id !== report.employeeId && report.status === 'submitted' && (actor.role === 'ceo' || (actor.role === 'manager' && report.submittedToId === actor.id));
}