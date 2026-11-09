import React from 'react';
import { Zap } from 'lucide-react';

export const PromoCard: React.FC = () => {
  return (
    <div className="bg-gradient-to-br from-[#08101e] to-[#050b16] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] relative overflow-hidden group transition-all">
      {/* Ambient background glow */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

      {/* Top Icon */}
      <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4 shadow-[0_0_12px_rgba(6,182,212,0.3)]">
        <Zap className="w-4 h-4" />
      </div>

      {/* Taglines */}
      <div className="relative z-10 flex flex-col gap-1 mb-8">
        <span className="text-base font-extrabold text-white tracking-tight leading-tight">
          Better Data.
        </span>
        <span className="text-base font-extrabold text-white tracking-tight leading-tight">
          Smarter Decisions.
        </span>
        <span className="text-base font-extrabold text-cyan-400 tracking-tight leading-tight drop-shadow-[0_0_10px_rgba(6,182,212,0.4)]">
          Longer Battery Life.
        </span>
      </div>

      {/* Bottom Neon Wave Illustration */}
      <div className="absolute -bottom-2 right-0 w-48 h-24 pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity">
        <svg viewBox="0 0 160 80" fill="none" className="w-full h-full">
          <path
            d="M0 60 C 40 20, 80 80, 160 20"
            stroke="#06b6d4"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="drop-shadow-[0_0_12px_rgba(6,182,212,0.9)]"
          />
          <path
            d="M20 70 C 60 30, 100 85, 160 35"
            stroke="#0284c7"
            strokeWidth="1.5"
            opacity="0.6"
          />
          <path
            d="M40 75 C 80 40, 120 90, 160 50"
            stroke="#38bdf8"
            strokeWidth="1"
            opacity="0.3"
          />
        </svg>
      </div>

      <div className="text-[10px] text-slate-500 pt-2 border-t border-[#142340] relative z-10 flex items-center justify-between">
        <span>ThermoCell Foundation</span>
        <span className="text-cyan-400 font-mono">v1.2-PRO</span>
      </div>
    </div>
  );
};
