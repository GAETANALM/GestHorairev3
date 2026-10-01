import { DayEntry, DaySchedule, PayrollSummary, Timesheet, UserContract } from '../types';

/**
 * Converts a time string "HH:mm" to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  return hours * 60 + minutes;
}

/**
 * Converts minutes to hours (decimal with 2 decimals)
 */
export function minutesToHours(mins: number): number {
  return Math.round((mins / 60) * 100) / 100;
}

/**
 * Formats decimal hours into a clean French string (e.g., 7.5 -> "7h30" or "7h00")
 */
export function formatHours(decimalHours: number): string {
  const isNegative = decimalHours < 0;
  const abs = Math.abs(decimalHours);
  const h = Math.floor(abs);
  const m = Math.round((abs - h) * 60);
  const sign = isNegative ? '-' : '';
  return `${sign}${h}h${m.toString().padStart(2, '0')}`;
}

/**
 * Calculates duration in decimal hours between two times
 */
export function calculateIntervalHours(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const start = timeToMinutes(startStr);
  const end = timeToMinutes(endStr);
  if (end <= start) return 0;
  return minutesToHours(end - start);
}

/**
 * Calculates the standard contractual hours for a day schedule based on morning and afternoon intervals.
 * Returns 0 if the day is not worked (repos).
 */
export function calculateScheduleStandardHours(
  isWorked: boolean,
  morningStart?: string,
  morningEnd?: string,
  afternoonStart?: string,
  afternoonEnd?: string
): number {
  if (!isWorked) return 0;
  const morning = calculateIntervalHours(morningStart || '', morningEnd || '');
  const afternoon = calculateIntervalHours(afternoonStart || '', afternoonEnd || '');
  return Math.round((morning + afternoon) * 100) / 100;
}

/**
 * Calculates night hours (between 21:00 (1260 min) and 06:00 (360 min))
 */
export function calculateNightHoursForInterval(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 0;
  const start = timeToMinutes(startStr);
  const end = timeToMinutes(endStr);
  if (end <= start) return 0;

  let nightMins = 0;

  // Segment 00:00 to 06:00 (0 to 360)
  const morningNightStart = 0;
  const morningNightEnd = 360;
  const overlapMorningStart = Math.max(start, morningNightStart);
  const overlapMorningEnd = Math.min(end, morningNightEnd);
  if (overlapMorningEnd > overlapMorningStart) {
    nightMins += (overlapMorningEnd - overlapMorningStart);
  }

  // Segment 21:00 to 24:00 (1260 to 1440)
  const eveningNightStart = 1260;
  const eveningNightEnd = 1440;
  const overlapEveningStart = Math.max(start, eveningNightStart);
  const overlapEveningEnd = Math.min(end, eveningNightEnd);
  if (overlapEveningEnd > overlapEveningStart) {
    nightMins += (overlapEveningEnd - overlapEveningStart);
  }

  return minutesToHours(nightMins);
}

/**
 * French public holidays for a given year
 */
export function getFrenchHolidays(year: number): Record<string, string> {
  // Fixed holidays
  const holidays: Record<string, string> = {
    [`${year}-01-01`]: "Jour de l'An",
    [`${year}-05-01`]: "Fête du Travail",
    [`${year}-05-08`]: "Victoire 1945",
    [`${year}-07-14`]: "Fête Nationale",
    [`${year}-08-15`]: "Assomption",
    [`${year}-11-01`]: "Toussaint",
    [`${year}-11-11`]: "Armistice 1918",
    [`${year}-12-25`]: "Noël",
  };

  // Easter calculation (Meeus/Jones/Butcher algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  const easterDate = new Date(year, month - 1, day);
  
  // Lundi de Pâques (Easter + 1 day)
  const easterMonday = new Date(easterDate);
  easterMonday.setDate(easterDate.getDate() + 1);
  holidays[easterMonday.toISOString().slice(0, 10)] = "Lundi de Pâques";

  // Ascension (Easter + 39 days)
  const ascension = new Date(easterDate);
  ascension.setDate(easterDate.getDate() + 39);
  holidays[ascension.toISOString().slice(0, 10)] = "Ascension";

  // Lundi de Pentecôte (Easter + 50 days)
  const pentecostMonday = new Date(easterDate);
  pentecostMonday.setDate(easterDate.getDate() + 50);
  holidays[pentecostMonday.toISOString().slice(0, 10)] = "Lundi de Pentecôte";

  return holidays;
}

