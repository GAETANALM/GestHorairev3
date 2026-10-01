import React, { useState, useEffect } from 'react';
import {
  User,
  KeyRound,
  Shield,
  Briefcase,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Award,
  Edit3,
  Save,
  RotateCcw,
  Download,
  FileText,
  Info,
  Lock,
} from 'lucide-react';
import { DaySchedule, Timesheet, UserProfile } from '../types';
import {
  calculateIntervalHours,
  calculatePayrollSummary,
  calculateScheduleStandardHours,
  formatHours,
  getFrenchDayName,
} from '../utils/timeCalculations';

interface UserProfileModalProps {
  currentUser: UserProfile;
  timesheets: Timesheet[];
  onUpdateCurrentUser: (updated: UserProfile) => void;
}

export function UserProfileModal({
  currentUser,
  timesheets,
  onUpdateCurrentUser,
}: UserProfileModalProps) {
  const [activeTab, setActiveTab] = useState<'schedule' | 'security' | 'gdpr'>('schedule');
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [customSchedule, setCustomSchedule] = useState<DaySchedule[]>(() =>
    currentUser.contract.defaultSchedule.map((s) => ({ ...s }))
  );
  const [scheduleFeedback, setScheduleFeedback] = useState<string>('');

  // Keep custom schedule in sync if currentUser prop updates
  useEffect(() => {
    setCustomSchedule(currentUser.contract.defaultSchedule.map((s) => ({ ...s })));
  }, [currentUser]);

  // Calculate cumulative stats for user across all timesheets
  const userTimesheets = timesheets.filter((ts) => ts.userId === currentUser.id);

  let cumulativeOvertime = 0;
  let totalCpTaken = 0;
  let totalSickDays = 0;

  userTimesheets.forEach((ts) => {
    const sum = calculatePayrollSummary(ts, currentUser.contract);
    cumulativeOvertime += sum.monthOvertime;
    totalCpTaken += sum.absenceCounts.cpDays;
    totalSickDays += sum.absenceCounts.sickDays;
  });

  const handleDownloadMyPersonalData = () => {
    const exportPayload = {
      exportMetadata: {
        dateExport: new Date().toISOString(),
        reglementation: "RGPD (UE 2016/679) - Portabilité des données (Art. 20)",
        destinataire: `${currentUser.firstName} ${currentUser.lastName}`,
      },
      profilUtilisateur: {
        identifiant: currentUser.id,
        nom: currentUser.lastName,
        prenom: currentUser.firstName,
        email: currentUser.email,
        roles: currentUser.roles,
        dateEmbauche: currentUser.hireDate,
        statutCompte: currentUser.isActive ? "Actif" : "Désactivé",
      },
      contratEtHoraires: {
        intitule: currentUser.contract.title,
        departement: currentUser.contract.department,
        heuresHebdomadaires: currentUser.contract.weeklyHours,
        planningHebdomadaire: currentUser.contract.defaultSchedule,
      },
      statistiquesCumulees: {
        cumulHeuresSupplementaires: cumulativeOvertime,
        congesPayesPoses: totalCpTaken,
        arretsMaladieJours: totalSickDays,
      },
      feuillesDeTemps: userTimesheets.map((ts) => ({
        id: ts.id,
        periode: ts.period,
        statut: ts.status,
        reportHeuresM1: ts.carryoverM1,
        totalJours: ts.days.length,
        joursTravailles: ts.days.filter((d) => !d.isOffDay && d.actualWorkedHours > 0).length,
      })),
      mentionsLegalesConservation: {
        dureeLegale: "5 ans",
        referenceCodeDuTravail: "Article L.3171-4 du Code du travail",
        finalite: "Contrôle de la durée du travail et justification des rémunérations",
      },
    };

    const dataBlob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mes_donnees_personnelles_rgpd_${currentUser.lastName}_${currentUser.firstName}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 4000);
  };

  const handlePinChange = (e: React.FormEvent) => {
    e.preventDefault();
    setPinFeedback(null);

    if (currentPinInput !== currentUser.pin) {
      setPinFeedback({ type: 'error', message: 'Le code PIN actuel est incorrect.' });
      return;
    }

    if (!/^\d{6}$/.test(newPinInput)) {
      setPinFeedback({
        type: 'error',
        message: 'Le nouveau code PIN doit comporter exactement 6 chiffres.',
      });
      return;
    }

    if (newPinInput !== confirmPinInput) {
      setPinFeedback({
        type: 'error',
        message: 'La confirmation ne correspond pas au nouveau code PIN.',
      });
      return;
    }

    const updatedUser: UserProfile = {
      ...currentUser,
      pin: newPinInput,
    };

    onUpdateCurrentUser(updatedUser);
    setPinFeedback({
      type: 'success',
      message: 'Votre code PIN a été mis à jour avec succès.',
    });
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
  };

  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      {/* Profile Header Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white font-extrabold text-2xl flex items-center justify-center shadow-md shadow-indigo-600/20">
            {currentUser.firstName[0]}
            {currentUser.lastName[0]}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {currentUser.firstName} {currentUser.lastName}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {currentUser.email} • Matricule : <span className="font-mono">{currentUser.id}</span>
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {currentUser.roles.map((r) => (
                <span
                  key={r}
                  className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200"
                >
                  {r === 'employee' ? 'Salarié' : r === 'validator' ? 'Valideur' : 'Administrateur'}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-5 py-3.5 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1.5 w-full sm:w-auto">
          <div>
            Date d'embauche : <strong className="text-slate-800">{new Date(currentUser.hireDate).toLocaleDateString('fr-FR')}</strong>
          </div>
          <div>
            Département : <strong className="text-slate-800">{currentUser.contract.department}</strong>
          </div>
          <div>
            Base contractuelle : <strong className="text-slate-800">{currentUser.contract.weeklyHours}h hebdomadaires</strong>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 overflow-x-auto">
        <button
          type="button"
          id="btn-user-tab-schedule"
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'schedule'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Profil & Horaires</span>
        </button>

        <button
          type="button"
          id="btn-user-tab-security"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'security'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Sécurité & Code PIN</span>
        </button>

        <button
          type="button"
          id="btn-user-tab-gdpr"
          onClick={() => setActiveTab('gdpr')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'gdpr'
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span className="flex items-center gap-1.5">
            <span>Confidentialité & RGPD</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                activeTab === 'gdpr'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              Mes Droits
            </span>
          </span>
        </button>
      </div>

      {/* TAB 1: SCHEDULE & BALANCES */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* Balances & Portefeuille personnel */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Cumul Heures Sup.
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-700 tracking-tight">
            +{cumulativeOvertime}h00
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-2">Acquises sur l'ensemble de l'historique</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Congés Payés Posés
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 tracking-tight">
            {totalCpTaken} jour(s)
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-2">Solde consommé sur l'exercice</p>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Arrêts Maladie
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-700 tracking-tight">
            {totalSickDays} jour(s)
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-2">Assimilés au temps contractuel</p>
        </div>
      </div>

      {/* Contract Schedule Details */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Planning Contractuel par Défaut</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Ces plages horaires sont pré-remplies automatiquement et sauvegardées de manière permanente
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
              {currentUser.contract.title} ({currentUser.contract.weeklyHours}h/sem)
            </span>
            {!isEditingSchedule ? (
              <button
                type="button"
                id="btn-edit-profile-schedule"
                onClick={() => setIsEditingSchedule(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Modifier mes horaires</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingSchedule(false);
                    setCustomSchedule(currentUser.contract.defaultSchedule.map((s) => ({ ...s })));
                  }}
                  className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Annuler</span>
                </button>
                <button
                  type="button"
                  id="btn-save-profile-schedule"
                  onClick={() => {
                    const updatedWithHours = customSchedule.map((s) => ({
                      ...s,
                      standardHours: calculateScheduleStandardHours(
                        s.isWorked,
                        s.morningStart,
                        s.morningEnd,
                        s.afternoonStart,
                        s.afternoonEnd
                      ),
                    }));

                    const weeklyTotal =
                      Math.round(
                        updatedWithHours.reduce(
                          (sum, s) => sum + (s.isWorked ? s.standardHours : 0),
                          0
                        ) * 100
                      ) / 100;

                    const updatedUser: UserProfile = {
                      ...currentUser,
                      contract: {
                        ...currentUser.contract,
                        weeklyHours: weeklyTotal,
                        defaultSchedule: updatedWithHours,
                      },
                    };

                    onUpdateCurrentUser(updatedUser);
                    setIsEditingSchedule(false);
                    setScheduleFeedback('Planning par défaut enregistré de manière permanente.');
                    setTimeout(() => setScheduleFeedback(''), 4000);
                  }}
                  className="flex items-center gap-1 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Enregistrer</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {scheduleFeedback && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{scheduleFeedback}</span>
          </div>
        )}

        {/* Schedule Grid or Edit Form */}
        {!isEditingSchedule ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {currentUser.contract.defaultSchedule.map((s) => (
              <div
                key={s.dayOfWeek}
                className={`p-3.5 rounded-2xl border ${
                  s.isWorked
                    ? 'bg-slate-50/80 border-slate-200 text-slate-800'
                    : 'bg-slate-100/60 border-slate-200/60 text-slate-400'
                }`}
              >
                <div className="font-bold text-xs mb-1.5 flex items-center justify-between">
                  <span>{getFrenchDayName(s.dayOfWeek)}</span>
                  <span className={s.isWorked ? 'text-indigo-600 font-mono font-bold' : ''}>
                    {s.isWorked ? formatHours(s.standardHours) : 'Repos'}
                  </span>
                </div>
                {s.isWorked ? (
                  <div className="space-y-1 text-[11px] text-slate-500 font-mono">
                    <div className="flex items-center justify-between">
                      <span>Matin : {s.morningStart} - {s.morningEnd}</span>
                      <span className="text-slate-400 font-normal">
                        {formatHours(calculateIntervalHours(s.morningStart, s.morningEnd))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>A-Midi : {s.afternoonStart} - {s.afternoonEnd}</span>
                      <span className="text-slate-400 font-normal">
                        {formatHours(calculateIntervalHours(s.afternoonStart, s.afternoonEnd))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic">Jour non travaillé</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 bg-slate-50/60 p-4 rounded-2xl border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customSchedule.map((s, idx) => (
                <div
                  key={s.dayOfWeek}
                  className={`p-3 rounded-xl border ${
                    s.isWorked ? 'bg-white border-slate-200' : 'bg-slate-100/80 border-slate-200/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-slate-800">
                      {getFrenchDayName(s.dayOfWeek)}
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={s.isWorked}
                        onChange={(e) => {
                          const updated = [...customSchedule];
                          updated[idx] = {
                            ...updated[idx],
                            isWorked: e.target.checked,
                          };
                          setCustomSchedule(updated);
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>Travaillé</span>
                    </label>
                  </div>

                  {s.isWorked ? (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Matin</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="time"
                            value={s.morningStart}
                            onChange={(e) => {
                              const updated = [...customSchedule];
                              updated[idx] = { ...updated[idx], morningStart: e.target.value };
                              setCustomSchedule(updated);
                            }}
                            className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                          />
                          <span className="text-slate-300">-</span>
                          <input
                            type="time"
                            value={s.morningEnd}
                            onChange={(e) => {
                              const updated = [...customSchedule];
                              updated[idx] = { ...updated[idx], morningEnd: e.target.value };
                              setCustomSchedule(updated);
                            }}
                            className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                          />
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">Après-midi</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          <input
                            type="time"
                            value={s.afternoonStart}
                            onChange={(e) => {
                              const updated = [...customSchedule];
                              updated[idx] = { ...updated[idx], afternoonStart: e.target.value };
                              setCustomSchedule(updated);
                            }}
                            className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                          />
                          <span className="text-slate-300">-</span>
                          <input
                            type="time"
                            value={s.afternoonEnd}
                            onChange={(e) => {
                              const updated = [...customSchedule];
                              updated[idx] = { ...updated[idx], afternoonEnd: e.target.value };
                              setCustomSchedule(updated);
                            }}
                            className="w-full px-1.5 py-1 text-xs border border-slate-200 rounded-lg bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic py-1">Jour non travaillé</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
        </div>
      )}

      {/* TAB 2: SECURITY & PIN */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Change PIN Form */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7">
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Modifier mon Code PIN</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Code à 6 chiffres utilisé pour votre authentification sécurisée
                </p>
              </div>
            </div>

            {pinFeedback && (
              <div
                className={`p-3.5 rounded-2xl text-xs flex items-center gap-2.5 mb-5 ${
                  pinFeedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {pinFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="font-medium">{pinFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handlePinChange} className="space-y-4 max-w-md text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Code PIN actuel</label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={currentPinInput}
                  onChange={(e) => setCurrentPinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Nouveau code PIN (6 chiffres)</label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={newPinInput}
                  onChange={(e) => setNewPinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Confirmer le nouveau code PIN</label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="••••••"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
              >
                Mettre à jour le code PIN
              </button>
            </form>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1.5">
            <div className="font-bold text-slate-800 flex items-center gap-2">
              <Lock className="w-4 h-4 text-indigo-600" />
              <span>Consignes de sécurité du compte</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Votre code PIN est strictement personnel. Il vous engage juridiquement lors de la validation électronique de vos feuilles de temps conformément à l'article 1367 du Code civil.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: CONFIDENTIALITÉ & RGPD */}
      {activeTab === 'gdpr' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <span>Protection des Données & Vos Droits RGPD</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Règlement UE 2016/679
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Garantie de transparence, sécurité et portabilité de vos données personnelles et professionnelles.
                  </p>
                </div>
              </div>

              <button
                type="button"
                id="btn-userprofile-download-gdpr"
                onClick={handleDownloadMyPersonalData}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger mes données (JSON)</span>
              </button>
            </div>

            {downloadSuccess && (
              <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Votre archive personnelle de données (format JSON conforme Art. 20 RGPD) a été générée et téléchargée avec succès.</span>
              </div>
            )}
          </div>

          {/* Portabilité & Contenu de l'archive */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Droit à la portabilité de vos données (Article 20 du RGPD)</span>
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Vous avez le droit de recevoir les données à caractère personnel vous concernant que vous avez fournies à l'entreprise, dans un format structuré, couramment utilisé et lisible par machine (JSON). L'archive exportée contient l'intégralité de vos informations :
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <strong className="text-slate-800">1. Identité & Profil</strong>
                <p className="text-[11px] text-slate-500">Nom, prénom, email professionnel, matricule, rôle et statut d'activité.</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <strong className="text-slate-800">2. Contrat & Horaires contractuels</strong>
                <p className="text-[11px] text-slate-500">Intitulé du poste, département, base 35h/39h et planning hebdomadaire de référence.</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <strong className="text-slate-800">3. Relevés de temps & Pointages</strong>
                <p className="text-[11px] text-slate-500">Historique de vos feuilles de temps mensuelles, heures réelles, pauses et congés.</p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <strong className="text-slate-800">4. Soldes & Heures supplémentaires</strong>
                <p className="text-[11px] text-slate-500">Cumul de vos heures supplémentaires acquises, jours de congés payés et arrêts maladie.</p>
              </div>
            </div>
          </div>

          {/* Durée légale de conservation */}
          <div className="bg-slate-50 rounded-3xl border border-slate-200 p-6 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 flex-1">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span>Conservation légale des pointages : 5 ans</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                    Art. L. 3171-4 C. Trav.
                  </span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  En application de l'article L. 3171-4 du Code du travail, les documents et données informatiques nécessaires au décompte de la durée du travail doivent être conservés pendant <strong>5 ans</strong> à la disposition des agents de contrôle de l'Inspection du Travail et pour répondre aux obligations de prescription des salaires (Art. L. 3245-1).
                </p>
                <div className="text-xs text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-200 font-medium">
                  <strong>Note sur le droit à l'effacement :</strong> Conformément à l'article 17.3.b du RGPD, le droit à l'oubli / effacement immédiat ne peut s'exercer sur les relevés d'heures pendant cette durée légale obligatoire de 5 ans.
                </div>
              </div>
            </div>
          </div>

          {/* Vos Droits et Contact DPO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
              <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Vos Droits (Articles 15 à 22 RGPD)</span>
              </h5>
              <ul className="space-y-1.5 text-slate-600 text-[11px] list-disc list-inside">
                <li>Droit d'accès et d'obtention d'une copie de vos données</li>
                <li>Droit de rectification en cas d'horaires erronés</li>
                <li>Droit à la limitation du traitement (gel des données)</li>
                <li>Droit de réclamation auprès de la CNIL (cnil.fr)</li>
              </ul>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 p-5 space-y-2">
              <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>Contact Délégué à la Protection des Données</span>
              </h5>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Pour toute question relative à la protection de vos données ou pour exercer vos droits, vous pouvez contacter le DPO :
              </p>
              <div className="p-2.5 rounded-xl bg-slate-50 font-mono text-[11px] text-slate-800 font-semibold border border-slate-200">
                dpo@entreprise.fr
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
