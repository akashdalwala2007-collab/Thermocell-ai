import React from 'react';
import { Shield, Check, AlertTriangle, X } from 'lucide-react';

export interface SafetyCheck {
  id: string;
  name: string;
  status: 'Normal' | 'Warning' | 'Critical';
  threshold: string;
}

interface SafetyThresholdsCardProps {
  checks?: SafetyCheck[];
}

export const SafetyThresholdsCard: React.FC<SafetyThresholdsCardProps> = ({
  checks = [],
}) => {
  const total = checks.length;
  const passCount = checks.filter((c) => c.status === 'Normal').length;
  const allPass = total > 0 && passCount === total;

  return (
    <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] transition-all">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-[#142340]">
        <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
          <Shield className="w-3.5 h-3.5" />
        </div>
        <h3 className="text-xs font-semibold text-slate-200">
          Safety & Thresholds
        </h3>
      </div>

      {/* Safety Checks List */}
      <div className="flex flex-col gap-2.5 my-2">
        {checks.map((item) => {
          const isNormal = item.status === 'Normal';
          const isWarning = item.status === 'Warning';

          return (
            <div
              key={item.id}
              className="flex items-center justify-between py-0.5 text-xs group/row"
            >
              <div className="flex items-center gap-2.5">
                {/* Status indicator circle */}
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center border ${
                    isNormal
                      ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]'
                      : isWarning
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.3)]'
                      : 'bg-rose-500/20 border-rose-500/60 text-rose-400 shadow-[0_0_6px_rgba(239,68,68,0.3)]'
                  }`}
                >
                  {isNormal ? (
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  ) : isWarning ? (
                    <AlertTriangle className="w-2.5 h-2.5" />
                  ) : (
                    <X className="w-2.5 h-2.5 stroke-[3]" />
                  )}
                </div>
                <span className="font-medium text-slate-200 group-hover/row:text-white transition-colors">
                  {item.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`font-semibold text-[11px] ${
                    isNormal
                      ? 'text-emerald-400'
                      : isWarning
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {item.status}
                </span>
                <span className="text-slate-500 font-mono text-[10px]">
                  {item.threshold}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-500 pt-2 border-t border-[#142340] flex items-center justify-between">
        <span>Hardware Interlock Guard</span>
        <span
          className={`font-semibold ${
            allPass ? 'text-emerald-400' : 'text-amber-400'
          }`}
        >
          {total > 0
            ? allPass
              ? `ALL PASS (${passCount}/${total})`
              : `${passCount}/${total} PASS`
            : '—'}
        </span>
      </div>
    </div>
  );
};
