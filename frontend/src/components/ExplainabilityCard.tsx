import React from 'react';
import { FileText, ArrowRight } from 'lucide-react';

interface ExplainabilityCardProps {
  decision?: 'REUSE' | 'INVESTIGATE' | 'RETIRE';
  sohPercentage?: number;
  dcir?: number;
  deltaT?: number;
  onViewReport?: () => void;
}

export const ExplainabilityCard: React.FC<ExplainabilityCardProps> = ({
  decision = 'REUSE',
  sohPercentage = 84,
  dcir = 0.148,
  deltaT = 2.1,
  onViewReport,
}) => {
  const isReuse = decision === 'REUSE';
  const isRetire = decision === 'RETIRE';

  const bullets = isReuse
    ? [
        `SoH is above 80% (${sohPercentage}%)`,
        `DCIR is within safe limits (${dcir.toFixed(3)} Ω)`,
        `Temperature rise is stable (ΔT = ${deltaT.toFixed(1)}°C)`,
        'No abnormal patterns detected in voltage or thermal data',
      ]
    : isRetire
    ? [
        `SoH has degraded below retirement tripwire (${sohPercentage}%)`,
        `Internal impedance exceeds maximum tolerance (${dcir.toFixed(3)} Ω)`,
        `Thermal acceleration detected during discharge pulse (ΔT = ${deltaT.toFixed(1)}°C)`,
        'Relegate cell to recycling to prevent thermal runaway hazard',
      ]
    : [
        `SoH falls in intermediate evaluation band (${sohPercentage}%)`,
        `DCIR exhibits marginal rise (${dcir.toFixed(3)} Ω)`,
        `Thermal spatial distribution shows localized tab gradient`,
        'Additional cycle testing recommended before final second-life assignment',
      ];

  return (
    <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] transition-all">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-[#142340]">
        <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <FileText className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-semibold text-slate-200">Explainability</h3>
      </div>

      {/* Content */}
      <div className="my-2 flex flex-col gap-2">
        <p className="text-xs text-slate-300 font-medium leading-relaxed">
          The battery is classified as <strong className="text-white font-bold">{decision}</strong> due to:
        </p>

        <ul className="flex flex-col gap-1.5 text-xs text-slate-400 leading-normal pl-1">
          {bullets.map((bullet, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1.5 shadow-[0_0_4px_#38bdf8]" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action Button: View Detailed Report */}
      <div className="pt-2 border-t border-[#142340]">
        <button
          onClick={onViewReport}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[#0b172e] hover:bg-[#122344] text-cyan-300 hover:text-cyan-200 border border-cyan-500/30 hover:border-cyan-400/50 text-xs font-semibold transition-all shadow-[0_0_12px_rgba(6,182,212,0.15)] group"
        >
          <span>View Detailed Report</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
