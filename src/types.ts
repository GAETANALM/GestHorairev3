export type Role = 'employee' | 'validator' | 'admin';

export type AbsenceType = 'none' | 'cp' | 'unpaid' | 'sick' | 'recovery' | 'other' | 'unjustified';
export type AbsenceDuration = 'full' | 'morning' | 'afternoon';

export type TimesheetStatus = 'draft' | 'submitted' | 'validated' | 'rejected';

export interface DaySchedule {
  dayOfWeek: number; // 1 = Monday, ..., 7 = Sunday
  isWorked: boolean;
  morningStart: string; // e.g. "08:30"
  morningEnd: string;   // e.g. "12:30"
  afternoonStart: string; // e.g. "13:30"
  afternoonEnd: string;   // e.g. "17:30"
  standardHours: number; // calculated, e.g. 7.5 or 8.0
}

export interface UserContract {
  weeklyHours: number; // e.g. 35, 39, 28
  title: string;
  department: string;
  defaultSchedule: DaySchedule[];
}

export interface UserGdprSettings {
  retentionNoticeAcknowledged?: boolean;
  consentSignedDate?: string;
  dataExportRequestedDate?: string;
  allowAuditLogging?: boolean;
  notes?: string;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  pin: string; // 6 digits
  roles: Role[];
  contract: UserContract;
  isActive: boolean;
  avatarUrl?: string;
  hireDate: string;
  gdpr?: UserGdprSettings;
}

export interface DayEntry {
  date: string; // YYYY-MM-DD
  dayOfWeek: number; // 1 (Mon) - 7 (Sun)
  isOffDay: boolean; // weekend or non-working day
  isHoliday?: boolean; // public holiday
  morningStart: string;
  morningEnd: string;
  afternoonStart: string;
  afternoonEnd: string;
  actualWorkedHours: number;
  nightHours: number;
  hasManualNightHours?: boolean; // True when night hours were entered manually by the user
  nightHoursReason?: string; // Justification obligatoire pour les heures de nuit (taux spécifique de nuit)
  overtimeHours: number;
  hasManualOvertimeHours?: boolean; // True when overtime was entered manually by the user
  overtimeReason: string; // Justification obligatoire pour les heures supplémentaires classiques
  absenceType: AbsenceType;
  absenceDuration: AbsenceDuration;
  absenceCreditedHours: number;
  absenceReason?: string; // Explication / motif obligatoire pour absence injustifiée ou autre motif
  notes: string;
}

export interface Timesheet {
  id: string;
  userId: string;
  userName: string;
  userDepartment: string;
  period: string; // YYYY-MM, e.g. "2026-06"
  status: TimesheetStatus;
  days: DayEntry[];
  carryoverM1: number; // Overtime carried over from M-1
  previousTimesheetId?: string;
  submittedAt?: string;
  validatedAt?: string;
  validatedBy?: string;
  validatorName?: string;
  signature?: string;
  rejectionReason?: string;
  deferOvertimeToNextMonth?: boolean; // Case à cocher : ne pas payer les heures sup restantes et les reporter sur M+1
  carryoverToNextMonth?: number; // Montant exact d'heures sup reportées sur M+1
  paidOvertimeHours?: number; // Montant d'heures sup payées sur ce mois
  // Complément a posteriori / Avenant de régularisation
  isSupplement?: boolean; // True si cette feuille est un complément créé a posteriori sur une feuille validée
  parentTimesheetId?: string; // ID de la feuille initiale validée
  supplementNumber?: number; // Numéro séquentiel du complément (1, 2, ...)
  supplementReason?: string; // Justification / Motif obligatoire du complément a posteriori
  baseDaysSnapshot?: DayEntry[]; // Cliché des journées initiales validées pour calcul et affichage des écarts
  updatedAt: string;
}

export interface PayrollSummary {
  requiredHours: number;
  realizedHours: number; // Adjusted realized hours (rawRealizedHours + overtimeDeductedForDeficit)
  rawRealizedHours: number; // Initial realized hours before compensation (worked + credited absences)
  workedHours: number; // Purely worked hours
  creditedAbsenceHours: number; // Credited hours from CP, sick leave, recovery
  deficitHours: number; // Shortfall before compensation: Math.max(0, requiredHours - rawRealizedHours)
  deductedFromM1: number; // Heures décomptées du report M-1 pour compenser
  deductedFromMonthOvertime: number; // Heures sup du mois décomptées pour compenser
  overtimeDeductedForDeficit: number; // Overtime hours deducted from reserve to compensate shortfall
  nightHoursDeductedForDeficit: number; // Night hours deducted to compensate shortfall when overtime is insufficient
  totalDeductedForDeficit: number; // Total hours deducted (overtime + night hours) to compensate shortfall
  remainingDeficitHours: number; // Residual deficit if reserve was insufficient to fully cover required hours
  monthOvertime: number; // Remaining month overtime after deduction
  initialMonthOvertime: number; // Initial month overtime declared
  carryoverM1: number; // Remaining carryover M-1 after deduction
  initialCarryoverM1: number; // Initial carryover M-1
  remainingCarryoverM1: number; // Remaining carryover M-1 after deduction
  remainingMonthOvertime: number; // Remaining month overtime after deduction
  totalCumulativeOvertime: number; // Net remaining overtime in reserve after deduction
  initialTotalOvertime: number; // Total initial overtime in reserve before deduction
  totalAllOvertimeCombined: number; // Total global des heures sup combinées (Classiques restantes + Nuit restantes)
  initialTotalAllOvertimeCombined: number; // Total initial global des heures sup (Classiques + Nuit)
  deferOvertimeToNextMonth: boolean; // Si true : heures sup restantes non payées et reportées sur M+1
  carryoverToNextMonth: number; // Heures sup reportées sur M+1
  paidOvertimeHours: number; // Heures sup payées sur ce mois
  netBalance: number;
  nightHours: number; // Remaining night hours after compensation
  initialNightHours: number; // Initial total night hours worked
  remainingNightHours: number; // Remaining night hours after deduction
  absenceCounts: {
    cpDays: number;
    unpaidDays: number;
    sickDays: number;
    recoveryDays: number;
    otherDays: number;
    unjustifiedDays: number;
    justifiedDays: number;
    unjustifiedTotalDays: number;
  };
}
