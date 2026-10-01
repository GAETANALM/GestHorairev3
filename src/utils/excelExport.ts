import * as XLSX from 'xlsx';
import { Timesheet, UserProfile } from '../types';
import { calculatePayrollSummary, formatHours, formatMonthName, getFrenchDayName } from './timeCalculations';

/**
 * Builds an individual payroll timesheet Excel workbook
 */
export function buildIndividualTimesheetWorkbook(timesheet: Timesheet, user: UserProfile): XLSX.WorkBook {
  const summary = calculatePayrollSummary(timesheet, user.contract);
  const wb = XLSX.utils.book_new();

  const docTypeLabel = timesheet.isSupplement
    ? `COMPLÉMENT VISIBLE #${timesheet.supplementNumber || 1}${timesheet.supplementReason ? ` (Motif : ${timesheet.supplementReason})` : ''}`
    : 'ANCIENNE VERSION / FEUILLE INITIALE ARCHIVÉE';

  // 1. Header Information rows
  const headerData = [
    ['SUIVI ET VALIDATION DES HORAIRES - RELEVÉ MENSUEL DE PAIE'],
    [''],
    ['Type de Relevé :', docTypeLabel, '', 'Période :', formatMonthName(timesheet.period).toUpperCase()],
    ['Collaborateur :', `${user.firstName} ${user.lastName}`, '', 'Département :', user.contract.department],
    ['Matricule / ID :', user.id, '', 'Base hebdo :', `${user.contract.weeklyHours}h`],
    ['Contrat :', user.contract.title, '', 'Statut relevé :', timesheet.status.toUpperCase()],
    ['Édité le :', new Date().toLocaleDateString('fr-FR'), '', 'Validation :', timesheet.validatorName || '-'],
    [''],
    ['SYNTHÈSE PAIE & VENTILATION DES 5 TYPES D’HORAIRES'],
    ['1. Horaires Normaux Contractuels (Taux Normal) :'],
    ['  - Heures Requises (Contrat théorique)', `${summary.requiredHours}h (${formatHours(summary.requiredHours)})`],
    ['  - Heures Réalisées (Présence physique + assimilées)', `${summary.realizedHours}h (${formatHours(summary.realizedHours)})`],
    ['2. Heures Supplémentaires Classiques (Taux Majoré HS) :'],
    ['  - Heures Sup. du Mois', `${summary.remainingMonthOvertime}h (Initiales : ${summary.initialMonthOvertime}h)`],
    ['  - Report Heures Sup. Mois Précédent (M-1)', `${summary.remainingCarryoverM1}h (Initial : ${summary.initialCarryoverM1}h)`],
    ['  - Total Heures Sup. Classiques en Réserve', `${summary.totalCumulativeOvertime}h`],
    ['  - Option Paie : Heures Sup. Rémunérées ce mois', `${summary.paidOvertimeHours}h`],
    ['  - Option Paie : Report Heures Sup. sur M+1 (Non payées)', `${summary.carryoverToNextMonth}h`],
    ['3. Heures de Nuit 21h-06h (Taux Majoré Spécifique Nuit - Comptabilisées Fin de Mois) :'],
    ['  - Heures de Nuit', `${summary.nightHours}h (Initiales : ${summary.initialNightHours}h)`],
    ['  - CUMUL GLOBAL HEURES SUP. & NUIT', `${summary.totalAllOvertimeCombined}h (${formatHours(summary.totalAllOvertimeCombined)})`],
    ['4. Absences Justifiées (Assimilées aux Horaires Normaux) :'],
    ['  - Total Jours Justifiés', `${summary.absenceCounts.justifiedDays} jour(s)`],
    ['  - Congés Payés (CP)', `${summary.absenceCounts.cpDays} jour(s)`],
    ['  - Récupérations (RECUP)', `${summary.absenceCounts.recoveryDays} jour(s)`],
    ['  - Arrêts Maladie / Accident', `${summary.absenceCounts.sickDays} jour(s)`],
    ['  - Congés Sans Solde', `${summary.absenceCounts.unpaidDays} jour(s)`],
    ['5. Absences Non Travaillées / Injustifiées (Explication Obligatoire) :'],
    ['  - Total Jours Non Travaillés', `${summary.absenceCounts.unjustifiedTotalDays} jour(s)`],
    ['  - Absences Injustifiées', `${summary.absenceCounts.unjustifiedDays} jour(s)`],
    ['  - Autres Motifs', `${summary.absenceCounts.otherDays} jour(s)`],
    [''],
    ['Solde Net Global (Excédent / Sous-service)', `${summary.netBalance >= 0 ? '+' : ''}${summary.netBalance}h`],
    [''],
    ['DÉTAIL JOURNALIER DES POINTAGES, JUSTIFICATIONS ET DÉCLARATIONS'],
    [
      'Date',
      'Jour',
      'Matin Début',
      'Matin Fin',
      'Après-midi Début',
      'Après-midi Fin',
      'Heures Travaillées',
      'Heures Nuit',
      'Justification Nuit',
      'Heures Sup.',
      'Justification Heures Sup.',
      'Type Absence',
      'Catégorie Absence',
      'Durée Absence',
      'Explication Absence',
      'Notes & Observations',
    ],
  ];

  // 2. Day-by-day rows
  const daysData = timesheet.days.map((day) => {
    const dayName = getFrenchDayName(day.dayOfWeek);
    let absenceLabel = 'Aucune';
    let absenceCategory = '-';
    if (day.absenceType === 'cp') {
      absenceLabel = 'Congés Payés';
      absenceCategory = 'Justifiée (Horaire normal)';
    } else if (day.absenceType === 'recovery') {
      absenceLabel = 'Récupération';
      absenceCategory = 'Justifiée (Horaire normal)';
    } else if (day.absenceType === 'sick') {
      absenceLabel = 'Maladie / Accident';
      absenceCategory = 'Justifiée (Horaire normal)';
    } else if (day.absenceType === 'unpaid') {
      absenceLabel = 'Sans Solde';
      absenceCategory = 'Justifiée (Horaire normal)';
    } else if (day.absenceType === 'other') {
      absenceLabel = 'Autre motif';
      absenceCategory = 'Non travaillée (Explication requise)';
    } else if (day.absenceType === 'unjustified') {
      absenceLabel = 'Absence injustifiée';
      absenceCategory = 'Non travaillée (Explication requise)';
    }

    let durationLabel = '-';
    if (day.absenceType !== 'none') {
      durationLabel = day.absenceDuration === 'full' ? 'Journée entière' : day.absenceDuration === 'morning' ? 'Matinée' : 'Après-midi';
    }

    return [
      day.date,
      dayName,
      day.morningStart || '-',
      day.morningEnd || '-',
      day.afternoonStart || '-',
      day.afternoonEnd || '-',
      day.actualWorkedHours ? `${day.actualWorkedHours}h` : '-',
      day.nightHours ? `${day.nightHours}h` : '-',
      day.nightHoursReason || '-',
      day.overtimeHours ? `${day.overtimeHours}h` : '-',
      day.overtimeReason || '-',
      absenceLabel,
      absenceCategory,
      durationLabel,
      day.absenceReason || '-',
      day.notes || (day.isOffDay ? 'Repos' : '-'),
    ];
  });

  // 3. Validation footer
  const footerData = [
    [''],
    ['ÉMARGEMENT ET VALIDATION'],
    [
      'Signature Collaborateur :',
      `Certifié sur l'honneur le ${timesheet.submittedAt ? new Date(timesheet.submittedAt).toLocaleDateString('fr-FR') : 'Non soumis'}`,
      '',
      'Validation Responsable / RH :',
      timesheet.signature || (timesheet.status === 'validated' ? `Validé par ${timesheet.validatorName || 'Direction'}` : 'En attente'),
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...headerData, ...daysData, ...footerData]);

  // Adjust column widths for readability
  ws['!cols'] = [
    { wch: 12 }, // Date
    { wch: 12 }, // Jour
    { wch: 12 }, // Matin D
    { wch: 12 }, // Matin F
    { wch: 15 }, // AM D
    { wch: 15 }, // AM F
    { wch: 18 }, // Heures Travaillées
    { wch: 12 }, // Nuit
    { wch: 30 }, // Justification Nuit
    { wch: 14 }, // Heures Sup
    { wch: 30 }, // Justification HS
    { wch: 18 }, // Type Absence
    { wch: 30 }, // Catégorie Absence
    { wch: 16 }, // Durée
    { wch: 35 }, // Explication Absence
    { wch: 30 }, // Notes
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Relevé Mensuel');
  return wb;
}

/**
 * Creates and downloads a single individual payroll timesheet Excel file
 */
export function exportIndividualTimesheetToExcel(timesheet: Timesheet, user: UserProfile): void {
  const wb = buildIndividualTimesheetWorkbook(timesheet, user);
  const fileName = `Releve_Heures_${user.lastName}_${user.firstName}_${timesheet.period}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Builds a grouped Excel workbook for a list of timesheets
 */
export function buildGroupedTimesheetsWorkbook(timesheets: Timesheet[], users: UserProfile[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sort: Complements FIRST, then older versions
  const sortedTimesheets = [...timesheets].sort((a, b) => {
    const aIsSupp = Boolean(a.isSupplement);
    const bIsSupp = Boolean(b.isSupplement);
    if (aIsSupp && !bIsSupp) return -1;
    if (!aIsSupp && bIsSupp) return 1;
    return b.period.localeCompare(a.period);
  });

  // Summary sheet of all collaborators
  const summaryRows = [
    ['RÉCAPITULATIF GLOBAL DES HEURES ET DE LA PAIE (VENTILATION 5 TYPES D’HORAIRES)'],
    ['Date d’export :', new Date().toLocaleString('fr-FR')],
    ['Nombre de feuilles de temps :', sortedTimesheets.length],
    ['Ordre d’affichage :', 'Compléments visibles en premier, suivis des anciennes versions'],
    [''],
    [
      'Collaborateur',
      'Département',
      'Période',
      'Type Document',
      'Statut',
      'Contrat Hebdo',
      'Heures Requises (Taux Normal)',
      'Heures Réalisées (Présence+Assimilées)',
      'HS Mois (Taux HS)',
      'Report M-1',
      'Total Réserve HS',
      'HS Payées Paie',
      'Report HS sur M+1 (Non payées)',
      'Heures Nuit 21h-06h (Taux Nuit)',
      'CUMUL TOUTES HS (HS+Nuit)',
      'Solde Net Global',
      'Abs. Justifiées (j)',
      'Abs. Non Travaillées / Injustifiées (j)',
      'CP (j)',
      'Récup (j)',
      'Maladie (j)',
      'Sans Solde (j)',
      'Autre / Injustifié (j)',
      'Validé par',
      'Date Validation',
    ],
  ];

  sortedTimesheets.forEach((ts) => {
    const user = users.find(u => u.id === ts.userId);
    const contract = user?.contract || {
      weeklyHours: 35,
      title: 'Contrat Standard',
      department: ts.userDepartment,
      defaultSchedule: [],
    };
    const sum = calculatePayrollSummary(ts, contract);

    const docType = ts.isSupplement
      ? `COMPLÉMENT VISIBLE #${ts.supplementNumber || 1}${ts.supplementReason ? ` (${ts.supplementReason})` : ''}`
      : 'ANCIENNE VERSION / INITIALE';

    summaryRows.push([
      ts.userName,
      ts.userDepartment,
      ts.period,
      docType,
      ts.status.toUpperCase(),
      `${contract.weeklyHours}h`,
      `${sum.requiredHours}h`,
      `${sum.realizedHours}h`,
      `${sum.remainingMonthOvertime}h`,
      `${sum.remainingCarryoverM1}h`,
      `${sum.totalCumulativeOvertime}h`,
      `${sum.paidOvertimeHours}h`,
      `${sum.carryoverToNextMonth}h`,
      `${sum.nightHours}h`,
      `${sum.totalAllOvertimeCombined}h`,
      `${sum.netBalance >= 0 ? '+' : ''}${sum.netBalance}h`,
      `${sum.absenceCounts.justifiedDays}`,
      `${sum.absenceCounts.unjustifiedTotalDays}`,
      `${sum.absenceCounts.cpDays}`,
      `${sum.absenceCounts.recoveryDays}`,
      `${sum.absenceCounts.sickDays}`,
      `${sum.absenceCounts.unpaidDays}`,
      `${sum.absenceCounts.unjustifiedDays + sum.absenceCounts.otherDays}`,
      ts.validatorName || (ts.status === 'validated' ? 'Direction' : '-'),
      ts.validatedAt ? new Date(ts.validatedAt).toLocaleDateString('fr-FR') : '-',
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 22 }, // Collaborateur
    { wch: 25 }, // Departement
    { wch: 12 }, // Periode
    { wch: 26 }, // Type Document
    { wch: 14 }, // Statut
    { wch: 14 }, // Contrat
    { wch: 22 }, // Req
    { wch: 22 }, // Real
    { wch: 16 }, // HS Mois
    { wch: 14 }, // M-1
    { wch: 18 }, // Total HS
    { wch: 24 }, // Heures Nuit
    { wch: 22 }, // Cumul toutes HS
    { wch: 16 }, // Solde Net
    { wch: 16 }, // Abs Justifiées
    { wch: 26 }, // Abs Non Travaillées
    { wch: 8 },  // CP
    { wch: 10 }, // Recup
    { wch: 12 }, // Maladie
    { wch: 12 }, // Sans solde
    { wch: 16 }, // Autre / Injustifié
    { wch: 20 }, // Valideur
    { wch: 16 }, // Date Val
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Synthese Globale');
  return wb;
}

/**
 * Creates and downloads a grouped Excel workbook for all filtered timesheets
 */
export function exportGroupedTimesheetsToExcel(timesheets: Timesheet[], users: UserProfile[], label: string = 'Recapitulatif_Global'): void {
  const wb = buildGroupedTimesheetsWorkbook(timesheets, users);
  const fileName = `${label}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
