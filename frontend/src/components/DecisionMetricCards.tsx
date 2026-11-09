import React from 'react';
import {
  BatteryCharging,
  Leaf,
  Zap,
  Thermometer,
  Calendar,
  AlertTriangle,
  ShieldX,
} from 'lucide-react';

interface DecisionMetricCardsProps {
  decision?: 'REUSE' | 'INVESTIGATE' | 'RETIRE';
  dcir?: number; // e.g. 0.148
  dcirDelta?: number; // e.g. -12.3
  maxTemp?: number; // e.g. 32.4
  tempDelta?: number; // e.g. -4.6
  avgVoltage?: number; // e.g. 3.71
  voltageDelta?: number; // e.g. +0.8
  estimatedCycles?: number; // e.g. 2480
  lifespanDelta?: number; // e.g. +18.2
  isSampleData?: boolean;
}

export const DecisionMetricCards: React.FC<DecisionMetricCardsProps> = ({
  decision = 'REUSE',
  dcir,
  dcirDelta,
  maxTemp,
  tempDelta,
  avgVoltage,
  voltageDelta,
  estimatedCycles,
  lifespanDelta,
  isSampleData = false,
}) => {
  const isReuse = decision === 'REUSE';
  const isRetire = decision === 'RETIRE';

  const decisionConfig = isReuse
    ? {
        titleColor: 'text-emerald-400',
        subtitle: 'Suitable for second-life applications',
        Icon: Leaf,
        iconColor: 'text-emerald-400',
        borderColor: 'border-[#142340] hover:border-emerald-500/40',
      }
    : isRetire
    ? {
        titleColor: 'text-rose-400',
        subtitle: 'Relegate to recycling / safety lockout',
        Icon: ShieldX,
        iconColor: 'text-rose-400',
        borderColor: 'border-[#142340] hover:border-rose-500/40',
      }
    : {
        titleColor: 'text-amber-400',
        subtitle: 'Intermediate degradation or anomaly',
        Icon: AlertTriangle,
        iconColor: 'text-amber-400',
        borderColor: 'border-[#142340] hover:border-amber-500/40',
      };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {/* 1. Final Decision Card */}
      <div
        className={`bg-[#08101e] border rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all ${decisionConfig.borderColor} group relative overflow-hidden`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <BatteryCharging className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
              Final Decision {isSampleData && <span className="text-amber-400 font-normal lowercase">(sample)</span>}
            </span>
          </div>
          <decisionConfig.Icon className={`w-4 h-4 ${decisionConfig.iconColor} opacity-90`} />
        </div>

        <div className="mt-2.5">
          <span
            className={`text-2xl font-black tracking-wider block font-sans ${decisionConfig.titleColor}`}
          >
            {decision}
          </span>
          <span className="text-[10px] text-slate-400 font-normal block mt-0.5 line-clamp-1">
            {decisionConfig.subtitle}
          </span>
        </div>
      </div>

      {/* 2. DCIR Metric Card */}
      <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all group">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0d1c33] border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-400">DCIR</span>
        </div>

        <div className="mt-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white font-mono">
              {dcir !== undefined && !isNaN(dcir) ? `${dcir.toFixed(3)} Ω` : '—'}
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-400 flex items-center">
              {dcirDelta !== undefined && !isNaN(dcirDelta)
                ? `${dcirDelta < 0 ? '↓' : '↑'} ${Math.abs(dcirDelta).toFixed(1)}%`
                : isSampleData
                ? '↓ 12.3%'
                : '—'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {isSampleData ? '(sample data)' : '(vs. last cycle)'}
          </span>
        </div>
      </div>

      {/* 3. Temperature (Max) Card */}
      <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all group">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0d1c33] border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <Thermometer className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Temperature <span className="text-slate-500 font-normal">(Max)</span>
          </span>
        </div>

        <div className="mt-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white font-mono">
              {maxTemp !== undefined && !isNaN(maxTemp) ? `${maxTemp.toFixed(1)} °C` : '—'}
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-400 flex items-center">
              {tempDelta !== undefined && !isNaN(tempDelta)
                ? `${tempDelta < 0 ? '↓' : '↑'} ${Math.abs(tempDelta).toFixed(1)}%`
                : isSampleData
                ? '↓ 4.6%'
                : '—'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {isSampleData ? '(sample data)' : '(vs. last cycle)'}
          </span>
        </div>
      </div>

      {/* 4. Voltage (Avg) Card */}
      <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all group">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0d1c33] border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Voltage <span className="text-slate-500 font-normal">(Avg)</span>
          </span>
        </div>

        <div className="mt-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white font-mono">
              {avgVoltage !== undefined && !isNaN(avgVoltage) ? `${avgVoltage.toFixed(2)} V` : '—'}
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-400 flex items-center">
              {voltageDelta !== undefined && !isNaN(voltageDelta)
                ? `${voltageDelta < 0 ? '↓' : '↑'} ${Math.abs(voltageDelta).toFixed(1)}%`
                : isSampleData
                ? '↑ 0.8%'
                : '—'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {isSampleData ? '(sample data)' : '(vs. last cycle)'}
          </span>
        </div>
      </div>

      {/* 5. Estimated Lifespan Card */}
      <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-4 flex flex-col justify-between shadow-[0_4px_20px_rgba(0,0,0,0.5)] transition-all group">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0d1c33] border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Estimated Lifespan
          </span>
        </div>

        <div className="mt-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white font-mono">
              {estimatedCycles !== undefined && !isNaN(estimatedCycles) ? `${estimatedCycles.toLocaleString()} ` : '— '}
              {estimatedCycles !== undefined && !isNaN(estimatedCycles) && <span className="text-xs font-sans text-slate-300">cycles</span>}
            </span>
            <span className="text-[10px] font-mono font-semibold text-emerald-400 flex items-center">
              {lifespanDelta !== undefined && !isNaN(lifespanDelta)
                ? `${lifespanDelta < 0 ? '↓' : '↑'} ${Math.abs(lifespanDelta).toFixed(1)}%`
                : isSampleData
                ? '↑ 18.2%'
                : '—'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {isSampleData ? '(sample data)' : '(NASA degradation model)'}
          </span>
        </div>
      </div>
    </div>
  );
};
