import React, { useEffect, useState, useRef } from 'react';
import {
  Clock,
  CalendarCheck,
  CheckSquare,
  Archive,
  Users,
  User,
  LogOut,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Bell,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { UserProfile } from '../types';

export type NavTab = 'timesheet' | 'validation' | 'history' | 'admin' | 'profile';

interface HeaderProps {
  currentUser: UserProfile;
  currentTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout: () => void;
  onResetDemo: () => void;
  pendingCount: number;
}

export function Header({
  currentUser,
  currentTab,
  onTabChange,
  onLogout,
  onResetDemo,
  pendingCount,
}: HeaderProps) {
  // Inactivity countdown: 10 minutes (600 seconds)
  const [inactiveSecondsLeft, setInactiveSecondsLeft] = useState(600);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const onLogoutRef = useRef(onLogout);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    let lastActivityTime = Date.now();

    const handleActivity = () => {
      lastActivityTime = Date.now();
      setInactiveSecondsLeft(600);
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    const timer = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - lastActivityTime) / 1000);
      const remaining = Math.max(0, 600 - elapsedSeconds);
      setInactiveSecondsLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        // Dispatch logout outside the React render / state-update phase
        setTimeout(() => {
          onLogoutRef.current();
        }, 0);
      }
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      clearInterval(timer);
    };
  }, []);

  const formatInactiveTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isValidator = currentUser.roles.includes('validator') || currentUser.roles.includes('admin');
  const isAdmin = currentUser.roles.includes('admin');

  return (
    <header className="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 shrink-0">
              <Clock className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base sm:text-lg text-slate-900 tracking-tight leading-none">
                  Horaires & Paie
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100">
                  Bento Flow
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium tracking-wide uppercase hidden sm:block mt-1">
                Suivi du temps, report M-1 & validation RH
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => onTabChange('timesheet')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'timesheet'
                  ? 'bg-slate-100 text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <CalendarCheck className="w-4 h-4" />
              <span>Saisie d'heures</span>
            </button>

            {isValidator && (
              <button
                onClick={() => onTabChange('validation')}
                className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentTab === 'validation'
                    ? 'bg-slate-100 text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                <span>Panneau Validation</span>
                {pendingCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500 text-white animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => onTabChange('history')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'history'
                  ? 'bg-slate-100 text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Archive className="w-4 h-4" />
              <span>Historique & Archives</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => onTabChange('admin')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  currentTab === 'admin'
                    ? 'bg-slate-100 text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Administration RH</span>
              </button>
            )}
          </nav>

          {/* Right Action Area */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Inactivity indicator */}
            <div
              className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200"
              title="Déconnexion automatique après 10 minutes d'inactivité pour sécurité sur poste partagé"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-medium">Auto-lock : {formatInactiveTime(inactiveSecondsLeft)}</span>
            </div>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((prev) => !prev)}
                className={`relative p-2 rounded-xl border transition-all cursor-pointer ${
                  notificationsOpen
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
                title="Notifications de soumission et de validation"
              >
                <Bell className="w-4 h-4" />
                {pendingCount > 0 && isValidator && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white font-bold text-[10px] flex items-center justify-center shadow-xs animate-pulse">
                    {pendingCount}
                  </span>
                )}
              </button>

              {/* Notifications Popover */}
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 z-50 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-xs text-slate-900">Centre de notifications</span>
                    </div>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="py-3 space-y-2.5 max-h-72 overflow-y-auto text-xs">
                    {pendingCount > 0 && isValidator ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1.5">
                        <div className="flex items-center gap-2 text-amber-900 font-bold">
                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Feuilles en attente ({pendingCount})</span>
                        </div>
                        <p className="text-slate-600 text-[11px] leading-relaxed">
                          {pendingCount} feuille(s) d'heures soumise(s) par vos collaborateurs nécessitent votre examen et validation.
                        </p>
                        <button
                          onClick={() => {
                            setNotificationsOpen(false);
                            onTabChange('validation');
                          }}
                          className="mt-1 w-full py-1.5 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition-colors cursor-pointer text-center block"
                        >
                          Ouvrir le panneau de validation
                        </button>
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="text-[11px]">Aucune feuille en attente d'approbation.</span>
                      </div>
                    )}

                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                      <div className="font-semibold text-slate-800">Rappel soumission :</div>
                      <p className="mt-0.5 text-slate-500">
                        Chaque collaborateur doit cliquer sur « Soumettre pour validation » pour transmettre sa fiche d'heures.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Button */}
            <button
              onClick={() => onTabChange('profile')}
              className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-left transition-all cursor-pointer ${
                currentTab === 'profile'
                  ? 'bg-indigo-50/70 border-indigo-200 ring-2 ring-indigo-500/20'
                  : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {currentUser.firstName[0]}
                {currentUser.lastName[0]}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-slate-900 leading-tight">
                  {currentUser.firstName} {currentUser.lastName}
                </div>
                <div className="text-[10px] text-slate-400 font-medium leading-tight">
                  {currentUser.roles.includes('admin')
                    ? 'Admin RH'
                    : currentUser.roles.includes('validator')
                    ? 'Valideur'
                    : 'Collaborateur'}
                </div>
              </div>
            </button>

            {/* Reset / Clear All Timesheets Button */}
            <button
              onClick={() => {
                if (
                  window.confirm(
                    'Supprimer toutes les feuilles de temps et repartir de 0 ?\nToutes les fiches de temps enregistrées seront effacées pour tester le processus depuis le début.'
                  )
                ) {
                  onResetDemo();
                }
              }}
              title="Supprimer toutes les fiches de temps et repartir de 0"
              className="p-2 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Logout button */}
            <button
              onClick={onLogout}
              title="Déconnexion"
              className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="flex md:hidden items-center justify-around py-2.5 border-t border-slate-200 text-xs overflow-x-auto gap-1">
          <button
            onClick={() => onTabChange('timesheet')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 ${
              currentTab === 'timesheet' ? 'bg-slate-100 text-indigo-600 shadow-xs' : 'text-slate-500'
            }`}
          >
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>Saisie</span>
          </button>

          {isValidator && (
            <button
              onClick={() => onTabChange('validation')}
              className={`relative px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 ${
                currentTab === 'validation' ? 'bg-slate-100 text-indigo-600 shadow-xs' : 'text-slate-500'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Validation</span>
              {pendingCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </button>
          )}

          <button
            onClick={() => onTabChange('history')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 ${
              currentTab === 'history' ? 'bg-slate-100 text-indigo-600 shadow-xs' : 'text-slate-500'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archives</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => onTabChange('admin')}
              className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 ${
                currentTab === 'admin' ? 'bg-slate-100 text-indigo-600 shadow-xs' : 'text-slate-500'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Admin RH</span>
            </button>
          )}

          <button
            onClick={() => onTabChange('profile')}
            className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 ${
              currentTab === 'profile' ? 'bg-slate-100 text-indigo-600 shadow-xs' : 'text-slate-500'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Profil</span>
          </button>
        </div>
      </div>
    </header>
  );
}