/**
 * Returns month name in French (e.g., "Juin 2026")
 */
export function formatMonthName(period: string): string {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/**
 * Returns current period string "YYYY-MM" based on reference date (default today)
 */
export function getCurrentPeriod(refDate: Date = new Date()): string {
  const year = refDate.getFullYear();
  const month = (refDate.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns previous period string "YYYY-MM"
 */
export function getPreviousPeriod(period: string): string {
  const [yearStr, monthStr] = period.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) - 1; // 0-based
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${year}-${month.toString().padStart(2, '0')}`;
}

/**
 * Returns next period string "YYYY-MM"
 */
export function getNextPeriod(period: string): string {
  const [yearStr, monthStr] = period.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${month.toString().padStart(2, '0')}`;
}

/**
 * Calculates month difference between two periods (target - base)
 * e.g., '2026-10' vs '2026-09' = +1
 */
export function getPeriodMonthDifference(targetPeriod: string, basePeriod: string): number {
  if (!targetPeriod || !basePeriod) return 0;
  const [targetY, targetM] = targetPeriod.split('-').map(Number);
  const [baseY, baseM] = basePeriod.split('-').map(Number);
  return (targetY - baseY) * 12 + (targetM - baseM);
}

/**
 * Formats a period with Anticipation context tag (e.g., "Octobre 2026 (Anticipation M+1)")
 */
export function formatPeriodLabel(period: string, refDate: Date = new Date()): string {
  const current = getCurrentPeriod(refDate);
  const diff = getPeriodMonthDifference(period, current);
  const name = formatMonthName(period);
  if (diff === 0) {
    return `${name} (Mois en cours)`;
  } else if (diff > 0 && diff <= 3) {
    return `${name} (Anticipation M+${diff})`;
  } else if (diff > 3) {
    return `${name} (Futur M+${diff})`;
  }
  return name;
}

/**
 * Computes available periods list:
 * - Current month (M)
 * - Next 3 upcoming months (M+1, M+2, M+3) for anticipation
 * - Past 5 months from current date
 * - Any extra existing periods from stored timesheets
 * Returns sorted descending (latest future month first).
 */
export function getAvailablePeriods(
  referenceDate: Date = new Date(),
  extraKnownPeriods: string[] = []
): string[] {
  const periodSet = new Set<string>();

  // Add the next 3 future months (+1, +2, +3) for anticipation
  for (let i = 1; i <= 3; i++) {
    const futureDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + i, 1);
    const y = futureDate.getFullYear();
    const m = (futureDate.getMonth() + 1).toString().padStart(2, '0');
    periodSet.add(`${y}-${m}`);
  }

  // Add the current month (0)
  const currentY = referenceDate.getFullYear();
  const currentM = (referenceDate.getMonth() + 1).toString().padStart(2, '0');
  periodSet.add(`${currentY}-${currentM}`);

  // Add past 5 months from current date
  for (let i = 1; i <= 5; i++) {
    const pastDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const y = pastDate.getFullYear();
    const m = (pastDate.getMonth() + 1).toString().padStart(2, '0');
    periodSet.add(`${y}-${m}`);
  }

  // Include any extra historical periods from existing database/sheets
  extraKnownPeriods.forEach((p) => {
    if (p && /^\d{4}-\d{2}$/.test(p)) {
      periodSet.add(p);
    }
  });

  // Sort descending
  return Array.from(periodSet).sort().reverse();
}

/**
 * Generates initial blank or contract-prefilled DayEntry list for a given period YYYY-MM
 */
export function generateMonthDays(period: string, contract: UserContract, prefill: boolean = true): DayEntry[] {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-12
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidays = getFrenchHolidays(year);

  const entries: DayEntry[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${monthStr.padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    const dateObj = new Date(year, month - 1, d);
    // JS getDay(): 0 = Sun, 1 = Mon, ..., 6 = Sat
    // We want 1 = Mon, ..., 7 = Sun
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const schedule = contract.defaultSchedule.find(s => s.dayOfWeek === dayOfWeek);
    const isOffDay = !schedule || !schedule.isWorked;
    const isHoliday = Boolean(holidays[dateStr]);

    const morningStart = prefill && !isOffDay && !isHoliday ? (schedule?.morningStart || '') : '';
    const morningEnd = prefill && !isOffDay && !isHoliday ? (schedule?.morningEnd || '') : '';
    const afternoonStart = prefill && !isOffDay && !isHoliday ? (schedule?.afternoonStart || '') : '';
    const afternoonEnd = prefill && !isOffDay && !isHoliday ? (schedule?.afternoonEnd || '') : '';

    const workedMorning = calculateIntervalHours(morningStart, morningEnd);
    const workedAfternoon = calculateIntervalHours(afternoonStart, afternoonEnd);
    const actualWorkedHours = workedMorning + workedAfternoon;

    const nightMorning = calculateNightHoursForInterval(morningStart, morningEnd);
    const nightAfternoon = calculateNightHoursForInterval(afternoonStart, afternoonEnd);
    const nightHours = nightMorning + nightAfternoon;

    entries.push({
      date: dateStr,
      dayOfWeek,
      isOffDay: isOffDay || isHoliday,
      isHoliday,
      morningStart,
      morningEnd,
      afternoonStart,
      afternoonEnd,
      actualWorkedHours,
      nightHours,
      hasManualNightHours: false,
      nightHoursReason: '',
      overtimeHours: 0,
      hasManualOvertimeHours: false,
      overtimeReason: '',
      absenceType: 'none',
      absenceDuration: 'full',
      absenceCreditedHours: 0,
      absenceReason: '',
      notes: isHoliday ? `Férié : ${holidays[dateStr]}` : '',
    });
  }

  return entries;
}

/**
 * Recalculates hours for a single day entry.
 * When a half-day or full-day absence is set, the corresponding interval is blocked
 * and cannot be cumulated with worked hours.
 */
export function recalculateDayEntry(day: DayEntry, contract: UserContract): DayEntry {
  const isFullAbsence = day.absenceType !== 'none' && day.absenceDuration === 'full';
  const isMorningAbsence = day.absenceType !== 'none' && day.absenceDuration === 'morning';
  const isAfternoonAbsence = day.absenceType !== 'none' && day.absenceDuration === 'afternoon';

  let morningStart = day.morningStart;
  let morningEnd = day.morningEnd;
  let afternoonStart = day.afternoonStart;
  let afternoonEnd = day.afternoonEnd;

  // Block and clear the absent segment so worked hours cannot be cumulated on top of leave
  if (isFullAbsence || isMorningAbsence) {
    morningStart = '';
    morningEnd = '';
  }
  if (isFullAbsence || isAfternoonAbsence) {
    afternoonStart = '';
    afternoonEnd = '';
  }

  const workedMorning = (isFullAbsence || isMorningAbsence) ? 0 : calculateIntervalHours(morningStart, morningEnd);
  const workedAfternoon = (isFullAbsence || isAfternoonAbsence) ? 0 : calculateIntervalHours(afternoonStart, afternoonEnd);
  const actualWorkedHours = Math.round((workedMorning + workedAfternoon) * 100) / 100;

  // Night hours calculation (21:00 to 06:00)
  // Guard against transient keystrokes in browser time inputs (e.g., typing '0' sends '00:30' when minutes are ':30')
  const validMorningNight = (isFullAbsence || isMorningAbsence)
    ? 0
    : (morningStart && morningStart < '04:00' && morningEnd >= '08:00')
    ? 0
    : calculateNightHoursForInterval(morningStart, morningEnd);

  const validAfternoonNight = (isFullAbsence || isAfternoonAbsence)
    ? 0
    : (afternoonStart && afternoonStart < '11:00' && afternoonEnd >= '14:00')
    ? 0
    : calculateNightHoursForInterval(afternoonStart, afternoonEnd);

  const autoNightHours = Math.round((validMorningNight + validAfternoonNight) * 100) / 100;

  // Determine if day has an explicit manual night hours entry in the "Nuit :" column
  const isManualNight = day.hasManualNightHours === true ||
    (day.hasManualNightHours === undefined && typeof day.nightHours === 'number' && day.nightHours > 0 && Boolean(day.overtimeReason));

  let nightHours = 0;
  if (isFullAbsence) {
    nightHours = 0;
  } else if (isManualNight) {
    nightHours = typeof day.nightHours === 'number' && !isNaN(day.nightHours) ? Math.max(0, day.nightHours) : 0;
  } else {
    nightHours = autoNightHours;
  }

  // Standard contract daily hours for this weekday
  const schedule = contract.defaultSchedule.find(s => s.dayOfWeek === day.dayOfWeek);
  const isWorkingDay = Boolean(schedule?.isWorked && !day.isHoliday);
  const standardDayHours = isWorkingDay ? (schedule?.standardHours ?? 0) : 0;

  // Absences calculation
  let creditedHours = 0;
  if (day.absenceType !== 'none' && !day.isOffDay) {
    if (day.absenceType === 'cp' || day.absenceType === 'sick' || day.absenceType === 'recovery') {
      if (day.absenceDuration === 'full') {
        creditedHours = standardDayHours;
      } else {
        creditedHours = Math.round((standardDayHours / 2) * 100) / 100;
      }
    }
  }

  // Automatic overtime calculation:
  // - Full absence: 0 overtime
  // - Non-working day (weekend, off day, holiday) where employee worked: all worked hours are overtime
  // - Working day: any hours beyond contractual daily schedule are overtime
  const totalDayEffective = Math.round((actualWorkedHours + creditedHours) * 100) / 100;
  let autoOvertimeHours = 0;
  if (isFullAbsence) {
    autoOvertimeHours = 0;
  } else if (!isWorkingDay) {
    autoOvertimeHours = actualWorkedHours;
  } else if (totalDayEffective > standardDayHours) {
    autoOvertimeHours = Math.round((totalDayEffective - standardDayHours) * 100) / 100;
  } else {
    autoOvertimeHours = 0;
  }

  // Determine if day has an explicit manual overtime entry in the "Sup :" field
  const isManualOvertime = day.hasManualOvertimeHours === true ||
    (day.hasManualOvertimeHours === undefined &&
      typeof day.overtimeHours === 'number' &&
      day.overtimeHours > 0 &&
      Boolean(day.overtimeReason) &&
      day.overtimeHours !== autoOvertimeHours);

  let overtimeHours = 0;
  if (isFullAbsence) {
    overtimeHours = 0;
  } else if (isManualOvertime) {
    overtimeHours = typeof day.overtimeHours === 'number' && !isNaN(day.overtimeHours)
      ? Math.max(0, day.overtimeHours)
      : 0;
  } else {
    overtimeHours = autoOvertimeHours;
  }

  return {
    ...day,
    morningStart,
    morningEnd,
    afternoonStart,
    afternoonEnd,
    actualWorkedHours,
    nightHours,
    hasManualNightHours: isManualNight,
    nightHoursReason: isFullAbsence || nightHours <= 0 ? '' : (day.nightHoursReason || ''),
    absenceCreditedHours: creditedHours,
    overtimeHours,
    hasManualOvertimeHours: isManualOvertime,
    overtimeReason: isFullAbsence || (overtimeHours <= 0) ? '' : (day.overtimeReason || ''),
    absenceReason: (day.absenceType === 'other' || day.absenceType === 'unjustified') ? (day.absenceReason || '') : '',
  };
}

/**
 * Calculates theoretical contractual required hours for a given month
 */
export function calculateRequiredHoursForMonth(period: string, contract: UserContract): number {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidays = getFrenchHolidays(year);

  let total = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${monthStr.padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    const dateObj = new Date(year, month - 1, d);
    const jsDay = dateObj.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const isHoliday = Boolean(holidays[dateStr]);
    const schedule = contract.defaultSchedule.find(s => s.dayOfWeek === dayOfWeek);

    if (schedule && schedule.isWorked && !isHoliday) {
      total += schedule.standardHours;
    }
  }
  return Math.round(total * 100) / 100;
}

/**
 * Calculates complete Payroll Summary for a timesheet.
 * If raw realized hours (actual worked + credited absences) are lower than contractual required hours,
 * available overtime hours in reserve (carryover M-1 + current month overtime) are automatically
 * debited/deducted to compensate the shortfall and added to the realized hours counter.
 */
export function calculatePayrollSummary(timesheet: Timesheet, contract: UserContract): PayrollSummary {
  const requiredHours = calculateRequiredHoursForMonth(timesheet.period, contract);

  let workedHours = 0;
  let creditedAbsenceHours = 0;
  let initialMonthOvertime = 0;
  let nightHours = 0;

  let cpDays = 0;
  let unpaidDays = 0;
  let sickDays = 0;
  let recoveryDays = 0;
  let otherDays = 0;
  let unjustifiedDays = 0;

  for (const day of timesheet.days) {
    workedHours += day.actualWorkedHours || 0;
    creditedAbsenceHours += day.absenceCreditedHours || 0;
    initialMonthOvertime += day.overtimeHours || 0;
    nightHours += day.nightHours || 0;

    if (day.absenceType !== 'none') {
      const dayWeight = day.absenceDuration === 'full' ? 1 : 0.5;
      switch (day.absenceType) {
        case 'cp':
          cpDays += dayWeight;
          break;
        case 'unpaid':
          unpaidDays += dayWeight;
          break;
        case 'sick':
          sickDays += dayWeight;
          break;
        case 'recovery':
          recoveryDays += dayWeight;
          break;
        case 'other':
          otherDays += dayWeight;
          break;
        case 'unjustified':
          unjustifiedDays += dayWeight;
          break;
      }
    }
  }

  workedHours = Math.round(workedHours * 100) / 100;
  creditedAbsenceHours = Math.round(creditedAbsenceHours * 100) / 100;
  initialMonthOvertime = Math.round(initialMonthOvertime * 100) / 100;
  const initialCarryoverM1 = Math.round((timesheet.carryoverM1 || 0) * 100) / 100;
  const initialTotalOvertime = Math.round((initialMonthOvertime + initialCarryoverM1) * 100) / 100;
  const initialNightHours = Math.round(nightHours * 100) / 100;

  // Base raw realized hours = worked hours + credited absences (e.g. CP, sick, recovery)
  const rawRealizedHours = Math.round((workedHours + creditedAbsenceHours) * 100) / 100;

  // Deficit calculation: If rawRealizedHours is less than required contractual hours
  const deficitHours = Math.max(0, Math.round((requiredHours - rawRealizedHours) * 100) / 100);

  // 1. Overtime deduction from reserve to compensate the deficit:
  // First deduct from carryover M-1, then from current month overtime if needed
  let deductedFromM1 = 0;
  let deductedFromMonthOvertime = 0;

  if (deficitHours > 0 && initialTotalOvertime > 0) {
    deductedFromM1 = Math.min(deficitHours, initialCarryoverM1);
    const remainingDeficitAfterM1 = Math.round((deficitHours - deductedFromM1) * 100) / 100;

    if (remainingDeficitAfterM1 > 0) {
      deductedFromMonthOvertime = Math.min(remainingDeficitAfterM1, initialMonthOvertime);
    }
  }

  deductedFromM1 = Math.round(deductedFromM1 * 100) / 100;
  deductedFromMonthOvertime = Math.round(deductedFromMonthOvertime * 100) / 100;
  const overtimeDeductedForDeficit = Math.round((deductedFromM1 + deductedFromMonthOvertime) * 100) / 100;

  // 2. Night hours compensation if overtime is insufficient to cover deficit
  // "les heures de la colonne heure de nuit doivent etre utilisée pour compenser si il n'y a pas assez d'eure sup en cas de manque d'heure effectuées"
  const remainingDeficitAfterOvertime = Math.max(0, Math.round((deficitHours - overtimeDeductedForDeficit) * 100) / 100);
  let nightHoursDeductedForDeficit = 0;

  if (remainingDeficitAfterOvertime > 0 && initialNightHours > 0) {
    nightHoursDeductedForDeficit = Math.min(remainingDeficitAfterOvertime, initialNightHours);
  }
  nightHoursDeductedForDeficit = Math.round(nightHoursDeductedForDeficit * 100) / 100;

  const totalDeductedForDeficit = Math.round((overtimeDeductedForDeficit + nightHoursDeductedForDeficit) * 100) / 100;

  // Realized hours after compensation from reserve (overtime + night hours)
  const realizedHours = Math.round((rawRealizedHours + totalDeductedForDeficit) * 100) / 100;

  // Residual deficit if reserve & night hours were insufficient to fully cover required hours
  const remainingDeficitHours = Math.max(0, Math.round((deficitHours - totalDeductedForDeficit) * 100) / 100);

  // Remaining overtime in reserve
  const remainingCarryoverM1 = Math.round((initialCarryoverM1 - deductedFromM1) * 100) / 100;
  const remainingMonthOvertime = Math.round((initialMonthOvertime - deductedFromMonthOvertime) * 100) / 100;
  const totalCumulativeOvertime = Math.round((remainingCarryoverM1 + remainingMonthOvertime) * 100) / 100;

  // Remaining night hours after compensation
  const remainingNightHours = Math.round((initialNightHours - nightHoursDeductedForDeficit) * 100) / 100;

  // Combined all overtime metrics (Overtime + Night hours)
  const initialTotalAllOvertimeCombined = Math.round((initialTotalOvertime + initialNightHours) * 100) / 100;
  const totalAllOvertimeCombined = Math.round((totalCumulativeOvertime + remainingNightHours) * 100) / 100;

  // Overtime payment vs Carryover to M+1 (checkbox in validation)
  const deferOvertimeToNextMonth = Boolean(timesheet.deferOvertimeToNextMonth);
  const carryoverToNextMonth = deferOvertimeToNextMonth
    ? totalCumulativeOvertime
    : (timesheet.carryoverToNextMonth !== undefined ? timesheet.carryoverToNextMonth : 0);
  const paidOvertimeHours = deferOvertimeToNextMonth
    ? 0
    : Math.max(0, Math.round((totalCumulativeOvertime - carryoverToNextMonth) * 100) / 100);

  // Net balance
  const netBalance = Math.round((realizedHours + totalCumulativeOvertime - requiredHours) * 100) / 100;

  const justifiedDays = Math.round((cpDays + unpaidDays + sickDays + recoveryDays) * 100) / 100;
  const unjustifiedTotalDays = Math.round((otherDays + unjustifiedDays) * 100) / 100;

  return {
    requiredHours: Math.round(requiredHours * 100) / 100,
    realizedHours,
    rawRealizedHours,
    workedHours,
    creditedAbsenceHours,
    deficitHours,
    deductedFromM1,
    deductedFromMonthOvertime,
    overtimeDeductedForDeficit,
    nightHoursDeductedForDeficit,
    totalDeductedForDeficit,
    remainingDeficitHours,
    monthOvertime: remainingMonthOvertime,
    initialMonthOvertime,
    carryoverM1: remainingCarryoverM1,
    initialCarryoverM1,
    remainingCarryoverM1,
    remainingMonthOvertime,
    totalCumulativeOvertime,
    initialTotalOvertime,
    totalAllOvertimeCombined,
    initialTotalAllOvertimeCombined,
    deferOvertimeToNextMonth,
    carryoverToNextMonth,
    paidOvertimeHours,
    netBalance,
    nightHours: remainingNightHours,
    initialNightHours,
    remainingNightHours,
    absenceCounts: {
      cpDays,
      unpaidDays,
      sickDays,
      recoveryDays,
      otherDays,
      unjustifiedDays,
      justifiedDays,
      unjustifiedTotalDays,
    },
  };
}

/**
 * Splits month days into weekly chunks (weeks run Mon to Sun)
 */
export interface WeekChunk {
  weekNumber: number;
  label: string;
  startDate: string;
  endDate: string;
  days: DayEntry[];
}

export function groupDaysIntoWeeks(days: DayEntry[]): WeekChunk[] {
  if (!days.length) return [];

  const weeks: WeekChunk[] = [];
  let currentWeekDays: DayEntry[] = [];
  let weekIndex = 1;

  days.forEach((day, index) => {
    currentWeekDays.push(day);

    // If day is Sunday (dayOfWeek === 7) or last day of month
    if (day.dayOfWeek === 7 || index === days.length - 1) {
      const first = currentWeekDays[0];
      const last = currentWeekDays[currentWeekDays.length - 1];

      const startD = new Date(first.date).getDate();
      const endD = new Date(last.date).getDate();

      weeks.push({
        weekNumber: weekIndex,
        label: `Semaine ${weekIndex} (${startD} au ${endD})`,
        startDate: first.date,
        endDate: last.date,
        days: [...currentWeekDays],
      });

      weekIndex++;
      currentWeekDays = [];
    }
  });

  return weeks;
}

/**
 * French day of week short label
 */
export function getFrenchDayName(dayOfWeek: number, short: boolean = false): string {
  const daysLong = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const daysShort = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
  return short ? daysShort[dayOfWeek - 1] : daysLong[dayOfWeek - 1];
}
