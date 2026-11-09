import React from 'react';
import { motion } from 'framer-motion';

interface OverallHealthGaugeProps {
  sohPercentage?: number; // e.g. 84
  statusText?: string; // 'GOOD' | 'WARNING' | 'CRITICAL'
  statusNote?: string; // 'No critical issues detected'
}

export const OverallHealthGauge: React.FC<OverallHealthGaugeProps> = ({
  sohPercentage = 84,
  statusText,
  statusNote = 'No critical issues detected',
}) => {
  // SVG circular arc configuration
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (sohPercentage / 100) * circumference;

  const isGood = statusText != null
    ? statusText.toUpperCase() === 'GOOD'
    : sohPercentage >= 80;
  const isInvestigate = statusText != null
    ? statusText.toUpperCase() === 'WARNING' || statusText.toUpperCase() === 'INVESTIGATE'
    : (sohPercentage >= 70 && sohPercentage < 80);

  const themeConfig = isGood
    ? {
        badgeBg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-400',
        dotColor: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
        strokeColor: 'url(#healthCyanEmeraldGrad)',
        glow: 'rgba(16, 185, 129, 0.3)',
      }
    : isInvestigate
    ? {
        badgeBg: 'bg-amber-950/80 border-amber-500/40 text-amber-400',
        dotColor: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]',
        strokeColor: '#f59e0b',
        glow: 'rgba(245, 158, 11, 0.3)',
      }
    : {
        badgeBg: 'bg-rose-950/80 border-rose-500/40 text-rose-400',
        dotColor: 'bg-rose-400 shadow-[0_0_8px_#f87171]',
        strokeColor: '#ef4444',
        glow: 'rgba(239, 68, 68, 0.3)',
      };

  return (
    <div className="bg-[#08101e] border border-[#142340] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] hover:border-[#1e3b66] transition-all group">
      {/* Title */}
      <h3 className="text-xs font-semibold text-slate-300 tracking-wide">
        Overall Health
      </h3>

      {/* Main Body: Gauge on Left, Badge & Note on Right */}
      <div className="flex items-center gap-5 mt-2">
        {/* Circular Progress Gauge */}
        <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <defs>
              <linearGradient
                id="healthCyanEmeraldGrad"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Track Circle */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="#0e1b30"
              strokeWidth="7"
              fill="none"
            />

            {/* Glowing Active Arc */}
            <motion.circle
              cx="50"
              cy="50"
              r={radius}
              stroke={themeConfig.strokeColor}
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              style={{
                filter: `drop-shadow(0 0 6px ${themeConfig.glow})`,
              }}
            />
          </svg>

          {/* Center Value */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black text-white font-mono tracking-tight leading-none">
              {sohPercentage}%
            </span>
            <span className="text-[9px] text-slate-400 font-medium tracking-tight mt-1">
              State of Health
            </span>
          </div>
        </div>

        {/* Right Info: Badge & Assessment */}
        <div className="flex flex-col items-start gap-2">
          {/* Status Badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold border ${themeConfig.badgeBg}`}
          >
            {/* Diamond Shape */}
            <span className={`w-2 h-2 rotate-45 rounded-[1px] inline-block ${themeConfig.dotColor}`} />
            <span>{statusText || (isGood ? 'GOOD' : isInvestigate ? 'INVESTIGATE' : 'RETIRE')}</span>
          </div>

          {/* Supporting Assessment Note */}
          <p className="text-xs text-slate-400 leading-snug font-normal max-w-[130px]">
            {statusNote}
          </p>
        </div>
      </div>
    </div>
  );
};
