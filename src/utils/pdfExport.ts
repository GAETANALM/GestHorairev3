import { jsPDF } from 'jspdf';
import { Timesheet, UserProfile } from '../types';
import { calculatePayrollSummary, formatHours, formatMonthName, getFrenchDayName } from './timeCalculations';

export function buildTimesheetPDF(timesheet: Timesheet, user: UserProfile): jsPDF {
  // A4 Landscape: 297 x 210 mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const summary = calculatePayrollSummary(timesheet, user.contract);

  // Background clean header strip
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, 297, 24, 'F');

  // Title in header
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('ATTESTATION MENSUELLE DES HORAIRES ET DES HEURES SUPPLÉMENTAIRES', 14, 11);

  // Subtitle with Document Type indication
  const docTypeLabel = timesheet.isSupplement
    ? `COMPLÉMENT D'HEURES VISIBLE #${timesheet.supplementNumber || 1}`
    : 'ANCIENNE VERSION / RELEVÉ ARCHIVÉ';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Document officiel de décompte du temps de travail • [ ${docTypeLabel} ]`, 14, 18);

  // Status Badge in Header
  const statusLabels: Record<string, string> = {
    draft: 'BROUILLON',
    submitted: 'SOUMIS POUR VALIDATION',
    validated: 'VALIDÉ ET CERTIFIÉ',
    rejected: 'REJETÉ POUR CORRECTION',
  };
  const statusText = statusLabels[timesheet.status] || timesheet.status.toUpperCase();
  doc.setFillColor(timesheet.status === 'validated' ? 22 : timesheet.status === 'rejected' ? 220 : 59, timesheet.status === 'validated' ? 163 : timesheet.status === 'rejected' ? 38 : 130, timesheet.status === 'validated' ? 74 : timesheet.status === 'rejected' ? 38 : 246);
  doc.roundedRect(210, 6, 73, 12, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(statusText, 246.5, 13.5, { align: 'center' });

  // Collaborator & Contract Info Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 28, 130, 25, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`${user.firstName} ${user.lastName}`, 18, 35);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Matricule : ${user.id} | Email : ${user.email}`, 18, 41);
  doc.text(`Département : ${user.contract.department}`, 18, 46);
  doc.text(`Contrat : ${user.contract.title} (${user.contract.weeklyHours}h hebdo)`, 18, 50);

  // Month & Synthesis Box
  doc.roundedRect(152, 28, 131, 25, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Période : ${formatMonthName(timesheet.period).toUpperCase()}`, 156, 35);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(`Heures Requises : ${summary.requiredHours}h (${formatHours(summary.requiredHours)})`, 156, 41);
  doc.text(`Heures Réalisées : ${summary.realizedHours}h (${formatHours(summary.realizedHours)})`, 156, 46);

  // M-1 Carryover badge if exists
  doc.setFont('helvetica', 'bold');
  if (summary.carryoverM1 > 0) {
    doc.setTextColor(22, 101, 52); // green-800
    doc.text(`Report M-1 : +${summary.carryoverM1}h | Heures Sup Mois : +${summary.monthOvertime}h | Total Cumulé : +${summary.totalCumulativeOvertime}h`, 156, 50);
  } else {
    doc.setTextColor(15, 23, 42);
    doc.text(`Heures Sup Mois : +${summary.monthOvertime}h | Solde Net : ${summary.netBalance >= 0 ? '+' : ''}${summary.netBalance}h`, 156, 50);
  }

  // Days Table Layout
  const startY = 57;
  const rowHeight = 3.6;
  const colX = [14, 30, 48, 64, 80, 96, 112, 126, 140, 156, 210, 240, 283];
  // cols: Date, Jour, Matin D, Matin F, AM D, AM F, Réalisé, Nuit, HS, Motif HS, Absence, Notes

  // Table Header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, startY, 269, 5, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.line(14, startY, 283, startY);
  doc.line(14, startY + 5, 283, startY + 5);

  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('Date', 16, startY + 3.5);
  doc.text('Jour', 30, startY + 3.5);
  doc.text('Matin D.', 46, startY + 3.5);
  doc.text('Matin F.', 60, startY + 3.5);
  doc.text('A-Midi D.', 74, startY + 3.5);
  doc.text('A-Midi F.', 88, startY + 3.5);
  doc.text('Réalisé', 102, startY + 3.5);
  doc.text('Nuit', 118, startY + 3.5);
  doc.text('H. Sup', 130, startY + 3.5);
  doc.text('Justifications (HS / Nuit)', 144, startY + 3.5);
  doc.text('Absence (Justifiée / Non trav.)', 204, startY + 3.5);
  doc.text('Observations', 252, startY + 3.5);

  let currentY = startY + 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);

  timesheet.days.forEach((day, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 250, 252);
    }

    if (day.isOffDay) {
      doc.setFillColor(241, 245, 249);
    }
    if (day.overtimeHours > 0) {
      doc.setFillColor(254, 243, 199); // amber-100 highlight for overtime days!
    } else if (day.nightHours > 0) {
      doc.setFillColor(238, 242, 255); // indigo-50 highlight for night hours!
    } else if (day.absenceType === 'other' || day.absenceType === 'unjustified') {
      doc.setFillColor(255, 241, 242); // rose-50 highlight for unjustified absences
    }

    doc.rect(14, currentY, 269, rowHeight, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(14, currentY + rowHeight, 283, currentY + rowHeight);

    doc.setTextColor(30, 41, 59);
    doc.text(day.date.slice(5), 16, currentY + 2.6);
    doc.text(getFrenchDayName(day.dayOfWeek, true), 30, currentY + 2.6);

    const isMornAbs = day.absenceType !== 'none' && (day.absenceDuration === 'full' || day.absenceDuration === 'morning');
    const isAftAbs = day.absenceType !== 'none' && (day.absenceDuration === 'full' || day.absenceDuration === 'afternoon');

    doc.text(isMornAbs ? 'Congé' : day.morningStart || '-', 46, currentY + 2.6);
    doc.text(isMornAbs ? 'Congé' : day.morningEnd || '-', 60, currentY + 2.6);
    doc.text(isAftAbs ? 'Congé' : day.afternoonStart || '-', 74, currentY + 2.6);
    doc.text(isAftAbs ? 'Congé' : day.afternoonEnd || '-', 88, currentY + 2.6);

    const workedStr = day.actualWorkedHours > 0
      ? (day.absenceCreditedHours > 0 ? `${day.actualWorkedHours}h (+${day.absenceCreditedHours}h)` : `${day.actualWorkedHours}h`)
      : (day.absenceCreditedHours > 0 ? `${day.absenceCreditedHours}h (C)` : '-');
    doc.text(workedStr, 102, currentY + 2.6);
    doc.text(day.nightHours ? `${day.nightHours}h` : '-', 118, currentY + 2.6);

    if (day.overtimeHours > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 83, 9);
      doc.text(`+${day.overtimeHours}h`, 130, currentY + 2.6);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
    } else {
      doc.text('-', 130, currentY + 2.6);
    }

    // Justifications for HS and Night (combined, truncated if long)
    const reasonsParts: string[] = [];
    if (day.overtimeHours > 0) {
      reasonsParts.push(`HS: ${day.overtimeReason || 'Justif. requise'}`);
    }
    if (day.nightHours > 0) {
      reasonsParts.push(`Nuit: ${day.nightHoursReason || 'Justif. requise'}`);
    }
    const combinedReason = reasonsParts.length > 0 ? reasonsParts.join(' | ').slice(0, 42) : '-';
    doc.text(combinedReason, 144, currentY + 2.6);

    // Absence
    let absStr = '-';
    if (day.absenceType !== 'none') {
      const typeLabel =
        day.absenceType === 'cp'
          ? 'CP'
          : day.absenceType === 'recovery'
          ? 'Récup'
          : day.absenceType === 'sick'
          ? 'Maladie'
          : day.absenceType === 'unpaid'
          ? 'Sans solde'
          : day.absenceType === 'unjustified'
          ? 'Injustifiée'
          : 'Autre';
      const durLabel = day.absenceDuration === 'full' ? '1j' : day.absenceDuration === 'morning' ? '0.5j m.' : '0.5j am.';
      const expl = day.absenceReason ? ` [${day.absenceReason.slice(0, 18)}]` : '';
      absStr = `${typeLabel} (${durLabel})${expl}`.slice(0, 35);
    }
    doc.text(absStr, 204, currentY + 2.6);

    // Notes
    const notesStr = (day.notes || (day.isOffDay ? 'Repos' : '')).slice(0, 24);
    doc.text(notesStr, 252, currentY + 2.6);

    currentY += rowHeight;
  });

  // Footer Summary & Signatures block (Y ~ 174 to 204)
  const footerY = Math.max(currentY + 3, 172);

  // Cartouche de synthèse paie (Gauche)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, footerY, 130, 29, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('SYNTHÈSE PAIE - 5 TYPES D’HORAIRES & 3 TAUX DE RÉMUNÉRATION', 18, footerY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85);
  doc.text(`1. Heures Normales : ${summary.realizedHours}h réalisées / ${summary.requiredHours}h requises`, 18, footerY + 8.5);
  doc.text(`2. Heures Sup Classiques (Taux HS) : +${summary.remainingMonthOvertime}h (Cumul M+M-1 : +${summary.totalCumulativeOvertime}h)`, 18, footerY + 12.5);
  doc.text(`3. Heures de Nuit 21h-06h (Taux Nuit) : ${summary.nightHours}h comptabilisées en fin de mois`, 18, footerY + 16.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`• CUMUL GLOBAL TOUTES HS (HS + Nuit) : +${summary.totalAllOvertimeCombined}h`, 18, footerY + 20.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(51, 65, 85);
  doc.text(`4. Absences Justifiées : ${summary.absenceCounts.justifiedDays}j (CP: ${summary.absenceCounts.cpDays}j, Réc: ${summary.absenceCounts.recoveryDays}j, Mal: ${summary.absenceCounts.sickDays}j, SS: ${summary.absenceCounts.unpaidDays}j)`, 18, footerY + 24.5);
  doc.text(`5. Absences Non Travaillées / Injustifiées : ${summary.absenceCounts.unjustifiedTotalDays}j (Injustifiées: ${summary.absenceCounts.unjustifiedDays}j, Autre: ${summary.absenceCounts.otherDays}j)`, 18, footerY + 28);

  // Signature Collaborateur (Milieu)
  doc.roundedRect(148, footerY, 65, 28, 2, 2, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('ÉMARGEMENT COLLABORATEUR', 151, footerY + 5.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text("« Je certifie sur l'honneur l'exactitude des horaires et heures supplémentaires déclarés. »", 151, footerY + 9.5, { maxWidth: 59 });

  if (timesheet.submittedAt) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(22, 101, 52);
    doc.text(`Signé numériquement le ${new Date(timesheet.submittedAt).toLocaleDateString('fr-FR')}`, 151, footerY + 23);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Date et signature :', 151, footerY + 24);
  }

  // Signature Direction / Valideur (Droite)
  doc.roundedRect(218, footerY, 65, 28, 2, 2, 'D');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('VALIDATION DIRECTION / RH', 221, footerY + 5.5);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Validation hiérarchique pour transmission en paie et archivage légal.', 221, footerY + 9.5, { maxWidth: 59 });

  if (timesheet.status === 'validated') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(22, 101, 52);
    doc.text(`VALIDÉ par ${timesheet.validatorName || 'Direction'}`, 221, footerY + 20);
    doc.text(`Le ${timesheet.validatedAt ? new Date(timesheet.validatedAt).toLocaleDateString('fr-FR') : '31/05/2026'}`, 221, footerY + 24);
  } else if (timesheet.status === 'rejected') {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(220, 38, 38);
    doc.text(`REJETÉ : ${timesheet.rejectionReason?.slice(0, 30) || 'Correction requise'}`, 221, footerY + 23);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('Cachet et signature de l’employeur :', 221, footerY + 24);
  }

  return doc;
}

export function exportTimesheetToPDF(timesheet: Timesheet, user: UserProfile): void {
  const doc = buildTimesheetPDF(timesheet, user);
  const fileName = `Attestation_Heures_${user.lastName}_${user.firstName}_${timesheet.period}.pdf`;
  doc.save(fileName);
}
