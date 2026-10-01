with open('src/components/ValidationPanel.tsx', 'r') as f:
    content = f.read()

# 1. Add states for deferring overtime
old_state = """  const [toast, setToast] = useState<{ type: 'success' | 'info'; message: string; details?: string } | null>(null);
  const [rejectionError, setRejectionError] = useState('');"""

new_state = """  const [toast, setToast] = useState<{ type: 'success' | 'info'; message: string; details?: string } | null>(null);
  const [rejectionError, setRejectionError] = useState('');
  const [deferOvertimeInModal, setDeferOvertimeInModal] = useState<boolean>(false);
  const [quickValidationSheet, setQuickValidationSheet] = useState<Timesheet | null>(null);
  const [deferOvertimeInQuickModal, setDeferOvertimeInQuickModal] = useState<boolean>(false);

  // Sync deferOvertimeInModal when selected sheet changes
  useEffect(() => {
    if (selectedSheetForInspection) {
      setDeferOvertimeInModal(Boolean(selectedSheetForInspection.deferOvertimeToNextMonth));
    }
  }, [selectedSheetForInspection?.id]);"""

assert old_state in content, "old_state not found"
content = content.replace(old_state, new_state)

# 2. Update handleValidate and handleReopenDraft
old_validate_reopen = """  // Handle direct 1-click validation with electronic signature & timestamp
  const handleValidate = (sheet: Timesheet) => {
    const signature = `Certifié conforme par ${currentValidator.firstName} ${currentValidator.lastName} (${currentValidator.contract.title}) le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`;

    const updated: Timesheet = {
      ...sheet,
      status: 'validated',
      validatedAt: new Date().toISOString(),
      validatedBy: currentValidator.id,
      validatorName: `${currentValidator.firstName} ${currentValidator.lastName}`,
      signature,
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updated);
    if (selectedSheetForInspection?.id === sheet.id) {
      setSelectedSheetForInspection(updated);
    }

    setToast({
      type: 'success',
      message: `Fiche d'heures de ${sheet.userName} validée avec succès !`,
      details: 'La fiche est certifiée conforme et signée électroniquement.',
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
      updatedAt: new Date().toISOString(),
    };

    onUpdateTimesheet(updated);
    if (selectedSheetForInspection?.id === sheet.id) {
      setSelectedSheetForInspection(null);
    }

    setToast({
      type: 'info',
      message: `Fiche d'heures de ${sheet.userName} réouverte en brouillon`,
      details: 'La fiche est renvoyée au collaborateur et retirée de la validation tant qu\\'elle n\\'est pas resoumise.',
    });
  };"""

new_validate_reopen = """  // Handle validation with electronic signature, timestamp & optional overtime deferral to next month
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
      details: 'La fiche est renvoyée au collaborateur et retirée de la validation tant qu\\'elle n\\'est pas resoumise.',
    });
  };"""

assert old_validate_reopen in content, "old_validate_reopen not found"
content = content.replace(old_validate_reopen, new_validate_reopen)

# 3. Update the table row "Valider" button and validated display
old_row_validate = """                    {ts.status === 'submitted' && (
                      <>
                        <button
                          onClick={() => handleValidate(ts)}
                          className="flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer shadow-sm"
                          title="Valider immédiatement avec signature électronique et horodatage"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Valider</span>
                        </button>"""

new_row_validate = """                    {ts.status === 'submitted' && (
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
                        </button>"""

assert old_row_validate in content, "old_row_validate not found"
content = content.replace(old_row_validate, new_row_validate)

old_row_validated_display = """                    {ts.status === 'validated' && (
                      <div className="flex items-center gap-2">
                        <div className="text-[11px] text-emerald-700 font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Signé le {ts.validatedAt ? new Date(ts.validatedAt).toLocaleDateString('fr-FR') : ''}</span>
                        </div>
                        <button
                          onClick={() => handleReopenDraft(ts)}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors cursor-pointer shadow-xs"
                          title="Rouvrir la feuille d'heures en brouillon en cas d'erreur de validation"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          <span>Rouvrir en brouillon</span>
                        </button>
                      </div>
                    )}"""

new_row_validated_display = """                    {ts.status === 'validated' && (
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
                    )}"""

assert old_row_validated_display in content, "old_row_validated_display not found"
content = content.replace(old_row_validated_display, new_row_validated_display)

# 4. In Inspection Modal: add the defer overtime checkbox & status display before footer
old_insp_footer_start = """            {/* Modal Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">"""

new_insp_footer_start = """            {/* Option Traitement Paie des Heures Sup. Restantes : Ne pas payer et garder pour le mois suivant */}
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
            <div className="p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">"""

assert old_insp_footer_start in content, "old_insp_footer_start not found"
content = content.replace(old_insp_footer_start, new_insp_footer_start)

# 5. In Inspection Modal: pass deferOvertimeInModal to handleValidate
old_insp_validate_call = """                    <button
                      onClick={() => {
                        handleValidate(selectedSheetForInspection);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Signer et Valider</span>
                    </button>"""

new_insp_validate_call = """                    <button
                      onClick={() => {
                        handleValidate(selectedSheetForInspection, deferOvertimeInModal);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Signer et Valider</span>
                    </button>"""

assert old_insp_validate_call in content, "old_insp_validate_call not found"
content = content.replace(old_insp_validate_call, new_insp_validate_call)

# 6. Add Quick Validation Modal before end of component
old_modals_end = """      {/* MODAL : REJECTION REASON (Rejet motivé avec commentaire explicatif) */}"""

quick_modal_markup = """      {/* QUICK VALIDATION MODAL (avec case à cocher pour reporter ou payer les heures sup) */}
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

      {/* MODAL : REJECTION REASON (Rejet motivé avec commentaire explicatif) */}"""

assert old_modals_end in content, "old_modals_end not found"
content = content.replace(old_modals_end, quick_modal_markup)

with open('src/components/ValidationPanel.tsx', 'w') as f:
    f.write(content)

print("ValidationPanel.tsx updated successfully with defer overtime checkbox!")
