import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FileSpreadsheet,
  FileText,
  Send,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Coffee,
  Check,
  Lock,
  ExternalLink,
  HelpCircle,
  ShieldCheck,
  X,
  FilePlus2,
  Trash2,
  FileSignature,
  Layers,
} from 'lucide-react';
import {
  AbsenceDuration,
  AbsenceType,
  DayEntry,
  Timesheet,
  UserProfile,
} from '../types';
import {
  calculatePayrollSummary,
  formatHours,
  formatMonthName,
  formatPeriodLabel,
  getCurrentPeriod,
  getFrenchDayName,
  getNextPeriod,
  getPeriodMonthDifference,
  getPreviousPeriod,
  groupDaysIntoWeeks,
  recalculateDayEntry,
  WeekChunk,
} from '../utils/timeCalculations';
import { exportIndividualTimesheetToExcel } from '../utils/excelExport';
import { exportTimesheetToPDF } from '../utils/pdfExport';

interface TimesheetSubmissionProps {
  currentUser: UserProfile;
  timesheet: Timesheet;
  allPeriodTimesheets?: Timesheet[];
  onSelectTimesheetId?: (id: string) => void;
  onDeleteTimesheet?: (id: string) => void;
  onUpdateTimesheet: (updated: Timesheet) => void;
  onNavigateToPeriod: (period: string) => void;
  availablePeriods: string[];
  selectedPeriod: string;
}

