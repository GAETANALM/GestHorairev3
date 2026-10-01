import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckSquare,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Search,
  Filter,
  Eye,
  ShieldCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  ArrowRight,
  TrendingUp,
  RotateCcw,
  X,
  Moon,
  Check,
} from 'lucide-react';
import { Timesheet, UserProfile } from '../types';
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
  WeekChunk,
} from '../utils/timeCalculations';
import { exportIndividualTimesheetToExcel } from '../utils/excelExport';
import { exportTimesheetToPDF } from '../utils/pdfExport';

interface ValidationPanelProps {
  currentValidator: UserProfile;
  timesheets: Timesheet[];
  users: UserProfile[];
  onUpdateTimesheet: (updated: Timesheet) => void;
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  availablePeriods: string[];
}

export function ValidationPanel({
  currentValidator,
  timesheets,
  users,
  onUpdateTimesheet,
  selectedPeriod,
  onPeriodChange,
  availablePeriods,
}: ValidationPanelProps) {
  const [selectedSheetForInspection, setSelectedSheetForInspection] = useState<Timesheet | null>(
    null
  );
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [sheetToReject, setSheetToReject] = useState<Timesheet | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'info'; message: string; details?: string } | null>(null);
  const [rejectionError, setRejectionError] = useState('');
  const [deferOvertimeInModal, setDeferOvertimeInModal] = useState<boolean>(false);
  const [quickValidationSheet, setQuickValidationSheet] = useState<Timesheet | null>(null);
  const [deferOvertimeInQuickModal, setDeferOvertimeInQuickModal] = useState<boolean>(false);

  // Sync deferOvertimeInModal when selected sheet changes
  useEffect(() => {
    if (selectedSheetForInspection) {
      setDeferOvertimeInModal(Boolean(selectedSheetForInspection.deferOvertimeToNextMonth));
    }
  }, [selectedSheetForInspection?.id]);

  // Auto-dismiss toast after 4.5s
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Filter sheets for selected period : strictly submitted/validated/rejected sheets.
  // A draft timesheet must NEVER appear in the validation panel until submitted for validation.
  const periodSheets = useMemo(() => {
    return timesheets.filter((ts) => ts.period === selectedPeriod && ts.status !== 'draft');
  }, [timesheets, selectedPeriod]);

  // KPI calculations
  const kpis = useMemo(() => {
    const pendingSheets = periodSheets.filter((ts) => ts.status === 'submitted');
    const validatedSheets = periodSheets.filter((ts) => ts.status === 'validated');
    const rejectedSheets = periodSheets.filter((ts) => ts.status === 'rejected');

    let totalOvertimeToApprove = 0;
    pendingSheets.forEach((ts) => {
      ts.days.forEach((d) => {
        totalOvertimeToApprove += d.overtimeHours || 0;
      });
      // also include carryover
      totalOvertimeToApprove += ts.carryoverM1 || 0;
    });

    return {
      pendingCount: pendingSheets.length,
      validatedCount: validatedSheets.length,
      rejectedCount: rejectedSheets.length,
      totalOvertimeToApprove: Math.round(totalOvertimeToApprove * 100) / 100,
    };
  }, [periodSheets]);

  // Filtered list
  const filteredSheets = useMemo(() => {
    return periodSheets.filter((ts) => {
      const matchesSearch =
        ts.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ts.userDepartment.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = filterStatus === 'all' || ts.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [periodSheets, searchQuery, filterStatus]);

  // Handle validation with electronic signature, timestamp & optional overtime deferral to next month
  const handleValidate = (sheet: Timesheet, deferOvertime: boolean = false) => {
    const user = users.find((u) => u.id === sheet.userId);
    const contract = user?.contract || {
      weeklyHours: 35,
      title: 'Contrat',
      department: sheet.userDepartment,
      defaultSchedule: [],
    };
    const summary = calculatePayrollSummary(sheet, contract);

    const remainingOvertime = summary.totalCumulativeOvertime;
    const carryoverAmount = deferOvertime ? remainingOvertime : 0;
    const paidOvertime = deferOvertime ? 0 : remainingOvertime;

    const signature = `Certifié conforme par ${currentValidator.firstName} ${currentValidator.lastName} (${currentValidator.contract.title}) le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;

    const updated: Timesheet = {
      ...sheet,
      status: 'validated',
      validatedAt: new Date().toISOString(),
      validatedBy: currentValidator.id,
      validatorName: `${currentValidator.firstName} ${currentValidator.lastName}`,
      signature,
      deferOvertimeToNextMonth: deferOvertime,
      carryoverToNextMonth: carryoverAmount,
      paidOvertimeHours: paidOvertime,
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updated);
    if (selectedSheetForInspection?.id === sheet.id) {
      setSelectedSheetForInspection(updated);
    }

    // Auto-propagate carryover to M+1 if M+1 timesheet already exists in draft
    const nextPeriod = getNextPeriod(sheet.period);
    const nextSheet = timesheets.find((ts) => ts.userId === sheet.userId && ts.period === nextPeriod);
    if (nextSheet && nextSheet.status === 'draft') {
      const updatedNext: Timesheet = {
        ...nextSheet,
        carryoverM1: carryoverAmount,
        previousTimesheetId: updated.id,
        updatedAt: new Date().toISOString(),
      };
      onUpdateTimesheet(updatedNext);
    }

    setToast({
      type: 'success',
      message: `Fiche d'heures de ${sheet.userName} validée avec succès !`,
      details: deferOvertime
        ? `Heures sup non payées et reportées sur le mois suivant (+${formatHours(carryoverAmount)}).`
        : `Heures sup rémunérées sur le bulletin de ce mois (+${formatHours(paidOvertime)}).`,
    });
  };

  // Reopen timesheet in draft mode if error was made during validation or submission
  const handleReopenDraft = (sheet: Timesheet) => {
    const updated: Timesheet = {
      ...sheet,
      status: 'draft',
      validatedAt: undefined,
      validatedBy: undefined,
      validatorName: undefined,
      signature: undefined,
      rejectionReason: undefined,
      submittedAt: undefined,
      deferOvertimeToNextMonth: undefined,
      carryoverToNextMonth: undefined,
      paidOvertimeHours: undefined,
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updated);
    if (selectedSheetForInspection?.id === sheet.id) {
      setSelectedSheetForInspection(null);
    }

    // Also reset M+1 carryover if M+1 was in draft
    const nextPeriod = getNextPeriod(sheet.period);
    const nextSheet = timesheets.find((ts) => ts.userId === sheet.userId && ts.period === nextPeriod);
    if (nextSheet && nextSheet.status === 'draft') {
      const updatedNext: Timesheet = {
        ...nextSheet,
        carryoverM1: 0,
        updatedAt: new Date().toISOString(),
      };
      onUpdateTimesheet(updatedNext);
    }

    setToast({
      type: 'info',
      message: `Fiche d'heures de ${sheet.userName} réouverte en brouillon`,
      details: 'La fiche est renvoyée au collaborateur et retirée de la validation tant qu\'elle n\'est pas resoumise.',
    });
  };

  // Open rejection modal
  const handleOpenRejection = (sheet: Timesheet) => {
    setSheetToReject(sheet);
    setRejectionReasonInput('');
    setRejectionError('');
    setRejectionModalOpen(true);
  };

  // Confirm rejection
  const handleConfirmRejection = () => {
    if (!sheetToReject) return;
    if (!rejectionReasonInput.trim()) {
      setRejectionError('Veuillez renseigner un motif explicatif pour permettre la correction.');
      return;
    }

    const updated: Timesheet = {
      ...sheetToReject,
      status: 'rejected',
      rejectionReason: rejectionReasonInput.trim(),
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updated);
    if (selectedSheetForInspection?.id === sheetToReject.id) {
      setSelectedSheetForInspection(updated);
    }
    setRejectionModalOpen(false);
    setSheetToReject(null);
    setRejectionError('');

    setToast({
      type: 'info',
      message: `Fiche d'heures de ${sheetToReject.userName} rejetée`,
      details: 'Le collaborateur est invité à corriger sa feuille selon le motif indiqué.',
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
      {/* Header and Controls */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Panneau de Validation Managériale</h2>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 uppercase tracking-wider">
              {currentValidator.firstName} {currentValidator.lastName}
            </span>
            {isFuturePeriod && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                <span>Anticipation M+{periodMonthOffset}</span>
              </span>
            )}
            {selectedPeriod === currentPeriod && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Mois en cours
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Examen approfondi des feuilles d'heures, signature numérique et validation de paie
          </p>
        </div>

        {/* Month selector with Chevrons */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs">
          <button
            type="button"
            disabled={!hasPrevPeriod}
            onClick={() => hasPrevPeriod && onPeriodChange(prevPeriod)}
            title={hasPrevPeriod ? `Mois précédent : ${formatMonthName(prevPeriod)}` : 'Aucun mois antérieur'}
            className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="font-semibold text-slate-500 px-1">Période :</span>
          <select
            value={selectedPeriod}
            onChange={(e) => onPeriodChange(e.target.value)}
            className="font-semibold bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-xs"
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
            onClick={() => hasNextPeriod && onPeriodChange(nextPeriod)}
            title={hasNextPeriod ? `Mois suivant (Anticipation) : ${formatMonthName(nextPeriod)}` : 'Anticipation limitée aux 3 prochains mois'}
            className="p-1.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Anticipation Banner if viewing future month */}
      {isFuturePeriod && (
        <div className="p-5 rounded-3xl bg-indigo-50/80 border border-indigo-200 text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center font-bold text-xs shadow-md shadow-indigo-200 shrink-0">
              <span className="text-[10px] uppercase font-semibold tracking-wider text-indigo-200">Mois</span>
              <span className="text-sm font-extrabold leading-none">+{periodMonthOffset}</span>
            </div>
            <div>
              <div className="font-bold text-sm text-indigo-950 flex items-center gap-2">
                <span>Période Prévisionnelle : {formatMonthName(selectedPeriod)}</span>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-wide">
                  Anticipation M+{periodMonthOffset}
                </span>
              </div>
              <p className="text-xs text-indigo-800 mt-0.5">
                Consultation et suivi des prévisions d'heures et des congés (CP, RTT) posés à l'avance par votre équipe.
              </p>
            </div>
          </div>

          <button
            onClick={() => onPeriodChange(currentPeriod)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100/70 transition-colors shadow-xs cursor-pointer shrink-0 self-start sm:self-center"
            title="Revenir au mois en cours"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Mois en cours</span>
          </button>
        </div>
      )}

      {/* 3 KPI Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Feuilles en attente (White Bento Card) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md inline-block">
              En attente
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-mono tracking-tight mt-2">
              {kpis.pendingCount}
            </div>
            <div className="text-xs text-slate-500 mt-1">À examiner et valider</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Feuilles validées (Indigo Bento Card) */}
        <div className="bg-indigo-600 text-white rounded-3xl p-6 shadow-md shadow-indigo-200/50 relative overflow-hidden flex items-center justify-between">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full pointer-events-none" />
          <div className="relative z-10">
            <div className="text-xs font-bold uppercase tracking-wide text-indigo-100 bg-white/15 px-2.5 py-1 rounded-md inline-block">
              Validées
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-white font-mono tracking-tight mt-2">
              {kpis.validatedCount}
            </div>
            <div className="text-xs text-indigo-200 mt-1">Certifiées conformes</div>
          </div>
          <div className="relative z-10 w-12 h-12 rounded-2xl bg-white/15 text-white flex items-center justify-center font-bold">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Heures Sup. à approuver (Slate-900 Bento Card) */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-md relative overflow-hidden flex items-center justify-between">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full pointer-events-none" />
          <div className="relative z-10">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-300 bg-slate-800 px-2.5 py-1 rounded-md inline-block">
              Heures Sup. à valider
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 font-mono tracking-tight mt-2">
              +{kpis.totalOvertimeToApprove}h00
            </div>
            <div className="text-xs text-slate-400 mt-1">Sur les feuilles soumises</div>
          </div>
          <div className="relative z-10 w-12 h-12 rounded-2xl bg-slate-800 text-indigo-400 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full sm:w-80 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher collaborateur ou département..."
            className="w-full bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <span className="font-semibold text-slate-500">Filtrer par statut :</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none"
          >
            <option value="all">Toutes les feuilles soumises ({periodSheets.length})</option>
            <option value="submitted">En attente ({kpis.pendingCount})</option>
            <option value="validated">Validées ({kpis.validatedCount})</option>
            <option value="rejected">Rejetées ({kpis.rejectedCount})</option>
          </select>
        </div>
      </div>

      {/* Timesheets List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200">
          <h3 className="font-bold text-slate-900 text-base">
            Feuilles d'heures du mois de {formatMonthName(selectedPeriod)}
          </h3>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Cliquez sur « Examiner » pour contrôler les pointages journaliers, justifier les dépassements ou signer
          </p>
        </div>

        {filteredSheets.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <CheckSquare className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">
              Aucune feuille d'heures soumise pour le mois de {formatMonthName(selectedPeriod)}
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Les feuilles de temps restent privées en brouillon côté collaborateur tant qu\'elles ne sont pas soumises. Dès qu\'un collaborateur clique sur « Soumettre pour validation », sa feuille apparaîtra ici prête pour examen et signature électronique.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredSheets.map((ts) => {
              const user = users.find((u) => u.id === ts.userId);
              const contract = user?.contract || {
                weeklyHours: 35,
                title: 'Contrat',
                department: ts.userDepartment,
                defaultSchedule: [],
              };
              const sum = calculatePayrollSummary(ts, contract);

              return (
                <div
                  key={ts.id}
                  className="p-5 sm:p-6 hover:bg-slate-50/80 transition-colors flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                >
                  {/* Collaborator info */}
                  <div className="flex items-center gap-3.5 min-w-64">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
                      {ts.userName.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900 flex flex-wrap items-center gap-2">
                        <span>{ts.userName}</span>
                        {ts.isSupplement && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-900 border border-purple-300">
                            Complément #{ts.supplementNumber || 1}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            ts.status === 'validated'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : ts.status === 'submitted'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200 animate-pulse'
                              : ts.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {ts.status === 'validated'
                            ? 'Validé'
                            : ts.status === 'submitted'
                            ? 'En attente'
                            : ts.status === 'rejected'
                            ? 'Rejeté'
                            : 'Brouillon'}
                        </span>
                      </div>
                      {ts.isSupplement && ts.supplementReason && (
                        <p className="text-[11px] text-purple-900 bg-purple-50/80 px-2 py-0.5 rounded-md border border-purple-200 mt-1 inline-block">
                          <strong className="text-purple-950">Motif du complément :</strong> « {ts.supplementReason} »
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-0.5">
                        {ts.userDepartment} • {contract.weeklyHours}h/sem ({contract.title})
                      </p>
                    </div>
                  </div>

                  {/* Hours summary chips */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs w-full lg:w-auto">
                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Réalisé / Requis</span>
                      <strong
                        className={`font-mono ${
                          sum.rawRealizedHours === sum.requiredHours
                            ? 'text-emerald-700'
                            : sum.rawRealizedHours < sum.requiredHours
                            ? 'text-rose-700'
                            : 'text-amber-600'
                        }`}
                      >
                        {sum.realizedHours}h
                      </strong>
                      <span className="text-[10px] text-slate-400 ml-1">/ {sum.requiredHours}h</span>
                    </div>

                    <div className="bg-amber-50/70 p-2.5 rounded-2xl border border-amber-200">
                      <span className="text-[10px] text-amber-700 block">HS Mois (Taux HS)</span>
                      <strong className="font-mono text-amber-900">+{sum.remainingMonthOvertime}h</strong>
                      {sum.carryoverM1 > 0 && (
                        <span className="text-[10px] text-emerald-700 ml-1 font-semibold">(M-1: +{sum.remainingCarryoverM1}h)</span>
                      )}
                    </div>

                    <div className="bg-indigo-50/70 p-2.5 rounded-2xl border border-indigo-200">
                      <span className="text-[10px] text-indigo-700 block">Nuit (Taux Nuit)</span>
                      <strong className="font-mono text-indigo-900 inline-flex items-center gap-1">
                        <Moon className="w-3 h-3 text-indigo-500" />
                        {sum.nightHours}h
                      </strong>
                    </div>

                    <div className="bg-purple-50/70 p-2.5 rounded-2xl border border-purple-200">
                      <span className="text-[10px] text-purple-700 block">Cumul Toutes HS (HS+Nuit)</span>
                      <strong className="font-mono text-purple-900">
                        +{sum.totalAllOvertimeCombined}h
                      </strong>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
                    <button
                      onClick={() => setSelectedSheetForInspection(ts)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-600" />
                      <span>Examiner jour par jour</span>
                    </button>

                    {ts.status === 'submitted' && (
                      <>
                        <button
                          onClick={() => {
                            if (sum.totalCumulativeOvertime > 0) {
                              setQuickValidationSheet(ts);
                              setDeferOvertimeInQuickModal(false);
                            } else {
                              handleValidate(ts, false);
                            }
                          }}
                          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-sm"
                          title="Valider avec signature électronique et choix du report d'heures"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Valider</span>
                        </button>

                        <button
                          onClick={() => handleOpenRejection(ts)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rejeter</span>
                        </button>

                        <button
                          onClick={() => handleReopenDraft(ts)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors cursor-pointer shadow-xs"
                          title="Rouvrir en brouillon pour corriger la saisie"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span>Rouvrir en brouillon</span>
                        </button>
                      </>
                    )}



                    {ts.status === 'rejected' && (
                      <button
                        onClick={() => handleReopenDraft(ts)}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors cursor-pointer shadow-xs"
                        title="Remettre en brouillon pour permettre la resoumission"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>Remettre en brouillon</span>
                      </button>
                    )}

                    {ts.status === 'validated' && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[11px] text-emerald-700 font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Signé le {ts.validatedAt ? new Date(ts.validatedAt).toLocaleDateString('fr-FR') : ''}</span>
                        </div>
                        {ts.deferOvertimeToNextMonth ? (
                          <div className="text-[11px] text-amber-900 font-semibold px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Report M+1 (+{formatHours(ts.carryoverToNextMonth || sum.totalCumulativeOvertime)})</span>
                          </div>
                        ) : (
                          sum.totalCumulativeOvertime > 0 && (
                            <div className="text-[11px] text-emerald-900 font-semibold px-2.5 py-1.5 rounded-xl bg-emerald-100/60 border border-emerald-200 flex items-center gap-1">
                              <span>Payées (+{formatHours(ts.paidOvertimeHours || sum.totalCumulativeOvertime)})</span>
                            </div>
                          )
                        )}
                        <button
                          onClick={() => handleReopenDraft(ts)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors cursor-pointer shadow-xs"
                          title="Rouvrir la feuille d'heures en brouillon en cas d'erreur de validation"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span>Rouvrir en brouillon</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL : DAY-BY-DAY INSPECTION (Inspection détaillée jour par jour) */}
      {selectedSheetForInspection && (() => {
        const inspUser = users.find((u) => u.id === selectedSheetForInspection.userId);
        const inspSummary = inspUser ? calculatePayrollSummary(selectedSheetForInspection, inspUser.contract) : null;
        const weeks = groupDaysIntoWeeks(selectedSheetForInspection.days);

        // Helper to compute weekly metrics for the inspection view
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
                    unjustified: 0,
                    other: 0,
                  };

                  week.days.forEach((day) => {
                    workedHours += day.actualWorkedHours || 0;
                    const night = day.nightHours || 0;
                    nightHours += night;
                    const ot = day.overtimeHours || 0;
                    overtimeHours += ot;

                    if (ot > 0 && (!day.overtimeReason || !day.overtimeReason.trim())) {
                      missingOvertimeReasonCount++;
                    }
                    if (night > 0 && (!day.nightHoursReason || !day.nightHoursReason.trim())) {
                      missingNightReasonCount++;
                    }

                    creditedAbsenceHours += day.absenceCreditedHours || 0;

                    if (day.absenceType !== 'none') {
                      const durationVal = day.absenceDuration === 'full' ? 1 : 0.5;
                      absenceCounts[day.absenceType] = (absenceCounts[day.absenceType] || 0) + durationVal;

                      if (
                        (day.absenceType === 'other' || day.absenceType === 'unjustified') &&
                        (!day.absenceReason || !day.absenceReason.trim())
                      ) {
                        missingAbsenceReasonCount++;
                      }
                    }

                    if (inspUser?.contract?.defaultSchedule) {
                      const schedule = inspUser.contract.defaultSchedule.find(
                        (s) => s.dayOfWeek === day.dayOfWeek
                      );
                      if (schedule && schedule.isWorked && !day.isHoliday) {
                        requiredHours += schedule.standardHours;
                        workedDaysCount++;
                      }
                    } else if (day.dayOfWeek <= 5 && !day.isHoliday) {
                      requiredHours += 7;
                      workedDaysCount++;
                    }
                  });

                  const totalMissingReasonCount =
                    missingOvertimeReasonCount + missingNightReasonCount + missingAbsenceReasonCount;

                  const absencesSummary: string[] = [];
                  if (absenceCounts.cp > 0) absencesSummary.push(`${absenceCounts.cp}j CP`);
                  if (absenceCounts.recovery > 0) absencesSummary.push(`${absenceCounts.recovery}j Récup.`);
                  if (absenceCounts.sick > 0) absencesSummary.push(`${absenceCounts.sick}j Maladie`);
                  if (absenceCounts.unpaid > 0) absencesSummary.push(`${absenceCounts.unpaid}j Sans solde`);
                  if (absenceCounts.unjustified > 0) absencesSummary.push(`${absenceCounts.unjustified}j Injustifiée`);
                  if (absenceCounts.other > 0) absencesSummary.push(`${absenceCounts.other}j Autre`);

                  const totalEffectiveHours = Math.round((workedHours + creditedAbsenceHours) * 100) / 100;
                  const balanceHours = Math.round((totalEffectiveHours - requiredHours) * 100) / 100;

                  // Weekly compensation logic:
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

                  const remainingOvertimeHours = Math.round((overtimeHours - overtimeDeductedForDeficit) * 100) / 100;
                  const remainingNightHours = Math.round((nightHours - nightDeductedForDeficit) * 100) / 100;

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

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Modal Header */}
              <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-bold">
                      Inspection détaillée : {selectedSheetForInspection.userName}
                    </h3>
                    {selectedSheetForInspection.isSupplement && (
                      <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-purple-500/30 text-purple-200 border border-purple-400/40 uppercase tracking-wider">
                        Complément #{selectedSheetForInspection.supplementNumber || 1}
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                      {formatMonthName(selectedSheetForInspection.period)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Vérification des pointages réels, dépassements justifiés et justificatifs d'absence
                  </p>
                </div>

                <button
                  onClick={() => setSelectedSheetForInspection(null)}
                  className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body: Global summary + Days table with weekly reports */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs">

                {/* Supplement Banner inside Inspection Modal */}
                {selectedSheetForInspection.isSupplement && (
                  <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl text-purple-950 space-y-2.5 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-purple-950">
                        <FileText className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>Complément d'heures a posteriori #{selectedSheetForInspection.supplementNumber || 1}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-purple-600 text-white">
                        Avenant de rectification
                      </span>
                    </div>
                    <div className="text-xs text-purple-900 bg-white/90 p-2.5 rounded-xl border border-purple-100">
                      <strong>Motif justifiant le complément :</strong> « {selectedSheetForInspection.supplementReason || 'Ajustement a posteriori'} »
                    </div>
                    {selectedSheetForInspection.baseDaysSnapshot && (
                      <div className="text-[11px] text-purple-900 flex flex-wrap items-center gap-3 pt-0.5 font-medium">
                        <span>Feuille certifiée initiale : <strong className="font-mono text-slate-800">{selectedSheetForInspection.baseDaysSnapshot.reduce((acc, d) => acc + (d.actualWorkedHours || 0), 0)}h00</strong></span>
                        <span>&bull; Nouveau total : <strong className="font-mono text-purple-950">{inspSummary ? inspSummary.rawRealizedHours : 0}h00</strong></span>
                        <span>
                          &bull; Régularisation nette :{' '}
                          <strong className="font-mono text-purple-950">
                            {(() => {
                              const baseH = selectedSheetForInspection.baseDaysSnapshot.reduce((acc, d) => acc + (d.actualWorkedHours || 0), 0);
                              const newH = inspSummary ? inspSummary.rawRealizedHours : 0;
                              const diff = Math.round((newH - baseH) * 100) / 100;
                              return diff >= 0 ? `+${diff}h00` : `${diff}h00`;
                            })()}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Status Banner inside Inspection Modal */}
                    {selectedSheetForInspection.status === 'validated' && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                        <div className="flex items-center gap-2.5">
                          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                          <div>
                            <strong className="font-bold text-xs text-emerald-950 block">
                              Feuille d'heures validée et certifiée conforme
                            </strong>
                            <span className="text-[11px] text-emerald-800">
                              {selectedSheetForInspection.signature || `Validée le ${selectedSheetForInspection.validatedAt ? new Date(selectedSheetForInspection.validatedAt).toLocaleDateString('fr-FR') : ''}`}
                            </span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white font-bold text-[10px] uppercase tracking-wider self-start sm:self-auto">
                          Certifié Conforme
                        </span>
                      </div>
                    )}

                    {/* Warning banner if missing justifications exist */}
                    {(() => {
                      let missingOvertimeCount = 0;
                      let missingNightCount = 0;
                      let missingAbsenceCount = 0;
                      selectedSheetForInspection.days.forEach((d) => {
                        if (d.overtimeHours > 0 && (!d.overtimeReason || !d.overtimeReason.trim())) missingOvertimeCount++;
                        if (d.nightHours > 0 && (!d.nightHoursReason || !d.nightHoursReason.trim())) missingNightCount++;
                        if ((d.absenceType === 'other' || d.absenceType === 'unjustified') && (!d.absenceReason || !d.absenceReason.trim())) missingAbsenceCount++;
                      });
                      const totalMissing = missingOvertimeCount + missingNightCount + missingAbsenceCount;
                      if (totalMissing === 0) return null;
                      return (
                        <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-2xl text-rose-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                          <div className="flex items-center gap-2.5">
                            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                            <div>
                              <strong className="font-bold text-xs text-rose-950 block">
                                Attention : {totalMissing} justification(s) obligatoire(s) manquante(s)
                              </strong>
                              <span className="text-[11px] text-rose-800">
                                {[
                                  missingOvertimeCount > 0 && `${missingOvertimeCount} heure(s) sup. sans motif`,
                                  missingNightCount > 0 && `${missingNightCount} créneau(x) de nuit sans motif`,
                                  missingAbsenceCount > 0 && `${missingAbsenceCount} absence(s) autre/injustifiée sans motif`,
                                ].filter(Boolean).join(' • ')}
                              </span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-bold text-[10px] uppercase tracking-wider self-start sm:self-auto">
                            Justification(s) requise(s)
                          </span>
                        </div>
                      );
                    })()}

                    {/* COMPTE RENDU GLOBAL DU MOIS (EN HAUT) */}
                    {inspSummary && (
                      <div className="bg-slate-50/90 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3.5">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              <Clock className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-extrabold text-slate-900 text-sm">
                                  Compte Rendu Global du Mois
                                </h4>
                                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-bold uppercase tracking-wider">
                                  {formatMonthName(selectedSheetForInspection.period)}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500">
                                {inspUser ? `${inspUser.contract.title} (${inspUser.contract.weeklyHours}h/semaine)` : 'Contrat standard'} &bull; Synthèse globale avant validation
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {inspSummary.netBalance > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs shadow-2xs">
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />
                                Excédent global : +{formatHours(inspSummary.netBalance)}
                              </span>
                            ) : inspSummary.netBalance < 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-100 text-rose-900 border border-rose-300 font-bold text-xs shadow-2xs">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-700" />
                                Sous-service net : -{formatHours(Math.abs(inspSummary.netBalance))}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                Mois équilibré
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 4 Indicateurs Clés du Mois (Ventilation des 5 types d'horaires & 3 taux de paie) */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Stat 1: 1. Horaires Normaux (Taux Normal) */}
                          {(() => {
                            const isRawEqual = inspSummary.rawRealizedHours === inspSummary.requiredHours;
                            const isRawUnder = inspSummary.rawRealizedHours < inspSummary.requiredHours;
                            const colorClass = isRawEqual
                              ? 'text-emerald-600'
                              : isRawUnder
                              ? 'text-rose-600'
                              : 'text-amber-500';

                            return (
                              <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
                                <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
                                  <span>1. Horaires Normaux (Taux Normal)</span>
                                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                </div>
                                <div className={`text-lg font-extrabold font-mono mt-1 ${colorClass}`}>
                                  {formatHours(inspSummary.realizedHours)}
                                  <span className="text-xs text-slate-400 font-normal ml-1">/ {formatHours(inspSummary.requiredHours)}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  <span className={`font-semibold ${colorClass}`}>
                                    {formatHours(inspSummary.rawRealizedHours)} brutes
                                  </span>{' '}
                                  ({formatHours(inspSummary.workedHours)} trav. + {formatHours(inspSummary.creditedAbsenceHours)} congés)
                                  {inspSummary.totalDeductedForDeficit > 0 && (
                                    <span className="block text-amber-700 font-semibold mt-0.5">
                                      +{formatHours(inspSummary.totalDeductedForDeficit)} compensées pour contrat
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Stat 2: 2. Heures Sup Classiques (Taux Majoré HS) */}
                          <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
                            <div className="text-[11px] font-semibold text-amber-800 flex items-center justify-between">
                              <span>2. Heures Sup Faites (Taux HS)</span>
                              <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                            </div>
                            <div className="text-lg font-extrabold text-amber-900 font-mono mt-1">
                              +{formatHours(inspSummary.initialMonthOvertime)} faites
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {inspSummary.deductedFromMonthOvertime > 0 ? (
                                <span className="text-amber-800 font-medium">
                                  -{formatHours(inspSummary.deductedFromMonthOvertime)} compense &bull; +{formatHours(inspSummary.remainingMonthOvertime)} payées
                                </span>
                              ) : (
                                <span>+{formatHours(inspSummary.remainingMonthOvertime)} payées taux HS</span>
                              )}
                              <div className="flex items-center justify-between text-slate-400 text-[10px] mt-0.5">
                                <span>Réserve nette : +{formatHours(inspSummary.totalCumulativeOvertime)}</span>
                                {inspSummary.remainingCarryoverM1 > 0 && (
                                  <span className="text-emerald-700 font-semibold">(M-1 : +{formatHours(inspSummary.remainingCarryoverM1)})</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Stat 3: 3. Heures de Nuit Faites (21h-06h) (Taux Spécifique Nuit) */}
                          <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
                            <div className="text-[11px] font-semibold text-indigo-800 flex items-center justify-between">
                              <span>3. Nuit Faites 21h-06h (Taux Nuit)</span>
                              <Moon className="w-3.5 h-3.5 text-indigo-500" />
                            </div>
                            <div className="text-lg font-extrabold text-indigo-900 font-mono mt-1">
                              {formatHours(inspSummary.initialNightHours)} faites
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {inspSummary.nightHoursDeductedForDeficit > 0 ? (
                                <span className="text-amber-800 font-medium">
                                  -{formatHours(inspSummary.nightHoursDeductedForDeficit)} compense &bull; {formatHours(inspSummary.remainingNightHours)} payées
                                </span>
                              ) : (
                                <span className="text-indigo-900 font-medium">
                                  {inspSummary.initialNightHours > 0
                                    ? `${formatHours(inspSummary.remainingNightHours)} payées taux nuit`
                                    : '0h effectuée'}
                                </span>
                              )}
                              <div className="flex items-center justify-between text-slate-400 text-[10px] mt-0.5">
                                <span>Plage 21h00 - 06h00</span>
                                <span className="font-bold text-purple-700" title="Cumul toutes HS (HS classiques + Nuit)">
                                  Cumul HS+Nuit : +{formatHours(inspSummary.totalAllOvertimeCombined)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Stat 4: 4 & 5. Absences Justifiées vs Non Travaillées */}
                          <div className="bg-white rounded-xl p-3 border border-slate-200/80 shadow-2xs">
                            <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
                              <span>4 & 5. Absences & Congés</span>
                              <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                                {inspSummary.absenceCounts.justifiedDays + inspSummary.absenceCounts.unjustifiedTotalDays} j
                              </span>
                            </div>
                            <div className="text-xs font-bold text-slate-800 mt-1.5 flex flex-col gap-0.5">
                              <span className="text-emerald-800">
                                Justifiées : {inspSummary.absenceCounts.justifiedDays}j (CP, Récup...)
                              </span>
                              {inspSummary.absenceCounts.unjustifiedTotalDays > 0 && (
                                <span className="text-rose-700 text-[11px]">
                                  Non trav. / Explication : {inspSummary.absenceCounts.unjustifiedTotalDays}j
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {inspSummary.creditedAbsenceHours > 0
                                ? `${formatHours(inspSummary.creditedAbsenceHours)} assimilées normales`
                                : 'Sans déduction'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Carryover info if exists */}
                    {selectedSheetForInspection.carryoverM1 > 0 && (
                      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-950 flex items-center justify-between">
                        <div>
                          <strong className="font-bold">Report M-1 certifié :</strong>{' '}
                          +{selectedSheetForInspection.carryoverM1}h00 reportées du mois précédent.
                        </div>
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                          Audit conforme
                        </span>
                      </div>
                    )}

                    {/* Automatic Overtime & Night Hours Compensation Alert & Audit Trail */}
                    {inspSummary && (inspSummary.overtimeDeductedForDeficit > 0 || inspSummary.nightHoursDeductedForDeficit > 0) && (
                      <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2.5">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="font-bold text-xs text-amber-900">
                              Traçabilité de la compensation automatique du sous-service
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-mono font-bold text-[10px]">
                              +{formatHours(inspSummary.totalDeductedForDeficit)} compensées
                            </span>
                          </div>
                          <span className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 font-mono font-bold text-amber-900 text-xs shrink-0">
                            Réalisé contractuel final : {formatHours(inspSummary.realizedHours)} / {formatHours(inspSummary.requiredHours)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
                          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                            <span className="text-slate-500 block">Déficit initial :</span>
                            <strong className="text-rose-700 text-sm font-mono">-{formatHours(inspSummary.deficitHours)}</strong>
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              {formatHours(inspSummary.rawRealizedHours)} brutes faites
                            </span>
                          </div>
                          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                            <span className="text-slate-500 block">Compensé par Report M-1 :</span>
                            <strong className="text-amber-800 text-sm font-mono">
                              {inspSummary.deductedFromM1 > 0 ? `-${formatHours(inspSummary.deductedFromM1)}` : '0h00'}
                            </strong>
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              Reste M-1 : +{formatHours(inspSummary.remainingCarryoverM1)}
                            </span>
                          </div>
                          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                            <span className="text-slate-500 block">Compensé par HS Mois :</span>
                            <strong className="text-amber-800 text-sm font-mono">
                              {inspSummary.deductedFromMonthOvertime > 0 ? `-${formatHours(inspSummary.deductedFromMonthOvertime)}` : '0h00'}
                            </strong>
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              Reste HS payées : +{formatHours(inspSummary.remainingMonthOvertime)}
                            </span>
                          </div>
                          <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200">
                            <span className="text-slate-500 block">Compensé par Nuit (21h-06h) :</span>
                            <strong className="text-indigo-800 text-sm font-mono">
                              {inspSummary.nightHoursDeductedForDeficit > 0 ? `-${formatHours(inspSummary.nightHoursDeductedForDeficit)}` : '0h00'}
                            </strong>
                            <span className="block text-[10px] text-slate-500 mt-0.5">
                              Reste Nuit payée : {formatHours(inspSummary.remainingNightHours)}
                            </span>
                          </div>
                        </div>

                        <p className="text-[11px] text-amber-900 leading-relaxed">
                          Le sous-service a été comblé selon l'ordre de priorité légal (Report M-1 &rarr; Heures Sup du mois &rarr; Heures de Nuit).
                          Le salaire de base contractuel est 100% garanti.
                          La réserve totale d'heures sup s'établit à <strong>+{formatHours(inspSummary.totalCumulativeOvertime)}</strong> et les heures de nuit rémunérées au taux spécifique s'établissent à <strong>{formatHours(inspSummary.remainingNightHours)}</strong>.
                        </p>
                      </div>
                    )}

                    {/* Table of inspected days grouped by week with weekly report row */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                            <th className="py-3 px-3.5 w-36">Date</th>
                            <th className="py-3 px-3 w-32">Matin</th>
                            <th className="py-3 px-3 w-32">Après-midi</th>
                            <th className="py-3 px-3 w-36 text-center">Travaillé</th>
                            <th className="py-3 px-3 w-48">Nuit / Heures Sup.</th>
                            <th className="py-3 px-3 w-40">Absence / Congé</th>
                            <th className="py-3 px-3.5">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {weeks.map((week) => {
                            const sum = computeWeekSummary(week);

                            return (
                              <React.Fragment key={`insp-week-${week.weekNumber}`}>
                                {/* Individual Day rows for this week */}
                                {week.days.map((day) => {
                                  const schedule = inspUser?.contract?.defaultSchedule?.find(
                                    (s) => s.dayOfWeek === day.dayOfWeek
                                  );
                                  const dayRequired = schedule?.isWorked && !day.isHoliday ? schedule.standardHours : (day.dayOfWeek <= 5 && !day.isHoliday ? 7 : 0);
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

                                  // Supplement comparison
                                  const baseDay =
                                    selectedSheetForInspection.isSupplement && selectedSheetForInspection.baseDaysSnapshot
                                      ? selectedSheetForInspection.baseDaysSnapshot.find((b) => b.date === day.date)
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
                                  const diffHours = baseDay
                                    ? Math.round(((day.actualWorkedHours || 0) - (baseDay.actualWorkedHours || 0)) * 100) / 100
                                    : 0;

                                  return (
                                  <tr
                                    key={day.date}
                                    className={
                                      isDayModifiedInSupplement
                                        ? 'bg-purple-50/70 hover:bg-purple-50/90'
                                        : day.isOffDay
                                        ? 'bg-slate-50 text-slate-400'
                                        : isSuperior
                                        ? 'bg-yellow-50/35 hover:bg-yellow-50/65'
                                        : isInferior
                                        ? 'bg-rose-50/30 hover:bg-rose-50/55'
                                        : day.overtimeHours > 0
                                        ? 'bg-amber-50/40'
                                        : day.absenceType !== 'none'
                                        ? 'bg-indigo-50/30'
                                        : 'hover:bg-slate-50/70 transition-colors'
                                    }
                                  >
                                    <td className="py-2.5 px-3.5 font-semibold text-slate-800">
                                      <div>{getFrenchDayName(day.dayOfWeek, true)} {day.date.slice(8)}</div>
                                      {isDayModifiedInSupplement && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-900 border border-purple-300 mt-0.5">
                                          Ajusté {diffHours !== 0 ? `(${diffHours > 0 ? '+' : ''}${diffHours}h)` : ''}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono">
                                      {day.absenceType !== 'none' && (day.absenceDuration === 'full' || day.absenceDuration === 'morning') ? (
                                        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 font-medium text-[11px]">
                                          {day.absenceType === 'cp' ? '🌴 CP Matin' : day.absenceType === 'sick' ? '🩺 Maladie' : day.absenceType === 'recovery' ? '⏳ Récup.' : 'Absence'}
                                        </span>
                                      ) : day.morningStart ? (
                                        `${day.morningStart} - ${day.morningEnd}`
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono">
                                      {day.absenceType !== 'none' && (day.absenceDuration === 'full' || day.absenceDuration === 'afternoon') ? (
                                        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 font-medium text-[11px]">
                                          {day.absenceType === 'cp' ? '🌴 CP A-Midi' : day.absenceType === 'sick' ? '🩺 Maladie' : day.absenceType === 'recovery' ? '⏳ Récup.' : 'Absence'}
                                        </span>
                                      ) : day.afternoonStart ? (
                                        `${day.afternoonStart} - ${day.afternoonEnd}`
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-center font-mono">
                                      {worked > 0 ? (
                                        <div className="flex flex-col items-center justify-center gap-1">
                                          <span
                                            className={`text-base sm:text-lg font-black font-mono tracking-tight leading-none px-2.5 py-1 rounded-xl border shadow-2xs ${
                                              !isSuperior && !isInferior && dayRequired > 0
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                                : isInferior
                                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                                : isSuperior
                                                ? 'bg-yellow-50 text-yellow-900 border-yellow-400'
                                                : 'bg-slate-100 text-slate-900 border-slate-300'
                                            }`}
                                          >
                                            {formatHours(worked)}
                                          </span>
                                          {credited > 0 && (
                                            <div className="text-[10px] text-indigo-700 font-bold bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-100">
                                              +{formatHours(credited)} congé
                                            </div>
                                          )}
                                          {isSuperior && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-100 text-yellow-950 border border-yellow-400 font-mono font-bold text-[10px] shadow-2xs"
                                              title={`+${formatHours(extraHours)} heure(s) en plus par rapport au temps contractuel (${formatHours(dayRequired)})`}
                                            >
                                              <TrendingUp className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                              +{formatHours(extraHours)}
                                            </span>
                                          )}
                                          {isInferior && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 font-mono font-bold text-[10px] shadow-2xs"
                                              title={`-${formatHours(missingHours)} heure(s) manquante(s) par rapport au temps contractuel (${formatHours(dayRequired)})`}
                                            >
                                              <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
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
                                        <div className="flex flex-col items-center justify-center gap-1">
                                          <span className="text-base sm:text-lg font-black text-indigo-700 font-mono tracking-tight leading-none px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 shadow-2xs">
                                            +{formatHours(credited)}
                                          </span>
                                          <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                                            Congé / Abs.
                                          </span>
                                          {isSuperior && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-yellow-100 text-yellow-950 border border-yellow-400 font-mono font-bold text-[10px] shadow-2xs"
                                            >
                                              <TrendingUp className="w-2.5 h-2.5 text-amber-700 shrink-0" />
                                              +{formatHours(extraHours)}
                                            </span>
                                          )}
                                          {isInferior && (
                                            <span
                                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 font-mono font-bold text-[10px] shadow-2xs"
                                            >
                                              <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
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
                                        <div className="flex flex-col items-center justify-center gap-1">
                                          <span className="text-base sm:text-lg font-black text-rose-600 font-mono tracking-tight leading-none px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 shadow-2xs">
                                            0h00
                                          </span>
                                          <span
                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 font-mono font-bold text-[10px] shadow-2xs"
                                          >
                                            <AlertCircle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                            -{formatHours(missingHours)}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="space-y-1.5">
                                        {day.nightHours > 0 && (
                                          <div className="flex flex-col gap-0.5">
                                            <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 inline-flex items-center gap-1 font-mono">
                                              <Moon className="w-3 h-3" />
                                              {formatHours(day.nightHours)} nuit
                                            </span>
                                            {day.nightHoursReason ? (
                                              <span className="text-[10px] text-indigo-950 italic">
                                                « {day.nightHoursReason} »
                                              </span>
                                            ) : (
                                              <span className="text-[10px] text-rose-600 font-bold inline-flex items-center gap-0.5">
                                                <AlertCircle className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                                                Justification nuit manquante
                                              </span>
                                            )}
                                          </div>
                                        )}
                                        {day.overtimeHours > 0 ? (
                                          <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-amber-800 font-mono text-xs">
                                              +{formatHours(day.overtimeHours)} HS
                                            </span>
                                            {day.overtimeReason ? (
                                              <div className="text-[10px] text-slate-700 italic mt-0.5">
                                                « {day.overtimeReason} »
                                              </div>
                                            ) : (
                                              <div className="text-[10px] text-rose-600 font-bold inline-flex items-center gap-0.5">
                                                <AlertCircle className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                                                Justification HS manquante
                                              </div>
                                            )}
                                          </div>
                                        ) : !day.nightHours ? (
                                          <span className="text-slate-300">-</span>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {day.absenceType !== 'none' ? (
                                        <div className="flex flex-col gap-0.5">
                                          <span
                                            className={`px-2 py-0.5 rounded-lg border font-semibold text-[11px] inline-block ${
                                              day.absenceType === 'other' || day.absenceType === 'unjustified'
                                                ? 'bg-rose-50 text-rose-900 border-rose-200'
                                                : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                            }`}
                                          >
                                            {day.absenceType === 'cp'
                                              ? 'CP (Justifiée)'
                                              : day.absenceType === 'recovery'
                                              ? 'Récupération (Justifiée)'
                                              : day.absenceType === 'sick'
                                              ? 'Maladie (Justifiée)'
                                              : day.absenceType === 'unpaid'
                                              ? 'Sans solde (Justifiée)'
                                              : day.absenceType === 'unjustified'
                                              ? 'Injustifiée (Non trav.)'
                                              : 'Autre (Non trav.)'}{' '}
                                            ({day.absenceDuration === 'full' ? '1j' : day.absenceDuration === 'morning' ? 'matin' : 'ap-midi'})
                                          </span>
                                          {(day.absenceType === 'other' || day.absenceType === 'unjustified') && (
                                            day.absenceReason ? (
                                              <span className="text-[10px] text-slate-700 italic">
                                                « {day.absenceReason} »
                                              </span>
                                            ) : (
                                              <span className="text-[10px] text-rose-600 font-bold inline-flex items-center gap-0.5">
                                                <AlertCircle className="w-2.5 h-2.5 text-rose-500 shrink-0" />
                                                Explication obligatoire manquante
                                              </span>
                                            )
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-slate-300">-</span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3.5 text-slate-500">{day.notes || '-'}</td>
                                  </tr>
                                );
                              })}

                                {/* COMPTE RENDU HEBDOMADAIRE (ENTRE CHAQUE SEMAINE) */}
                                <tr className="bg-slate-100/95 hover:bg-slate-200/70 border-t-2 border-b-2 border-slate-300 transition-colors font-medium">
                                  {/* Jour & Plages horaires fusionnées (3 colonnes) */}
                                  <td colSpan={3} className="py-3 px-3.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-xs tracking-wide shadow-2xs">
                                          <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                          Compte Rendu {week.label}
                                        </span>
                                        <span className="text-[11px] text-slate-500 font-medium">
                                          ({sum.workedDaysCount} j. ouvrés)
                                        </span>
                                      </div>
                                      <div className="text-right text-[11px] text-slate-500 font-medium">
                                        <span>Attendu contractuel : </span>
                                        <strong className="text-slate-800 font-mono font-bold">{formatHours(sum.requiredHours)}</strong>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Travaillé (Effectif vs Attendu avec compensation) */}
                                  <td className="py-3 px-3 text-center">
                                    {(() => {
                                      const isEqualRequired = sum.compensatedEffectiveHours === sum.requiredHours;
                                      const isUnder = sum.compensatedEffectiveHours < sum.requiredHours;
                                      const badgeColor = isEqualRequired
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : isUnder
                                        ? 'bg-rose-50 text-rose-800 border-rose-300'
                                        : 'bg-yellow-50 text-yellow-900 border-yellow-400';

                                      return (
                                        <div className="inline-flex flex-col items-center gap-1">
                                          <span
                                            className={`font-mono font-black text-base sm:text-lg px-3 py-1 rounded-xl shadow-2xs border leading-none ${badgeColor}`}
                                            title={
                                              sum.totalDeductedForDeficit > 0
                                                ? `${formatHours(sum.totalEffectiveHours)} brutes + ${formatHours(sum.totalDeductedForDeficit)} transférées des HS = ${formatHours(sum.compensatedEffectiveHours)} effectives`
                                                : "Total des heures travaillées effectives de la semaine"
                                            }
                                          >
                                            {formatHours(sum.compensatedEffectiveHours)}
                                          </span>
                                          {sum.totalDeductedForDeficit > 0 ? (
                                            <span className="text-[10px] text-amber-700 font-bold" title="Heures déduites des HS pour combler le quota">
                                              +{formatHours(sum.totalDeductedForDeficit)} comp. HS
                                            </span>
                                          ) : sum.creditedAbsenceHours > 0 ? (
                                            <span className="text-[11px] text-indigo-700 font-bold" title="Heures d'absences créditées">
                                              +{formatHours(sum.creditedAbsenceHours)} abs.
                                            </span>
                                          ) : null}
                                        </div>
                                      );
                                    })()}
                                  </td>

                                  {/* Nuit & Heures sup */}
                                  <td className="py-3 px-3">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        <span
                                          className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg ${
                                            sum.remainingOvertimeHours > 0
                                              ? 'bg-amber-100 text-amber-950 border border-amber-300'
                                              : sum.overtimeDeductedForDeficit > 0
                                              ? 'bg-slate-100 text-slate-700 border border-slate-300'
                                              : 'text-slate-500 bg-white border border-slate-200'
                                          }`}
                                          title={
                                            sum.overtimeDeductedForDeficit > 0
                                              ? `${formatHours(sum.overtimeHours)} HS faites - ${formatHours(sum.overtimeDeductedForDeficit)} récup/quota = ${formatHours(sum.remainingOvertimeHours)} HS restantes`
                                              : "Heures supplémentaires"
                                          }
                                        >
                                          {sum.remainingOvertimeHours > 0
                                            ? `+${formatHours(sum.remainingOvertimeHours)} HS`
                                            : sum.overtimeDeductedForDeficit > 0
                                            ? '0h00 HS nette'
                                            : '0h00 HS'}
                                        </span>
                                        <span
                                          className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${
                                            sum.remainingNightHours > 0
                                              ? 'text-indigo-700 bg-indigo-50 border border-indigo-200'
                                              : sum.nightDeductedForDeficit > 0
                                              ? 'text-slate-600 bg-slate-100 border border-slate-300'
                                              : 'text-slate-500 bg-white border border-slate-200'
                                          }`}
                                          title={
                                            sum.nightDeductedForDeficit > 0
                                              ? `${formatHours(sum.nightHours)} faites - ${formatHours(sum.nightDeductedForDeficit)} récup/quota = ${formatHours(sum.remainingNightHours)} nuit payée`
                                              : "Heures de nuit (21h-06h)"
                                          }
                                        >
                                          <Moon className="w-3 h-3 text-indigo-500" />
                                          {sum.remainingNightHours > 0
                                            ? `${formatHours(sum.remainingNightHours)} Nuit`
                                            : sum.nightDeductedForDeficit > 0
                                            ? '0h00 Nuit'
                                            : '0h00 Nuit'}
                                        </span>
                                      </div>

                                      {/* Détail du calcul en cas de déduction pour quota */}
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
                                          {sum.totalMissingReasonCount} justification(s) manquante(s)
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Absences / Congés */}
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

                                  {/* Notes / Écart de la semaine */}
                                  <td className="py-3 px-3.5">
                                    <div className="flex items-center justify-between gap-2">
                                      {sum.totalDeductedForDeficit > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-lg shadow-2xs">
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          Quota comblé (+{formatHours(sum.totalDeductedForDeficit)} HS)
                                        </span>
                                      ) : sum.balanceHours > 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg shadow-2xs">
                                          <TrendingUp className="w-3 h-3 text-amber-600" />
                                          Écart : +{formatHours(sum.balanceHours)}
                                        </span>
                                      ) : sum.balanceHours < 0 ? (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-900 bg-rose-50 border border-rose-300 px-2.5 py-1 rounded-lg shadow-2xs">
                                          <AlertCircle className="w-3 h-3 text-rose-600" />
                                          Sous-service : -{formatHours(Math.abs(sum.balanceHours))}
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-lg shadow-2xs">
                                          <Check className="w-3 h-3 text-emerald-600" />
                                          Équilibré ({formatHours(sum.requiredHours)})
                                        </span>
                                      )}

                                      <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                                        Effectif : {formatHours(sum.compensatedEffectiveHours)}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </tbody>

                        {/* Total général du mois dans l'inspection */}
                        {inspSummary && (
                          <tfoot className="bg-slate-900 text-slate-100 border-t-2 border-slate-700 font-medium">
                            <tr>
                              <td colSpan={3} className="py-3 px-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="px-3 py-1 rounded-xl bg-indigo-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-xs">
                                      Total du Mois
                                    </span>
                                    <span className="text-xs text-slate-300 font-medium">
                                      Synthèse globale {formatMonthName(selectedSheetForInspection.period)}
                                    </span>
                                  </div>
                                  <div className="text-right text-xs text-slate-400">
                                    Attendu contractuel : <strong className="text-white font-mono">{inspSummary.requiredHours}h</strong>
                                  </div>
                                </div>
                              </td>

                              {/* Travaillé validé */}
                              <td className="py-3 px-3 text-center">
                                <div className="inline-flex flex-col items-center gap-0.5">
                                  <span
                                    className={`font-mono font-black text-sm px-2.5 py-1 rounded-xl shadow-xs border ${
                                      inspSummary.realizedHours === inspSummary.requiredHours
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                        : inspSummary.realizedHours < inspSummary.requiredHours
                                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                        : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                                    }`}
                                  >
                                    {inspSummary.realizedHours}h
                                  </span>
                                  {inspSummary.totalDeductedForDeficit > 0 ? (
                                    <span className="text-[10px] text-amber-300 font-semibold">
                                      +{inspSummary.totalDeductedForDeficit}h comp.
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-slate-400 font-mono">
                                      sur {inspSummary.requiredHours}h
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Heures sup / nuit nettes */}
                              <td className="py-3 px-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg ${
                                        inspSummary.remainingMonthOvertime > 0
                                          ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                                      }`}
                                    >
                                      {inspSummary.remainingMonthOvertime > 0 ? `+${inspSummary.remainingMonthOvertime}h HS nettes` : '0h00 HS nette'}
                                    </span>
                                    <span
                                      className={`font-mono font-bold text-xs px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                                        inspSummary.remainingNightHours > 0
                                          ? 'bg-indigo-400 text-indigo-950 font-black shadow-xs'
                                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                                      }`}
                                    >
                                      <Moon className="w-3 h-3 text-indigo-950" />
                                      {inspSummary.remainingNightHours > 0 ? `${inspSummary.remainingNightHours}h Nuit` : '0h00 Nuit'}
                                    </span>
                                  </div>

                                  {inspSummary.deductedFromMonthOvertime > 0 && (
                                    <div className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-700/50 p-1.5 rounded-lg leading-tight mt-0.5">
                                      <div className="flex justify-between">
                                        <span>HS faites :</span>
                                        <span className="font-mono font-bold">+{inspSummary.initialMonthOvertime}h</span>
                                      </div>
                                      <div className="flex justify-between text-rose-300">
                                        <span>Transférées pour quota :</span>
                                        <span className="font-mono font-bold">-{inspSummary.deductedFromMonthOvertime}h</span>
                                      </div>
                                      <div className="flex justify-between text-emerald-300 pt-0.5 border-t border-amber-700/40 font-bold">
                                        <span>Reste payé :</span>
                                        <span className="font-mono">+{inspSummary.remainingMonthOvertime}h</span>
                                      </div>
                                    </div>
                                  )}

                                  {inspSummary.nightHoursDeductedForDeficit > 0 && (
                                    <div className="text-[10px] text-indigo-300 bg-indigo-950/40 border border-indigo-700/50 p-1.5 rounded-lg leading-tight mt-0.5">
                                      <div className="flex justify-between">
                                        <span>Nuit faites :</span>
                                        <span className="font-mono font-bold">{inspSummary.initialNightHours}h</span>
                                      </div>
                                      <div className="flex justify-between text-rose-300">
                                        <span>Transférées pour quota :</span>
                                        <span className="font-mono font-bold">-{inspSummary.nightHoursDeductedForDeficit}h</span>
                                      </div>
                                      <div className="flex justify-between text-indigo-200 pt-0.5 border-t border-indigo-700/40 font-bold">
                                        <span>Reste payé :</span>
                                        <span className="font-mono">{inspSummary.remainingNightHours}h</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </td>

                              {/* Absences */}
                              <td className="py-3 px-3 text-xs text-slate-300">
                                {inspSummary.creditedAbsenceHours > 0 ? (
                                  <span className="font-semibold text-indigo-300">
                                    +{formatHours(inspSummary.creditedAbsenceHours)} créditées
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Aucune</span>
                                )}
                              </td>

                              {/* Observations */}
                              <td className="py-3 px-3.5">
                                <div className="flex items-center gap-2">
                                  {inspSummary.totalDeductedForDeficit > 0 ? (
                                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      Quota normal 100% garanti ({inspSummary.realizedHours}h)
                                    </span>
                                  ) : inspSummary.realizedHours >= inspSummary.requiredHours ? (
                                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      Quota contractuel atteint ({inspSummary.realizedHours}h)
                                    </span>
                                  ) : (
                                    <span className="text-xs text-rose-400 font-bold flex items-center gap-1">
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                                      Sous-service restant : -{inspSummary.remainingDeficitHours}h
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
              </div>

            {/* Option Traitement Paie des Heures Sup. Restantes : Ne pas payer et garder pour le mois suivant */}
            {inspSummary && inspSummary.totalCumulativeOvertime > 0 && selectedSheetForInspection.status === 'submitted' && (
              <div className="px-6 py-4 bg-amber-50/95 border-t border-b border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-xs">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">
                        Heures supplémentaires restantes :
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-600 text-white font-mono font-bold text-xs">
                        +{formatHours(inspSummary.totalCumulativeOvertime)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 max-w-xl">
                      {deferOvertimeInModal
                        ? `✓ Report M+1 activé : ces +${formatHours(inspSummary.totalCumulativeOvertime)} seront conservées pour le mois suivant (${formatMonthName(getNextPeriod(selectedSheetForInspection.period))}) et ne seront pas rémunérées sur le bulletin de ce mois.`
                        : `Rémunération paie : ces +${formatHours(inspSummary.totalCumulativeOvertime)} seront payées sur le bulletin de salaire de ${formatMonthName(selectedSheetForInspection.period)}.`}
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-3 bg-white px-4 py-3 rounded-2xl border-2 border-amber-400 shadow-sm cursor-pointer select-none shrink-0 hover:bg-amber-100/50 transition-all">
                  <input
                    type="checkbox"
                    checked={deferOvertimeInModal}
                    onChange={(e) => setDeferOvertimeInModal(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                  />
                  <span className="font-bold text-xs text-amber-950">
                    Ne pas payer les heures sup restantes et les garder pour le mois suivant
                  </span>
                </label>
              </div>
            )}

            {/* Information si déjà validée */}
            {selectedSheetForInspection.status === 'validated' && (
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-700">Traitement paie des heures supplémentaires :</span>
                </div>
                {selectedSheetForInspection.deferOvertimeToNextMonth ? (
                  <span className="px-3 py-1 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                    Non payées &rarr; Reportées sur M+1 (+{formatHours(selectedSheetForInspection.carryoverToNextMonth || inspSummary?.totalCumulativeOvertime || 0)})
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    Rémunérées sur le bulletin de ce mois (+{formatHours(selectedSheetForInspection.paidOvertimeHours || inspSummary?.totalCumulativeOvertime || 0)})
                  </span>
                )}
              </div>
            )}

            {/* Modal Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const usr = users.find((u) => u.id === selectedSheetForInspection.userId);
                    if (usr) exportTimesheetToPDF(selectedSheetForInspection, usr);
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer shadow-xs"
                >
                  <FileText className="w-3.5 h-3.5 text-rose-500" />
                  <span>Attestation PDF</span>
                </button>

                <button
                  onClick={() => {
                    const usr = users.find((u) => u.id === selectedSheetForInspection.userId);
                    if (usr) exportIndividualTimesheetToExcel(selectedSheetForInspection, usr);
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Excel Paie</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedSheetForInspection.status === 'submitted' && (
                  <>
                    <button
                      onClick={() => handleOpenRejection(selectedSheetForInspection)}
                      className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200 transition-colors cursor-pointer"
                    >
                      Rejeter avec motif...
                    </button>

                    <button
                      onClick={() => {
                        handleValidate(selectedSheetForInspection, deferOvertimeInModal);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Signer et Valider</span>
                    </button>
                  </>
                )}



                {(selectedSheetForInspection.status === 'validated' || selectedSheetForInspection.status === 'submitted' || selectedSheetForInspection.status === 'rejected') && (
                  <button
                    onClick={() => handleReopenDraft(selectedSheetForInspection)}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-300 transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="Rouvrir en brouillon en cas d'erreur de saisie ou de validation"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-600" />
                    <span>Rouvrir en brouillon</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedSheetForInspection(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs cursor-pointer"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* QUICK VALIDATION MODAL (avec case à cocher pour reporter ou payer les heures sup) */}
      {quickValidationSheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Validation de la feuille d'heures
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {quickValidationSheet.userName} &bull; {formatMonthName(quickValidationSheet.period)}
                </p>
              </div>
            </div>

            {(() => {
              const u = users.find((usr) => usr.id === quickValidationSheet.userId);
              const c = u?.contract || { weeklyHours: 35, title: 'Contrat', department: quickValidationSheet.userDepartment, defaultSchedule: [] };
              const s = calculatePayrollSummary(quickValidationSheet, c);

              return (
                <div className="space-y-4 text-xs">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Temps réalisé normal (contractuel) :</span>
                      <strong className="font-mono text-slate-900">
                        {formatHours(s.realizedHours)} / {formatHours(s.requiredHours)}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Heures supplémentaires restantes :</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-600 text-white font-mono font-bold text-xs">
                        +{formatHours(s.totalCumulativeOvertime)}
                      </span>
                    </div>
                  </div>

                  {/* Case à cocher : Ne pas payer les heures sup restantes et les garder pour le mois suivant */}
                  {s.totalCumulativeOvertime > 0 && (
                    <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2.5">
                      <label className="flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={deferOvertimeInQuickModal}
                          onChange={(e) => setDeferOvertimeInQuickModal(e.target.checked)}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer mt-0.5 shrink-0"
                        />
                        <div>
                          <span className="font-bold text-xs text-amber-950 block">
                            Ne pas payer les heures sup restantes et les garder pour le mois suivant
                          </span>
                          <span className="text-[11px] text-slate-600 mt-1 block leading-relaxed">
                            {deferOvertimeInQuickModal
                              ? `✓ Les +${formatHours(s.totalCumulativeOvertime)} seront reportées sur la feuille de ${formatMonthName(getNextPeriod(quickValidationSheet.period))} (M+1) et ne seront pas rémunérées sur la paie de ce mois.`
                              : `Les +${formatHours(s.totalCumulativeOvertime)} seront réglées sur le bulletin de paie de ce mois (${formatMonthName(quickValidationSheet.period)}).`}
                          </span>
                        </div>
                      </label>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400">
                    En validant, vous apposez votre signature électronique horodatée en tant que responsable habilité.
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                onClick={() => setQuickValidationSheet(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  if (quickValidationSheet) {
                    handleValidate(quickValidationSheet, deferOvertimeInQuickModal);
                    setQuickValidationSheet(null);
                  }
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Signer et Valider</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL : REJECTION REASON (Rejet motivé avec commentaire explicatif) */}
      {rejectionModalOpen && sheetToReject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-7 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Rejeter la feuille d'heures
                </h3>
                <p className="text-xs text-slate-500">{sheetToReject.userName}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Veuillez saisir un motif précis justifiant le rejet (ex: heures supplémentaires non justifiées, erreur de pointage). Le collaborateur sera notifié pour corriger sa feuille.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Motif explicatif obligatoire
              </label>
              <textarea
                rows={4}
                value={rejectionReasonInput}
                onChange={(e) => {
                  setRejectionReasonInput(e.target.value);
                  if (rejectionError) setRejectionError('');
                }}
                placeholder="Exemple : Merci de préciser le motif du dépassement du 22 juin et de corriger l'après-midi du 18..."
                className={`w-full text-xs p-3 border rounded-2xl focus:outline-none focus:ring-2 text-slate-800 ${
                  rejectionError
                    ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                    : 'border-slate-200 focus:ring-rose-500'
                }`}
              />
              {rejectionError && (
                <p className="text-xs text-rose-600 font-semibold mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {rejectionError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRejectionModalOpen(false);
                  setRejectionError('');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmRejection}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                Confirmer le rejet
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
              : 'bg-slate-900 text-white border-slate-700 shadow-slate-900/30'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-white shrink-0 mt-0.5" />
          ) : (
            <RotateCcw className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <strong className="block text-sm font-bold">{toast.message}</strong>
            {toast.details && (
              <p className={toast.type === 'success' ? 'text-emerald-100 mt-0.5' : 'text-slate-300 mt-0.5'}>
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
