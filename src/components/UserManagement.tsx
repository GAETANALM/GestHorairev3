import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Edit2,
  UserX,
  UserCheck,
  KeyRound,
  Shield,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  Briefcase,
  AlertTriangle,
  Calculator,
  Copy,
  Info,
  X,
  Search,
  ArrowUpDown,
  Building2,
  RotateCcw,
  SlidersHorizontal,
  Download,
  FileText,
  Lock,
  User,
  Check,
} from 'lucide-react';
import { DaySchedule, Role, UserContract, UserProfile } from '../types';
import { contract35h, contract39h, contract28h } from '../data/mockData';
import {
  calculateIntervalHours,
  calculateScheduleStandardHours,
  formatHours,
  getFrenchDayName,
} from '../utils/timeCalculations';

interface UserManagementProps {
  users: UserProfile[];
  onUpdateUsers: (updated: UserProfile[], updatedUserId?: string, applyScheduleToDrafts?: boolean) => void;
  currentAdmin: UserProfile;
}

export function UserManagement({ users, onUpdateUsers, currentAdmin }: UserManagementProps) {
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [applyScheduleToDrafts, setApplyScheduleToDrafts] = useState<boolean>(true);
  const [formError, setFormError] = useState<string>('');

  // Filter state: show deactivated accounts only if checkbox is checked
  const [showDeactivated, setShowDeactivated] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [alphabeticalSort, setAlphabeticalSort] = useState<'name_asc' | 'name_desc' | 'firstname_asc'>('name_asc');
  const [selectedLetter, setSelectedLetter] = useState<string>('all');

  const [confirmModal, setConfirmModal] = useState<{
    user: UserProfile;
    action: 'deactivate' | 'activate';
  } | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
    details?: string;
  } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Derived user counts & departments
  const activeUsers = useMemo(() => users.filter((u) => u.isActive !== false), [users]);
  const deactivatedUsers = useMemo(() => users.filter((u) => u.isActive === false), [users]);
  const deactivatedCount = deactivatedUsers.length;

  const availableDepartments = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.contract?.department) {
        set.add(u.contract.department);
      }
    });
    return Array.from(set).sort();
  }, [users]);

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    users.forEach((u) => {
      const char = (u.lastName || u.firstName || '')[0]?.toUpperCase();
      if (char) letters.add(char);
    });
    return letters;
  }, [users]);

  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      selectedRole !== 'all' ||
      selectedDepartment !== 'all' ||
      selectedLetter !== 'all' ||
      alphabeticalSort !== 'name_asc' ||
      showDeactivated
    );
  }, [
    searchQuery,
    selectedRole,
    selectedDepartment,
    selectedLetter,
    alphabeticalSort,
    showDeactivated,
  ]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedRole('all');
    setSelectedDepartment('all');
    setSelectedLetter('all');
    setAlphabeticalSort('name_asc');
    setShowDeactivated(false);
  };

  // Filtered & sorted users according to all active criteria
  const displayedUsers = useMemo(() => {
    return users
      .filter((u) => {
        // 1. Deactivated filter
        const isUserActive = u.isActive !== false;
        if (!showDeactivated && !isUserActive) return false;

        // 2. Role filter
        if (selectedRole !== 'all') {
          if (!u.roles.includes(selectedRole as Role)) return false;
        }

        // 3. Department filter
        if (selectedDepartment !== 'all') {
          if (u.contract?.department !== selectedDepartment) return false;
        }

        // 4. Alphabetical initial letter filter
        if (selectedLetter !== 'all') {
          const char = (u.lastName || u.firstName || '')[0]?.toUpperCase();
          if (char !== selectedLetter) return false;
        }

        // 5. Search query (first name, last name, email, id, contract title, department)
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
          const reverseName = `${u.lastName} ${u.firstName}`.toLowerCase();
          const email = (u.email || '').toLowerCase();
          const id = (u.id || '').toLowerCase();
          const dept = (u.contract?.department || '').toLowerCase();
          const title = (u.contract?.title || '').toLowerCase();

          const matches =
            fullName.includes(q) ||
            reverseName.includes(q) ||
            email.includes(q) ||
            id.includes(q) ||
            dept.includes(q) ||
            title.includes(q);

          if (!matches) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (alphabeticalSort === 'name_asc') {
          const cmp = a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' });
          if (cmp !== 0) return cmp;
          return a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' });
        }
        if (alphabeticalSort === 'name_desc') {
          const cmp = b.lastName.localeCompare(a.lastName, 'fr', { sensitivity: 'base' });
          if (cmp !== 0) return cmp;
          return b.firstName.localeCompare(a.firstName, 'fr', { sensitivity: 'base' });
        }
        if (alphabeticalSort === 'firstname_asc') {
          const cmp = a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' });
          if (cmp !== 0) return cmp;
          return a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' });
        }
        return 0;
      });
  }, [
    users,
    showDeactivated,
    selectedRole,
    selectedDepartment,
    selectedLetter,
    searchQuery,
    alphabeticalSort,
  ]);

  // Form states for creating / editing
  const [modalTab, setModalTab] = useState<'identity' | 'contract' | 'gdpr'>('identity');
  const [formData, setFormData] = useState<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    pin: string;
    roles: Role[];
    isActive: boolean;
    contractTitle: string;
    contractDepartment: string;
    contractWeeklyHours: number;
    defaultSchedule: DaySchedule[];
    gdprRetentionNoticeAcknowledged: boolean;
    gdprConsentSignedDate: string;
    gdprAllowAuditLogging: boolean;
    gdprNotes: string;
  }>({
    id: '',
    firstName: '',
    lastName: '',
    email: '',
    pin: '123456',
    roles: ['employee'],
    isActive: true,
    contractTitle: 'Contrat Standard 35h',
    contractDepartment: 'Opérations',
    contractWeeklyHours: 35,
    defaultSchedule: contract35h.defaultSchedule.map((s) => ({
      ...s,
      standardHours: calculateScheduleStandardHours(
        s.isWorked,
        s.morningStart,
        s.morningEnd,
        s.afternoonStart,
        s.afternoonEnd
      ),
    })),
    gdprRetentionNoticeAcknowledged: true,
    gdprConsentSignedDate: new Date().toISOString().slice(0, 10),
    gdprAllowAuditLogging: true,
    gdprNotes: '',
  });

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setIsCreatingNew(false);
    setModalTab('identity');

    const scheduleWithCalculatedHours: DaySchedule[] = (user.contract.defaultSchedule || []).map(
      (s) => ({
        ...s,
        standardHours: calculateScheduleStandardHours(
          s.isWorked,
          s.morningStart,
          s.morningEnd,
          s.afternoonStart,
          s.afternoonEnd
        ),
      })
    );

    const calculatedWeekly = Math.round(
      scheduleWithCalculatedHours.reduce(
        (sum, s) => sum + (s.isWorked ? s.standardHours : 0),
        0
      ) * 100
    ) / 100;

    setFormData({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      pin: user.pin,
      roles: [...user.roles],
      isActive: user.isActive,
      contractTitle: user.contract.title,
      contractDepartment: user.contract.department,
      contractWeeklyHours: calculatedWeekly || user.contract.weeklyHours,
      defaultSchedule: scheduleWithCalculatedHours,
      gdprRetentionNoticeAcknowledged: user.gdpr?.retentionNoticeAcknowledged ?? true,
      gdprConsentSignedDate: user.gdpr?.consentSignedDate || user.hireDate || new Date().toISOString().slice(0, 10),
      gdprAllowAuditLogging: user.gdpr?.allowAuditLogging ?? true,
      gdprNotes: user.gdpr?.notes || '',
    });
  };

  const handleOpenCreate = () => {
    setIsCreatingNew(true);
    setEditingUser(null);
    setModalTab('identity');
    const newId = `usr_${Date.now().toString(36)}`;

    const initialSchedule: DaySchedule[] = contract35h.defaultSchedule.map((s) => ({
      ...s,
      standardHours: calculateScheduleStandardHours(
        s.isWorked,
        s.morningStart,
        s.morningEnd,
        s.afternoonStart,
        s.afternoonEnd
      ),
    }));

    const calculatedWeekly = Math.round(
      initialSchedule.reduce((sum, s) => sum + (s.isWorked ? s.standardHours : 0), 0) * 100
    ) / 100;

    setFormData({
      id: newId,
      firstName: '',
      lastName: '',
      email: '',
      pin: '000000',
      roles: ['employee'],
      isActive: true,
      contractTitle: 'Contrat Standard 35h',
      contractDepartment: 'Services Généraux',
      contractWeeklyHours: calculatedWeekly || 35,
      defaultSchedule: initialSchedule,
      gdprRetentionNoticeAcknowledged: true,
      gdprConsentSignedDate: new Date().toISOString().slice(0, 10),
      gdprAllowAuditLogging: true,
      gdprNotes: '',
    });
  };

  const handleScheduleChange = (
    index: number,
    field: 'isWorked' | 'morningStart' | 'morningEnd' | 'afternoonStart' | 'afternoonEnd',
    value: boolean | string
  ) => {
    const updatedSchedule = formData.defaultSchedule.map((sched, idx) => {
      if (idx !== index) return sched;
      const updated: DaySchedule = { ...sched, [field]: value };

      // If user marks day as worked and times are empty, set sensible standard defaults
      if (field === 'isWorked' && value === true && !updated.morningStart && !updated.afternoonStart) {
        updated.morningStart = '09:00';
        updated.morningEnd = '12:30';
        updated.afternoonStart = '13:30';
        updated.afternoonEnd = '17:00';
      }

      // Automatically recalculate standard hours from morning and afternoon!
      updated.standardHours = calculateScheduleStandardHours(
        updated.isWorked,
        updated.morningStart,
        updated.morningEnd,
        updated.afternoonStart,
        updated.afternoonEnd
      );

      return updated;
    });

    // Automatically recalculate weekly contractual total based on the days
    const newWeeklyTotal = Math.round(
      updatedSchedule.reduce((acc, s) => acc + (s.isWorked ? s.standardHours : 0), 0) * 100
    ) / 100;

    setFormData({
      ...formData,
      defaultSchedule: updatedSchedule,
      contractWeeklyHours: newWeeklyTotal,
    });
  };

  const handleCopyMondayToWeekdays = () => {
    const monday = formData.defaultSchedule.find((s) => s.dayOfWeek === 1);
    if (!monday) return;

    const updatedSchedule = formData.defaultSchedule.map((sched) => {
      // Apply Monday's times to Tuesday through Friday (days 2 to 5)
      if (sched.dayOfWeek >= 2 && sched.dayOfWeek <= 5) {
        const updated = {
          ...sched,
          isWorked: monday.isWorked,
          morningStart: monday.morningStart,
          morningEnd: monday.morningEnd,
          afternoonStart: monday.afternoonStart,
          afternoonEnd: monday.afternoonEnd,
          standardHours: calculateScheduleStandardHours(
            monday.isWorked,
            monday.morningStart,
            monday.morningEnd,
            monday.afternoonStart,
            monday.afternoonEnd
          ),
        };
        return updated;
      }
      return sched;
    });

    const newWeeklyTotal = Math.round(
      updatedSchedule.reduce((acc, s) => acc + (s.isWorked ? s.standardHours : 0), 0) * 100
    ) / 100;

    setFormData({
      ...formData,
      defaultSchedule: updatedSchedule,
      contractWeeklyHours: newWeeklyTotal,
    });
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formData.firstName.trim() || !formData.lastName.trim() || !formData.email.trim()) {
      setFormError('Veuillez renseigner le prénom, nom et email professionnel.');
      return;
    }

    if (!/^\d{6}$/.test(formData.pin)) {
      setFormError('Le code PIN doit comporter exactement 6 chiffres.');
      return;
    }

    const updatedContract: UserContract = {
      title: formData.contractTitle,
      department: formData.contractDepartment,
      weeklyHours: formData.contractWeeklyHours,
      defaultSchedule: formData.defaultSchedule,
    };

    const userToSave: UserProfile = {
      id: formData.id,
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      email: formData.email.trim(),
      pin: formData.pin,
      roles: formData.roles,
      isActive: formData.isActive,
      contract: updatedContract,
      hireDate: editingUser?.hireDate || new Date().toISOString().slice(0, 10),
      gdpr: {
        retentionNoticeAcknowledged: formData.gdprRetentionNoticeAcknowledged,
        consentSignedDate: formData.gdprConsentSignedDate,
        allowAuditLogging: formData.gdprAllowAuditLogging,
        notes: formData.gdprNotes,
      },
    };

    if (isCreatingNew) {
      onUpdateUsers([...users, userToSave], userToSave.id, false);
    } else {
      onUpdateUsers(
        users.map((u) => (u.id === userToSave.id ? userToSave : u)),
        userToSave.id,
        applyScheduleToDrafts
      );
    }

    setEditingUser(null);
    setIsCreatingNew(false);
    setFormError('');
  };

  const handleExportUserGdprData = (targetUser?: UserProfile) => {
    const u = targetUser || editingUser;
    if (!u) return;

    const exportPayload = {
      exportMetadata: {
        dateExport: new Date().toISOString(),
        reglementation: "RGPD (UE 2016/679) & Code du travail Art. L.3171-4",
        typeDemande: "Portabilité & Droit d'accès aux données personnelles",
        emetteur: "Système de Gestion des Feuilles d'Heures & Paie",
      },
      collaborateur: {
        identifiant: u.id,
        prenom: u.firstName,
        nom: u.lastName,
        email: u.email,
        roles: u.roles,
        statutCompte: u.isActive ? "Actif" : "Désactivé (Archivé)",
        dateEmbauche: u.hireDate,
        contrat: {
          intitule: u.contract.title,
          departement: u.contract.department,
          heuresHebdomadaires: u.contract.weeklyHours,
          planningDefaut: u.contract.defaultSchedule,
        },
      },
      conformiteRgpd: {
        conservationLegaleAnnees: 5,
        baseLegale: "Obligation légale de l'employeur (Art. L.3171-4 et L.3245-1 du Code du travail, Art. 6.1.c RGPD)",
        noticeInformationAcceptee: formData.gdprRetentionNoticeAcknowledged,
        dateConsentement: formData.gdprConsentSignedDate,
        tracabiliteAuditActivee: formData.gdprAllowAuditLogging,
        observations: formData.gdprNotes || "Aucune restriction particulière signalée.",
      },
    };

    const dataBlob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `export_rgpd_${u.lastName}_${u.firstName}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToast({
      type: 'success',
      message: `Archive RGPD exportée avec succès pour ${u.firstName} ${u.lastName}`,
    });
  };

  // Deactivation handler - replacing permanent deletion
  const handleToggleActive = (user: UserProfile) => {
    if (user.id === currentAdmin.id) {
      setToast({
        type: 'error',
        message: 'Action non autorisée',
        details: 'Vous ne pouvez pas désactiver votre propre compte administrateur.',
      });
      return;
    }
    const action = user.isActive ? 'deactivate' : 'activate';
    setConfirmModal({ user, action });
  };

  const handleConfirmToggleActive = () => {
    if (!confirmModal) return;
    const { user, action } = confirmModal;
    const willBeActive = action === 'activate';

    const updatedUsers = users.map((u) =>
      u.id === user.id ? { ...u, isActive: willBeActive } : u
    );

    onUpdateUsers(updatedUsers, user.id, false);
    setConfirmModal(null);

    if (!willBeActive) {
      setToast({
        type: 'info',
        message: `Compte de ${user.firstName} ${user.lastName} désactivé`,
        details:
          "Le collaborateur est désormais masqué de l'annuaire. Cochez « Compte désactivé » pour l'afficher ou le réactiver.",
      });
    } else {
      setToast({
        type: 'success',
        message: `Compte de ${user.firstName} ${user.lastName} réactivé`,
        details:
          "Le collaborateur est à nouveau actif, visible dans l'annuaire et autorisé à se connecter.",
      });
    }
  };

  const handleApplyPreset = (preset: '35h' | '39h' | '28h') => {
    let baseSchedule: DaySchedule[] = [];
    let title = '';

    if (preset === '35h') {
      baseSchedule = JSON.parse(JSON.stringify(contract35h.defaultSchedule));
      title = contract35h.title;
    } else if (preset === '39h') {
      baseSchedule = JSON.parse(JSON.stringify(contract39h.defaultSchedule));
      title = contract39h.title;
    } else if (preset === '28h') {
      baseSchedule = JSON.parse(JSON.stringify(contract28h.defaultSchedule));
      title = contract28h.title;
    }

    const calculatedSchedule: DaySchedule[] = baseSchedule.map((s) => ({
      ...s,
      standardHours: calculateScheduleStandardHours(
        s.isWorked,
        s.morningStart,
        s.morningEnd,
        s.afternoonStart,
        s.afternoonEnd
      ),
    }));

    const weeklyTotal = Math.round(
      calculatedSchedule.reduce((acc, s) => acc + (s.isWorked ? s.standardHours : 0), 0) * 100
    ) / 100;

    setFormData((prev) => ({
      ...prev,
      contractTitle: title,
      contractWeeklyHours: weeklyTotal,
      defaultSchedule: calculatedSchedule,
    }));
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Administration des Collaborateurs & Contrats
            </h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              RH & Direction
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Gestion de l'annuaire, attribution des rôles (Salarié, Valideur, Admin), plannings contractuels et codes PIN
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Ajouter un collaborateur</span>
        </button>
      </div>

      {/* User Directory Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="font-bold text-slate-900 text-base">Annuaire des Utilisateurs</h3>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {displayedUsers.length} affiché{displayedUsers.length > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {activeUsers.length} collaborateur{activeUsers.length > 1 ? 's' : ''} actif{activeUsers.length > 1 ? 's' : ''}
              {deactivatedCount > 0 && !showDeactivated && (
                <span className="text-amber-600 font-semibold ml-1.5">
                  • {deactivatedCount} compte{deactivatedCount > 1 ? 's' : ''} désactivé{deactivatedCount > 1 ? 's' : ''} masqué{deactivatedCount > 1 ? 's' : ''}
                </span>
              )}
            </p>
          </div>

          {/* Filter checkbox: Compte désactivé */}
          <label
            id="label-filter-deactivated"
            htmlFor="checkbox-compte-desactive"
            className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all select-none ${
              showDeactivated
                ? 'bg-amber-50 border-amber-300 text-amber-950 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <input
              type="checkbox"
              id="checkbox-compte-desactive"
              checked={showDeactivated}
              onChange={(e) => setShowDeactivated(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
            />
            <div className="flex items-center gap-1.5">
              <span>Compte désactivé</span>
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  showDeactivated
                    ? 'bg-amber-200 text-amber-900'
                    : 'bg-slate-200 text-slate-600'
                }`}
                title={`${deactivatedCount} compte(s) désactivé(s)`}
              >
                {deactivatedCount}
              </span>
            </div>
          </label>
        </div>

        {/* Advanced Filters & Search Toolbar */}
        <div className="p-4 sm:p-5 bg-slate-50/60 border-b border-slate-200 space-y-3.5">
          {/* Row 1: Search bar, Role filter, Department filter, Sort dropdown, Reset button */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher par nom, prénom, matricule, contrat, email..."
                className="w-full pl-9.5 pr-9 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Effacer la recherche"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter controls */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5">
              {/* Role Filter */}
              <div className="flex items-center gap-1.5 min-w-[140px] flex-1 sm:flex-none">
                <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  title="Filtrer par rôle"
                >
                  <option value="all">Tous les rôles</option>
                  <option value="employee">Salarié / Collaborateur</option>
                  <option value="validator">Valideur</option>
                  <option value="admin">Admin RH</option>
                </select>
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-1.5 min-w-[150px] flex-1 sm:flex-none">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                <select
                  value={selectedDepartment}
                  onChange={(e) => setSelectedDepartment(e.target.value)}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  title="Filtrer par département"
                >
                  <option value="all">Tous les départements</option>
                  {availableDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>

              {/* Alphabetical Sort Dropdown */}
              <div className="flex items-center gap-1.5 min-w-[130px] flex-1 sm:flex-none">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                <select
                  value={alphabeticalSort}
                  onChange={(e) => setAlphabeticalSort(e.target.value as any)}
                  className="w-full sm:w-auto px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  title="Ordre alphabétique de tri"
                >
                  <option value="name_asc">Nom (A → Z)</option>
                  <option value="name_desc">Nom (Z → A)</option>
                  <option value="firstname_asc">Prénom (A → Z)</option>
                </select>
              </div>

              {/* Reset Filters button */}
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-200/80 hover:bg-slate-300/80 text-slate-700 font-semibold text-xs transition-colors cursor-pointer shrink-0"
                  title="Réinitialiser tous les filtres"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Réinitialiser</span>
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Alphabetical Letters A-Z Bar */}
          <div className="flex items-center gap-1 pt-1 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1.5 flex items-center gap-1">
              <span>Lettre :</span>
            </span>

            <button
              onClick={() => setSelectedLetter('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 ${
                selectedLetter === 'all'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              Toutes
            </button>

            {['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'].map((letter) => {
              const hasUsers = availableLetters.has(letter);
              const isSelected = selectedLetter === letter;

              return (
                <button
                  key={letter}
                  disabled={!hasUsers}
                  onClick={() => setSelectedLetter(isSelected ? 'all' : letter)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-2xs ring-2 ring-indigo-300'
                      : hasUsers
                      ? 'bg-white hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200'
                      : 'bg-slate-100/50 text-slate-300 border border-slate-100 cursor-not-allowed opacity-40'
                  }`}
                  title={hasUsers ? `Filtrer par les noms commençant par ${letter}` : `Aucun collaborateur en ${letter}`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-4 px-4">Collaborateur</th>
                <th className="py-4 px-3">Statut</th>
                <th className="py-4 px-3">Rôles attribués</th>
                <th className="py-4 px-3">Département & Contrat</th>
                <th className="py-4 px-3">Code PIN</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <Users className="w-8 h-8 text-slate-300" />
                      <p className="text-xs font-semibold text-slate-600">
                        {hasActiveFilters
                          ? 'Aucun collaborateur ne correspond aux filtres et critères sélectionnés.'
                          : 'Aucun collaborateur trouvé dans cette vue.'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          onClick={handleResetFilters}
                          className="mt-1.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-colors cursor-pointer border border-indigo-200 shadow-2xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Réinitialiser les filtres</span>
                        </button>
                      )}
                      {deactivatedCount > 0 && !showDeactivated && (
                        <p className="text-[11px] text-amber-700 font-medium mt-1">
                          {deactivatedCount} compte{deactivatedCount > 1 ? 's' : ''} désactivé{deactivatedCount > 1 ? 's' : ''} masqué{deactivatedCount > 1 ? 's' : ''}. Cochez la case « Compte désactivé » pour l'afficher.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayedUsers.map((u) => {
                  const isUserActive = u.isActive !== false;
                  return (
                    <tr
                      key={u.id}
                      className={`transition-colors ${
                        isUserActive
                          ? 'hover:bg-slate-50/80'
                          : 'bg-slate-50/60 opacity-85 hover:opacity-100 hover:bg-slate-100/60'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold text-xs ${
                              isUserActive ? 'text-slate-900' : 'text-slate-500 line-through'
                            }`}
                          >
                            {u.firstName} {u.lastName}
                          </span>
                          {!isUserActive && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200">
                              Désactivé
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </td>

                      <td className="py-3.5 px-3">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                            isUserActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-200 text-slate-700 border border-slate-300'
                          }`}
                        >
                          {isUserActive ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="flex flex-wrap gap-1.5">
                          {u.roles.includes('employee') && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Salarié
                            </span>
                          )}
                          {u.roles.includes('validator') && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                              Valideur
                            </span>
                          )}
                          {u.roles.includes('admin') && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                              Admin RH
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className="font-semibold text-slate-800 text-xs">{u.contract.department}</div>
                        <div className="text-[11px] text-slate-500">
                          {u.contract.weeklyHours}h/sem • {u.contract.title}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-slate-700">
                        •••••• <span className="text-[10px] text-slate-400 font-normal">({u.pin})</span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            id={`btn-edit-${u.id}`}
                            onClick={() => handleOpenEdit(u)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer shadow-xs"
                            title="Modifier profil et contrat"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Deactivate / Reactivate button - permanent deletion is disabled */}
                          {isUserActive ? (
                            <button
                              id={`btn-deactivate-${u.id}`}
                              disabled={u.id === currentAdmin.id}
                              onClick={() => handleToggleActive(u)}
                              className={`p-2 rounded-xl transition-colors cursor-pointer shadow-xs ${
                                u.id === currentAdmin.id
                                  ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                  : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                              }`}
                              title={
                                u.id === currentAdmin.id
                                  ? 'Impossible de désactiver votre propre compte administrateur'
                                  : 'Désactiver le compte (le rend invisible sauf si la case est cochée)'
                              }
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              id={`btn-reactivate-${u.id}`}
                              onClick={() => handleToggleActive(u)}
                              className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer shadow-xs"
                              title="Réactiver le compte"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT USER MODAL */}
      {(editingUser || isCreatingNew) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-base">
                {isCreatingNew ? 'Nouveau Collaborateur' : `Modifier : ${formData.firstName} ${formData.lastName}`}
              </h3>
              <button
                onClick={() => {
                  setEditingUser(null);
                  setIsCreatingNew(false);
                }}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs Navigation */}
            <div className="bg-slate-100/90 px-6 pt-3 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
              <button
                type="button"
                id="btn-modal-tab-identity"
                onClick={() => setModalTab('identity')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  modalTab === 'identity'
                    ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border-transparent'
                }`}
              >
                <User className="w-3.5 h-3.5 text-indigo-600" />
                <span>Identité & Rôles</span>
              </button>

              <button
                type="button"
                id="btn-modal-tab-contract"
                onClick={() => setModalTab('contract')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  modalTab === 'contract'
                    ? 'bg-white text-indigo-700 border-indigo-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border-transparent'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                <span>Contrat & Horaires</span>
              </button>

              <button
                type="button"
                id="btn-modal-tab-gdpr"
                onClick={() => setModalTab('gdpr')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                  modalTab === 'gdpr'
                    ? 'bg-white text-emerald-700 border-emerald-600 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border-transparent'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span className="flex items-center gap-1.5">
                  <span>Confidentialité & RGPD</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Conformité
                  </span>
                </span>
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveUser} className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* TAB 1: IDENTITÉ & RÔLES */}
              {modalTab === 'identity' && (
                <div className="space-y-6">
                  {/* Personal details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Prénom</label>
                      <input
                        type="text"
                        required
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Nom</label>
                      <input
                        type="text"
                        required
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Email professionnel</label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Code PIN de connexion (6 chiffres)
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        required
                        value={formData.pin}
                        onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Roles selection */}
                  <div>
                    <label className="block text-slate-700 font-semibold mb-2">Rôles & Habilitations</label>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.roles.includes('employee')}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...formData.roles, 'employee' as Role]
                              : formData.roles.filter((r) => r !== 'employee');
                            setFormData({ ...formData, roles: next });
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-slate-800">Collaborateur (isEmployee)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.roles.includes('validator')}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...formData.roles, 'validator' as Role]
                              : formData.roles.filter((r) => r !== 'validator');
                            setFormData({ ...formData, roles: next });
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-slate-800">Valideur / Manager (isValidator)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.roles.includes('admin')}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...formData.roles, 'admin' as Role]
                              : formData.roles.filter((r) => r !== 'admin');
                            setFormData({ ...formData, roles: next });
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium text-slate-800">Administrateur RH (isAdmin)</span>
                      </label>
                    </div>
                  </div>

                  {/* Account active status control (deletion is disabled, deactivation makes user invisible) */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <label className="block text-slate-900 font-bold text-xs">
                          Statut d'activation du compte
                        </label>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          La suppression définitive est proscrite pour conserver l'historique légal (paie et audit). La désactivation masque le compte et suspend ses accès.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={editingUser?.id === currentAdmin.id}
                          onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                            formData.isActive
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300'
                          } ${editingUser?.id === currentAdmin.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {formData.isActive ? (
                            <>
                              <UserCheck className="w-4 h-4" />
                              <span>Compte Actif (Visible)</span>
                            </>
                          ) : (
                            <>
                              <UserX className="w-4 h-4" />
                              <span>Compte Désactivé (Masqué)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                    {!formData.isActive && (
                      <div className="text-[11px] text-amber-900 bg-amber-50 p-3 rounded-xl border border-amber-200 font-medium flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <span>
                          Ce compte sera masqué de l'annuaire RH. Pour le faire réapparaître, vous devrez cocher la case <strong>« Compte désactivé »</strong>. L'utilisateur ne pourra plus s'authentifier.
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: CONTRAT & HORAIRES */}
              {modalTab === 'contract' && (
                <div className="space-y-6">
                  {/* Contract settings & Presets */}
              <div className="pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-900 text-sm">Contrat de Travail & Horaires</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-medium">Modèles prédéfinis :</span>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset('35h')}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-semibold"
                    >
                      35h Standard
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset('39h')}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-semibold"
                    >
                      39h Opérations
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset('28h')}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded text-[11px] font-semibold"
                    >
                      28h (Temps partiel)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-slate-600 mb-1">Intitulé du contrat</label>
                    <input
                      type="text"
                      value={formData.contractTitle}
                      onChange={(e) => setFormData({ ...formData, contractTitle: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1">Département</label>
                    <input
                      type="text"
                      value={formData.contractDepartment}
                      onChange={(e) => setFormData({ ...formData, contractDepartment: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-600">Base hebdomadaire contractuelle</label>
                      <span className="text-[10px] text-indigo-600 font-semibold">
                        Calculée : {formatHours(formData.contractWeeklyHours)}
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.5"
                        value={formData.contractWeeklyHours}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            contractWeeklyHours: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 bg-indigo-50/40"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                        h / sem.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Day-by-day weekly default schedule (Lundi au Dimanche) */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Planning hebdomadaire type & heures standard</span>
                        </h5>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                          Calcul automatique
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Pour chaque jour, le compte d'heures standard est calculé automatiquement à partir des plages du matin et de l'après-midi.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopyMondayToWeekdays}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer shrink-0"
                      title="Copie les horaires du lundi sur mardi, mercredi, jeudi et vendredi"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copier Lundi sur Mar-Ven</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-100 text-slate-700 font-bold text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3 w-32">Jour</th>
                          <th className="py-2.5 px-2 w-20 text-center">Travaillé</th>
                          <th className="py-2.5 px-3">Matin (Début - Fin)</th>
                          <th className="py-2.5 px-3">Après-midi (Début - Fin)</th>
                          <th className="py-2.5 px-3 text-right w-44">Heures standard calculées</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {formData.defaultSchedule.map((sched, idx) => {
                          const morningDur = sched.isWorked
                            ? calculateIntervalHours(sched.morningStart, sched.morningEnd)
                            : 0;
                          const afternoonDur = sched.isWorked
                            ? calculateIntervalHours(sched.afternoonStart, sched.afternoonEnd)
                            : 0;
                          const hasTimeError =
                            sched.isWorked &&
                            ((sched.morningStart &&
                              sched.morningEnd &&
                              sched.morningEnd <= sched.morningStart) ||
                              (sched.afternoonStart &&
                                sched.afternoonEnd &&
                                sched.afternoonEnd <= sched.afternoonStart));

                          return (
                            <tr
                              key={sched.dayOfWeek}
                              className={
                                !sched.isWorked
                                  ? 'bg-slate-50/70 text-slate-400'
                                  : 'hover:bg-slate-50/60 transition-colors'
                              }
                            >
                              {/* Day Name */}
                              <td className="py-2.5 px-3 font-semibold text-slate-800 text-xs">
                                {getFrenchDayName(sched.dayOfWeek)}
                              </td>

                              {/* Is Worked checkbox */}
                              <td className="py-2.5 px-2 text-center">
                                <label className="inline-flex items-center justify-center cursor-pointer p-1">
                                  <input
                                    type="checkbox"
                                    checked={sched.isWorked}
                                    onChange={(e) =>
                                      handleScheduleChange(idx, 'isWorked', e.target.checked)
                                    }
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </label>
                              </td>

                              {/* Morning Times */}
                              <td className="py-2.5 px-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="time"
                                      disabled={!sched.isWorked}
                                      value={sched.morningStart}
                                      onChange={(e) =>
                                        handleScheduleChange(idx, 'morningStart', e.target.value)
                                      }
                                      className="w-20 px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400 bg-white"
                                    />
                                    <span className="text-slate-400">-</span>
                                    <input
                                      type="time"
                                      disabled={!sched.isWorked}
                                      value={sched.morningEnd}
                                      onChange={(e) =>
                                        handleScheduleChange(idx, 'morningEnd', e.target.value)
                                      }
                                      className="w-20 px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400 bg-white"
                                    />
                                  </div>
                                  {sched.isWorked && morningDur > 0 && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      Matin : {formatHours(morningDur)} ({morningDur.toFixed(2)}h)
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Afternoon Times */}
                              <td className="py-2.5 px-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="time"
                                      disabled={!sched.isWorked}
                                      value={sched.afternoonStart}
                                      onChange={(e) =>
                                        handleScheduleChange(idx, 'afternoonStart', e.target.value)
                                      }
                                      className="w-20 px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400 bg-white"
                                    />
                                    <span className="text-slate-400">-</span>
                                    <input
                                      type="time"
                                      disabled={!sched.isWorked}
                                      value={sched.afternoonEnd}
                                      onChange={(e) =>
                                        handleScheduleChange(idx, 'afternoonEnd', e.target.value)
                                      }
                                      className="w-20 px-1.5 py-1 border border-slate-200 rounded-lg text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400 bg-white"
                                    />
                                  </div>
                                  {sched.isWorked && afternoonDur > 0 && (
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      Après-midi : {formatHours(afternoonDur)} ({afternoonDur.toFixed(2)}h)
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Standard Hours (Computed automatically) */}
                              <td className="py-2.5 px-3 text-right">
                                {!sched.isWorked ? (
                                  <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-400 font-medium text-[11px]">
                                    0h00 (Repos)
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="inline-flex items-center gap-1 font-bold text-xs font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg shadow-2xs">
                                      <Clock className="w-3 h-3 text-indigo-500" />
                                      {formatHours(sched.standardHours)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">
                                      {sched.standardHours.toFixed(2)}h / jour
                                    </span>
                                    {hasTimeError && (
                                      <span className="text-[10px] text-rose-600 font-semibold mt-0.5">
                                        Fin &le; Début !
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t border-slate-200 text-xs">
                        <tr>
                          <td colSpan={4} className="py-3 px-3">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                                <Calculator className="w-4 h-4 text-indigo-600" />
                                Total hebdomadaire calculé (Lundi au Dimanche) :
                              </span>
                              <span className="text-[11px] text-slate-500 hidden sm:inline">
                                Somme des heures standard journalières
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="font-mono font-bold text-indigo-700 text-sm">
                              {formatHours(formData.contractWeeklyHours)}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {formData.contractWeeklyHours.toFixed(2)}h / semaine
                            </div>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Option to propagate new schedule to drafts */}
              {!isCreatingNew && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/80 border border-indigo-200 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs text-indigo-950">
                      Mettre à jour les feuilles d'heures en cours (brouillons)
                    </div>
                    <div className="text-[11px] text-indigo-700">
                      Applique automatiquement ces nouveaux horaires par défaut sur la feuille du mois en cours et prévisionnel.
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={applyScheduleToDrafts}
                      onChange={(e) => setApplyScheduleToDrafts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              )}
                </div>
              )}

              {/* TAB 3: CONFIDENTIALITÉ & RGPD */}
              {modalTab === 'gdpr' && (
                <div className="space-y-6">
                  {/* GDPR Header Information Banner */}
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          <span>Protection des Données & Conformité RGPD</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Règlement UE 2016/679
                          </span>
                        </h4>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          Encadrement légal du traitement des temps de travail, traçabilité des pointages et respect des droits des salariés.
                        </p>
                      </div>
                    </div>

                    {editingUser && (
                      <button
                        type="button"
                        id="btn-export-gdpr-user"
                        onClick={() => handleExportUserGdprData(editingUser)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-emerald-100/60 text-emerald-800 border border-emerald-300 font-bold text-xs transition-colors cursor-pointer shadow-2xs shrink-0"
                        title="Générer l'archive JSON pour la portabilité des données"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Exporter les données (JSON)</span>
                      </button>
                    )}
                  </div>

                  {/* Conservation légale 5 ans */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <h5 className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <span>Durée légale de conservation des pointages : 5 ans</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                            Art. L. 3171-4 C. Trav.
                          </span>
                        </h5>
                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                          Conformément à l’article L. 3171-4 du Code du travail, les documents nécessaires au décompte de la durée du travail (feuilles de temps, pointages, relevés des heures supplémentaires et des repos compensateurs) doivent être conservés pendant <strong>5 ans</strong> à la disposition de l’Inspection du Travail et pour satisfaire aux règles de prescription salariale (Art. L. 3245-1).
                        </p>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-white p-3 rounded-xl border border-slate-200">
                          <div>
                            <span className="text-slate-500 font-medium">Date d'embauche déclarée :</span>{' '}
                            <strong className="text-slate-800">
                              {editingUser ? new Date(editingUser.hireDate).toLocaleDateString('fr-FR') : 'Nouveau collaborateur'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 font-medium">Règle de purge / archivage :</span>{' '}
                            <strong className="text-slate-800">Archivage intermédiaire 5 ans après clôture</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Registre des finalités autorisées */}
                  <div className="space-y-2">
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Finalités du traitement & Base légale RH</span>
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-700">
                        <div className="font-bold text-[11px] text-indigo-700 mb-1">1. Décompte du temps de travail</div>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Suivi des heures effectives, des heures supplémentaires et du repos compensateur.
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-700">
                        <div className="font-bold text-[11px] text-indigo-700 mb-1">2. Établissement de la paie</div>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Transmission certifiée des éléments variables et justificatifs aux services RH et paie.
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-700">
                        <div className="font-bold text-[11px] text-indigo-700 mb-1">3. Contrôle de conformité</div>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Respect des durées maximales quotidiennes (10h) et hebdomadaires (48h) de travail.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Consentement & Traçabilité */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                    <h5 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Droits du salarié & Traçabilité RH</span>
                    </h5>

                    <div className="space-y-2.5">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.gdprRetentionNoticeAcknowledged}
                          onChange={(e) =>
                            setFormData({ ...formData, gdprRetentionNoticeAcknowledged: e.target.checked })
                          }
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 text-xs">
                            Notice d'information RGPD remise et acceptée par le collaborateur
                          </span>
                          <p className="text-[11px] text-slate-500">
                            Le collaborateur a été informé de la finalité de la collecte, des destinataires et de ses droits d’accès, de rectification et de portabilité.
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.gdprAllowAuditLogging}
                          onChange={(e) =>
                            setFormData({ ...formData, gdprAllowAuditLogging: e.target.checked })
                          }
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 mt-0.5 cursor-pointer"
                        />
                        <div>
                          <span className="font-semibold text-slate-800 text-xs">
                            Journalisation d'audit & sécurité activée
                          </span>
                          <p className="text-[11px] text-slate-500">
                            Chaque soumission et validation de feuille d'heures est horodatée avec traçabilité de l'auteur et du valideur.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">
                          Date de consentement / prise de connaissance
                        </label>
                        <input
                          type="date"
                          value={formData.gdprConsentSignedDate}
                          onChange={(e) =>
                            setFormData({ ...formData, gdprConsentSignedDate: e.target.value })
                          }
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 font-semibold mb-1">
                          Délégué à la Protection des Données (DPO)
                        </label>
                        <input
                          type="text"
                          readOnly
                          value="dpo@entreprise.fr (Référent RH & Conformité)"
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs bg-slate-100 text-slate-600 font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">
                        Observations et mentions particulières (Registre DPO)
                      </label>
                      <textarea
                        rows={2}
                        value={formData.gdprNotes}
                        onChange={(e) => setFormData({ ...formData, gdprNotes: e.target.value })}
                        placeholder="Ex : Référence fiche registre de traitement RH-04, demande spécifique..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  {/* Notice droit à l'effacement */}
                  <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-900">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Information sur le droit à l'effacement (Droit à l'oubli) :</strong> Conformément à l’article 17.3.b du RGPD, le droit à l’effacement ne peut être exercé par le collaborateur sur ses relevés d'heures tant que court le délai légal obligatoire de conservation de 5 ans fixé par le Code du travail. En cas de départ, la procédure conforme consiste à désactiver le compte (archivage intermédiaire sans suppression des feuilles).
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
                  {formError}
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-5 border-t border-slate-200 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setIsCreatingNew(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-sm cursor-pointer"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: DEACTIVATE / REACTIVATE (Permanent deletion is forbidden) */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  confirmModal.action === 'deactivate'
                    ? 'bg-amber-100 text-amber-700 border border-amber-200'
                    : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }`}
              >
                {confirmModal.action === 'deactivate' ? (
                  <UserX className="w-6 h-6" />
                ) : (
                  <UserCheck className="w-6 h-6" />
                )}
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-base">
                  {confirmModal.action === 'deactivate'
                    ? `Désactiver le compte de ${confirmModal.user.firstName} ${confirmModal.user.lastName}`
                    : `Réactiver le compte de ${confirmModal.user.firstName} ${confirmModal.user.lastName}`}
                </h3>
                <p className="text-xs text-slate-500">
                  {confirmModal.user.contract.department} • {confirmModal.user.email}
                </p>
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl text-xs space-y-2 ${
                confirmModal.action === 'deactivate'
                  ? 'bg-amber-50/80 border border-amber-200 text-amber-950'
                  : 'bg-emerald-50/80 border border-emerald-200 text-emerald-950'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-amber-700" />
                <span>Règle de conformité et audit social</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {confirmModal.action === 'deactivate'
                  ? "Conformément aux exigences RH, la suppression définitive est proscrite afin de préserver l'historique légal des feuilles d'heures et des paies. Le compte sera désactivé : il deviendra invisible dans l'annuaire sauf si la case « Compte désactivé » est cochée, et le collaborateur ne pourra plus se connecter."
                  : "Le compte de ce collaborateur sera réactivé : il réapparaîtra dans l'annuaire actif et pourra à nouveau se connecter pour enregistrer ses heures de travail."}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                id="btn-confirm-toggle-active"
                onClick={handleConfirmToggleActive}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-colors shadow-xs flex items-center gap-2 cursor-pointer ${
                  confirmModal.action === 'deactivate'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmModal.action === 'deactivate' ? (
                  <>
                    <UserX className="w-4 h-4" />
                    <span>Confirmer la désactivation</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Réactiver le compte</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-xl border flex items-start gap-3 max-w-md animate-in slide-in-from-bottom-5 duration-200 ${
            toast.type === 'success'
              ? 'bg-slate-900 text-white border-emerald-500/50 shadow-emerald-950/20'
              : toast.type === 'error'
              ? 'bg-slate-900 text-white border-rose-500/50 shadow-rose-950/20'
              : 'bg-slate-900 text-white border-amber-500/50 shadow-amber-950/20'
          }`}
        >
          <div className="mt-0.5">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : toast.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            ) : (
              <Info className="w-5 h-5 text-amber-400" />
            )}
          </div>
          <div className="flex-1 space-y-0.5">
            <div className="font-bold text-xs">{toast.message}</div>
            {toast.details && (
              <div className="text-[11px] text-slate-300 leading-relaxed">{toast.details}</div>
            )}
          </div>
          <button
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