export function TimesheetSubmission({
  currentUser,
  timesheet,
  allPeriodTimesheets = [],
  onSelectTimesheetId,
  onDeleteTimesheet,
  onUpdateTimesheet,
  onNavigateToPeriod,
  availablePeriods,
  selectedPeriod,
}: TimesheetSubmissionProps) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedWeekIndex, setSelectedWeekIndex] = useState<number>(0);
  const [autoSaveNotice, setAutoSaveNotice] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'info' | 'error'; message: string; details?: string } | null>(null);
  const [submissionError, setSubmissionError] = useState<string>('');
  const [submissionSuccessModalOpen, setSubmissionSuccessModalOpen] = useState<boolean>(false);
  const [createSupplementModalOpen, setCreateSupplementModalOpen] = useState<boolean>(false);
  const [supplementReasonInput, setSupplementReasonInput] = useState<string>('');
  const [supplementReasonError, setSupplementReasonError] = useState<string>('');
  const [deleteSupplementModalOpen, setDeleteSupplementModalOpen] = useState<boolean>(false);

  // Handle creating an a posteriori supplement on a validated timesheet
  const handleCreateSupplement = () => {
    if (!supplementReasonInput.trim()) {
      setSupplementReasonError('Veuillez préciser le motif justifiant ce complément a posteriori (obligatoire).');
      return;
    }
    const currentPeriodSheets = allPeriodTimesheets.length > 0 ? allPeriodTimesheets : [timesheet];
    const supplementCount = currentPeriodSheets.filter((ts) => ts.isSupplement).length;
    const nextNum = supplementCount + 1;
    const newSupplementId = `ts_${currentUser.id}_${timesheet.period}_supp_${Date.now()}`;
    const newSupplement: Timesheet = {
      id: newSupplementId,
      userId: currentUser.id,
      userName: timesheet.userName,
      userDepartment: timesheet.userDepartment,
      period: timesheet.period,
      status: 'draft',
      days: JSON.parse(JSON.stringify(timesheet.days)),
      carryoverM1: timesheet.carryoverM1 || 0,
      isSupplement: true,
      parentTimesheetId: timesheet.parentTimesheetId || timesheet.id,
      supplementNumber: nextNum,
      supplementReason: supplementReasonInput.trim(),
      baseDaysSnapshot: JSON.parse(JSON.stringify(timesheet.days)),
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(newSupplement);
    if (onSelectTimesheetId) {
      onSelectTimesheetId(newSupplementId);
    }
    setCreateSupplementModalOpen(false);
    setSupplementReasonInput('');
    setSupplementReasonError('');
    setToast({
      type: 'success',
      message: `Complément a posteriori #${nextNum} initialisé`,
      details: 'Modifiez les journées nécessaires ci-dessous puis soumettez-le pour validation à votre responsable.',
    });
  };

  // Handle deleting a draft supplement
  const handleDeleteDraftSupplement = () => {
    if (!timesheet.isSupplement || timesheet.status !== 'draft') return;
    if (onDeleteTimesheet) {
      onDeleteTimesheet(timesheet.id);
    }
    setDeleteSupplementModalOpen(false);
    setToast({
      type: 'info',
      message: 'Brouillon de complément supprimé',
      details: 'Vous êtes revenu sur la feuille d\'heures validée.',
    });
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Auto-sync draft days on load to ensure automatic overtime calculation applies to existing hours
  useEffect(() => {
    if (timesheet.status === 'draft') {
      let hasChanges = false;
      const refreshedDays = timesheet.days.map((day) => {
        const recalculated = recalculateDayEntry(day, currentUser.contract);
        if (
          recalculated.overtimeHours !== day.overtimeHours ||
          recalculated.hasManualOvertimeHours !== day.hasManualOvertimeHours
        ) {
          hasChanges = true;
          return recalculated;
        }
        return day;
      });
      if (hasChanges) {
        onUpdateTimesheet({
          ...timesheet,
          days: refreshedDays,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }, [timesheet.id, timesheet.status, currentUser.contract]);

  const weeks = useMemo(() => {
    return groupDaysIntoWeeks(timesheet.days);
  }, [timesheet.days]);

  // Ensure selectedWeekIndex stays within bounds
  useEffect(() => {
    if (selectedWeekIndex >= weeks.length && weeks.length > 0) {
      setSelectedWeekIndex(0);
    }
  }, [weeks.length, selectedWeekIndex]);

  const currentWeek = weeks[selectedWeekIndex] || weeks[0];

  // Recalculate summary
  const summary = useMemo(() => {
    return calculatePayrollSummary(timesheet, currentUser.contract);
  }, [timesheet, currentUser.contract]);

  // Calculations for Weekly Bento Cards
  const weeklyStats = useMemo(() => {
    if (!currentWeek) return { realized: 0, required: 0, percent: 0, overtime: 0, priorOvertime: 0 };

    let realized = 0;
    let required = 0;
    let weekOvertime = 0;

    currentWeek.days.forEach((day) => {
      realized += day.actualWorkedHours + day.absenceCreditedHours;
      weekOvertime += day.overtimeHours || 0;

      const schedule = currentUser.contract.defaultSchedule.find(
        (s) => s.dayOfWeek === day.dayOfWeek
      );
      if (schedule && schedule.isWorked && !day.isHoliday) {
        required += schedule.standardHours;
      }
    });

    // Overtime from weeks strictly before this one in the same month
    let previousWeeksOvertime = 0;
    for (let i = 0; i < selectedWeekIndex; i++) {
      const priorWk = weeks[i];
      if (priorWk) {
        priorWk.days.forEach((d) => {
          previousWeeksOvertime += d.overtimeHours || 0;
        });
      }
    }

    const m1Carryover = timesheet.carryoverM1 || 0;
    const totalPrior = Math.round((m1Carryover + previousWeeksOvertime) * 100) / 100;
    const percent = required > 0 ? Math.min(Math.round((realized / required) * 100), 100) : 100;

    return {
      realized: Math.round(realized * 100) / 100,
      required: Math.round(required * 100) / 100,
      percent,
      weekOvertime: Math.round(weekOvertime * 100) / 100,
      m1Carryover,
      previousWeeksOvertime,
      totalPrior,
      cumulativeToDate: Math.round((totalPrior + weekOvertime) * 100) / 100,
    };
  }, [currentWeek, currentUser.contract, selectedWeekIndex, weeks, timesheet.carryoverM1]);

  const isLocked = timesheet.status === 'submitted' || timesheet.status === 'validated';

  // Handle updates to a day
  const handleDayChange = (date: string, updates: Partial<DayEntry>) => {
    if (isLocked) return;

    const newDays = timesheet.days.map((day) => {
      if (day.date === date) {
        const merged = { ...day, ...updates };
        const schedule = currentUser.contract.defaultSchedule.find(
          (s) => s.dayOfWeek === day.dayOfWeek
        );

        // When working intervals are modified, reset manual overtime override so the new schedule calculates overtime automatically
        if (
          updates.morningStart !== undefined ||
          updates.morningEnd !== undefined ||
          updates.afternoonStart !== undefined ||
          updates.afternoonEnd !== undefined
        ) {
          if (updates.hasManualOvertimeHours === undefined) {
            merged.hasManualOvertimeHours = false;
          }
        }

        // When absence type or duration changes, block and adjust corresponding half-days
        if (updates.absenceType !== undefined || updates.absenceDuration !== undefined) {
          merged.hasManualOvertimeHours = false;
          if (merged.absenceType !== 'none') {
            if (merged.absenceDuration === 'full') {
              merged.morningStart = '';
              merged.morningEnd = '';
              merged.afternoonStart = '';
              merged.afternoonEnd = '';
              merged.overtimeHours = 0;
              merged.overtimeReason = '';
            } else if (merged.absenceDuration === 'morning') {
              merged.morningStart = '';
              merged.morningEnd = '';
              // Pre-fill contractual afternoon if empty so the employee has their afternoon working hours ready
              if (!merged.afternoonStart && schedule?.isWorked && !day.isHoliday) {
                merged.afternoonStart = schedule.afternoonStart;
                merged.afternoonEnd = schedule.afternoonEnd;
              }
            } else if (merged.absenceDuration === 'afternoon') {
              merged.afternoonStart = '';
              merged.afternoonEnd = '';
              // Pre-fill contractual morning if empty so the employee has their morning working hours ready
              if (!merged.morningStart && schedule?.isWorked && !day.isHoliday) {
                merged.morningStart = schedule.morningStart;
                merged.morningEnd = schedule.morningEnd;
              }
            }
          } else if (updates.absenceType === 'none' && schedule?.isWorked && !day.isHoliday) {
            // Restore default schedule if hours were empty
            if (!merged.morningStart && !merged.afternoonStart) {
              merged.morningStart = schedule.morningStart;
              merged.morningEnd = schedule.morningEnd;
              merged.afternoonStart = schedule.afternoonStart;
              merged.afternoonEnd = schedule.afternoonEnd;
            }
          }
        }

        return recalculateDayEntry(merged, currentUser.contract);
      }
      return day;
    });

    const updatedTimesheet: Timesheet = {
      ...timesheet,
      days: newDays,
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updatedTimesheet);

    setAutoSaveNotice('Modifications enregistrées de manière permanente');
    setTimeout(() => setAutoSaveNotice(''), 3500);
  };

  // Manual explicit save action with toast
  const handleManualSave = () => {
    if (isLocked) return;
    onUpdateTimesheet({
      ...timesheet,
      updatedAt: new Date().toISOString(),
    });
    setToast({
      type: 'success',
      message: 'Horaires enregistrés avec succès',
      details: 'Vos modifications d\'horaires sont sauvegardées de manière permanente.',
    });
  };

  // Pre-fill standard contractual hours for the current week or whole month
  const handlePrefillStandardHours = (scope: 'week' | 'all') => {
    if (isLocked) return;

    const targetDates = new Set(
      scope === 'week' ? currentWeek.days.map((d) => d.date) : timesheet.days.map((d) => d.date)
    );

    const newDays = timesheet.days.map((day) => {
      if (targetDates.has(day.date)) {
        const schedule = currentUser.contract.defaultSchedule.find(
          (s) => s.dayOfWeek === day.dayOfWeek
        );
        if (schedule && schedule.isWorked && !day.isHoliday) {
          if (day.absenceType !== 'none') {
            // Preserve the user's declared absence and fill only the non-absent half
            let mStart = '';
            let mEnd = '';
            let aStart = '';
            let aEnd = '';
            if (day.absenceDuration === 'morning') {
              aStart = schedule.afternoonStart;
              aEnd = schedule.afternoonEnd;
            } else if (day.absenceDuration === 'afternoon') {
              mStart = schedule.morningStart;
              mEnd = schedule.morningEnd;
            }
            const prefilledDay: DayEntry = {
              ...day,
              morningStart: mStart,
              morningEnd: mEnd,
              afternoonStart: aStart,
              afternoonEnd: aEnd,
              nightHours: 0,
              hasManualNightHours: false,
            };
            return recalculateDayEntry(prefilledDay, currentUser.contract);
          } else {
            const prefilledDay: DayEntry = {
              ...day,
              morningStart: schedule.morningStart,
              morningEnd: schedule.morningEnd,
              afternoonStart: schedule.afternoonStart,
              afternoonEnd: schedule.afternoonEnd,
              absenceType: 'none',
              absenceDuration: 'full',
              absenceCreditedHours: 0,
              nightHours: 0,
              hasManualNightHours: false,
            };
            return recalculateDayEntry(prefilledDay, currentUser.contract);
          }
        }
      }
      return day;
    });

    const updatedTimesheet: Timesheet = {
      ...timesheet,
      days: newDays,
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updatedTimesheet);
  };

  // Adjust M-1 reserve overtime for testing / calibration
  const handleAdjustReserve = () => {
    if (isLocked) return;
    const currentVal = timesheet.carryoverM1 || 0;
    const input = window.prompt(
      "Définir le solde d'heures supplémentaires en réserve (Report M-1) pour tester la compensation :",
      currentVal.toString()
    );
    if (input !== null) {
      const parsed = parseFloat(input.replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 0) {
        onUpdateTimesheet({
          ...timesheet,
          carryoverM1: Math.round(parsed * 100) / 100,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  };

  // Submit timesheet
  const handleSubmit = () => {
    // 1. Check if any day has overtime without justification
    const missingOvertime = timesheet.days.find(
      (d) => (d.overtimeHours || 0) > 0 && (!d.overtimeReason || d.overtimeReason.trim() === '')
    );
    if (missingOvertime) {
      const msg = `Une justification est obligatoire pour les heures supplémentaires du ${missingOvertime.date}. Merci de renseigner le motif.`;
      setSubmissionError(msg);
      setToast({
        type: 'error',
        message: 'Soumission bloquée : motif manquant',
        details: msg,
      });
      return;
    }

    // 2. Check if any day has night hours without justification
    const missingNight = timesheet.days.find(
      (d) => (d.nightHours || 0) > 0 && (!d.nightHoursReason || d.nightHoursReason.trim() === '')
    );
    if (missingNight) {
      const msg = `Une justification est obligatoire pour les heures de nuit du ${missingNight.date} (taux majoré de nuit). Merci de renseigner le motif.`;
      setSubmissionError(msg);
      setToast({
        type: 'error',
        message: 'Soumission bloquée : motif manquant',
        details: msg,
      });
      return;
    }

    // 3. Check if any day has other or unjustified absence without explanation
    const missingAbsence = timesheet.days.find(
      (d) =>
        (d.absenceType === 'other' || d.absenceType === 'unjustified') &&
        (!d.absenceReason || d.absenceReason.trim() === '')
    );
    if (missingAbsence) {
      const msg = `Une explication est obligatoire pour l'absence (${missingAbsence.absenceType === 'unjustified' ? 'injustifiée' : 'autre motif'}) du ${missingAbsence.date}. Merci de renseigner le motif.`;
      setSubmissionError(msg);
      setToast({
        type: 'error',
        message: 'Soumission bloquée : absence non justifiée',
        details: msg,
      });
      return;
    }

    setSubmissionError('');
    const updated: Timesheet = {
      ...timesheet,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onUpdateTimesheet(updated);
    setToast({
      type: 'success',
      message: 'Feuille d’heures transmise avec succès !',
      details: 'Votre feuille est soumise et apparaît désormais dans le Panneau de Validation pour le manager.',
    });
    setSubmissionSuccessModalOpen(true);
  };

  // Direct Validation (Acceptation des fiches d'heures)
  const handleDirectValidate = () => {
    // Verify justifications before validating
    const missingOvertime = timesheet.days.find(
      (d) => (d.overtimeHours || 0) > 0 && (!d.overtimeReason || d.overtimeReason.trim() === '')
    );
    if (missingOvertime) {
      setSubmissionError(
        `Validation impossible : une justification est obligatoire pour les heures supplémentaires du ${missingOvertime.date}.`
      );
      return;
    }

    const missingNight = timesheet.days.find(
      (d) => (d.nightHours || 0) > 0 && (!d.nightHoursReason || d.nightHoursReason.trim() === '')
    );
    if (missingNight) {
      setSubmissionError(
        `Validation impossible : une justification est obligatoire pour les heures de nuit du ${missingNight.date}.`
      );
      return;
    }

    const missingAbsence = timesheet.days.find(
      (d) =>
        (d.absenceType === 'other' || d.absenceType === 'unjustified') &&
        (!d.absenceReason || d.absenceReason.trim() === '')
    );
    if (missingAbsence) {
      setSubmissionError(
        `Validation impossible : une explication est obligatoire pour l'absence (${missingAbsence.absenceType === 'unjustified' ? 'injustifiée' : 'autre motif'}) du ${missingAbsence.date}.`
      );
      return;
    }

    const signature = `Certifié conforme par ${currentUser.firstName} ${currentUser.lastName} (${currentUser.contract.title}) le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;

    const updated: Timesheet = {
      ...timesheet,
      status: 'validated',
      validatedAt: new Date().toISOString(),
      validatedBy: currentUser.id,
      validatorName: `${currentUser.firstName} ${currentUser.lastName}`,
      signature,
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updated);
    setSubmissionError('');
    setToast({
      type: 'success',
      message: 'Fiche d’heures validée avec succès !',
      details: 'La fiche est certifiée conforme et signée électroniquement.',
    });
  };

  // Reopen in draft mode (Rouvrir en brouillons)
  const handleReopenDraft = () => {
    const updated: Timesheet = {
      ...timesheet,
      status: 'draft',
      validatedAt: undefined,
      validatedBy: undefined,
      validatorName: undefined,
      signature: undefined,
      rejectionReason: undefined,
      submittedAt: undefined,
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updated);
    setSubmissionError('');
    setToast({
      type: 'info',
      message: 'Fiche d’heures réouverte en brouillon',
      details: 'Les saisies sont à nouveau modifiables pour effectuer vos corrections.',
    });
  };

  const currentPeriod = useMemo(() => getCurrentPeriod(), []);
  const periodMonthOffset = useMemo(
    () => getPeriodMonthDifference(selectedPeriod, currentPeriod),
    [selectedPeriod, currentPeriod]
  );
  const isFuturePeriod = periodMonthOffset > 0;
  const prevPeriod = getPreviousPeriod(selectedPeriod);
  const nextPeriod = getNextPeriod(selectedPeriod);
  const hasPrevPeriod = availablePeriods.includes(prevPeriod);
  const hasNextPeriod = availablePeriods.includes(nextPeriod);

  return (
    <div className="space-y-6 pb-20">
      {/* DOCUMENT SWITCHER & AMENDMENT SELECTOR */}
      {((allPeriodTimesheets && allPeriodTimesheets.length > 1) || timesheet.isSupplement || timesheet.status === 'validated') && (
        <div className="bg-white rounded-2xl p-3 sm:p-4 border-2 border-indigo-100 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Dossier {formatMonthName(selectedPeriod)} :</span>
            </div>

            {(allPeriodTimesheets && allPeriodTimesheets.length > 0 ? allPeriodTimesheets : [timesheet]).map((sheet, idx) => {
              const isSelected = sheet.id === timesheet.id;
              const isSupp = sheet.isSupplement;
              const label = isSupp ? `Complément #${sheet.supplementNumber || idx}` : 'Feuille Initiale';

              return (
                <button
                  key={sheet.id}
                  id={`btn-select-doc-${sheet.id}`}
                  onClick={() => onSelectTimesheetId && onSelectTimesheetId(sheet.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                    isSelected
                      ? isSupp
                        ? 'bg-purple-700 text-white shadow-xs ring-2 ring-purple-300'
                        : 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-300'
                      : isSupp
                      ? 'bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  {isSupp && <Layers className="w-3.5 h-3.5 shrink-0" />}
                  <span>{label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      sheet.status === 'validated'
                        ? isSelected
                          ? 'bg-emerald-400/30 text-emerald-100 border border-emerald-300/40'
                          : 'bg-emerald-100 text-emerald-800'
                        : sheet.status === 'submitted'
                        ? isSelected
                          ? 'bg-amber-400/30 text-amber-100 border border-amber-300/40'
                          : 'bg-amber-100 text-amber-800'
                        : isSelected
                        ? 'bg-slate-800 text-slate-200'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {sheet.status === 'validated' ? 'Validé' : sheet.status === 'submitted' ? 'En attente' : 'Brouillon'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {/* Real-time server sync badge */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200 font-semibold" title="Les données de cette fiche sont synchronisées et enregistrées de manière permanente sur le serveur">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Sauvegardé</span>
            </div>

            {/* If looking at a validated sheet, allow creating a supplement directly */}
            {timesheet.status === 'validated' && (
              <button
                id="btn-create-supplement-top"
                onClick={() => {
                  setSupplementReasonInput('');
                  setSupplementReasonError('');
                  setCreateSupplementModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors shadow-2xs cursor-pointer shrink-0"
                title="Créer un complément a posteriori pour modifier des heures validées"
              >
                <FilePlus2 className="w-4 h-4 text-indigo-600" />
                <span>Créer un complément a posteriori</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top Banner / Month and View Selector */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 capitalize tracking-tight">
              Feuille de temps : {formatMonthName(selectedPeriod)}
            </h2>

            {/* Complement tag if active */}
            {timesheet.isSupplement && (
              <span className="text-xs font-black px-3 py-1 rounded-full bg-purple-100 text-purple-950 border-2 border-purple-300 flex items-center gap-1.5 shadow-2xs">
                <Layers className="w-3.5 h-3.5 text-purple-700" />
                <span>Complément #{timesheet.supplementNumber || 1}</span>
              </span>
            )}

            {/* Anticipation or Current month tag */}
            {isFuturePeriod && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                <span>Anticipation M+{periodMonthOffset}</span>
              </span>
            )}

            {selectedPeriod === currentPeriod && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Mois en cours
              </span>
            )}

            {/* Status Badge */}
            <span
              className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                timesheet.status === 'validated'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : timesheet.status === 'submitted'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : timesheet.status === 'rejected'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              {timesheet.status === 'validated'
                ? 'Validé'
                : timesheet.status === 'submitted'
                ? 'Soumis pour validation'
                : timesheet.status === 'rejected'
                ? 'Rejeté'
                : 'Brouillon'}
            </span>
          </div>

          {/* Supplement Reason Banner if applicable */}
          {timesheet.isSupplement && timesheet.supplementReason && (
            <div className="mt-2 text-xs text-purple-900 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200 inline-flex items-center gap-2">
              <span className="font-bold text-purple-950">Motif justifiant le complément :</span>
              <span className="italic">« {timesheet.supplementReason} »</span>
            </div>
          )}

          <p className="text-xs text-slate-400 font-medium tracking-wide uppercase mt-1">
            Contrat : <strong className="text-slate-700 normal-case">{currentUser.contract.title}</strong> (
            {currentUser.contract.weeklyHours}h/semaine) • {currentUser.contract.department}
          </p>
        </div>

        {/* Action Controls & Selectors */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Month Selector with Chevrons for quick Anticipation navigation */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              disabled={!hasPrevPeriod}
              onClick={() => hasPrevPeriod && onNavigateToPeriod(prevPeriod)}
              title={hasPrevPeriod ? `Mois précédent : ${formatMonthName(prevPeriod)}` : 'Aucun mois antérieur'}
              className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-semibold text-slate-500 px-1">Mois :</span>
            <select
              value={selectedPeriod}
              onChange={(e) => onNavigateToPeriod(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
            >
              {availablePeriods.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabel(p)}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!hasNextPeriod}
              onClick={() => hasNextPeriod && onNavigateToPeriod(nextPeriod)}
              title={hasNextPeriod ? `Mois suivant (Anticipation) : ${formatMonthName(nextPeriod)}` : 'Anticipation limitée aux 3 prochains mois'}
              className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Dual View Toggle: Semaine vs Mois */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white text-indigo-600 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Vue Semaine
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white text-indigo-600 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Vue Mois complet
            </button>
          </div>

          {/* Quick Pre-fill standard hours */}
          {!isLocked && (
            <>
              <button
                id="btn-prefill-hours"
                onClick={() => handlePrefillStandardHours(viewMode === 'week' ? 'week' : 'all')}
                className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer shadow-xs"
                title="Remplir les horaires normaux de travail définis dans votre contrat"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>{viewMode === 'week' ? 'Pré-remplir semaine' : 'Pré-remplir tout'}</span>
              </button>

              <button
                id="btn-save-hours-permanent"
                onClick={handleManualSave}
                className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer shadow-xs"
                title="Sauvegarder immédiatement toutes vos modifications d'horaires de façon permanente"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Enregistrer</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ANTICIPATION BANNER (Next 3 months from today's date) */}
      {isFuturePeriod && (
        <div className="p-5 rounded-3xl bg-indigo-50/80 border border-indigo-200 text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center font-bold text-xs shadow-md shadow-indigo-200 shrink-0">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-indigo-200">Mois</span>
              <span className="text-sm font-extrabold leading-none">+{periodMonthOffset}</span>
            </div>
            <div>
              <div className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                <span>Feuille prévisionnelle : {formatMonthName(selectedPeriod)}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-wide">
                  Anticipation M+{periodMonthOffset}
                </span>
              </div>
              <p className="text-xs text-indigo-800 mt-0.5">
                Feuille de temps disponible pour anticiper vos horaires et poser vos congés payés (CP) ou RTT à l'avance. Les horaires contractuels ({currentUser.contract.weeklyHours}h/semaine) sont pré-remplis automatiquement.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            <button
              onClick={() => onNavigateToPeriod(currentPeriod)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100/70 transition-colors shadow-xs cursor-pointer"
              title="Revenir au mois en cours"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Mois en cours</span>
            </button>
          </div>
        </div>
      )}

      {/* Auto-save notification feedback */}
      {autoSaveNotice && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-xl inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span className="font-medium">{autoSaveNotice}</span>
        </div>
      )}

      {/* Submission Error Banner */}
      {submissionError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <strong className="text-xs font-bold block">Validation impossible</strong>
              <p className="text-xs text-rose-800 mt-0.5">{submissionError}</p>
            </div>
          </div>
          <button
            onClick={() => setSubmissionError('')}
            className="text-rose-400 hover:text-rose-700 cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* SUPPLEMENT BANNER (If viewing an a posteriori supplement) */}
      {timesheet.isSupplement && (
        <div className="p-5 rounded-3xl bg-linear-to-r from-purple-50 via-indigo-50/50 to-white border border-purple-200 text-purple-950 flex flex-col gap-4 shadow-sm animate-in fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-200">
                <FilePlus2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-extrabold text-sm sm:text-base text-purple-950">
                    Complément d'heures a posteriori #{timesheet.supplementNumber || 1}
                  </h4>
                  <span
                    className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      timesheet.status === 'validated'
                        ? 'bg-emerald-600 text-white'
                        : timesheet.status === 'submitted'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-purple-600 text-white'
                    }`}
                  >
                    {timesheet.status === 'validated'
                      ? 'Validé & Certifié'
                      : timesheet.status === 'submitted'
                      ? 'Soumis — En attente'
                      : 'Brouillon en cours'}
                  </span>
                </div>
                <div className="text-xs text-purple-900 bg-white/80 border border-purple-200/80 px-3 py-1.5 rounded-xl font-medium inline-block">
                  <strong className="text-purple-950">Motif déclaré :</strong> « {timesheet.supplementReason || 'Avenant de régularisation'} »
                </div>
                <p className="text-[11px] text-purple-800">
                  Ce document constitue un complément a posteriori apporté à la feuille certifiée initiale. Seuls les ajustements apportés seront pris en compte pour la régularisation en paie.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
              {timesheet.status === 'draft' && (
                <button
                  id="btn-discard-supplement"
                  onClick={() => setDeleteSupplementModalOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 transition-colors shadow-2xs cursor-pointer"
                  title="Supprimer ce brouillon de complément et revenir à la feuille d'heures validée"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Supprimer le brouillon</span>
                </button>
              )}
            </div>
          </div>

          {/* Comparison Delta vs base snapshot */}
          {timesheet.baseDaysSnapshot && (
            <div className="p-3.5 rounded-2xl bg-white/90 border border-purple-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-slate-600">
                <Info className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  Heures de la feuille initiale : <strong className="font-mono text-slate-800">{timesheet.baseDaysSnapshot.reduce((acc, d) => acc + (d.actualWorkedHours || 0), 0)}h00</strong> travaillées
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="px-3 py-1 rounded-xl bg-purple-50 text-purple-900 border border-purple-200 font-semibold">
                  Nouveau total : <span className="font-mono font-bold text-purple-950">{summary.rawRealizedHours}h00</span>
                </div>
                {(() => {
                  const baseWorked = timesheet.baseDaysSnapshot.reduce((acc, d) => acc + (d.actualWorkedHours || 0), 0);
                  const diff = Math.round((summary.rawRealizedHours - baseWorked) * 100) / 100;
                  return (
                    <div
                      className={`px-3 py-1 rounded-xl font-bold border ${
                        diff > 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : diff < 0
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      Écart régularisé : <span className="font-mono">{diff >= 0 ? `+${diff}` : diff}h00</span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VALIDATED CERTIFICATION BANNER */}
      {timesheet.status === 'validated' && !timesheet.isSupplement && (
        <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-300 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-emerald-950">
                  Fiche d'heures validée et certifiée conforme
                </h4>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider">
                  Certifié
                </span>
              </div>
              <p className="text-xs text-emerald-800">
                {timesheet.signature || `Validée le ${timesheet.validatedAt ? new Date(timesheet.validatedAt).toLocaleDateString('fr-FR') : ''}`}
              </p>
              <p className="text-[11px] text-emerald-700">
                Les heures sont verrouillées pour l'export paie. Pour apporter une correction sans altérer l'historique, créez un complément a posteriori.
              </p>
              {timesheet.deferOvertimeToNextMonth ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs mt-1">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Heures sup. non payées ce mois-ci &rarr; Reportées sur le mois suivant (+{formatHours(timesheet.carryoverToNextMonth || summary.totalCumulativeOvertime)})</span>
                </div>
              ) : (
                summary.totalCumulativeOvertime > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Heures sup. rémunérées sur le bulletin de ce mois (+{formatHours(timesheet.paidOvertimeHours || summary.totalCumulativeOvertime)})</span>
                  </div>
                )
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              id="btn-create-supplement-banner"
              onClick={() => {
                setSupplementReasonInput('');
                setSupplementReasonError('');
                setCreateSupplementModalOpen(true);
              }}
              className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-xs cursor-pointer shrink-0"
              title="Créer un complément d'heures / avenant a posteriori à faire valider par votre responsable"
            >
              <FilePlus2 className="w-4 h-4" />
              <span>Modifier via un complément a posteriori</span>
            </button>

            <button
              onClick={handleReopenDraft}
              className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors shadow-xs cursor-pointer shrink-0"
              title="Rouvrir la feuille en brouillon pour corriger une saisie"
            >
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>Rouvrir en brouillon</span>
            </button>
          </div>
        </div>
      )}

      {/* SUBMITTED BANNER */}
      {timesheet.status === 'submitted' && (
        <div className="p-5 rounded-3xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Clock className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <h4 className="font-bold text-sm text-indigo-950">
                Feuille d'heures transmise — En attente de validation
              </h4>
              <p className="text-xs text-indigo-800">
                Transmise le {timesheet.submittedAt ? new Date(timesheet.submittedAt).toLocaleDateString('fr-FR') : ''} au manager pour vérification et signature.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDirectValidate}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-sm"
              title="Valider immédiatement la fiche d'heures"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Valider la fiche</span>
            </button>

            <button
              onClick={handleReopenDraft}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 transition-colors cursor-pointer shadow-xs"
              title="Rouvrir la feuille en brouillon pour modifier"
            >
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <span>Rouvrir en brouillon</span>
            </button>
          </div>
        </div>
      )}

      {/* REJECTION ALERT IF REJECTED */}
      {timesheet.status === 'rejected' && (
        <div className="p-5 rounded-3xl bg-red-50 border border-red-200 text-red-900 flex items-start gap-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-red-900">
              Feuille d'heures rejetée par le manager
            </h4>
            <p className="text-xs text-red-800 leading-relaxed">
              <strong>Motif du rejet :</strong> {timesheet.rejectionReason || 'Corrections demandées.'}
            </p>
            <p className="text-[11px] text-red-700">
              Vous pouvez ajuster vos horaires ou les motifs d'heures supplémentaires ci-dessous, puis soumettre à nouveau.
            </p>
          </div>
        </div>
      )}

      {/* Quick test button to calibrate M-1 reserve overtime if needed */}
      {!isLocked && (
        <div className="flex items-center justify-end">
          <button
            onClick={handleAdjustReserve}
            className="text-[11px] font-semibold text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer inline-flex items-center gap-1.5"
            title="Ajuster le solde de report d'heures sup. M-1 pour tester les règles de compensation"
          >
            <TrendingUp className="w-3 h-3 text-indigo-500" />
            <span>Réserve d'heures sup. M-1 : <strong className="font-mono text-slate-800">+{timesheet.carryoverM1 || 0}h00</strong> (Ajuster pour test)</span>
          </button>
        </div>
      )}

      {/* AUTOMATIC CARRYOVER BANNER M-1 (Specified in Presentation & OCR page 8) */}
      {timesheet.carryoverM1 > 0 && (
        <div className="p-5 rounded-3xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-emerald-200 shrink-0">
              M-1
            </div>
            <div>
              <div className="font-bold text-sm text-emerald-950 flex items-center gap-2">
                <span>Report automatique du mois précédent ({formatMonthName(prevPeriod)})</span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-mono font-bold text-xs">
                  +{timesheet.carryoverM1}h00 en réserve
                </span>
                {summary.overtimeDeductedForDeficit > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-mono font-bold text-[10px] uppercase">
                    -{summary.overtimeDeductedForDeficit}h décomptées
                  </span>
                )}
              </div>
              <p className="text-xs text-emerald-800 mt-0.5">
                Reliquat d'heures supplémentaires reporté et disponible pour compenser les sous-services ou alimenter la paie.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            {!isLocked && (
              <button
                onClick={handleAdjustReserve}
                className="text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                title="Modifier la réserve M-1 pour tester"
              >
                Ajuster
              </button>
            )}
            <button
              onClick={() => onNavigateToPeriod(prevPeriod)}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-xs cursor-pointer"
            >
              <span>Consulter {formatMonthName(prevPeriod)}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* AUTOMATIC OVERTIME & NIGHT HOURS RESERVE COMPENSATION CALLOUT */}
      {(summary.overtimeDeductedForDeficit > 0 || summary.nightHoursDeductedForDeficit > 0) && (
        <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-400/40 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-fadeIn">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-amber-200 shrink-0 mt-0.5 sm:mt-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-amber-900 flex flex-wrap items-center gap-2">
                <span>Compensation automatique du sous-service active</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-600 text-white font-mono font-bold text-xs">
                  +{formatHours(summary.totalDeductedForDeficit)} transférées au temps réalisé
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed max-w-3xl">
                Le compteur d'heures réalisées brutes ({formatHours(summary.rawRealizedHours)}) étant inférieur aux heures contractuelles requises ({formatHours(summary.requiredHours)}),{' '}
                {summary.overtimeDeductedForDeficit > 0 && summary.nightHoursDeductedForDeficit > 0 ? (
                  <><strong>{formatHours(summary.overtimeDeductedForDeficit)}</strong> d'heures sup. et <strong>{formatHours(summary.nightHoursDeductedForDeficit)}</strong> d'heures de nuit ont été décomptées pour compenser le manque d'heures effectuées et atteindre <strong>{formatHours(summary.realizedHours)}</strong>.</>
                ) : summary.nightHoursDeductedForDeficit > 0 ? (
                  <>les heures supplémentaires étant insuffisantes, <strong>{formatHours(summary.nightHoursDeductedForDeficit)}</strong> d'heures de nuit de la colonne dédiée ont été décomptées pour compenser le manque d'heures effectuées et atteindre <strong>{formatHours(summary.realizedHours)}</strong>.</>
                ) : (
                  <><strong>{formatHours(summary.overtimeDeductedForDeficit)}</strong> d'heures supplémentaires en réserve ont été décomptées et ajoutées au temps réalisé pour atteindre <strong>{formatHours(summary.realizedHours)}</strong>.</>
                )}
                {' '}Reliquat HS restant : <strong>+{formatHours(summary.totalCumulativeOvertime)}</strong> &bull; Heures de nuit restantes : <strong>{formatHours(summary.nightHours)}</strong>.
              </p>
            </div>
          </div>

          <div className="shrink-0 self-start sm:self-center flex flex-col items-end gap-1.5">
            <span className="px-3.5 py-1.5 rounded-2xl bg-amber-100 text-amber-900 border border-amber-300 font-mono font-bold text-xs inline-flex items-center gap-1.5 shadow-2xs">
              <Check className="w-3.5 h-3.5 text-amber-700" />
              Réserve HS : +{formatHours(summary.totalCumulativeOvertime)}
            </span>
            {summary.nightHoursDeductedForDeficit > 0 && (
              <span className="px-2.5 py-0.5 rounded-xl bg-indigo-50 text-indigo-900 border border-indigo-200 font-mono font-bold text-[10px] inline-flex items-center gap-1">
                <Moon className="w-3 h-3 text-indigo-500" />
                Nuit restante : {formatHours(summary.nightHours)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* WEEKLY BENTO CARDS DASHBOARD (Week View) */}
      {viewMode === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Carte 1 : Heures de la Semaine en cours (Bento White Card) */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md uppercase tracking-wide">
                  Semaine Actuelle
                </span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
              </div>

              {(() => {
                const isUnderRequired = weeklyStats.realized < weeklyStats.required;
                const isOverRequired = weeklyStats.realized > weeklyStats.required;
                const isEqualRequired = weeklyStats.realized === weeklyStats.required;

                const valueColor = isEqualRequired
                  ? 'text-emerald-600'
                  : isUnderRequired
                  ? 'text-rose-600'
                  : 'text-amber-500';

                return (
                  <>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight ${valueColor}`}>
                        {formatHours(weeklyStats.realized)}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        / {formatHours(weeklyStats.required)} requis
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-1.5">
                      {isUnderRequired ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                          Temps inférieur au requis (-{formatHours(Math.max(0, weeklyStats.required - weeklyStats.realized))})
                        </span>
                      ) : isEqualRequired ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Temps requis atteint (100%)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-300">
                          Temps supérieur au requis (+{formatHours(weeklyStats.realized - weeklyStats.required)})
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}

              <p className="text-xs text-slate-500 mt-2">
                Heures travaillées + absences indemnisées (CP, maladie)
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="flex justify-between text-xs font-medium text-slate-600 mb-1.5">
                <span>Avancement hebdomadaire</span>
                <span
                  className={`font-bold ${
                    weeklyStats.realized === weeklyStats.required
                      ? 'text-emerald-600'
                      : weeklyStats.realized < weeklyStats.required
                      ? 'text-rose-600'
                      : 'text-amber-500'
                  }`}
                >
                  {weeklyStats.percent}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    weeklyStats.realized === weeklyStats.required
                      ? 'bg-emerald-500'
                      : weeklyStats.realized < weeklyStats.required
                      ? 'bg-rose-500'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, weeklyStats.percent)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Carte 2 : Report Heures Sup. Antérieures (Bento Vibrant Indigo Card) */}
          <div className="bg-indigo-600 text-white rounded-3xl p-6 flex flex-col justify-between overflow-hidden relative shadow-md shadow-indigo-200/50">
            {/* Decorative subtle background circle */}
            <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-100 bg-white/15 px-2.5 py-1 rounded-md uppercase tracking-wide">
                  Report Antérieur
                </span>
                <div className="w-9 h-9 rounded-xl bg-white/15 text-white flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight">
                  +{weeklyStats.totalPrior}h00
                </span>
                <span className="text-xs font-semibold text-indigo-200">en réserve</span>
              </div>

              <div className="mt-4 space-y-2">
                <div className="bg-white/10 p-2.5 rounded-2xl border border-white/10 flex items-center justify-between text-xs">
                  <span className="text-indigo-100">• Reliquat initial M-1 :</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onNavigateToPeriod(prevPeriod)}
                      className="font-bold text-white hover:underline inline-flex items-center gap-1 cursor-pointer"
                      title="Cliquer pour vérifier la feuille M-1"
                    >
                      <span>+{weeklyStats.m1Carryover}h00</span>
                      <ExternalLink className="w-3 h-3 text-indigo-200" />
                    </button>
                    {!isLocked && (
                      <button
                        onClick={handleAdjustReserve}
                        className="text-[10px] bg-white/20 hover:bg-white/30 text-white px-1.5 py-0.5 rounded cursor-pointer"
                        title="Ajuster la réserve pour tester"
                      >
                        Ajuster
                      </button>
                    )}
                  </div>
                </div>

                {summary.overtimeDeductedForDeficit > 0 && (
                  <div className="bg-amber-400/20 p-2.5 rounded-2xl border border-amber-300/30 flex items-center justify-between text-xs text-amber-200">
                    <span className="font-medium">• Décompté (déficit) :</span>
                    <span className="font-bold text-white font-mono">
                      -{formatHours(summary.overtimeDeductedForDeficit)}
                    </span>
                  </div>
                )}

                <div className="bg-white/10 p-2.5 rounded-2xl border border-white/10 flex items-center justify-between text-xs">
                  <span className="text-indigo-100">• Semaines passées :</span>
                  <span className="font-bold text-white">
                    +{weeklyStats.previousWeeksOvertime}h00
                  </span>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-4 pt-3 text-[11px] text-indigo-200 border-t border-white/15 flex items-center justify-between">
              <span>Audit continu</span>
              <span className="text-[10px] font-medium bg-white/15 px-2 py-0.5 rounded">M-1 certifié</span>
            </div>
          </div>

          {/* Carte 3 : Cumul Heures Sup. à Date (Bento Pitch Slate-900 Card) */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 flex flex-col justify-between overflow-hidden relative shadow-md">
            {/* Decorative background circle */}
            <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  Réserve Restante à Date
                </p>
                <div className="w-9 h-9 rounded-xl bg-slate-800 text-indigo-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-3xl sm:text-4xl font-extrabold text-emerald-400 font-mono tracking-tight">
                  +{formatHours(summary.totalCumulativeOvertime)}
                </span>
                <span className="text-xs font-semibold text-slate-400">disponibles</span>
              </div>

              <div className="mt-3 flex items-center space-x-2 text-xs text-slate-300">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  {summary.overtimeDeductedForDeficit > 0
                    ? `Après décompte de -${formatHours(summary.overtimeDeductedForDeficit)} pour combler le sous-service`
                    : 'Solde net disponible pour récupération ou paie'}
                </span>
              </div>
            </div>

            <div className="relative z-10 mt-5 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>HS déclarées ce mois :</span>
              <span className="font-bold text-amber-400">+{formatHours(summary.initialMonthOvertime)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Week Navigator (if in Week View) */}
      {viewMode === 'week' && (
        <div className="flex items-center justify-between bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
          <button
            onClick={() => setSelectedWeekIndex((prev) => Math.max(0, prev - 1))}
            disabled={selectedWeekIndex === 0}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-700 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Semaine précédente</span>
          </button>

          <div className="text-xs sm:text-sm font-bold text-slate-900 text-center">
            {currentWeek?.label} • Du {currentWeek?.startDate.slice(8)} au {currentWeek?.endDate.slice(8)}{' '}
            {formatMonthName(selectedPeriod)}
          </div>

          <button
            onClick={() => setSelectedWeekIndex((prev) => Math.min(weeks.length - 1, prev + 1))}
            disabled={selectedWeekIndex === weeks.length - 1}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-700 cursor-pointer"
          >
            <span>Semaine suivante</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TABLE DES HORAIRES ET DES POINTAGES */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-base">
              {viewMode === 'week' ? `Détail : ${currentWeek?.label}` : 'Relevé du Mois Complet'}
            </h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {viewMode === 'month'
                ? 'Saisie journalière avec ligne de compte rendu (total) après chaque semaine pour aérer et contrôler les pointages'
                : 'Saisie journalière des plages horaires, des heures supplémentaires justifiées et des congés'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[11px] font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
              <span className="text-slate-400">Repères :</span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-950 border border-yellow-400 font-bold text-[10px]">
                <TrendingUp className="w-3 h-3 text-amber-700" />
                +Xh en plus
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-300 font-bold text-[10px]">
                <AlertCircle className="w-3 h-3 text-rose-600" />
                -Xh manquante
              </span>
            </div>

            {isLocked && (
              <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-3.5 py-1.5 rounded-xl border border-amber-200 font-medium">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Feuille verrouillée ({timesheet.status === 'validated' ? 'Validée' : 'Soumise'})</span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable table container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4 w-32">Jour & Date</th>
                <th className="py-3.5 px-3 w-44">Matin (Début - Fin)</th>
                <th className="py-3.5 px-3 w-44">Après-Midi (Début - Fin)</th>
                <th className="py-3.5 px-2 w-32 text-center">Travaillé</th>
                <th className="py-3.5 px-3 w-60">Nuit / Heures Sup.</th>
                <th className="py-3.5 px-3 w-52">Absence / Congé</th>
                <th className="py-3.5 px-4">Observations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(() => {
                // Helper to compute metrics for any given week
                const computeWeekSummary = (week: WeekChunk) => {
                  let workedHours = 0;
                  let nightHours = 0;
                  let overtimeHours = 0;
                  let creditedAbsenceHours = 0;
                  let requiredHours = 0;
                  let missingOvertimeReasonCount = 0;
                  let missingNightReasonCount = 0;
                  let missingAbsenceReasonCount = 0;
                  let workedDaysCount = 0;

                  const absenceCounts: Record<string, number> = {
                    cp: 0,
                    sick: 0,
                    recovery: 0,
                    unpaid: 0,
                    other: 0,
                    unjustified: 0,
                  };

                  week.days.forEach((day) => {
                    workedHours += day.actualWorkedHours || 0;
                    const nh = day.nightHours || 0;
                    nightHours += nh;
                    if (nh > 0 && (!day.nightHoursReason || !day.nightHoursReason.trim())) {
                      missingNightReasonCount++;
                    }

                    const ot = day.overtimeHours || 0;
                    overtimeHours += ot;
                    if (ot > 0 && (!day.overtimeReason || !day.overtimeReason.trim())) {
                      missingOvertimeReasonCount++;
                    }

                    if (
                      (day.absenceType === 'other' || day.absenceType === 'unjustified') &&
                      (!day.absenceReason || !day.absenceReason.trim())
                    ) {
                      missingAbsenceReasonCount++;
                    }

                    creditedAbsenceHours += day.absenceCreditedHours || 0;

                    if (day.absenceType !== 'none') {
                      const durationVal = day.absenceDuration === 'full' ? 1 : 0.5;
                      absenceCounts[day.absenceType] = (absenceCounts[day.absenceType] || 0) + durationVal;
                    }

                    const schedule = currentUser.contract.defaultSchedule.find(
                      (s) => s.dayOfWeek === day.dayOfWeek
                    );
                    if (schedule && schedule.isWorked && !day.isHoliday) {
                      requiredHours += schedule.standardHours;
                      workedDaysCount++;
                    }
                  });

                  const absencesSummary: string[] = [];
                  if (absenceCounts.cp > 0) absencesSummary.push(`${absenceCounts.cp}j CP`);
                  if (absenceCounts.recovery > 0) absencesSummary.push(`${absenceCounts.recovery}j Récup.`);
                  if (absenceCounts.sick > 0) absencesSummary.push(`${absenceCounts.sick}j Maladie`);
                  if (absenceCounts.unpaid > 0) absencesSummary.push(`${absenceCounts.unpaid}j Sans solde`);
                  if (absenceCounts.other > 0) absencesSummary.push(`${absenceCounts.other}j Autre`);
                  if (absenceCounts.unjustified > 0) absencesSummary.push(`${absenceCounts.unjustified}j Injustifiée`);

                  const totalEffectiveHours = Math.round((workedHours + creditedAbsenceHours) * 100) / 100;
                  const balanceHours = Math.round((totalEffectiveHours - requiredHours) * 100) / 100;
                  const totalMissingReasonCount =
                    missingOvertimeReasonCount + missingNightReasonCount + missingAbsenceReasonCount;

                  // Compensation calculation for the week if deficit in normal hours:
                  // Si l'employé doit des heures pour son quota normal, déduire des heures sup
                  // pour les transférer dans le temps travaillé, et calculer le solde d'heures sup restant.
                  const weekDeficit = Math.max(0, Math.round((requiredHours - totalEffectiveHours) * 100) / 100);
                  let overtimeDeductedForDeficit = 0;
                  let nightDeductedForDeficit = 0;

                  if (weekDeficit > 0) {
                    if (overtimeHours > 0) {
                      overtimeDeductedForDeficit = Math.min(overtimeHours, weekDeficit);
                    }
                    const remainingDeficitAfterOT = Math.round((weekDeficit - overtimeDeductedForDeficit) * 100) / 100;
                    if (remainingDeficitAfterOT > 0 && nightHours > 0) {
                      nightDeductedForDeficit = Math.min(nightHours, remainingDeficitAfterOT);
                    }
                  }

                  overtimeDeductedForDeficit = Math.round(overtimeDeductedForDeficit * 100) / 100;
                  nightDeductedForDeficit = Math.round(nightDeductedForDeficit * 100) / 100;
                  const totalDeductedForDeficit = Math.round((overtimeDeductedForDeficit + nightDeductedForDeficit) * 100) / 100;

                  // Heures supplémentaires et heures de nuit restantes après compensation du quota
                  const remainingOvertimeHours = Math.round((overtimeHours - overtimeDeductedForDeficit) * 100) / 100;
                  const remainingNightHours = Math.round((nightHours - nightDeductedForDeficit) * 100) / 100;

                  // Temps effectif finalisé avec compensation
                  const compensatedEffectiveHours = Math.round((totalEffectiveHours + totalDeductedForDeficit) * 100) / 100;
                  const remainingDeficitHours = Math.max(0, Math.round((weekDeficit - totalDeductedForDeficit) * 100) / 100);

                  return {
                    workedHours: Math.round(workedHours * 100) / 100,
                    nightHours: Math.round(nightHours * 100) / 100,
                    overtimeHours: Math.round(overtimeHours * 100) / 100,
                    creditedAbsenceHours: Math.round(creditedAbsenceHours * 100) / 100,
                    totalEffectiveHours,
                    requiredHours: Math.round(requiredHours * 100) / 100,
                    balanceHours,
                    weekDeficit,
                    overtimeDeductedForDeficit,
                    nightDeductedForDeficit,
                    totalDeductedForDeficit,
                    remainingOvertimeHours,
                    remainingNightHours,
                    compensatedEffectiveHours,
                    remainingDeficitHours,
                    missingOvertimeReasonCount,
                    missingNightReasonCount,
                    missingAbsenceReasonCount,
                    totalMissingReasonCount,
                    absencesSummary,
                    workedDaysCount,
                  };
                };

                // Helper to render day row
                const renderDayRow = (day: DayEntry) => {
                  const dayName = getFrenchDayName(day.dayOfWeek);
                  const isOvertimeMissingReason = (day.overtimeHours || 0) > 0 && !day.overtimeReason?.trim();
                  const isNightMissingReason = (day.nightHours || 0) > 0 && !day.nightHoursReason?.trim();
                  const isAbsenceMissingReason =
                    (day.absenceType === 'other' || day.absenceType === 'unjustified') &&
                    !day.absenceReason?.trim();
                  const isWeekend = day.dayOfWeek >= 6;

                  // Contract standard required hours for this day
                  const schedule = currentUser.contract.defaultSchedule.find(
                    (s) => s.dayOfWeek === day.dayOfWeek
                  );
                  const dayRequired = schedule?.isWorked && !day.isHoliday ? schedule.standardHours : 0;
                  const worked = day.actualWorkedHours || 0;
                  const credited = day.absenceCreditedHours || 0;
                  const overtime = day.overtimeHours || 0;
                  const totalDayEffective = Math.round((worked + credited) * 100) / 100;

                  const hasActivity =
                    worked > 0 ||
                    credited > 0 ||
                    overtime > 0 ||
                    Boolean(day.morningStart) ||
                    Boolean(day.morningEnd) ||
                    Boolean(day.afternoonStart) ||
                    Boolean(day.afternoonEnd) ||
                    day.absenceType !== 'none';

                  let extraHours = 0;
                  let missingHours = 0;

                  if (hasActivity && (dayRequired > 0 || totalDayEffective > 0 || overtime > 0)) {
                    if (totalDayEffective > dayRequired) {
                      extraHours = Math.round(Math.max(totalDayEffective - dayRequired, overtime) * 100) / 100;
                    } else if (totalDayEffective < dayRequired) {
                      const rawDeficit = Math.round((dayRequired - totalDayEffective) * 100) / 100;
                      if (overtime >= rawDeficit) {
                        extraHours = Math.round((overtime - rawDeficit) * 100) / 100;
                      } else {
                        missingHours = Math.round((rawDeficit - overtime) * 100) / 100;
                      }
                    } else {
                      if (overtime > 0) {
                        extraHours = overtime;
                      }
                    }
                  }

                  const isSuperior = extraHours > 0;
                  const isInferior = missingHours > 0;

                  // Supplement change detection against baseDaysSnapshot
                  const baseDay =
                    timesheet.isSupplement && timesheet.baseDaysSnapshot
                      ? timesheet.baseDaysSnapshot.find((b) => b.date === day.date)
                      : null;
                  const isDayModifiedInSupplement = Boolean(
                    baseDay &&
                      ((day.actualWorkedHours || 0) !== (baseDay.actualWorkedHours || 0) ||
                        (day.overtimeHours || 0) !== (baseDay.overtimeHours || 0) ||
                        (day.nightHours || 0) !== (baseDay.nightHours || 0) ||
                        day.morningStart !== baseDay.morningStart ||
                        day.morningEnd !== baseDay.morningEnd ||
                        day.afternoonStart !== baseDay.afternoonStart ||
                        day.afternoonEnd !== baseDay.afternoonEnd ||
                        day.absenceType !== baseDay.absenceType)
                  );
                  const supplementWorkedDiff = baseDay
                    ? Math.round(((day.actualWorkedHours || 0) - (baseDay.actualWorkedHours || 0)) * 100) / 100
                    : 0;

                  return (
                    <tr
                      key={day.date}
                      className={`transition-colors ${
                        isDayModifiedInSupplement
                          ? 'bg-purple-50/60 hover:bg-purple-50/90'
                          : day.isOffDay
                          ? 'bg-slate-50/60 text-slate-400'
                          : isSuperior
                          ? 'bg-yellow-50/35 hover:bg-yellow-50/65'
                          : isInferior
                          ? 'bg-rose-50/30 hover:bg-rose-50/55'
                          : day.overtimeHours > 0
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : day.absenceType !== 'none'
                          ? 'bg-blue-50/30 hover:bg-blue-50/50'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Date and Day Name */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <span>{dayName}</span>
                          <span className="text-slate-500 font-normal">{day.date.slice(8)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1">
                          {day.isHoliday ? (
                            <span className="text-rose-600 font-medium">Férié</span>
                          ) : isWeekend ? (
                            <span>Week-end</span>
                          ) : (
                            <span>Ouvré</span>
                          )}
                          {isDayModifiedInSupplement && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-900 border border-purple-300">
                              Ajusté {supplementWorkedDiff !== 0 ? `(${supplementWorkedDiff > 0 ? '+' : ''}${supplementWorkedDiff}h)` : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Morning (Start - End) */}
                      <td className="py-2.5 px-3">
                        {(() => {
                          const isMorningAbsenceBlocked =
                            day.absenceType !== 'none' &&
                            (day.absenceDuration === 'full' || day.absenceDuration === 'morning');

                          if (isMorningAbsenceBlocked) {
                            return (
                              <div className="flex items-center justify-between px-2 py-1 bg-indigo-50/90 border border-indigo-200/90 rounded-xl text-indigo-900 font-semibold text-[11px] w-full shadow-2xs">
                                <span className="truncate">
                                  {day.absenceType === 'cp'
                                    ? '🌴 CP'
                                    : day.absenceType === 'sick'
                                    ? '🩺 Maladie'
                                    : day.absenceType === 'recovery'
                                    ? '⏳ Récup.'
                                    : day.absenceType === 'unpaid'
                                    ? '⛔ Sans solde'
                                    : 'Absence'}{' '}
                                  {day.absenceDuration === 'full' ? '(Jour)' : '(Matin)'}
                                </span>
                                <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-200/70 text-indigo-950 font-bold uppercase tracking-wider shrink-0 ml-1">
                                  Bloqué
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-center gap-1">
                              <input
                                type="time"
                                disabled={isLocked || day.isOffDay}
                                value={day.morningStart}
                                onChange={(e) => handleDayChange(day.date, { morningStart: e.target.value })}
                                className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                              />
                              <span className="text-slate-400">-</span>
                              <input
                                type="time"
                                disabled={isLocked || day.isOffDay}
                                value={day.morningEnd}
                                onChange={(e) => handleDayChange(day.date, { morningEnd: e.target.value })}
                                className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                              />
                            </div>
                          );
                        })()}
                      </td>

                      {/* Afternoon (Start - End) */}
                      <td className="py-2.5 px-3">
                        {(() => {
                          const isAfternoonAbsenceBlocked =
                            day.absenceType !== 'none' &&
                            (day.absenceDuration === 'full' || day.absenceDuration === 'afternoon');

                          if (isAfternoonAbsenceBlocked) {
                            return (
                              <div className="flex items-center justify-between px-2 py-1 bg-indigo-50/90 border border-indigo-200/90 rounded-xl text-indigo-900 font-semibold text-[11px] w-full shadow-2xs">
                                <span className="truncate">
                                  {day.absenceType === 'cp'
                                    ? '🌴 CP'
                                    : day.absenceType === 'sick'
                                    ? '🩺 Maladie'
                                    : day.absenceType === 'recovery'
                                    ? '⏳ Récup.'
                                    : day.absenceType === 'unpaid'
                                    ? '⛔ Sans solde'
                                    : 'Absence'}{' '}
                                  {day.absenceDuration === 'full' ? '(Jour)' : '(A-Midi)'}
                                </span>
                                <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-200/70 text-indigo-950 font-bold uppercase tracking-wider shrink-0 ml-1">
                                  Bloqué
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="flex items-center gap-1">
                              <input
                                type="time"
                                disabled={isLocked || day.isOffDay}
                                value={day.afternoonStart}
                                onChange={(e) => handleDayChange(day.date, { afternoonStart: e.target.value })}
                                className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                              />
                              <span className="text-slate-400">-</span>
                              <input
                                type="time"
                                disabled={isLocked || day.isOffDay}
                                value={day.afternoonEnd}
                                onChange={(e) => handleDayChange(day.date, { afternoonEnd: e.target.value })}
                                className="w-20 px-2 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                              />
                            </div>
                          );
                        })()}
                      </td>

                      {/* Actual Worked Hours with red (missing hours) or yellow (extra hours) indicator */}
                      <td className="py-2.5 px-2 text-center font-mono">
                        {worked > 0 ? (
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`font-bold text-xs px-2 py-0.5 rounded-lg border shadow-2xs ${
                                !isSuperior && !isInferior && dayRequired > 0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : isInferior
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : isSuperior
                                  ? 'bg-yellow-50 text-yellow-900 border-yellow-400'
                                  : 'bg-slate-100 text-slate-900 border-slate-200'
                              }`}
                            >
                              {formatHours(worked)}
                            </span>
                            {credited > 0 && (
                              <div className="text-[10px] text-indigo-700 font-semibold">
                                +{formatHours(credited)} congé
                              </div>
                            )}
                            {isSuperior && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-100 text-yellow-950 border border-yellow-400 font-mono font-bold text-[11px] shadow-2xs"
                                title={`+${formatHours(extraHours)} heure(s) en plus par rapport aux ${formatHours(dayRequired)} attendues`}
                              >
                                <TrendingUp className="w-3 h-3 text-amber-700 shrink-0" />
                                +{formatHours(extraHours)}
                              </span>
                            )}
                            {isInferior && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 font-mono font-bold text-[11px] shadow-2xs"
                                title={`-${formatHours(missingHours)} heure(s) manquante(s) par rapport aux ${formatHours(dayRequired)} attendues`}
                              >
                                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                -{formatHours(missingHours)}
                              </span>
                            )}
                            {!isSuperior && !isInferior && dayRequired > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono font-semibold text-[10px]">
                                <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                Conforme
                              </span>
                            )}
                          </div>
                        ) : credited > 0 ? (
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${
                                !isSuperior && !isInferior && dayRequired > 0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : isInferior
                                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                                  : isSuperior
                                  ? 'bg-yellow-50 text-yellow-900 border-yellow-400'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              +{formatHours(credited)} congé
                            </span>
                            {isSuperior && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-100 text-yellow-950 border border-yellow-400 font-mono font-bold text-[11px] shadow-2xs"
                                title={`+${formatHours(extraHours)} heure(s) en plus`}
                              >
                                <TrendingUp className="w-3 h-3 text-amber-700 shrink-0" />
                                +{formatHours(extraHours)}
                              </span>
                            )}
                            {isInferior && (
                              <span
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 font-mono font-bold text-[11px] shadow-2xs"
                                title={`-${formatHours(missingHours)} heure(s) manquante(s)`}
                              >
                                <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                -{formatHours(missingHours)}
                              </span>
                            )}
                            {!isSuperior && !isInferior && dayRequired > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-300 font-mono font-semibold text-[10px]">
                                <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                Conforme
                              </span>
                            )}
                          </div>
                        ) : isInferior ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-400 font-mono text-xs">0h00</span>
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 font-mono font-bold text-[11px] shadow-2xs"
                              title={`-${formatHours(missingHours)} heure(s) manquante(s) par rapport aux ${formatHours(dayRequired)} attendues`}
                            >
                              <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                              -{formatHours(missingHours)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Overtime / Night (Hours + Reason) */}
                      <td className="py-2.5 px-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Heures Sup */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-tight" title="Heures supplémentaires classiques (taux majoré HS). Calcul automatique d'après vos horaires. Justification obligatoire.">
                                Sup :
                              </span>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="12"
                                disabled={isLocked || (day.absenceType !== 'none' && day.absenceDuration === 'full')}
                                value={day.overtimeHours || ''}
                                placeholder="0.0"
                                onChange={(e) => {
                                  const rawVal = e.target.value;
                                  if (rawVal === '') {
                                    handleDayChange(day.date, {
                                      overtimeHours: 0,
                                      hasManualOvertimeHours: false,
                                    });
                                  } else {
                                    const parsed = parseFloat(rawVal);
                                    handleDayChange(day.date, {
                                      overtimeHours: isNaN(parsed) ? 0 : Math.max(0, parsed),
                                      hasManualOvertimeHours: true,
                                    });
                                  }
                                }}
                                title={
                                  day.hasManualOvertimeHours
                                    ? "Heures supplémentaires ajustées manuellement (effacez la case pour recalculer automatiquement)"
                                    : "Heures supplémentaires calculées automatiquement selon les horaires travaillés"
                                }
                                className={`w-14 px-1.5 py-0.5 text-xs font-mono font-bold rounded-lg border focus:outline-none transition-all ${
                                  day.overtimeHours > 0
                                    ? 'bg-amber-50 border-amber-400 text-amber-900 focus:ring-1 focus:ring-amber-500'
                                    : 'bg-slate-50/60 border-slate-200 focus:bg-white focus:ring-1 focus:ring-indigo-500'
                                }`}
                              />
                            </div>

                            {/* Heures de Nuit (21h-06h) */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-tight flex items-center gap-0.5" title="Heures de nuit (taux majoré spécifique de nuit). Comptabilisées en fin de mois pour ne pas confondre avec les HS classiques ni les heures normales. Justification obligatoire.">
                                <Moon className="w-2.5 h-2.5 text-indigo-500" />
                                Nuit :
                              </span>
                              <input
                                type="number"
                                step="0.5"
                                min="0"
                                max="12"
                                disabled={isLocked || (day.absenceType !== 'none' && day.absenceDuration === 'full')}
                                value={day.nightHours || ''}
                                placeholder="0.0"
                                onChange={(e) =>
                                  handleDayChange(day.date, {
                                    nightHours: isNaN(parseFloat(e.target.value)) ? 0 : Math.max(0, parseFloat(e.target.value)),
                                    hasManualNightHours: e.target.value !== '' && (parseFloat(e.target.value) || 0) > 0,
                                  })
                                }
                                className={`w-14 px-1.5 py-0.5 text-xs font-mono font-bold rounded-lg border focus:outline-none ${
                                  day.nightHours > 0
                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 focus:ring-1 focus:ring-indigo-500'
                                    : 'bg-slate-50/60 border-slate-200 focus:bg-white focus:ring-1 focus:ring-indigo-500'
                                }`}
                              />
                            </div>
                          </div>

                          {/* Justification Heures Sup */}
                          {day.overtimeHours > 0 && (
                            <div className="space-y-0.5">
                              <input
                                type="text"
                                disabled={isLocked}
                                value={day.overtimeReason || ''}
                                placeholder="Justification heures sup. obligatoire"
                                onChange={(e) =>
                                  handleDayChange(day.date, { overtimeReason: e.target.value })
                                }
                                className={`w-full px-2.5 py-1 text-xs rounded-xl border transition-all focus:outline-none ${
                                  isOvertimeMissingReason
                                    ? 'bg-red-50 border-red-400 text-red-900 ring-1 ring-red-400 placeholder:text-red-400'
                                    : 'bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-amber-500'
                                }`}
                              />
                              {isOvertimeMissingReason && (
                                <p className="text-[10px] text-red-600 font-semibold">Justification HS requise</p>
                              )}
                            </div>
                          )}

                          {/* Justification Heures de Nuit */}
                          {day.nightHours > 0 && (
                            <div className="space-y-0.5">
                              <input
                                type="text"
                                disabled={isLocked}
                                value={day.nightHoursReason || ''}
                                placeholder="Justification heures de nuit obligatoire"
                                onChange={(e) =>
                                  handleDayChange(day.date, { nightHoursReason: e.target.value })
                                }
                                className={`w-full px-2.5 py-1 text-xs rounded-xl border transition-all focus:outline-none ${
                                  isNightMissingReason
                                    ? 'bg-red-50 border-red-400 text-red-900 ring-1 ring-red-400 placeholder:text-red-400'
                                    : 'bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-indigo-500'
                                }`}
                              />
                              {isNightMissingReason && (
                                <p className="text-[10px] text-red-600 font-semibold">Justification Nuit requise</p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Absence / Leave */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1.5">
                          <select
                            disabled={isLocked}
                            value={day.absenceType}
                            onChange={(e) =>
                              handleDayChange(day.date, {
                                absenceType: e.target.value as AbsenceType,
                              })
                            }
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="none">Aucune</option>
                            <optgroup label="Absences justifiées (Horaires normaux)">
                              <option value="cp">Congés payés (CP)</option>
                              <option value="recovery">Récupération (RECUP)</option>
                              <option value="sick">Arrêt maladie / Accident</option>
                              <option value="unpaid">Congé sans solde</option>
                            </optgroup>
                            <optgroup label="Absences non travaillées (Explication requise)">
                              <option value="other">Autre motif</option>
                              <option value="unjustified">Absence injustifiée</option>
                            </optgroup>
                          </select>

                          {day.absenceType !== 'none' && (
                            <div className="flex items-center gap-1">
                              <select
                                disabled={isLocked}
                                value={day.absenceDuration}
                                onChange={(e) =>
                                  handleDayChange(day.date, {
                                    absenceDuration: e.target.value as AbsenceDuration,
                                  })
                                }
                                className="w-full px-2 py-0.5 text-[11px] border border-indigo-200 rounded-lg bg-indigo-50/60 text-indigo-900 font-medium"
                              >
                                <option value="full">Journée entière</option>
                                <option value="morning">Matinée uniquement</option>
                                <option value="afternoon">Après-midi uniquement</option>
                              </select>
                            </div>
                          )}

                          {/* Explication obligatoire pour autre motif ou absence injustifiée */}
                          {(day.absenceType === 'other' || day.absenceType === 'unjustified') && (
                            <div className="space-y-0.5">
                              <input
                                type="text"
                                disabled={isLocked}
                                value={day.absenceReason || ''}
                                placeholder={`Explication obligatoire (${day.absenceType === 'unjustified' ? 'injustifiée' : 'autre motif'})...`}
                                onChange={(e) =>
                                  handleDayChange(day.date, { absenceReason: e.target.value })
                                }
                                className={`w-full px-2.5 py-1 text-xs rounded-xl border transition-all focus:outline-none ${
                                  isAbsenceMissingReason
                                    ? 'bg-red-50 border-red-400 text-red-900 ring-1 ring-red-400 placeholder:text-red-400'
                                    : 'bg-white border-slate-200 text-slate-800 focus:ring-1 focus:ring-indigo-500'
                                }`}
                              />
                              {isAbsenceMissingReason && (
                                <p className="text-[10px] text-red-600 font-semibold">Explication obligatoire requise</p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Observations / Notes */}
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          disabled={isLocked}
                          value={day.notes || ''}
                          placeholder="Commentaires libres..."
                          onChange={(e) => handleDayChange(day.date, { notes: e.target.value })}
                          className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-xl bg-slate-50/60 focus:bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                    </tr>
                  );
                };

                // Helper to render weekly summary row (ligne de compte rendu / total)
                const renderWeekTotalRow = (week: WeekChunk) => {
                  const sum = computeWeekSummary(week);

                  return (
                    <tr
                      key={`total-${week.weekNumber}`}
                      className="bg-slate-100/95 hover:bg-slate-200/70 border-t-2 border-b-2 border-slate-300/80 transition-colors shadow-2xs font-medium"
                    >
                      {/* Jour & Plages horaires fusionnées (3 colonnes) */}
                      <td colSpan={3} className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 text-white font-bold text-xs tracking-wide shadow-xs">
                              <Clock className="w-3.5 h-3.5 text-indigo-400" />
                              Compte Rendu {week.label}
                            </span>
                            <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                              ({sum.workedDaysCount} jours ouvrés)
                            </span>
                          </div>
                          <div className="text-right text-xs text-slate-600 flex flex-col items-end justify-center gap-2">
                            <span className="text-xs font-semibold text-slate-700">Total travaillé :</span>
                            <span className="text-[11px] text-slate-500 font-medium">Attendu contractuel :</span>
                          </div>
                        </div>
                      </td>

                      {/* Heures Travaillées effectives de la semaine */}
                      <td className="py-3 px-2 text-center">
                        {(() => {
                          const isEqualRequired = sum.compensatedEffectiveHours === sum.requiredHours;
                          const isUnder = sum.compensatedEffectiveHours < sum.requiredHours;
                          const isOver = sum.compensatedEffectiveHours > sum.requiredHours;
                          const badgeColor = isEqualRequired
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                            : isUnder
                            ? 'bg-rose-50 text-rose-800 border-rose-300 font-bold'
                            : 'bg-yellow-50 text-yellow-900 border-yellow-400 font-bold';

                          return (
                            <div className="inline-flex flex-col items-center gap-1.5">
                              {/* Bulle 1 : Total Travaillé effectif (incluant compensation éventuelle) */}
                              <div className="flex flex-col items-center">
                                <span
                                  className={`font-mono font-extrabold text-xs px-2.5 py-1 rounded-xl shadow-xs border ${badgeColor}`}
                                  title={
                                    sum.totalDeductedForDeficit > 0
                                      ? `${formatHours(sum.totalEffectiveHours)} brutes + ${formatHours(sum.totalDeductedForDeficit)} transférées des HS/Nuit = ${formatHours(sum.compensatedEffectiveHours)} effectives`
                                      : "Total des heures travaillées"
                                  }
                                >
                                  {formatHours(sum.compensatedEffectiveHours)}
                                </span>
                                {sum.totalDeductedForDeficit > 0 ? (
                                  <span
                                    className="text-[10px] text-amber-700 font-bold mt-0.5"
                                    title="Heures déduites des heures sup pour combler le quota normal de travail"
                                  >
                                    +{formatHours(sum.totalDeductedForDeficit)} comp. HS
                                  </span>
                                ) : sum.creditedAbsenceHours > 0 ? (
                                  <span className="text-[10px] text-indigo-700 font-semibold mt-0.5" title="Heures d'absences créditées au contrat">
                                    +{formatHours(sum.creditedAbsenceHours)} abs.
                                  </span>
                                ) : null}
                              </div>

                              {/* Bulle 2 : Attendu contractuel */}
                              <div className="flex flex-col items-center">
                                <span
                                  className="font-mono font-bold text-xs px-2.5 py-1 rounded-xl bg-white text-slate-700 border border-slate-300 shadow-2xs"
                                  title="Attendu contractuel de la semaine"
                                >
                                  {formatHours(sum.requiredHours)}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Nuit & Heures Sup. (Total calculé en fonction des heures restantes) */}
                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* Heures Sup restantes / nettes */}
                            <span
                              className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded-xl ${
                                sum.remainingOvertimeHours > 0
                                  ? 'bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs'
                                  : sum.overtimeDeductedForDeficit > 0
                                  ? 'bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs'
                                  : 'text-slate-500 bg-white border border-slate-200'
                              }`}
                              title={
                                sum.overtimeDeductedForDeficit > 0
                                  ? `${formatHours(sum.overtimeHours)} HS faites - ${formatHours(sum.overtimeDeductedForDeficit)} transférées pour le quota = ${formatHours(sum.remainingOvertimeHours)} HS restantes`
                                  : "Heures supplémentaires classiques (taux majoré HS)"
                              }
                            >
                              {sum.remainingOvertimeHours > 0
                                ? `+${formatHours(sum.remainingOvertimeHours)} HS`
                                : sum.overtimeDeductedForDeficit > 0
                                ? '0h00 HS nette'
                                : '0h00 HS'}
                            </span>

                            {/* Heures de nuit restantes / nettes */}
                            <span
                              className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded-xl flex items-center gap-0.5 ${
                                sum.remainingNightHours > 0
                                  ? 'bg-indigo-100 text-indigo-950 border border-indigo-300 shadow-2xs'
                                  : sum.nightDeductedForDeficit > 0
                                  ? 'bg-slate-100 text-slate-700 border border-slate-300 shadow-2xs'
                                  : 'text-slate-500 bg-white border border-slate-200'
                              }`}
                              title={
                                sum.nightDeductedForDeficit > 0
                                  ? `${formatHours(sum.nightHours)} faites - ${formatHours(sum.nightDeductedForDeficit)} transférées pour le quota = ${formatHours(sum.remainingNightHours)} nuit payée`
                                  : "Heures de nuit (taux majoré spécifique de nuit)"
                              }
                            >
                              <Moon className="w-2.5 h-2.5 text-indigo-500" />
                              {sum.remainingNightHours > 0
                                ? `${formatHours(sum.remainingNightHours)} Nuit`
                                : sum.nightDeductedForDeficit > 0
                                ? '0h00 Nuit'
                                : '0h00 Nuit'}
                            </span>
                          </div>

                          {/* Détail du calcul en cas de déduction pour combler les heures manquantes au quota */}
                          {sum.overtimeDeductedForDeficit > 0 && (
                            <div className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 rounded-lg p-1.5 leading-tight">
                              <div className="flex justify-between gap-1">
                                <span>Faites :</span>
                                <span className="font-mono font-bold">+{formatHours(sum.overtimeHours)}</span>
                              </div>
                              <div className="flex justify-between gap-1 text-rose-700">
                                <span>Récup. quota :</span>
                                <span className="font-mono font-bold">-{formatHours(sum.overtimeDeductedForDeficit)}</span>
                              </div>
                              <div className="flex justify-between gap-1 text-emerald-800 pt-0.5 border-t border-amber-200 font-bold">
                                <span>Reste net :</span>
                                <span className="font-mono">+{formatHours(sum.remainingOvertimeHours)}</span>
                              </div>
                            </div>
                          )}

                          {sum.nightDeductedForDeficit > 0 && (
                            <div className="text-[10px] bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-lg p-1.5 leading-tight">
                              <div className="flex justify-between gap-1">
                                <span>Nuit faites :</span>
                                <span className="font-mono font-bold">{formatHours(sum.nightHours)}</span>
                              </div>
                              <div className="flex justify-between gap-1 text-rose-700">
                                <span>Récup. quota :</span>
                                <span className="font-mono font-bold">-{formatHours(sum.nightDeductedForDeficit)}</span>
                              </div>
                              <div className="flex justify-between gap-1 text-indigo-900 pt-0.5 border-t border-indigo-200 font-bold">
                                <span>Reste payé :</span>
                                <span className="font-mono">{formatHours(sum.remainingNightHours)}</span>
                              </div>
                            </div>
                          )}

                          {sum.totalMissingReasonCount > 0 && (
                            <span className="text-[10px] text-rose-600 font-bold inline-flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                              {sum.totalMissingReasonCount} justification(s) requise(s)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Synthèse des Absences / Congés de la semaine */}
                      <td className="py-3 px-3">
                        {sum.absencesSummary.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {sum.absencesSummary.map((ab, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded-md font-semibold text-[10px]"
                              >
                                {ab}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Aucune absence</span>
                        )}
                      </td>

                      {/* Observations & Équilibre hebdomadaire */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {sum.totalDeductedForDeficit > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs">
                                <Check className="w-3 h-3 text-emerald-600" />
                                Quota comblé (+{formatHours(sum.totalDeductedForDeficit)} HS)
                              </span>
                            ) : sum.balanceHours > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-yellow-950 bg-yellow-100 border border-yellow-400 px-2 py-0.5 rounded-lg shadow-2xs">
                                <TrendingUp className="w-3 h-3 text-amber-700" />
                                Heures en plus : +{formatHours(sum.balanceHours)}
                              </span>
                            ) : sum.balanceHours < 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-900 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-lg shadow-2xs">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                Heures manquantes : -{formatHours(Math.abs(sum.balanceHours))}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-lg shadow-2xs">
                                <Check className="w-3 h-3 text-emerald-600" />
                                Équilibré ({formatHours(sum.requiredHours)})
                              </span>
                            )}
                          </div>

                          <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                            Effectif : {formatHours(sum.compensatedEffectiveHours)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                };

                // Render based on current view mode
                if (viewMode === 'week') {
                  if (!currentWeek) return null;
                  return (
                    <React.Fragment key={`week-group-${currentWeek.weekNumber}`}>
                      {currentWeek.days.map((day) => renderDayRow(day))}
                      {renderWeekTotalRow(currentWeek)}
                    </React.Fragment>
                  );
                }

                // Month view: render each week's days followed by its week total row
                return weeks.map((week) => (
                  <React.Fragment key={`month-week-group-${week.weekNumber}`}>
                    {week.days.map((day) => renderDayRow(day))}
                    {renderWeekTotalRow(week)}
                  </React.Fragment>
                ));
              })()}
            </tbody>

            {/* Total général du mois dans le pied du tableau */}
            <tfoot className="bg-slate-900 text-slate-100 border-t-2 border-slate-700 font-medium">
              <tr>
                <td colSpan={3} className="py-3 px-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 rounded-xl bg-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-xs">
                        Total du Mois
                      </span>
                      <span className="text-xs text-slate-300 font-medium">
                        Synthèse globale {formatMonthName(timesheet.period)}
                      </span>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      Attendu contractuel : <strong className="text-white font-mono">{summary.requiredHours}h</strong>
                    </div>
                  </div>
                </td>

                {/* Travaillé (Heures validées après compensation éventuelle) */}
                <td className="py-3 px-2 text-center">
                  <div className="inline-flex flex-col items-center gap-0.5">
                    <span
                      className={`font-mono font-black text-xs px-2.5 py-1 rounded-xl shadow-xs border ${
                        summary.realizedHours === summary.requiredHours
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : summary.realizedHours < summary.requiredHours
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                      }`}
                      title={
                        summary.totalDeductedForDeficit > 0
                          ? `${summary.rawRealizedHours}h brutes + ${summary.totalDeductedForDeficit}h compensées par HS/Nuit = ${summary.realizedHours}h validées`
                          : "Heures réalisées validées"
                      }
                    >
                      {summary.realizedHours}h
                    </span>
                    {summary.totalDeductedForDeficit > 0 ? (
                      <span className="text-[10px] text-amber-300 font-semibold" title="Heures transférées depuis les HS pour sécuriser le quota normal">
                        +{summary.totalDeductedForDeficit}h comp.
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-mono">
                        sur {summary.requiredHours}h
                      </span>
                    )}
                  </div>
                </td>

                {/* Nuit / Heures Sup. - Total mensuel avec calcul net restant */}
                <td className="py-3 px-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg ${
                          summary.remainingMonthOvertime > 0
                            ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                        title="Heures supplémentaires payées après déduction de la récupération pour quota normal"
                      >
                        {summary.remainingMonthOvertime > 0 ? `+${summary.remainingMonthOvertime}h HS nettes` : '0h00 HS nette'}
                      </span>
                      <span
                        className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                          summary.remainingNightHours > 0
                            ? 'bg-indigo-400 text-indigo-950 font-black shadow-xs'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                        title="Heures de nuit payées après déduction éventuelle"
                      >
                        <Moon className="w-3 h-3 text-indigo-950" />
                        {summary.remainingNightHours > 0 ? `${summary.remainingNightHours}h Nuit` : '0h00 Nuit'}
                      </span>
                    </div>

                    {/* Détail clair si une déduction d'heures sup a été opérée pour le quota normal */}
                    {summary.deductedFromMonthOvertime > 0 && (
                      <div className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-700/50 p-1.5 rounded-lg leading-tight mt-0.5">
                        <div className="flex justify-between">
                          <span>HS faites :</span>
                          <span className="font-mono font-bold">+{summary.initialMonthOvertime}h</span>
                        </div>
                        <div className="flex justify-between text-rose-300">
                          <span>Transférées pour quota :</span>
                          <span className="font-mono font-bold">-{summary.deductedFromMonthOvertime}h</span>
                        </div>
                        <div className="flex justify-between text-emerald-300 pt-0.5 border-t border-amber-700/40 font-bold">
                          <span>Reste payé :</span>
                          <span className="font-mono">+{summary.remainingMonthOvertime}h</span>
                        </div>
                      </div>
                    )}

                    {summary.nightHoursDeductedForDeficit > 0 && (
                      <div className="text-[10px] text-indigo-300 bg-indigo-950/40 border border-indigo-700/50 p-1.5 rounded-lg leading-tight mt-0.5">
                        <div className="flex justify-between">
                          <span>Nuit faites :</span>
                          <span className="font-mono font-bold">{summary.initialNightHours}h</span>
                        </div>
                        <div className="flex justify-between text-rose-300">
                          <span>Transférées pour quota :</span>
                          <span className="font-mono font-bold">-{summary.nightHoursDeductedForDeficit}h</span>
                        </div>
                        <div className="flex justify-between text-indigo-200 pt-0.5 border-t border-indigo-700/40 font-bold">
                          <span>Reste payé :</span>
                          <span className="font-mono">{summary.remainingNightHours}h</span>
                        </div>
                      </div>
                    )}
                  </div>
                </td>

                {/* Absences */}
                <td className="py-3 px-3 text-xs text-slate-300">
                  {summary.creditedAbsenceHours > 0 ? (
                    <span className="font-semibold text-indigo-300">
                      +{formatHours(summary.creditedAbsenceHours)} créditées
                    </span>
                  ) : (
                    <span className="text-slate-500">Aucune</span>
                  )}
                </td>

                {/* Observations */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {summary.totalDeductedForDeficit > 0 ? (
                      <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Quota normal 100% garanti ({summary.realizedHours}h)
                      </span>
                    ) : summary.realizedHours >= summary.requiredHours ? (
                      <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Quota contractuel atteint ({summary.realizedHours}h)
                      </span>
                    ) : (
                      <span className="text-xs text-rose-400 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                        Sous-service restant : -{summary.remainingDeficitHours}h
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SYNTHÈSE MENSUELLE DE PAIE (PIED DE PAGE - Bento Pitch Slate-900 Module) */}
      <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        {/* Decorative background circle */}
        <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-white/5 rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Synthèse Mensuelle de Paie
              </h3>
              <span className="text-xs font-bold text-indigo-400 bg-indigo-500/20 px-2.5 py-1 rounded-md uppercase tracking-wider border border-indigo-500/30">
                Pied de page
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Récapitulatif certifié pour le cabinet comptable et le service des ressources humaines
            </p>
          </div>

          {/* Export Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => exportIndividualTimesheetToExcel(timesheet, currentUser)}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-sm"
              title="Télécharger le classeur Excel formaté"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={() => exportTimesheetToPDF(timesheet, currentUser)}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors border border-slate-700 cursor-pointer shadow-sm"
              title="Télécharger l'attestation PDF émargée au format A4 Paysage"
            >
              <FileText className="w-4 h-4 text-rose-400" />
              <span>Attestation PDF (A4 Paysage)</span>
            </button>

            {submissionError && (
              <div className="w-full p-3.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-2xl text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <span className="font-semibold">{submissionError}</span>
                </div>
                <button
                  onClick={() => setSubmissionError('')}
                  className="text-rose-500 hover:text-rose-800 p-1 cursor-pointer shrink-0"
                  title="Fermer l'alerte"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {!isLocked && (
              <>
                <button
                  onClick={handleSubmit}
                  className="flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-lg shadow-indigo-600/25"
                >
                  <Send className="w-4 h-4" />
                  <span>Soumettre pour validation</span>
                </button>

                <button
                  onClick={handleDirectValidate}
                  className="flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-lg shadow-emerald-600/25"
                  title="Valider directement cette feuille d'heures"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Valider la fiche</span>
                </button>
              </>
            )}

            {isLocked && (
              <div className="flex items-center gap-2">
                {timesheet.status === 'submitted' && (
                  <button
                    onClick={handleDirectValidate}
                    className="flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-lg shadow-emerald-600/25"
                    title="Valider la feuille d'heures soumise"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Valider la fiche</span>
                  </button>
                )}

                <button
                  onClick={handleReopenDraft}
                  className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-all cursor-pointer shadow-sm"
                  title="Rouvrir la feuille en brouillon en cas d'erreur de saisie ou de validation"
                >
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  <span>Rouvrir en brouillon</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 6 Bento Tiles - Synthèse mensuelle claire avec Heures de Nuit Faites, Heures Sup et Rôle de Compensation */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 py-6 border-b border-slate-800">
          {/* Tuile 1 : Horaires Normaux Réalisés */}
          {(() => {
            const isEqual = summary.realizedHours === summary.requiredHours;
            const isUnder = summary.realizedHours < summary.requiredHours;
            const colorClass = isEqual
              ? 'text-emerald-400'
              : isUnder
              ? 'text-rose-400'
              : 'text-yellow-400';
            const badgeClass = isEqual
              ? 'text-emerald-400 bg-emerald-500/20'
              : isUnder
              ? 'text-rose-400 bg-rose-500/20'
              : 'text-yellow-400 bg-yellow-500/20';

            return (
              <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    1. Réalisé Normal
                  </span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${badgeClass}`}>
                    {isEqual
                      ? '100% Requis'
                      : isUnder
                      ? `-${Math.round((summary.requiredHours - summary.realizedHours) * 100) / 100}h manque`
                      : `+${Math.round((summary.realizedHours - summary.requiredHours) * 100) / 100}h suppl.`}
                  </span>
                </div>
                <div className={`text-xl sm:text-2xl font-bold font-mono mt-1 ${colorClass}`}>
                  {summary.realizedHours}h
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {summary.totalDeductedForDeficit > 0 ? (
                    <>
                      <span className="text-amber-300 font-medium">
                        {summary.rawRealizedHours}h brutes + {summary.totalDeductedForDeficit}h comp.
                      </span>
                      <span className="block text-emerald-400 text-[9px] mt-0.5">
                        sur {summary.requiredHours}h requises (100% garanti)
                      </span>
                    </>
                  ) : (
                    <>
                      {summary.workedHours}h trav. + {summary.creditedAbsenceHours}h congés
                      <span className="block text-slate-500 text-[9px] mt-0.5">
                        sur {summary.requiredHours}h requises
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Tuile 2 : Heures de Nuit Faites (21h-06h) */}
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                <Moon className="w-3 h-3 text-indigo-400" />
                2. Nuit Faites
              </span>
              <span className="text-[9px] font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">
                Taux Nuit
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-indigo-300 mt-1">
              {summary.remainingNightHours}h
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {summary.nightHoursDeductedForDeficit > 0 ? (
                <span className="text-amber-300 font-medium">
                  {summary.initialNightHours}h faites - {summary.nightHoursDeductedForDeficit}h quota
                </span>
              ) : (
                <span className="text-indigo-200/90">
                  {summary.initialNightHours > 0 ? `${summary.remainingNightHours}h payées taux nuit` : '0h effectuée'}
                </span>
              )}
              <span className="block text-slate-500 text-[9px] mt-0.5">
                Plage 21h00 - 06h00
              </span>
            </div>
          </div>

          {/* Tuile 3 : Heures Sup Nettes (Mois) */}
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-amber-400" />
                3. HS Nettes Mois
              </span>
              <span className="text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded">
                Taux HS
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-amber-400 mt-1">
              +{summary.remainingMonthOvertime}h
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {summary.deductedFromMonthOvertime > 0 ? (
                <span className="text-amber-300 font-medium">
                  +{summary.initialMonthOvertime}h faites - {summary.deductedFromMonthOvertime}h quota
                </span>
              ) : (
                <span className="text-amber-200/90">
                  +{summary.remainingMonthOvertime}h payées taux HS
                </span>
              )}
              <span className="block text-slate-500 text-[9px] mt-0.5">
                Après compensation des heures manquantes
              </span>
            </div>
          </div>

          {/* Tuile 4 : Report Antérieur M-1 */}
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                4. Report M-1
              </span>
              <span className="text-[9px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                Antérieur
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-400 mt-1">
              +{summary.initialCarryoverM1}h
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {summary.deductedFromM1 > 0 ? (
                <span className="text-rose-300 font-medium">
                  -{summary.deductedFromM1}h compense &bull; +{summary.remainingCarryoverM1}h restantes
                </span>
              ) : (
                <span className="text-emerald-200/90">
                  +{summary.remainingCarryoverM1}h en réserve
                </span>
              )}
              <span className="block text-slate-500 text-[9px] mt-0.5">
                Reliquat certifié M-1
              </span>
            </div>
          </div>

          {/* Tuile 5 : Total Compensé du Sous-Service */}
          <div className="bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                5. Compensation
              </span>
              {summary.totalDeductedForDeficit > 0 ? (
                <span className="text-[9px] font-bold text-amber-300 bg-amber-500/30 px-1.5 py-0.5 rounded">
                  Actif
                </span>
              ) : (
                <span className="text-[9px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                  0h Manque
                </span>
              )}
            </div>
            <div className={`text-xl sm:text-2xl font-extrabold font-mono mt-1 ${
              summary.totalDeductedForDeficit > 0 ? 'text-amber-300' : 'text-slate-300'
            }`}>
              {summary.totalDeductedForDeficit > 0 ? `-${summary.totalDeductedForDeficit}h` : '0h00'}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {summary.totalDeductedForDeficit > 0 ? (
                <span>
                  {summary.overtimeDeductedForDeficit}h HS{summary.nightHoursDeductedForDeficit > 0 ? ` + ${summary.nightHoursDeductedForDeficit}h nuit` : ''} injectées
                </span>
              ) : (
                <span>Aucun sous-service</span>
              )}
              <span className="block text-slate-500 text-[9px] mt-0.5">
                Comble le contrat
              </span>
            </div>
          </div>

          {/* Tuile 6 : Solde Net & Réserve Finale */}
          <div className="bg-indigo-600/30 p-4 rounded-2xl border border-indigo-500/40 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">
                6. Reste à Payer
              </span>
              <span className="text-[9px] font-bold text-indigo-200 bg-indigo-500/30 px-1.5 py-0.5 rounded">
                Net Final
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold font-mono text-indigo-300 mt-1">
              +{summary.totalCumulativeOvertime}h HS
            </div>
            <div className="text-[10px] text-indigo-200/90 mt-1">
              <span>+ {summary.remainingNightHours}h de nuit restantes</span>
              <span className="block text-indigo-300 font-bold text-[10px] mt-0.5">
                Solde net global : {summary.netBalance >= 0 ? `+${summary.netBalance}h` : `${summary.netBalance}h`}
              </span>
            </div>
          </div>
        </div>

        {/* PANNEAU DE RÉCONCILIATION & TRAÇABILITÉ DES HEURES : FAITES vs COMPENSENT vs PAYÉES */}
        <div className="relative z-10 py-6 border-b border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Traçabilité des Heures : Ce qui est Fait, ce qui Compense, ce qui est Payé
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Ventilation détaillée et règles de compensation selon l'ordre légal de priorité
              </p>
            </div>

            {/* Badge de statut du mois */}
            <div>
              {summary.deficitHours > 0 ? (
                summary.remainingDeficitHours === 0 ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    Sous-service comblé ({summary.totalDeductedForDeficit}h compensées)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    Déficit résiduel non comblé (-{summary.remainingDeficitHours}h)
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Contrat 100% honoré (Aucune compensation nécessaire)
                </span>
              )}
            </div>
          </div>

          {/* Tableau de réconciliation des flux */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 w-44">Catégorie d'heures</th>
                  <th className="py-3 px-3 w-36">Heures Faites (Brut)</th>
                  <th className="py-3 px-4">Rôle de Compensation (si déficit)</th>
                  <th className="py-3 px-3 w-40">Rémunéré / Restant (Net)</th>
                  <th className="py-3 px-3 w-36">Taux Applicable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-mono">
                {/* Ligne 1 : Horaires Normaux */}
                <tr className="hover:bg-slate-900/40 transition-colors font-sans">
                  <td className="py-3 px-4">
                    <div className="font-bold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>1. Horaires Normaux</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block font-normal">
                      Temps de base contractuel
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div
                      className={`font-mono font-bold text-sm ${
                        summary.rawRealizedHours === summary.requiredHours
                          ? 'text-emerald-400'
                          : summary.rawRealizedHours < summary.requiredHours
                          ? 'text-rose-400'
                          : 'text-yellow-400'
                      }`}
                    >
                      {summary.rawRealizedHours}h
                    </div>
                    <span className="text-[10px] text-slate-400 block font-normal">
                      {summary.workedHours}h trav. + {summary.creditedAbsenceHours}h congés
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {summary.totalDeductedForDeficit > 0 ? (
                      <div className="text-amber-300 text-xs font-normal">
                        <strong className="font-semibold text-white">Reçoit +{summary.totalDeductedForDeficit}h</strong> pour combler le manque initial de {summary.deficitHours}h
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          ({summary.overtimeDeductedForDeficit}h prélevées sur HS + {summary.nightHoursDeductedForDeficit}h sur Nuit)
                        </span>
                      </div>
                    ) : (
                      <div className="text-emerald-400 text-xs font-normal">
                        <span>Contrat atteint ({summary.rawRealizedHours}h &ge; {summary.requiredHours}h requises).</span>
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          Aucun apport compensatoire nécessaire.
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div
                      className={`font-mono font-extrabold text-sm ${
                        summary.realizedHours === summary.requiredHours
                          ? 'text-emerald-400'
                          : summary.realizedHours < summary.requiredHours
                          ? 'text-rose-400'
                          : 'text-yellow-400'
                      }`}
                    >
                      {summary.realizedHours}h
                    </div>
                    <span className="text-[10px] text-slate-400 block font-normal">
                      sur {summary.requiredHours}h contrat
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[10px] font-bold border border-slate-700 font-mono">
                      Taux Normal (100%)
                    </span>
                  </td>
                </tr>

                {/* Ligne 2 : Heures Supplémentaires Classiques */}
                <tr className="hover:bg-slate-900/40 transition-colors font-sans">
                  <td className="py-3 px-4">
                    <div className="font-bold text-amber-400 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>2. Heures Sup. (HS)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block font-normal">
                      Dépassements quotidiens + M-1
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-mono font-bold text-amber-400 text-sm">
                      +{summary.initialTotalOvertime}h
                    </div>
                    <span className="text-[10px] text-slate-400 block font-normal">
                      +{summary.initialMonthOvertime}h mois &bull; +{summary.initialCarryoverM1}h M-1
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {summary.overtimeDeductedForDeficit > 0 ? (
                      <div className="text-amber-300 text-xs font-normal">
                        <strong className="font-semibold text-rose-300">Compense : -{summary.overtimeDeductedForDeficit}h</strong> déduites en priorité 1 pour sécuriser le salaire de base
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          (-{summary.deductedFromM1}h report M-1 &bull; -{summary.deductedFromMonthOvertime}h HS mois)
                        </span>
                      </div>
                    ) : (
                      <div className="text-slate-300 text-xs font-normal">
                        <strong className="text-emerald-400">0h décomptée :</strong> Réserve de HS 100% préservée
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          Aucun sous-service à combler.
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-mono font-extrabold text-amber-400 text-sm">
                      +{summary.totalCumulativeOvertime}h
                    </div>
                    <span className="text-[10px] text-slate-400 block font-normal">
                      +{summary.remainingMonthOvertime}h mois &bull; +{summary.remainingCarryoverM1}h M-1
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/30 font-mono">
                      Taux Majoré HS
                    </span>
                  </td>
                </tr>

                {/* Ligne 3 : Heures de Nuit (21h - 06h) */}
                <tr className="hover:bg-slate-900/40 transition-colors font-sans bg-indigo-950/20">
                  <td className="py-3 px-4">
                    <div className="font-bold text-indigo-300 flex items-center gap-2">
                      <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>3. Heures de Nuit</span>
                    </div>
                    <span className="text-[10px] text-indigo-200/70 block font-normal">
                      Pointages entre 21h00 et 06h00
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-mono font-bold text-indigo-300 text-sm">
                      {summary.initialNightHours}h
                    </div>
                    <span className="text-[10px] text-indigo-200/70 block font-normal">
                      {summary.initialNightHours > 0 ? 'Heures de nuit faites' : 'Aucune heure de nuit'}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {summary.nightHoursDeductedForDeficit > 0 ? (
                      <div className="text-amber-300 text-xs font-normal">
                        <strong className="font-semibold text-rose-300">Compense : -{summary.nightHoursDeductedForDeficit}h</strong> déduites en priorité 2
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          Les heures sup ayant été insuffisantes, la nuit a comblé le reliquat du sous-service.
                        </span>
                      </div>
                    ) : (
                      <div className="text-slate-300 text-xs font-normal">
                        <strong className="text-emerald-400">0h décomptée :</strong> {summary.initialNightHours > 0 ? 'Toutes les heures de nuit faites sont préservées' : 'Pas de compensation par la nuit'}
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          {summary.overtimeDeductedForDeficit > 0
                            ? 'La réserve de HS a suffi à combler le déficit.'
                            : 'Aucun manque d\'heures à combler.'}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-mono font-extrabold text-indigo-300 text-sm">
                      {summary.remainingNightHours}h
                    </div>
                    <span className="text-[10px] text-indigo-200/70 block font-normal">
                      {summary.remainingNightHours > 0 ? 'Reste à payer fin de mois' : '0h à payer'}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30 font-mono">
                      Taux Spécifique Nuit
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Bandeau narratif du flux de compensation */}
          {summary.totalDeductedForDeficit > 0 ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200">
              <div className="font-bold text-amber-300 flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Mécanisme de compensation appliqué à votre feuille ce mois :</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-amber-500/20">
                  <span className="text-slate-400 block">1. Déficit initial :</span>
                  <strong className="text-rose-400 text-sm font-mono">-{summary.deficitHours}h</strong>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {summary.rawRealizedHours}h faites / {summary.requiredHours}h
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-amber-500/20">
                  <span className="text-slate-400 block">2. Prélèvement HS :</span>
                  <strong className="text-amber-300 text-sm font-mono">-{summary.overtimeDeductedForDeficit}h</strong>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    (-{summary.deductedFromM1}h M-1, -{summary.deductedFromMonthOvertime}h mois)
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-amber-500/20">
                  <span className="text-slate-400 block">3. Prélèvement Nuit :</span>
                  <strong className="text-indigo-300 text-sm font-mono">
                    {summary.nightHoursDeductedForDeficit > 0 ? `-${summary.nightHoursDeductedForDeficit}h` : '0h (HS suff.)'}
                  </strong>
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    {summary.nightHoursDeductedForDeficit > 0 ? 'Utilisée car HS épuisées' : 'Heures de nuit intactes'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-emerald-500/30">
                  <span className="text-slate-400 block">4. Contrat finalisé :</span>
                  <strong className="text-emerald-400 text-sm font-mono">{summary.realizedHours}h</strong>
                  <span className="block text-[10px] text-emerald-300/80 mt-0.5">
                    Salaire de base 100% sécurisé
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3.5 text-xs text-emerald-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>Contrat 100% honoré :</strong> Aucune compensation n'a été nécessaire ({summary.rawRealizedHours}h faites pour {summary.requiredHours}h requises).
                  Vos <strong>+{summary.initialMonthOvertime}h d'heures sup</strong> et vos <strong>{summary.initialNightHours}h d'heures de nuit faites</strong> sont intégralement conservées et rémunérées avec leurs majorations de paie respectives.
                </span>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 font-mono font-bold text-[11px] shrink-0">
                0h compensée
              </span>
            </div>
          )}
        </div>

        {/* Ventilation des Congés & Absences */}
        <div className="relative z-10 pt-5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-semibold text-slate-400">Congés & Absences :</span>
            <span className="px-3 py-1 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700">
              CP : <strong className="text-white">{summary.absenceCounts.cpDays}j</strong>
            </span>
            <span className="px-3 py-1 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700">
              Maladie : <strong className="text-white">{summary.absenceCounts.sickDays}j</strong>
            </span>
            <span className="px-3 py-1 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700">
              Sans solde : <strong className="text-white">{summary.absenceCounts.unpaidDays}j</strong>
            </span>
            <span className="px-3 py-1 rounded-xl bg-slate-800/80 text-slate-300 border border-slate-700">
              Récupérations :{' '}
              <strong className="text-white">{summary.absenceCounts.recoveryDays}j</strong>
            </span>
            {summary.absenceCounts.unjustifiedTotalDays > 0 && (
              <span className="px-3 py-1 rounded-xl bg-rose-950/60 text-rose-300 border border-rose-800">
                Non trav. / Injustifié : <strong className="text-white">{summary.absenceCounts.unjustifiedTotalDays}j</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-indigo-300 bg-indigo-950/60 px-3.5 py-1.5 rounded-xl border border-indigo-800">
            <Moon className="w-4 h-4 text-indigo-400" />
            <span>
              Total Heures de Nuit Faites : <strong className="text-white font-mono">{summary.initialNightHours}h</strong>
              {summary.nightHoursDeductedForDeficit > 0 ? (
                <span className="ml-2 text-amber-300 font-semibold text-[11px]">
                  (Compense : -{summary.nightHoursDeductedForDeficit}h &bull; Reste payé taux nuit : {summary.remainingNightHours}h)
                </span>
              ) : (
                <span className="ml-2 text-emerald-300 font-semibold text-[11px]">
                  (100% payées au taux de nuit : {summary.remainingNightHours}h)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Modal Dialog de confirmation de soumission pour validation */}
      {submissionSuccessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900">
                Feuille transmise pour validation !
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Votre relevé d'heures du mois de{' '}
                <strong className="text-slate-900 font-semibold">{formatMonthName(timesheet.period)}</strong>{' '}
                a bien été soumis avec succès.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Nouveau statut :</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px] uppercase tracking-wide border border-amber-300">
                  En attente de validation
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Panneau de validation :</span>
                <span className="font-semibold text-emerald-700">Désormais visible pour le manager</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Date et heure :</span>
                <span className="font-mono text-slate-700">
                  {new Date().toLocaleDateString('fr-FR')} à {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 leading-normal">
                Vos pointages sont verrouillés pour garantir l'intégrité des calculs. Si vous devez modifier une ligne, cliquez sur <strong className="text-slate-700">« Rouvrir en brouillon »</strong>.
              </div>
            </div>

            <div className="pt-1">
              <button
                onClick={() => setSubmissionSuccessModalOpen(false)}
                className="w-full py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer"
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog : Création d'un complément a posteriori */}
      {createSupplementModalOpen && (
        <div
          id="modal-create-supplement"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full border border-slate-200 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-200 flex items-center justify-center shrink-0">
                  <FilePlus2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">
                    Créer un complément a posteriori
                  </h3>
                  <p className="text-xs text-slate-500 font-medium capitalize">
                    Période concernée : {formatMonthName(selectedPeriod)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCreateSupplementModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200/80 text-xs text-indigo-950 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Respect de l'historique et conformité</span>
              </div>
              <p className="text-indigo-900/90 leading-relaxed text-[11px]">
                La feuille initiale étant déjà validée et certifiée, elle est conservée intacte. Ce complément permet de déclarer des heures supplémentaires a posteriori ou de rectifier un pointage sans altérer l’audit trail.
              </p>
              <div className="text-[11px] text-slate-600 bg-white/90 p-2.5 rounded-xl border border-indigo-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Ce complément fera l'objet d'une nouvelle validation managériale avant régularisation en paie.</span>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="supplement-reason" className="block text-xs font-bold text-slate-800">
                Motif justifiant le complément d'heures <span className="text-rose-600">*</span> :
              </label>
              <textarea
                id="supplement-reason"
                rows={3}
                value={supplementReasonInput}
                onChange={(e) => {
                  setSupplementReasonInput(e.target.value);
                  if (supplementReasonError) setSupplementReasonError('');
                }}
                placeholder="Ex: Oubli de pointage d'heures sup le 15 suite à intervention d'astreinte urgente..."
                className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 placeholder-slate-400 resize-none transition-all"
              />
              {supplementReasonError && (
                <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{supplementReasonError}</span>
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreateSupplementModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                id="btn-confirm-create-supplement"
                onClick={handleCreateSupplement}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
              >
                <FilePlus2 className="w-4 h-4" />
                <span>Créer et modifier les heures</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog : Suppression du brouillon de complément */}
      {deleteSupplementModalOpen && (
        <div
          id="modal-delete-supplement"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-slate-200 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-extrabold text-slate-900">
                Supprimer ce brouillon de complément ?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Êtes-vous certain de vouloir abandonner ce complément a posteriori ? Toutes les modifications non soumises seront définitivement effacées et vous reviendrez à la feuille initiale validée.
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => setDeleteSupplementModalOpen(false)}
                className="w-1/2 py-2.5 px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Conserver
              </button>
              <button
                type="button"
                id="btn-confirm-delete-supplement"
                onClick={handleDeleteDraftSupplement}
                className="w-1/2 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action / Validation Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 max-w-md p-4 rounded-2xl shadow-xl flex items-start gap-3 border animate-in fade-in slide-in-from-top-4 duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-900/20'
              : toast.type === 'error'
              ? 'bg-rose-600 text-white border-rose-500 shadow-rose-900/20'
              : 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-900/20'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-white shrink-0 mt-0.5" />
          ) : (
            <Send className="w-5 h-5 text-white shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <strong className="block text-sm font-bold">{toast.message}</strong>
            {toast.details && (
              <p className="text-white/90 mt-0.5">
                {toast.details}
              </p>
            )}
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-white/70 hover:text-white cursor-pointer p-0.5 transition-colors"
            title="Fermer la notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
