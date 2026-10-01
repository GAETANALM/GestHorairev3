import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

export function GdprBanner() {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('svh_gdpr_dismissed') === 'true';
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem('svh_gdpr_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div className="bg-slate-900/95 backdrop-blur text-slate-200 border-t border-slate-700 px-4 py-3 fixed bottom-0 left-0 right-0 z-40 shadow-2xl transition-all">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <p className="leading-relaxed">
            <strong className="text-white font-semibold">Conformité RGPD & Sécurité :</strong> Vos données de pointage, horaires contractuels et motifs d'absence sont traitées exclusivement pour la gestion des temps et l'établissement de la paie. Persistance hybride sécurisée (Cloud & cache local chiffré).
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
          <button
            onClick={handleDismiss}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors cursor-pointer text-xs shadow-sm"
          >
            J'ai compris
          </button>
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
