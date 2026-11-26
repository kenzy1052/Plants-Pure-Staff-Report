import { differenceInCalendarDays, parseISO, startOfISOWeek } from 'date-fns';

// Week 1 is the week (Monday–Sunday) that contains this date. It is set in
// Settings (reportingStartDate) and falls back to this value.
export const DEFAULT_REPORTING_START = '2026-11-02';
let startDate = DEFAULT_REPORTING_START;
export function setReportingStart(date?: string) { if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) startDate = date; }

/** Plants & Pure reporting week number: 1 for the first week of use, then counting up each Monday. */
export function reportingWeekNumber(date: Date | string): number {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return Math.floor(differenceInCalendarDays(startOfISOWeek(d), startOfISOWeek(parseISO(startDate))) / 7) + 1;
}
