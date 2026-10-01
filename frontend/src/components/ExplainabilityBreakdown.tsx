import React from 'react';
import { HelpCircle, Zap, Flame, Compass, Maximize2 } from 'lucide-react';

interface ExplainabilityBreakdownProps {
  features: Record<string, number> | null;
}

export const ExplainabilityBreakdown: React.FC<ExplainabilityBreakdownProps> = ({ features }) => {
  if (!features || Object.keys(features).length === 0) {
    return null;
  }

  const dcir = features['DCIR'] ?? 0;
  const deltaT = features['ΔT_bulk'] ?? 0;
  const gradient = features['∇T_tab-body'] ?? 0;
  const variance = features['σ²_T'] ?? 0;
  const eccentricity = features['hotspot_eccentricity'] ?? 0;

  const dcirStatus = dcir <= 0.1167 ? 'NOMINAL' : dcir <= 0.20 ? 'MODERATE' : 'CRITICAL';
  const deltaTStatus = deltaT <= 2.5 ? 'NOMINAL' : deltaT <= 4.5 ? 'ELEVATED' : 'CRITICAL';
  const spatialStatus = variance <= 0.015 && gradient <= 0.15 ? 'UNIFORM' : 'NON-UNIFORM';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400" />
          Explainable Feature Diagnostics
        </h3>
        <span className="text-xs text-slate-400">Physical Degradation Evidence</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {/* DCIR */}
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 flex items-start justify-between">
          <div>
            <span className="text-slate-400 flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              Internal Resistance (DCIR)
            </span>
            <span className="text-lg font-mono font-bold text-white">{dcir.toFixed(4)} Ω</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Threshold: ≤ 0.1167 Ω</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              dcirStatus === 'NOMINAL'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : dcirStatus === 'MODERATE'
                ? 'bg-amber-950 text-amber-300 border-amber-800'
                : 'bg-rose-950 text-rose-300 border-rose-800'
            }`}
          >
            {dcirStatus}
          </span>
        </div>

        {/* ΔT_bulk */}
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 flex items-start justify-between">
          <div>
            <span className="text-slate-400 flex items-center gap-1.5 mb-1">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Bulk Temperature Rise (ΔT)
            </span>
            <span className="text-lg font-mono font-bold text-white">+{deltaT.toFixed(2)} °C</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Tripwire: &gt; 4.50 °C</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              deltaTStatus === 'NOMINAL'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-amber-950 text-amber-300 border-amber-800'
            }`}
          >
            {deltaTStatus}
          </span>
        </div>

        {/* Tab-Body Gradient */}
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 flex items-start justify-between">
          <div>
            <span className="text-slate-400 flex items-center gap-1.5 mb-1">
              <Compass className="w-3.5 h-3.5 text-indigo-400" />
              Tab-to-Body Gradient (∇T)
            </span>
            <span className="text-lg font-mono font-bold text-white">{gradient.toFixed(3)} °C</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Contact Resistance Indicator</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              spatialStatus === 'UNIFORM'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-amber-950 text-amber-300 border-amber-800'
            }`}
          >
            {spatialStatus}
          </span>
        </div>

        {/* Hotspot Eccentricity */}
        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 flex items-start justify-between">
          <div>
            <span className="text-slate-400 flex items-center gap-1.5 mb-1">
              <Maximize2 className="w-3.5 h-3.5 text-rose-400" />
              Hotspot Eccentricity
            </span>
            <span className="text-lg font-mono font-bold text-white">{eccentricity.toFixed(2)} px</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Localized Heat Asymmetry</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {eccentricity <= 1.0 ? 'CENTERED' : 'OFF-AXIS'}
          </span>
        </div>
      </div>
    </div>
  );
};
