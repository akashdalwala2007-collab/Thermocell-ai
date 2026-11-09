import React from 'react';
import { motion } from 'framer-motion';

interface BatteryOverviewCardProps {
  cellId: string;
  voltage: number;
  capacityAh?: number;
  chemistry?: string;
  isConnected?: boolean;
  lastDiagnosticDate?: string;
  lastDiagnosticDuration?: string;
  dataSourceLabel?: string;
  provenance?: 'REAL' | 'SYNTHETIC' | 'PREDICTED';
}

export const BatteryOverviewCard: React.FC<BatteryOverviewCardProps> = ({
  cellId = 'B-001',
  voltage = 3.71,
  capacityAh = 2.5,
  chemistry = 'Li-ion',
  isConnected = true,
  lastDiagnosticDate = '20 Apr 2025  |  14:20',
  lastDiagnosticDuration = '10.2s',
  dataSourceLabel = 'Real Sensor Data',
  provenance = 'REAL',
}) => {
  // Format cell name if plain id (e.g., 'B0005' -> 'B-005')
  const formattedId = cellId.startsWith('B00')
    ? `#B-${cellId.replace('B00', '')}`
    : cellId.startsWith('HW')
    ? `#${cellId}`
    : `#${cellId}`;

  return (
    <div className="bg-[#08101e] border border-[#142340] rounded-2xl p-5 flex flex-col md:flex-row items-center gap-6 shadow-[0_4px_25px_rgba(0,0,0,0.6)] relative overflow-hidden group hover:border-[#1e3b66] transition-all">
      {/* Subtle ambient cyan glow behind the battery */}
      <div className="absolute top-1/2 left-16 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Left: Futuristic Illuminated 3D Battery Graphic */}
      <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
        <svg
          viewBox="0 0 160 160"
          className="w-full h-full drop-shadow-[0_0_20px_rgba(6,182,212,0.6)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Ambient Radial Glow on Pedestal */}
            <radialGradient id="pedestalGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
              <stop offset="60%" stopColor="#0284c7" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#08101e" stopOpacity="0" />
            </radialGradient>

            {/* Battery Cylinder Gradient */}
            <linearGradient id="batteryBody" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#03254c" />
              <stop offset="25%" stopColor="#075985" />
              <stop offset="50%" stopColor="#0284c7" />
              <stop offset="70%" stopColor="#0369a1" />
              <stop offset="100%" stopColor="#021c38" />
            </linearGradient>

            {/* Specular Highlight Streak */}
            <linearGradient id="specularStreak" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
              <stop offset="40%" stopColor="#e0f2fe" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#bae6fd" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>

            {/* Top Cap Gradient */}
            <linearGradient id="capGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>

            {/* Bottom Ring Gradient */}
            <linearGradient id="ringGlow" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
          </defs>

          {/* 1. Base Pedestal Glowing Rings */}
          <ellipse cx="80" cy="138" rx="46" ry="12" fill="url(#pedestalGlow)" />
          <ellipse
            cx="80"
            cy="138"
            rx="36"
            ry="9"
            stroke="#06b6d4"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            opacity="0.8"
          />
          <ellipse
            cx="80"
            cy="138"
            rx="26"
            ry="6"
            stroke="#38bdf8"
            strokeWidth="2"
            opacity="0.9"
          />

          {/* 2. Battery Cylinder Body */}
          <path
            d="M 52 35 L 108 35 L 108 120 C 108 126 52 126 52 120 Z"
            fill="url(#batteryBody)"
            stroke="#0ea5e9"
            strokeWidth="1.2"
          />

          {/* Specular Vertical Light Band */}
          <rect
            x="64"
            y="35"
            width="8"
            height="85"
            fill="url(#specularStreak)"
            opacity="0.8"
          />

          {/* 3. Top Terminal Cap */}
          <ellipse
            cx="80"
            cy="35"
            rx="28"
            ry="8"
            fill="#0369a1"
            stroke="#38bdf8"
            strokeWidth="1.2"
          />
          {/* Positive Nib */}
          <rect
            x="72"
            y="22"
            width="16"
            height="10"
            rx="3"
            fill="url(#capGradient)"
            stroke="#bae6fd"
            strokeWidth="1"
          />
          <ellipse
            cx="80"
            cy="22"
            rx="8"
            ry="3"
            fill="#e0f2fe"
            stroke="#38bdf8"
            strokeWidth="0.8"
          />

          {/* 4. Illuminated Energy Core (Lightning Bolt) */}
          <motion.path
            animate={{
              opacity: [0.85, 1, 0.85],
              scale: [1, 1.02, 1],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            d="M 83 55 L 70 78 L 81 78 L 77 103 L 92 74 L 81 74 Z"
            fill="#38bdf8"
            stroke="#e0f2fe"
            strokeWidth="1.5"
            className="drop-shadow-[0_0_12px_#38bdf8]"
          />

          {/* Bottom Rim Ellipse */}
          <ellipse
            cx="80"
            cy="120"
            rx="28"
            ry="7"
            stroke="#38bdf8"
            strokeWidth="1.5"
            fill="none"
            opacity="0.7"
          />
        </svg>
      </div>

      {/* Right: Battery Pack Specifications & Diagnostics Telemetry */}
      <div className="flex-1 flex flex-col justify-between h-full gap-4 w-full">
        {/* Title & Connection Status */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Battery Pack {formattedId}
            </h2>

            {/* Connection Status Badge */}
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.25)]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-900 text-slate-400 border border-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Standby
              </span>
            )}
          </div>

          {/* Battery Chemistry, Voltage, and Capacity */}
          <div className="text-xs font-mono text-slate-400 flex items-center gap-2">
            <span>Type: <strong className="text-slate-200">{chemistry || 'Li-ion'}</strong></span>
            <span className="text-slate-600">|</span>
            <span><strong className="text-slate-200">{voltage !== undefined && !isNaN(voltage) ? `${voltage.toFixed(2)} V` : '—'}</strong></span>
            <span className="text-slate-600">|</span>
            <span><strong className="text-slate-200">{capacityAh !== undefined && !isNaN(capacityAh) ? `${capacityAh.toFixed(1)} Ah` : '—'}</strong></span>
          </div>
        </div>

        {/* Diagnostic Metadata Columns */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#142340]">
          {/* Column 1: Last Diagnostic */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-slate-400 font-medium">
              Last Diagnostic
            </span>
            <span className="text-xs font-bold text-slate-100 font-mono">
              {lastDiagnosticDate || '—'}
            </span>
            <span className="text-[10px] text-slate-400">
              Duration: <span className="text-cyan-300 font-mono font-medium">{lastDiagnosticDuration || '—'}</span>
            </span>
          </div>

          {/* Column 2: Data Source */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-slate-400 font-medium">
              Data Source
            </span>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span>{dataSourceLabel || '—'}</span>
            </div>
            <span className="text-[10px] text-slate-400">
              Provenance: <span className="text-sky-300 font-mono font-bold">{provenance || '—'}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
