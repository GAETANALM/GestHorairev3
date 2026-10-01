import React, { useState, useEffect } from 'react';
import { Shield, Lock, ArrowRight, UserCheck, AlertTriangle, KeyRound, Clock } from 'lucide-react';
import { UserProfile } from '../types';

interface LoginScreenProps {
  users: UserProfile[];
  onLogin: (user: UserProfile) => void;
}

export function LoginScreen({ users, onLogin }: LoginScreenProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[1]?.id || users[0]?.id || '');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTimer, setLockoutTimer] = useState(0);

  // Lockout countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (lockoutTimer > 0) {
      interval = setInterval(() => {
        setLockoutTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [lockoutTimer]);

  const selectedUser = users.find((u) => u.id === selectedUserId) || users[0];

  const handlePinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (lockoutTimer > 0) return;

    if (!selectedUser) {
      setError('Veuillez sélectionner un utilisateur.');
      return;
    }

    if (selectedUser.isActive === false) {
      setError('Ce compte est désactivé par l\'administration RH.');
      return;
    }

    if (pin === selectedUser.pin) {
      setError(null);
      setFailedAttempts(0);
      onLogin(selectedUser);
    } else {
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);
      if (newAttempts >= 5) {
        setLockoutTimer(30);
        setError('Compte temporairement verrouillé pour 30 secondes (sécurité anti-bruteforce).');
      } else {
        setError(`Code PIN incorrect. Tentative ${newAttempts}/5.`);
      }
      setPin('');
    }
  };

  const handleKeypadPress = (digit: string) => {
    if (lockoutTimer > 0) return;
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 6) {
        // Auto-check on 6th digit
        if (nextPin === selectedUser?.pin) {
          setError(null);
          setFailedAttempts(0);
          onLogin(selectedUser);
        } else {
          const newAttempts = failedAttempts + 1;
          setFailedAttempts(newAttempts);
          if (newAttempts >= 5) {
            setLockoutTimer(30);
            setError('Sécurité anti-bruteforce activée : verrouillage 30s.');
          } else {
            setError(`Code PIN incorrect. Tentative ${newAttempts}/5.`);
          }
          setPin('');
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleQuickLogin = (user: UserProfile) => {
    setSelectedUserId(user.id);
    setPin(user.pin);
    setError(null);
    onLogin(user);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      {/* Background decor */}
      <div className="w-full max-w-md bg-slate-850/90 bg-slate-800 border border-slate-700/80 rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden">
        {/* Card Header */}
        <div className="p-6 sm:p-8 bg-slate-900/60 border-b border-slate-700/60 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 mb-3">
            <Clock className="w-7 h-7" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Suivi & Validation des Horaires
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Gestion du temps de travail, heures sup. et préparation paie
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          {/* User selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Collaborateur
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {users.map((u) => {
                const isSelected = u.id === selectedUserId;
                const isLucas = u.id === 'usr_lucas';
                const isSophie = u.id === 'usr_sophie';
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUserId(u.id);
                      setPin('');
                      setError(null);
                    }}
                    className={`text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm ring-1 ring-indigo-500/50'
                        : 'bg-slate-900/40 border-slate-700/60 text-slate-300 hover:bg-slate-700/40'
                    }`}
                  >
                    <div className="font-semibold text-xs sm:text-sm truncate">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between mt-0.5">
                      <span>{u.contract.weeklyHours}h/sem</span>
                      {isSophie && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">
                          RH
                        </span>
                      )}
                      {isLucas && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                          M-1 +8h
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* PIN Display & Input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold uppercase tracking-wider">
                Code PIN sécurisé (6 chiffres)
              </span>
              <span className="text-slate-400">
                Code démo : <strong className="text-indigo-400">{selectedUser?.pin}</strong>
              </span>
            </div>

            {/* 6 Dots / Digits Indicator */}
            <div className="flex justify-center items-center gap-2.5 sm:gap-3 py-2">
              {[0, 1, 2, 3, 4, 5].map((index) => {
                const hasDigit = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`w-10 h-12 rounded-2xl border flex items-center justify-center font-mono text-lg font-bold transition-all ${
                      hasDigit
                        ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-sm shadow-indigo-500/20'
                        : 'bg-slate-900/50 border-slate-700 text-slate-500'
                    }`}
                  >
                    {hasDigit ? '•' : ''}
                  </div>
                );
              })}
            </div>

            {/* Error or Lockout Notification */}
            {lockoutTimer > 0 ? (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-2xl text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>
                  Verrouillage temporaire anti-bruteforce. Patientez <strong>{lockoutTimer}s</strong>.
                </span>
              </div>
            ) : error ? (
              <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-2xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={lockoutTimer > 0}
                  onClick={() => handleKeypadPress(digit)}
                  className="h-12 rounded-2xl bg-slate-700/50 hover:bg-slate-700 active:scale-95 border border-slate-600/40 font-semibold text-base sm:text-lg text-white transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin('')}
                disabled={lockoutTimer > 0 || pin.length === 0}
                className="h-12 rounded-2xl bg-slate-800/60 hover:bg-slate-700/70 active:scale-95 text-xs font-medium text-slate-400 border border-slate-700/60 transition-all cursor-pointer disabled:opacity-40"
              >
                Effacer
              </button>
              <button
                type="button"
                disabled={lockoutTimer > 0}
                onClick={() => handleKeypadPress('0')}
                className="h-12 rounded-2xl bg-slate-700/50 hover:bg-slate-700 active:scale-95 border border-slate-600/40 font-semibold text-base sm:text-lg text-white transition-all cursor-pointer disabled:opacity-40"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                disabled={lockoutTimer > 0 || pin.length === 0}
                className="h-12 rounded-2xl bg-slate-800/60 hover:bg-slate-700/70 active:scale-95 text-xs font-medium text-slate-400 border border-slate-700/60 transition-all cursor-pointer disabled:opacity-40"
              >
                ⌫
              </button>
            </div>
          </div>

          {/* Quick Connect Demo Buttons */}
          <div className="pt-2 border-t border-slate-700/60">
            <div className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider mb-2 text-center">
              Accès Démo Direct en 1-Clic
            </div>
            <div className="flex flex-wrap gap-2 justify-center">
              {users.map((u) => (
                <button
                  key={`quick_${u.id}`}
                  type="button"
                  onClick={() => handleQuickLogin(u)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-700/40 hover:bg-indigo-600 hover:text-white text-slate-300 border border-slate-600/40 transition-colors cursor-pointer"
                >
                  {u.firstName} ({u.roles.includes('admin') ? 'RH' : u.contract.weeklyHours + 'h'})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Card Footer */}
        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-700/60 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Chiffrement AES & Session sécurisée</span>
          </div>
          <span>v2.4.0</span>
        </div>
      </div>
    </div>
  );
}
