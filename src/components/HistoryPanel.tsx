import React, { useState, useMemo } from 'react';
import {
  Archive,
  Search,
  Filter,
  FileSpreadsheet,
  FileText,
  Calendar,
  Eye,
  CheckCircle2,
  Clock,
  XCircle,
  Download,
  ShieldCheck,
  ChevronRight,
  Layers,
  History,
  FilePlus2,
  FolderArchive,
  Loader2,
  CheckSquare,
} from 'lucide-react';
import { Timesheet, UserProfile } from '../types';
import {
  calculatePayrollSummary,
  formatHours,
  formatMonthName,
  formatPeriodLabel,
  getFrenchDayName,
} from '../utils/timeCalculations';
import {
  exportGroupedTimesheetsToExcel,
  exportIndividualTimesheetToExcel,
} from '../utils/excelExport';
import { exportTimesheetToPDF } from '../utils/pdfExport';
import { exportTimesheetsToZip } from '../utils/zipExport';

interface HistoryPanelProps {
  timesheets: Timesheet[];
  users: UserProfile[];
  currentUser: UserProfile;
}

export function HistoryPanel({ timesheets, users, currentUser }: HistoryPanelProps) {
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'complements' | 'old_versions'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectedSheet, setInspectedSheet] = useState<Timesheet | null>(null);

  // Selection state for bulk export
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(new Set());
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; stage: string } | null>(null);

  // Available periods in timesheets
  const allPeriods = useMemo(() => {
    const set = new Set<string>();
    timesheets.forEach((ts) => set.add(ts.period));
    return Array.from(set).sort().reverse();
  }, [timesheets]);

  // Helpers to categorize documents
  const isSupplementSheet = (ts: Timesheet) => Boolean(ts.isSupplement);
  const hasAssociatedSupplement = (ts: Timesheet) =>
    timesheets.some(
      (other) =>
        other.isSupplement &&
        (other.parentTimesheetId === ts.id ||
          (other.userId === ts.userId && other.period === ts.period))
    );

  // Counts for quick tabs
  const complementCount = useMemo(() => timesheets.filter(isSupplementSheet).length, [timesheets]);
  const oldVersionCount = useMemo(() => timesheets.filter((ts) => !isSupplementSheet(ts)).length, [timesheets]);

  // Filtered & Sorted sheets: COMPLÉMENTS FIRST (visible), then ANCIENNES VERSIONS
  const filteredTimesheets = useMemo(() => {
    return timesheets
      .filter((ts) => {
        const matchesUser = selectedUserFilter === 'all' || ts.userId === selectedUserFilter;
        const matchesStatus = selectedStatusFilter === 'all' || ts.status === selectedStatusFilter;
        const matchesPeriod = selectedPeriodFilter === 'all' || ts.period === selectedPeriodFilter;
        const matchesType =
          selectedTypeFilter === 'all' ||
          (selectedTypeFilter === 'complements' && isSupplementSheet(ts)) ||
          (selectedTypeFilter === 'old_versions' && !isSupplementSheet(ts));
        const matchesSearch =
          ts.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          ts.userDepartment.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (ts.supplementReason && ts.supplementReason.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchesUser && matchesStatus && matchesPeriod && matchesType && matchesSearch;
      })
      .sort((a, b) => {
        const aIsSupp = isSupplementSheet(a);
        const bIsSupp = isSupplementSheet(b);

        // 1. Compléments come FIRST in order
        if (aIsSupp && !bIsSupp) return -1;
        if (!aIsSupp && bIsSupp) return 1;

        // 2. If both are complements: sort by period desc, then supplementNumber desc, then updatedAt desc
        if (aIsSupp && bIsSupp) {
          if (a.period !== b.period) return b.period.localeCompare(a.period);
          const aNum = a.supplementNumber || 1;
          const bNum = b.supplementNumber || 1;
          if (aNum !== bNum) return bNum - aNum;
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        }

        // 3. If both are non-complements (anciennes versions):
        if (a.period !== b.period) return b.period.localeCompare(a.period);
        const aHasSupp = hasAssociatedSupplement(a);
        const bHasSupp = hasAssociatedSupplement(b);
        if (aHasSupp && !bHasSupp) return -1;
        if (!aHasSupp && bHasSupp) return 1;

        return (
          new Date(b.updatedAt || b.validatedAt || 0).getTime() -
          new Date(a.updatedAt || a.validatedAt || 0).getTime()
        );
      });
  }, [
    timesheets,
    selectedUserFilter,
    selectedStatusFilter,
    selectedPeriodFilter,
    selectedTypeFilter,
    searchQuery,
  ]);

  // Selection logic & helpers
  const isAllSelected = filteredTimesheets.length > 0 && filteredTimesheets.every((ts) => selectedSheetIds.has(ts.id));
  const isSomeSelected = filteredTimesheets.some((ts) => selectedSheetIds.has(ts.id));
  const selectedCount = selectedSheetIds.size;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      // Unselect all visible
      const next = new Set(selectedSheetIds);
      filteredTimesheets.forEach((ts) => next.delete(ts.id));
      setSelectedSheetIds(next);
    } else {
      // Select all visible
      const next = new Set(selectedSheetIds);
      filteredTimesheets.forEach((ts) => next.add(ts.id));
      setSelectedSheetIds(next);
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedSheetIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedSheetIds(next);
  };

  const clearSelection = () => {
    setSelectedSheetIds(new Set());
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedSheetIds);
    filteredTimesheets.forEach((ts) => next.add(ts.id));
    setSelectedSheetIds(next);
  };

  const selectComplementsOnly = () => {
    const next = new Set<string>();
    filteredTimesheets.filter(isSupplementSheet).forEach((ts) => next.add(ts.id));
    setSelectedSheetIds(next);
  };

  const handleBulkExcelExport = (onlySelected: boolean = false) => {
    const targetSheets = (onlySelected || selectedCount > 0)
      ? filteredTimesheets.filter((ts) => selectedSheetIds.has(ts.id))
      : filteredTimesheets;

    if (targetSheets.length === 0) return;

    exportGroupedTimesheetsToExcel(
      targetSheets,
      users,
      `Archives_Paie_${selectedPeriodFilter !== 'all' ? selectedPeriodFilter : 'Global'}${selectedCount > 0 ? `_${targetSheets.length}_fiches` : ''}`
    );
  };

  const handleExportZip = async (onlySelected: boolean = false) => {
    const targetSheets = (onlySelected || selectedCount > 0)
      ? filteredTimesheets.filter((ts) => selectedSheetIds.has(ts.id))
      : filteredTimesheets;

    if (targetSheets.length === 0) return;

    setIsExportingZip(true);
    setZipProgress({ current: 0, total: targetSheets.length, stage: 'Initialisation de l\'archive .ZIP...' });

    try {
      const periodLabel = selectedPeriodFilter !== 'all' ? selectedPeriodFilter : 'Archives_Globales';
      const archiveName = `Export_Groupé_${periodLabel}_${targetSheets.length}_fiches`;
      await exportTimesheetsToZip(targetSheets, users, {
        archiveName,
        includeExcel: true,
        includePDF: true,
        includeSummaryExcel: true,
        onProgress: (p) => setZipProgress(p),
      });
    } catch (err) {
      console.error('Erreur export ZIP:', err);
      alert('Une erreur est survenue lors de la création du fichier .zip.');
    } finally {
      setIsExportingZip(false);
      setZipProgress(null);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Historique & Archives Globales</h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {filteredTimesheets.length} relevé(s)
            </span>
            {selectedCount > 0 && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 animate-in fade-in">
                <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>{selectedCount} sélectionnée(s)</span>
              </span>
            )}
            {complementCount > 0 && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-600" />
                <span>{complementCount} complément(s) en tête</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Cochez les fiches souhaitées puis téléchargez l'archive compressée en .zip contenant tous les relevés Excel, attestations PDF et la synthèse.
          </p>
        </div>

        {/* Grouped Export Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            id="btn-bulk-export-zip"
            onClick={() => handleExportZip(selectedCount > 0)}
            disabled={filteredTimesheets.length === 0 || isExportingZip}
            className="flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-sm cursor-pointer"
            title="Télécharger les fiches sélectionnées dans un dossier compressé .zip (Excel + PDF + synthèse)"
          >
            {isExportingZip ? (
              <Loader2 className="w-4 h-4 animate-spin text-white" />
            ) : (
              <FolderArchive className="w-4 h-4 text-indigo-200" />
            )}
            <span>
              {isExportingZip
                ? 'Compression .ZIP...'
                : selectedCount > 0
                ? `Export Groupé .ZIP (${selectedCount})`
                : `Export Groupé .ZIP (${filteredTimesheets.length})`}
            </span>
          </button>

          <button
            id="btn-bulk-export-excel"
            onClick={() => handleBulkExcelExport(selectedCount > 0)}
            disabled={filteredTimesheets.length === 0 || isExportingZip}
            className="flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 transition-all cursor-pointer shadow-xs"
            title="Exporter uniquement le classeur de synthèse Excel récapitulatif"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Synthèse Excel</span>
          </button>
        </div>
      </div>

      {/* Contextual Action Banner when 1 or more fiches are selected */}
      {selectedCount > 0 && (
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-2xl p-4 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 border border-indigo-500/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center shrink-0">
              <FolderArchive className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wide text-white">
                  {selectedCount} fiche{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''}
                </span>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full border border-indigo-400/30">
                  Prêt pour l'archive ZIP
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Chaque fiche comprendra son relevé Excel (.xlsx) détaillé et son attestation PDF officielle signée.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <button
              id="btn-zip-download-selection"
              onClick={() => handleExportZip(true)}
              disabled={isExportingZip}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 text-xs font-bold px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-xs cursor-pointer"
            >
              {isExportingZip ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <FolderArchive className="w-4 h-4 text-emerald-200" />
              )}
              <span>Télécharger l'archive .ZIP ({selectedCount})</span>
            </button>

            <button
              id="btn-excel-selection"
              onClick={() => handleBulkExcelExport(true)}
              disabled={isExportingZip}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              title="Exporter uniquement le classeur Excel récapitulatif des fiches cochées"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Synthèse Excel</span>
            </button>

            <button
              id="btn-clear-selection"
              onClick={clearSelection}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-300 hover:text-rose-200 text-xs font-medium transition-colors cursor-pointer"
            >
              Désélectionner tout
            </button>
          </div>
        </div>
      )}

      {/* Quick Category Switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          id="btn-filter-all"
          onClick={() => setSelectedTypeFilter('all')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            selectedTypeFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Tous les relevés ({timesheets.length})
        </button>
        <button
          id="btn-filter-complements"
          onClick={() => setSelectedTypeFilter('complements')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            selectedTypeFilter === 'complements'
              ? 'bg-purple-700 text-white shadow-xs'
              : 'bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100'
          }`}
        >
          <Layers className="w-4 h-4 text-purple-600" />
          <span>Compléments visibles ({complementCount})</span>
        </button>
        <button
          id="btn-filter-oldversions"
          onClick={() => setSelectedTypeFilter('old_versions')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            selectedTypeFilter === 'old_versions'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <History className="w-4 h-4 text-amber-700" />
          <span>Anciennes versions ({oldVersionCount})</span>
        </button>
      </div>

      {/* Multi-criteria filter bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        {/* Search text */}
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, motif..."
            className="w-full bg-transparent focus:outline-none text-slate-800 placeholder:text-slate-400"
          />
        </div>

        {/* User filter */}
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
          <span className="text-slate-500 font-semibold whitespace-nowrap">Salarié :</span>
          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="w-full bg-transparent focus:outline-none text-slate-800 font-medium"
          >
            <option value="all">Tous les collaborateurs</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName}
              </option>
            ))}
          </select>
        </div>

        {/* Period filter */}
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
          <span className="text-slate-500 font-semibold whitespace-nowrap">Période :</span>
          <select
            value={selectedPeriodFilter}
            onChange={(e) => setSelectedPeriodFilter(e.target.value)}
            className="w-full bg-transparent focus:outline-none text-slate-800 font-medium"
          >
            <option value="all">Toutes les périodes</option>
            {allPeriods.map((p) => (
              <option key={p} value={p}>
                {formatPeriodLabel(p)}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
          <span className="text-slate-500 font-semibold whitespace-nowrap">Statut :</span>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="w-full bg-transparent focus:outline-none text-slate-800 font-medium"
          >
            <option value="all">Tous les statuts</option>
            <option value="validated">Validé</option>
            <option value="submitted">Soumis</option>
            <option value="draft">Brouillon</option>
            <option value="rejected">Rejeté</option>
          </select>
        </div>
      </div>

      {/* Archives Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-4 px-3 text-center w-12">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      id="checkbox-select-all-header"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !isAllSelected && isSomeSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer accent-indigo-600"
                      title={isAllSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    />
                  </div>
                </th>
                <th className="py-4 px-4">Collaborateur & Période</th>
                <th className="py-4 px-3">Type Document</th>
                <th className="py-4 px-3">Statut</th>
                <th className="py-4 px-3">Réalisé / Requis</th>
                <th className="py-4 px-3">HS Mois</th>
                <th className="py-4 px-3">Report M-1</th>
                <th className="py-4 px-3">Total HS</th>
                <th className="py-4 px-3">Congés / Abs.</th>
                <th className="py-4 px-3">Validation</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            {filteredTimesheets.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={11} className="py-16 text-center text-slate-400">
                    <Archive className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-600">Aucune feuille d'heures enregistrée dans l'historique</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      La base est vide pour vous permettre de tester le cycle de vie complet depuis 0 (saisie collaborateur, soumission, validation avec signature et archivage).
                    </p>
                  </td>
                </tr>
              </tbody>
            ) : (
              <tbody className="divide-y divide-slate-100">
                {filteredTimesheets.map((ts) => {
                  const user = users.find((u) => u.id === ts.userId);
                  const contract = user?.contract || {
                    weeklyHours: 35,
                    title: 'Contrat',
                    department: ts.userDepartment,
                    defaultSchedule: [],
                  };
                  const sum = calculatePayrollSummary(ts, contract);
                  const isSupp = isSupplementSheet(ts);
                  const isComplemented = hasAssociatedSupplement(ts);
                  const isSelected = selectedSheetIds.has(ts.id);

                  return (
                    <tr
                      key={ts.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/80 hover:bg-indigo-100/70 ring-1 ring-inset ring-indigo-300'
                          : isSupp
                          ? 'bg-purple-50/20 hover:bg-purple-50/50'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-3 text-center w-12">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            id={`checkbox-sheet-${ts.id}`}
                            checked={isSelected}
                            onChange={() => toggleSelectOne(ts.id)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer accent-indigo-600"
                            title="Sélectionner cette fiche pour l'export groupé"
                          />
                        </div>
                      </td>

                      {/* Collaborator & Period */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-xs">{ts.userName}</div>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {formatMonthName(ts.period)} • {ts.userDepartment}
                        </div>
                      </td>

                      {/* Type Document: Complément (marqué visible) ou Ancienne version (marqué ancienne version) */}
                      <td className="py-3.5 px-3">
                        {isSupp ? (
                          <div className="space-y-1">
                            <span
                              id={`badge-complement-${ts.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-black uppercase tracking-wide bg-purple-100 text-purple-950 border-2 border-purple-300 shadow-2xs"
                            >
                              <Layers className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                              <span>Complément visible {ts.supplementNumber ? `#${ts.supplementNumber}` : ''}</span>
                            </span>
                            {ts.supplementReason && (
                              <p
                                className="text-[10px] text-purple-900 bg-purple-50/90 px-2 py-0.5 rounded-md border border-purple-200/80 max-w-[210px] truncate"
                                title={ts.supplementReason}
                              >
                                Motif : « {ts.supplementReason} »
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span
                              id={`badge-oldversion-${ts.id}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11px] font-bold uppercase tracking-wide bg-amber-50 text-amber-950 border border-amber-300 shadow-2xs"
                            >
                              <History className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>Ancienne version</span>
                            </span>
                            {isComplemented ? (
                              <span className="text-[10px] text-amber-800 bg-amber-100/60 px-2 py-0.5 rounded-md border border-amber-200/80 block max-w-[210px] truncate font-medium">
                                Feuille initiale (complétée)
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 block">
                                Feuille initiale archivée
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                            ts.status === 'validated'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : ts.status === 'submitted'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : ts.status === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {ts.status === 'validated'
                            ? 'Validé'
                            : ts.status === 'submitted'
                            ? 'Soumis'
                            : ts.status === 'rejected'
                            ? 'Rejeté'
                            : 'Brouillon'}
                        </span>
                      </td>

                      {/* Realized / Required */}
                      <td className="py-3.5 px-3 font-mono">
                        <strong
                          className={
                            sum.rawRealizedHours === sum.requiredHours
                              ? 'text-emerald-700 font-bold'
                              : sum.rawRealizedHours < sum.requiredHours
                              ? 'text-rose-700 font-bold'
                              : 'text-amber-600 font-bold'
                          }
                        >
                          {sum.realizedHours}h
                        </strong>
                        <span className="text-slate-400 text-[11px]"> / {sum.requiredHours}h</span>
                      </td>

                      {/* Overtime */}
                      <td className="py-3.5 px-3 font-mono">
                        {sum.monthOvertime > 0 ? (
                          <span className="font-bold text-amber-800">+{sum.monthOvertime}h</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Carryover M-1 */}
                      <td className="py-3.5 px-3 font-mono">
                        {sum.carryoverM1 > 0 ? (
                          <span className="font-bold text-emerald-700">+{sum.carryoverM1}h</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Total Cumulative Overtime */}
                      <td className="py-3.5 px-3 font-mono font-bold text-indigo-700">
                        +{sum.totalCumulativeOvertime}h
                      </td>

                      {/* Absences */}
                      <td className="py-3.5 px-3">
                        {sum.absenceCounts.cpDays > 0 || sum.absenceCounts.sickDays > 0 ? (
                          <div className="space-y-0.5 text-[11px]">
                            {sum.absenceCounts.cpDays > 0 && (
                              <span className="text-slate-600 block">CP : {sum.absenceCounts.cpDays}j</span>
                            )}
                            {sum.absenceCounts.sickDays > 0 && (
                              <span className="text-slate-600 block">Maladie : {sum.absenceCounts.sickDays}j</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Validation */}
                      <td className="py-3.5 px-3">
                        {ts.status === 'validated' ? (
                          <div className="text-[11px]">
                            <span className="font-semibold text-emerald-800 block">
                              {ts.validatorName || 'Direction RH'}
                            </span>
                            <span className="text-slate-400">
                              {ts.validatedAt ? new Date(ts.validatedAt).toLocaleDateString('fr-FR') : ''}
                            </span>
                          </div>
                        ) : ts.status === 'rejected' ? (
                          <span className="text-rose-600 text-[11px] font-medium block max-w-xs truncate" title={ts.rejectionReason}>
                            {ts.rejectionReason || 'Rejeté'}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">En cours</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setInspectedSheet(ts)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shadow-xs"
                            title="Examiner en détail"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              if (user) exportIndividualTimesheetToExcel(ts, user);
                            }}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 transition-colors cursor-pointer shadow-xs"
                            title="Télécharger Excel individuel"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              if (user) exportTimesheetToPDF(ts, user);
                            }}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 transition-colors cursor-pointer shadow-xs"
                            title="Télécharger PDF officiel A4 Paysage"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* MODAL : ARCHIVE INSPECTION */}
      {inspectedSheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-bold text-base">
                    Archive : {inspectedSheet.userName} ({formatMonthName(inspectedSheet.period)})
                  </h3>
                  {inspectedSheet.isSupplement ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black uppercase bg-purple-100 text-purple-950 border-2 border-purple-300">
                      <Layers className="w-3.5 h-3.5 text-purple-700" />
                      Complément visible #{inspectedSheet.supplementNumber || 1}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold uppercase bg-amber-100 text-amber-950 border border-amber-300">
                      <History className="w-3.5 h-3.5 text-amber-700" />
                      Ancienne version
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Statut : {inspectedSheet.status.toUpperCase()}</p>
              </div>
              <button
                onClick={() => setInspectedSheet(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {inspectedSheet.isSupplement && (
                <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 space-y-1">
                  <div className="flex items-center gap-2 text-purple-950 font-bold">
                    <Layers className="w-4 h-4 text-purple-700" />
                    <span>Complément a posteriori visible (Avenant #{inspectedSheet.supplementNumber || 1})</span>
                  </div>
                  {inspectedSheet.supplementReason && (
                    <p className="text-xs text-purple-900 mt-1">
                      <strong>Motif déclaré :</strong> « {inspectedSheet.supplementReason} »
                    </p>
                  )}
                  <p className="text-[11px] text-purple-700">
                    Ce relevé a été créé ultérieurement pour corriger ou compléter la feuille d'heures originale sans altérer la conformité de l'audit RH.
                  </p>
                </div>
              )}

              {!inspectedSheet.isSupplement && hasAssociatedSupplement(inspectedSheet) && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                  <div className="flex items-center gap-2 text-amber-950 font-bold">
                    <History className="w-4 h-4 text-amber-700" />
                    <span>Ancienne version (Feuille d'heures initiale)</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Cette version initiale a fait l'objet d'un ou plusieurs compléments a posteriori. Elle est conservée à titre de traçabilité légale.
                  </p>
                </div>
              )}

              {inspectedSheet.status === 'rejected' && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900">
                  <strong>Motif de rejet archivé :</strong> {inspectedSheet.rejectionReason}
                </div>
              )}

              {inspectedSheet.status === 'validated' && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <strong>Signature d'approbation :</strong> {inspectedSheet.signature}
                </div>
              )}

              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="py-2.5 px-3.5">Date</th>
                      <th className="py-2.5 px-3">Horaires</th>
                      <th className="py-2.5 px-3 text-center">Heures</th>
                      <th className="py-2.5 px-3">Heures Sup. & Motif</th>
                      <th className="py-2.5 px-3">Absence</th>
                      <th className="py-2.5 px-3.5">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inspectedSheet.days.map((day) => (
                      <tr key={day.date} className={day.overtimeHours > 0 ? 'bg-amber-50/40' : ''}>
                        <td className="py-2.5 px-3.5 font-semibold">
                          {getFrenchDayName(day.dayOfWeek, true)} {day.date.slice(8)}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {day.morningStart ? `${day.morningStart}-${day.morningEnd} / ${day.afternoonStart}-${day.afternoonEnd}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">
                          {day.actualWorkedHours ? `${day.actualWorkedHours}h` : '-'}
                        </td>
                        <td className="py-2.5 px-3">
                          {day.overtimeHours > 0 ? `+${day.overtimeHours}h (${day.overtimeReason || '-'})` : '-'}
                        </td>
                        <td className="py-2.5 px-3">{day.absenceType !== 'none' ? day.absenceType.toUpperCase() : '-'}</td>
                        <td className="py-2.5 px-3.5 text-slate-500">{day.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setInspectedSheet(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL : ZIP EXPORT PROGRESS */}
      {isExportingZip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <FolderArchive className="w-7 h-7 text-indigo-600 animate-pulse" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">Préparation de votre archive .ZIP</h4>
              <p className="text-xs text-slate-500 mt-1">
                {zipProgress?.stage || 'Génération des relevés Excel et des attestations PDF...'}
              </p>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    zipProgress && zipProgress.total > 0
                      ? Math.max(10, Math.round((zipProgress.current / zipProgress.total) * 100))
                      : 25
                  }%`,
                }}
              />
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              {zipProgress ? `${zipProgress.current} / ${zipProgress.total} relevé(s) préparé(s)` : 'Compression en cours...'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
