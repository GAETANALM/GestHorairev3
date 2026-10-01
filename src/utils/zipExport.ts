import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { Timesheet, UserProfile } from '../types';
import { buildIndividualTimesheetWorkbook, buildGroupedTimesheetsWorkbook } from './excelExport';
import { buildTimesheetPDF } from './pdfExport';

export interface ZipExportOptions {
  includeExcel?: boolean;
  includePDF?: boolean;
  includeSummaryExcel?: boolean;
  archiveName?: string;
  onProgress?: (progress: { current: number; total: number; stage: string }) => void;
}

/**
 * Creates and downloads a compressed .zip archive containing all selected timesheets
 * with individual Excel spreadsheets, official PDF documents, and a consolidated synthesis Excel workbook.
 */
export async function exportTimesheetsToZip(
  timesheets: Timesheet[],
  users: UserProfile[],
  options: ZipExportOptions = {}
): Promise<void> {
  const {
    includeExcel = true,
    includePDF = true,
    includeSummaryExcel = true,
    archiveName,
    onProgress,
  } = options;

  if (timesheets.length === 0) {
    throw new Error('Aucune feuille de temps sélectionnée pour l’exportation.');
  }

  const zip = new JSZip();
  const totalCount = timesheets.length;
  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Generate consolidated summary workbook if requested
  if (includeSummaryExcel) {
    onProgress?.({ current: 0, total: totalCount, stage: 'Génération du récapitulatif global...' });
    const summaryWb = buildGroupedTimesheetsWorkbook(timesheets, users);
    const summaryArray = XLSX.write(summaryWb, { bookType: 'xlsx', type: 'array' });
    zip.file('00_Synthese_Globale_Paie.xlsx', summaryArray);
  }

  // 2. Iterate through each timesheet and generate its files
  for (let i = 0; i < totalCount; i++) {
    const ts = timesheets[i];
    onProgress?.({
      current: i + 1,
      total: totalCount,
      stage: `Traitement ${i + 1}/${totalCount} : ${ts.userName} (${ts.period})...`,
    });

    // Match or construct user profile
    const existingUser = users.find((u) => u.id === ts.userId);
    const user: UserProfile = existingUser || {
      id: ts.userId,
      firstName: ts.userName.split(' ')[0] || 'Prénom',
      lastName: ts.userName.split(' ').slice(1).join(' ') || 'Nom',
      email: `${ts.userName.toLowerCase().replace(/\s+/g, '.')}@entreprise.fr`,
      pin: '000000',
      roles: ['employee'],
      isActive: true,
      hireDate: '2025-01-01',
      contract: {
        weeklyHours: 35,
        title: 'Contrat Salarié',
        department: ts.userDepartment || 'Exploitation',
        defaultSchedule: [],
      },
    };

    const cleanLastName = user.lastName.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    const cleanFirstName = user.firstName.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    const suppSuffix = ts.isSupplement
      ? `_Complement_${ts.supplementNumber || 1}`
      : '';

    // Individual Excel spreadsheet
    if (includeExcel) {
      try {
        const wb = buildIndividualTimesheetWorkbook(ts, user);
        const excelArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const excelFilename = `Fiches_Excel/Releve_Heures_${cleanLastName}_${cleanFirstName}_${ts.period}${suppSuffix}.xlsx`;
        zip.file(excelFilename, excelArray);
      } catch (err) {
        console.error(`Erreur génération Excel pour ${ts.userName}:`, err);
      }
    }

    // Official A4 Landscape PDF
    if (includePDF) {
      try {
        const doc = buildTimesheetPDF(ts, user);
        const pdfArray = doc.output('arraybuffer');
        const pdfFilename = `Attestations_PDF/Attestation_Heures_${cleanLastName}_${cleanFirstName}_${ts.period}${suppSuffix}.pdf`;
        zip.file(pdfFilename, pdfArray);
      } catch (err) {
        console.error(`Erreur génération PDF pour ${ts.userName}:`, err);
      }
    }
  }

  // 3. Add manifest / summary readme
  const manifestContent = [
    '=============================================================',
    'BORDEREAU D\'EXPORTATION DES ARCHIVES ET FEUILLES DE TEMPS',
    '=============================================================',
    `Date d'exportation : ${new Date().toLocaleString('fr-FR')}`,
    `Nombre de relevés exportés : ${totalCount}`,
    `Archive compressée : ${archiveName || `Export_Archives_Fiches_${todayStr}`}.zip`,
    '',
    'CONTENU DU DOSSIER COMPRESSÉ :',
    '- 00_Synthese_Globale_Paie.xlsx : Tableau récapitulatif consolidé avec ventilation 5 types d\'horaires.',
    '- Fiches_Excel/ : Feuilles de temps individuelles au format Excel (.xlsx) éditables et détaillées jour par jour.',
    '- Attestations_PDF/ : Attestations certifiées au format PDF officiel A4 paysage prêtes pour la paie et le contrôle.',
    '',
    'LISTE DES RELEVÉS INCLUS :',
    ...timesheets.map((ts, idx) => {
      const typeLabel = ts.isSupplement ? `[Complément #${ts.supplementNumber || 1}]` : '[Relevé initial / archivé]';
      const statusLabel = ts.status.toUpperCase();
      return `${idx + 1}. ${ts.userName} | Période : ${ts.period} | ${typeLabel} | Statut : ${statusLabel}`;
    }),
    '',
    'MENTIONS LÉGALES ET CONSERVATION :',
    'Conformément à l\'article L. 3171-4 du Code du travail, les documents nécessaires',
    'au décompte de la durée du travail doivent être conservés pendant 5 ans à la disposition',
    'des agents de contrôle de l\'Inspection du travail et pour la prescription des salaires (Art. L. 3245-1).',
  ].join('\n');

  zip.file('00_Bordereau_Export_Archives.txt', manifestContent);

  // 4. Compress and trigger browser download
  onProgress?.({ current: totalCount, total: totalCount, stage: 'Finalisation et compression de l’archive .zip...' });
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const finalZipName = archiveName
    ? (archiveName.endsWith('.zip') ? archiveName : `${archiveName}.zip`)
    : `Export_Archives_Fiches_Temps_${todayStr}.zip`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalZipName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
