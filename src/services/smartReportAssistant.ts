import { DailyReport, WeeklyReport, WeeklyObjectiveReview, WeeklyResult, WeeklyChallenge, WeeklyRecommendation } from '../types';

export interface GenerationInput {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  roleTitle: string;
  department: string;
  weekNumber: number;
  year: number;
  startDate: string; // Monday
  endDate: string; // Friday
  submittedToId: string;
  submittedToName: string;
  dailyReports: DailyReport[];
}

/**
 * Returns helper dates for a given ISO week
 */
export function getWeekDates(startDateStr: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDateStr + 'T00:00:00');
  for (let i = 0; i < 5; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0,10));
  }
  return dates;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * Smart Report Assistant:
 * Local deterministic report intelligence engine that aggregates Monday–Friday
 * daily submissions into structured analytics and executive summaries.
 */
export function generateWeeklyReportFromDaily(input: GenerationInput): WeeklyReport {
  const {
    employeeId,
    employeeName,
    employeeCode,
    roleTitle,
    department,
    weekNumber,
    year,
    startDate,
    endDate,
    submittedToId,
    submittedToName,
    dailyReports
  } = input;

  // 1. Filter reports strictly to Monday-Friday of the specified week and matching employee
  const expectedDates = getWeekDates(startDate);
  const relevantReports = dailyReports
    .filter(r => r.employeeId === employeeId && expectedDates.includes(r.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Exclude Saturday and Sunday if any are somehow tagged
  const weekdayReports = relevantReports.filter(r => {
    const d = new Date(r.date + 'T00:00:00').getDay();
    return d >= 1 && d <= 5;
  });

  const availableDates = weekdayReports.map(r => r.date);
  const missingDates = expectedDates.filter(d => !availableDates.includes(d));
  const dailyReportsCount = weekdayReports.length;
  const totalDaysExpected = 5;

  // 2. Objectives Analysis
  let totalAssigned = 0;
  let totalDone = 0;
  let totalPartlyDone = 0;
  let totalNotDone = 0;

  const dailyObjectivesReview: WeeklyObjectiveReview[] = expectedDates.map((dateStr, index) => {
    const dayName = (DAY_NAMES[index] ?? 'Monday');
    const report = weekdayReports.find(r => r.date === dateStr);
    if (!report || !report.objectives || report.objectives.length === 0) {
      return {
        date: dateStr,
        dayName,
        objectivesAssigned: 0,
        objectivesAchieved: 0,
        objectivesPartlyAchieved: 0,
        objectivesNotAchieved: 0,
        items: []
      };
    }

    const assigned = report.objectives.length;
    const achieved = report.objectives.filter(o => o.status === 'Done').length;
    const partly = report.objectives.filter(o => o.status === 'Partly Done').length;
    const notAchieved = report.objectives.filter(o => o.status === 'Not Done').length;

    totalAssigned += assigned;
    totalDone += achieved;
    totalPartlyDone += partly;
    totalNotDone += notAchieved;

    return {
      date: dateStr,
      dayName,
      objectivesAssigned: assigned,
      objectivesAchieved: achieved,
      objectivesPartlyAchieved: partly,
      objectivesNotAchieved: notAchieved,
      items: report.objectives.map(o => ({
        objective: o.objective,
        status: o.status,
        results: o.resultsFigures || 'Recorded in daily submission',
        reason: o.reasonIfNotCompleted || (o.status !== 'Done' ? 'Reason not provided' : undefined)
      }))
    };
  });

  const completionRate = totalAssigned > 0 
    ? Math.round((totalDone / totalAssigned) * 100) 
    : 0;

  // 3. Activity Aggregation & Key Results
  const allActivities = weekdayReports.flatMap(r => r.activities || []);
  const totalActivitiesRecorded = allActivities.length;

  // Group similar activity tasks to compute totals where quantities are recorded
  const keyResultsFigures: WeeklyResult[] = [];
  const activityMap = new Map<string, { count: number; outcomes: string[]; numbers: number[]; unit: string }>();

  allActivities.forEach(act => {
    const key = act.activityTask.trim().toLowerCase();
    // Try to extract numeric quantity and unit e.g. "50 kg", "12 units", "4 batches", "8 posts"
    const match = act.quantityFigures?.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z%]*)/);
    const existing = activityMap.get(key) || { count: 0, outcomes: [], numbers: [], unit: '' };
    existing.count += 1;
    if (act.outcome) existing.outcomes.push(act.outcome);
    if (match) {
      existing.numbers.push(parseFloat(match[1] ?? '0'));
      if (!existing.unit && match[2]) existing.unit = match[2];
    }
    activityMap.set(key, existing);
  });

  // Pick top key results
  activityMap.forEach((val, taskKey) => {
    const capitalized = taskKey.charAt(0).toUpperCase() + taskKey.slice(1);
    if (val.numbers.length > 0) {
      const sum = val.numbers.reduce((acc, curr) => acc + curr, 0);
      keyResultsFigures.push({
        itemActivity: capitalized,
        target: 'Not specified',
        actual: `${sum} ${val.unit}`.trim(),
        variance: 'N/A',
        comments: val.outcomes.slice(0, 2).join('; ') || 'Completed as scheduled'
      });
    } else {
      keyResultsFigures.push({
        itemActivity: capitalized,
        target: 'Standard execution',
        actual: `${val.count} recorded session(s)`,
        variance: 'On track',
        comments: val.outcomes.slice(0, 2).join('; ') || 'Routine execution'
      });
    }
  });

  // 4. Challenges Clustering
  const allChallenges = weekdayReports.flatMap(r => (r.challenges || []).map(c => ({ ...c, date: r.date })));
  const challengesGrouped: WeeklyChallenge[] = [];

  const categorizeChallenge = (text: string): string => {
    const lower = text.toLowerCase();
    if (lower.includes('internet') || lower.includes('network') || lower.includes('wifi') || lower.includes('system') || lower.includes('software')) {
      return 'IT & Infrastructure';
    }
    if (lower.includes('rain') || lower.includes('weather') || lower.includes('soil') || lower.includes('pest') || lower.includes('irrigation')) {
      return 'Agricultural & Field Environment';
    }
    if (lower.includes('machine') || lower.includes('equipment') || lower.includes('power') || lower.includes('breakdown')) {
      return 'Equipment & Operations';
    }
    if (lower.includes('delay') || lower.includes('supplier') || lower.includes('delivery') || lower.includes('packaging') || lower.includes('stock')) {
      return 'Supply Chain & Logistics';
    }
    if (lower.includes('client') || lower.includes('customer') || lower.includes('lead') || lower.includes('ad') || lower.includes('budget')) {
      return 'Marketing & Engagement';
    }
    return 'General Operational';
  };

  const challengeMap = new Map<string, { problems: string[]; actions: string[]; dates: string[]; resolvedAll: boolean }>();

  allChallenges.forEach(ch => {
    const cat = categorizeChallenge(ch.problemEncountered);
    const existing = challengeMap.get(cat) || { problems: [], actions: [], dates: [], resolvedAll: true };
    existing.problems.push(ch.problemEncountered);
    if (ch.actionTaken) existing.actions.push(ch.actionTaken);
    if (!existing.dates.includes(ch.date)) existing.dates.push(ch.date);
    if (!ch.resolved) existing.resolvedAll = false;
    challengeMap.set(cat, existing);
  });

  challengeMap.forEach((val, cat) => {
    challengesGrouped.push({
      category: cat,
      problem: val.problems.slice(0, 3).join('; '),
      actionTaken: val.actions.slice(0, 2).join('; ') || 'Monitored and addressed on-site',
      resolved: val.resolvedAll,
      sourceDates: val.dates
    });
  });

  // 5. Recommendations & Next Week Plan
  const allTomorrowPlans = weekdayReports.flatMap(r => r.tomorrowPlans || []);
  const recommendationsNextWeek: WeeklyRecommendation[] = [];

  // Group or take unique high-value plans
  const planSeen = new Set<string>();
  allTomorrowPlans.forEach(plan => {
    const key = plan.plannedTask.trim().toLowerCase();
    if (!planSeen.has(key) && recommendationsNextWeek.length < 5) {
      planSeen.add(key);
      recommendationsNextWeek.push({
        plannedActivity: plan.plannedTask,
        recommendation: plan.approvalsRequired ? `Secure approval for: ${plan.approvalsRequired}` : 'Proceed with regular implementation schedule',
        resourcesNeeded: plan.resourcesNeeded || 'Standard team resources',
        targetDate: `Next reporting cycle`
      });
    }
  });

  // 6. Narrative Generation (Controlled Professional English Templates)
  const resolvedChallengesCount = allChallenges.filter(c => c.resolved).length;
  const unresolvedChallengesCount = allChallenges.length - resolvedChallengesCount;

  const topActivities = Array.from(activityMap.keys())
    .slice(0, 3)
    .map(k => k.charAt(0).toUpperCase() + k.slice(1))
    .join(', ');

  const overview = `During Week ${weekNumber} (${startDate} to ${endDate}), I submitted ${dailyReportsCount} out of ${totalDaysExpected} scheduled daily reports for the ${department} department. Across my active reporting days, I executed ${totalActivitiesRecorded} distinct operational activities and achieved an overall objective completion rate of ${completionRate}%.`;

  let achievements = '';
  if (totalDone > 0) {
    achievements = `I successfully achieved ${totalDone} assigned objective(s) throughout the week. My core accomplishments include: ${topActivities || 'fulfilling my core role responsibilities'}. I maintained high consistency and dedication across my day-to-day workflow execution.`;
  } else if (totalAssigned === 0) {
    achievements = `I maintained uninterrupted operational performance across scheduled days, completing ${totalActivitiesRecorded} tasks in adherence to departmental priorities.`;
  } else {
    achievements = `I actively advanced my operational duties with dedicated focus on foundational tasks. I partially completed ${totalPartlyDone} objective(s) which I am actively progressing into the upcoming cycle.`;
  }

  let shortfalls = '';
  if (totalNotDone > 0 || totalPartlyDone > 0) {
    shortfalls = `I was unable to fully complete ${totalNotDone} objective(s), and I partially completed ${totalPartlyDone} objective(s) due to operational field constraints and external dependencies. I have documented the specific reasons and context in my daily objective records.`;
  } else {
    shortfalls = 'I encountered no major task shortfalls this week. I successfully concluded all of my assigned daily objectives.';
  }

  const keyFigures = `I completed ${totalDone} of ${totalAssigned} objectives (${completionRate}%), recorded ${totalActivitiesRecorded} activities, and logged ${allChallenges.length} incidents, of which I resolved ${resolvedChallengesCount}.`;

  const majorActivities = topActivities
    ? `My primary areas of focus during this reporting week included: ${topActivities}. I have catalogued my specific timelines, locations, and outputs in my verified daily logs.`
    : `I carried out standard departmental duties and scheduled operational procedures across all active reporting days.`;

  // Code generator timestamp identifier
  const reportCode = `PP-WR-${year}-W${String(weekNumber).padStart(2, '0')}-${String(Math.floor(100 + Math.random() * 900))}`;

  return {
    id: `wr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    reportCode,
    employeeId,
    employeeName,
    employeeCode,
    roleTitle,
    department,
    weekNumber,
    year,
    startDate,
    endDate,
    submittedToId,
    submittedToName,
    status: 'draft',
    dailyReportIds: weekdayReports.map(r => r.id),
    dailyReportsCount,
    totalDaysExpected,
    completionRate,
    totalObjectivesAssigned: totalAssigned,
    totalObjectivesCompleted: totalDone,
    totalObjectivesPartlyCompleted: totalPartlyDone,
    totalObjectivesNotCompleted: totalNotDone,
    totalActivitiesRecorded,
    summaryOfWeek: {
      overview,
      achievements,
      shortfalls,
      keyFigures,
      majorActivities
    },
    dailyObjectivesReview,
    keyResultsFigures,
    challengesGrouped,
    recommendationsNextWeek,
    additionalRecommendations: '',
    employeeConfirmation: false,
    reviews: [],
    completenessStatus: {
      totalDaysExpected,
      availableDays: dailyReportsCount,
      missingDates,
      isComplete: dailyReportsCount === totalDaysExpected
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
