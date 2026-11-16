import { reportingWeekNumber } from '@/utils/reportingWeek';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  X, 
  BrainCircuit, 
  FileText,
  Clock,
  Info
} from 'lucide-react';
import { User, DailyReport, WeeklyReport, Employee } from '../../types';
import { generateWeeklyReportFromDaily, getWeekDates } from '../../services/smartReportAssistant';
import { WeeklyReportService } from '../../services/storageService';

interface WeeklyReportGeneratorModalProps {
  currentUser: User;
  dailyReports: DailyReport[];
  employees?: Employee[];
  onClose: () => void;
  onGenerated: (report: WeeklyReport) => void;
}

export const WeeklyReportGeneratorModal: React.FC<WeeklyReportGeneratorModalProps> = ({
  currentUser,
  dailyReports,
  employees = [],
  onClose,
  onGenerated
}) => {
  // Pre-calculate recent Monday dates
  const today = new Date();
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  const currentMonday = getMonday(today);
  const prevMonday = new Date(currentMonday);
  prevMonday.setDate(currentMonday.getDate() - 7);

  const [selectedMondayStr, setSelectedMondayStr] = useState<string>(
    currentMonday.toISOString().slice(0,10)
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // If manager or admin, allow selecting which employee to generate weekly report for
  const isManagerOrAdmin = currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'ceo';
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>(() => {
    if (currentUser.role === 'employee') return currentUser.id;
    // Default to David Kalu (emp_1) who has reports
    return employees.find(e=>e.id!==currentUser.id)?.id ?? currentUser.id;
  });

  // Selected target employee details
  const targetEmployee = employees.find(e => e.id === targetEmployeeId) || {
    id: currentUser.id,
    name: currentUser.name,
    employeeId: currentUser.employeeId,
    roleTitle: currentUser.roleTitle,
    department: currentUser.department,
    supervisorId: currentUser.supervisorId || '',
    supervisorName: currentUser.supervisorName || ''
  };

  // Calculate week number for selected Monday
  const selectedMondayDate = new Date(selectedMondayStr + 'T00:00:00');
  const getWeekNumber = (d: Date) => reportingWeekNumber(d);
  const weekNum = getWeekNumber(selectedMondayDate);
  const year = selectedMondayDate.getFullYear();

  // End date is Friday
  const selectedFriday = new Date(selectedMondayDate);
  selectedFriday.setDate(selectedMondayDate.getDate() + 4);
  const selectedFridayStr = selectedFriday.toISOString().slice(0,10);

  // Inspect available daily reports for this target employee in this week
  const expectedDates = getWeekDates(selectedMondayStr);
  const userDailyReports = useMemo(() => {
    return dailyReports.filter(r => r.employeeId === targetEmployee.id && expectedDates.includes(r.date));
  }, [dailyReports, targetEmployee.id, expectedDates]);

  const availableDates = userDailyReports.map(r => r.date);
  const missingDates = expectedDates.filter(d => !availableDates.includes(d));

  const handleGenerate = async () => {
    setIsProcessing(true);
    try {
      // Run deterministic Smart Report Assistant
      const generated = generateWeeklyReportFromDaily({
        employeeId: targetEmployee.id,
        employeeName: targetEmployee.name,
        employeeCode: targetEmployee.employeeId,
        roleTitle: targetEmployee.roleTitle,
        department: targetEmployee.department,
        weekNumber: weekNum,
        year,
        startDate: selectedMondayStr,
        endDate: selectedFridayStr,
        submittedToId: targetEmployee.supervisorId || '',
        submittedToName: targetEmployee.supervisorName || '',
        dailyReports: userDailyReports
      });

      // Save as draft in IndexedDB
      await WeeklyReportService.saveReport(generated, currentUser);
      onGenerated(generated);
    } catch (err: any) {
      toast.error('Weekly report could not be generated', { description: err.message });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-overlay/60 flex items-center justify-center p-4 backdrop-blur-xs">
      <div className="bg-card  rounded-lg shadow-2xl max-w-xl w-full border border-border  overflow-hidden space-y-0">
        {/* Modal Header */}
        <div className="p-6 border-b border-border  bg-background  flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shrink-0 shadow-xs">
              <BrainCircuit className="w-5 h-5 text-success" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-normal text-primary ">
                  Smart Report Assistant
                </span>
                <span className="text-[10px] bg-success-soft text-success   px-1.5 py-0.2 rounded font-semibold">
                  Weekly summary
                </span>
              </div>
              <h2 className="text-lg font-bold text-foreground  mt-0.5">
                Generate Weekly Summary Report
              </h2>
              <p className="text-xs text-muted-foreground  mt-1">
                Compiles Monday-to-Friday daily logs, calculates objective rates, clusters challenges, and generates an executive draft.
              </p>
            </div>
          </div>
          <Button variant="legacy" 
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground  p-1"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Employee Selection for Admin/Manager */}
          {isManagerOrAdmin && employees.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-foreground  mb-1">
                Staff Member
              </label>
              <select
                value={targetEmployeeId}
                onChange={(e) => setTargetEmployeeId(e.target.value)}
                className="w-full p-2.5 text-xs rounded-lg border border-border  bg-card  text-foreground  font-medium"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.roleTitle} · {emp.department})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Week Selection */}
          <div>
            <label className="block text-xs font-semibold text-foreground  mb-2">
              Select Reporting Week (Monday to Friday)
            </label>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <Button variant="legacy"
                type="button"
                onClick={() => setSelectedMondayStr(currentMonday.toISOString().slice(0,10))}
                className={`
                  p-3 rounded-lg border text-left text-xs transition-all
                  ${selectedMondayStr === currentMonday.toISOString().slice(0,10)
                    ? 'border-primary bg-success-soft/50  text-primary  font-bold'
                    : 'border-border  hover:bg-muted  text-foreground '}
                `}
              >
                <div className="text-[11px] font-medium text-muted-foreground">Current Week</div>
                <div className="font-bold">Week {getWeekNumber(currentMonday)} ({year})</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{currentMonday.toISOString().slice(0,10)}</div>
              </Button>

              <Button variant="legacy"
                type="button"
                onClick={() => setSelectedMondayStr(prevMonday.toISOString().slice(0,10))}
                className={`
                  p-3 rounded-lg border text-left text-xs transition-all
                  ${selectedMondayStr === prevMonday.toISOString().slice(0,10)
                    ? 'border-primary bg-success-soft/50  text-primary  font-bold'
                    : 'border-border  hover:bg-muted  text-foreground '}
                `}
              >
                <div className="text-[11px] font-medium text-muted-foreground">Previous Week</div>
                <div className="font-bold">Week {getWeekNumber(prevMonday)} ({year})</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{prevMonday.toISOString().slice(0,10)}</div>
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Or pick Monday date:</span>
              <input
                type="date"
                value={selectedMondayStr}
                onChange={(e) => setSelectedMondayStr(e.target.value)}
                className="px-2.5 py-1 text-xs border rounded-md border-border  bg-card  font-mono text-foreground "
              />
            </div>
          </div>

          {/* Completeness Inspector Indicator */}
          <div className="p-4 rounded-lg border border-border  bg-muted/80  space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-success" />
                <span className="text-xs font-bold text-foreground ">
                  Source Data Completeness Check
                </span>
              </div>
              <span className={`
                text-xs font-bold px-2 py-0.5 rounded
                ${userDailyReports.length === 5 
                  ? 'bg-success-soft text-success  ' 
                  : 'bg-warning-soft text-warning  '}
              `}>
                {userDailyReports.length} of 5 Daily Reports Available
              </span>
            </div>

            {/* Weekday indicators */}
            <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, idx) => {
                const dateStr = expectedDates[idx] ?? '';
                const hasReport = availableDates.includes(dateStr);
                return (
                  <div
                    key={day}
                    className={`
                      py-2 px-1 rounded-md border text-[11px] font-medium
                      ${hasReport 
                        ? 'bg-success-soft  border-success text-success ' 
                        : 'bg-muted  border-border  text-muted-foreground'}
                    `}
                  >
                    <div className="font-bold">{day}</div>
                    <div className="text-[10px] font-mono mt-0.5">{dateStr.split('-').slice(1).join('/')}</div>
                    <div className="text-[9px] mt-0.5">{hasReport ? 'Ready' : 'Missing'}</div>
                  </div>
                );
              })}
            </div>

            {missingDates.length > 0 && (
              <div className="text-[11px] text-warning  flex items-start gap-1.5 pt-1">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Some daily reports have not been filed yet. The Smart Report Assistant can still compile available records, but the final weekly summary will flag the missing dates.
                </span>
              </div>
            )}
          </div>

          
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-muted  border-t border-border  flex items-center justify-end gap-3">
          <Button variant="legacy"
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-muted-foreground  hover:bg-muted  rounded-lg transition-colors"
          >
            Cancel
          </Button>
          <Button variant="legacy"
            type="button"
            onClick={handleGenerate}
            disabled={isProcessing || userDailyReports.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <div className="w-4 h-4 border-2 border-card/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-success" />
                <span>Compile & Generate Draft</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
