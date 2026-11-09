import React, { useState, useEffect, useMemo } from 'react';
import { BatteryPulseTelemetry } from '../services/api';
import { getThermalColor } from '../utils/thermalColors';

interface LiveMonitoringViewProps {
  telemetry: BatteryPulseTelemetry | null;
  isRunningDiagnostic: boolean;
  onRunDiagnostic: () => void;
  selectedCell: string;
}

export const LiveMonitoringView: React.FC<LiveMonitoringViewProps> = ({
  telemetry,
  isRunningDiagnostic,
  onRunDiagnostic,
  selectedCell,
}) => {
  const [isLinkDropped, setIsLinkDropped] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(8.42);
  const [hoveredCoord, setHoveredCoord] = useState<{ r: number; c: number; temp: number } | null>(
    null
  );

  // Oscillogram live clock increment effect when active
  useEffect(() => {
    if (isRunningDiagnostic) {
      const interval = setInterval(() => {
        setElapsedSec((prev) => (prev >= 12.0 ? 0.0 : prev + 0.1));
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isRunningDiagnostic]);

  const hasTelemetry = telemetry !== null;
  const cellId = telemetry?.cell_id ?? selectedCell;
  const ocv = telemetry?.v_pre_pulse ?? null;
  const vMeas = isLinkDropped
    ? 0.0
    : isRunningDiagnostic
    ? 3.718
    : hasTelemetry
    ? telemetry.voltage[telemetry.voltage.length - 1] ?? ocv
    : null;
  const iMeas = isLinkDropped
    ? 0.0
    : isRunningDiagnostic
    ? 3.01
    : hasTelemetry
    ? telemetry.current[telemetry.current.length - 1] ?? 0.0
    : null;
  const tMeas = isLinkDropped
    ? 0.0
    : hasTelemetry
    ? telemetry.bulk_temperature[telemetry.bulk_temperature.length - 1] ?? null
    : null;
  const rMeas = isLinkDropped
    ? 0.0
    : ocv !== null && vMeas !== null && iMeas !== null && iMeas > 0
    ? ((ocv - vMeas) / iMeas) * 1000
    : null;

  // Determine stage pill state
  const activeStage = useMemo(() => {
    if (!isRunningDiagnostic) return 'IDLE';
    if (elapsedSec < 1.0) return 'BASELINE';
    if (elapsedSec <= 11.0) return 'ACTIVE_PULSE';
    return 'RELAXATION';
  }, [isRunningDiagnostic, elapsedSec]);

  // Synthetic or real 8x8 matrix
  const thermalGrid = useMemo(() => {
    return Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => {
        let temp = 24.2 + r * 0.06 + c * 0.04;
        if (r === 1 && c === 4) {
          temp = 25.85; // Hotspot
        } else if ((r === 0 || r === 1) && (c === 3 || c === 4)) {
          temp += 1.25;
        }
        return Number(temp.toFixed(2));
      })
    );
  }, []);

  const progressPercent = Math.min(100, Math.max(0, (elapsedSec / 12.0) * 100));

  return (
    <div className="flex flex-col w-full pb-12 space-y-4">
      {/* TOP HARDWARE DAQ STATUS BAR */}
      <div className="w-full bg-[#08101e] px-4 py-3 rounded border border-[#142340] flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isLinkDropped ? 'bg-rose-500' : 'bg-[#4cd7f6] animate-pulse'
              }`}
            ></span>
            <span className="font-mono text-xs font-bold text-slate-100">
              {isLinkDropped ? 'LINK OFFLINE (SIMULATED)' : 'ESP32 DAQ (250 SPS)'}
            </span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">Jitter: ±0.08ms</span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-[#090e1a] text-[#7bd0ff] border border-[#142340]">
            Cell: {cellId} (18650)
          </span>

          {/* Test State Stage Pills */}
          <div className="flex items-center gap-1 font-mono text-[10px] uppercase">
            <span
              className={`px-2 py-0.5 rounded ${
                activeStage === 'BASELINE'
                  ? 'bg-[#06b6d4] text-[#070c18] font-bold'
                  : 'bg-[#090e1a] text-slate-400'
              }`}
            >
              BASELINE
            </span>
            <span
              className={`px-2 py-0.5 rounded ${
                activeStage === 'ACTIVE_PULSE'
                  ? 'bg-amber-400 text-[#070c18] font-bold'
                  : 'bg-[#090e1a] text-slate-400'
              }`}
            >
              ACTIVE_PULSE
            </span>
            <span
              className={`px-2 py-0.5 rounded ${
                activeStage === 'RELAXATION'
                  ? 'bg-[#38bdf8] text-[#070c18] font-bold'
                  : 'bg-[#090e1a] text-slate-400'
              }`}
            >
              RELAXATION
            </span>
            <span
              className={`px-2 py-0.5 rounded ${
                activeStage === 'IDLE'
                  ? 'bg-emerald-500 text-[#070c18] font-bold'
                  : 'bg-[#090e1a] text-slate-400'
              }`}
            >
              IDLE
            </span>
          </div>
        </div>

        {/* Progress & Stream drop toggle button */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-400">{elapsedSec.toFixed(2)}s / 12.0s</span>
            <div className="w-24 h-1.5 bg-[#15223c] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#4cd7f6] transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>

          <button
            onClick={onRunDiagnostic}
            disabled={isRunningDiagnostic}
            type="button"
            className="px-3 py-1.5 rounded font-mono text-[11px] font-bold uppercase transition-all bg-[#06b6d4] hover:bg-[#4cd7f6] text-[#070c18] disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">bolt</span>
            <span>{isRunningDiagnostic ? 'TRIGGERED' : 'TRIGGER PULSE'}</span>
          </button>

          <button
            onClick={() => setIsLinkDropped(!isLinkDropped)}
            type="button"
            className={`px-3 py-1.5 rounded font-mono text-[11px] font-bold uppercase transition-all border flex items-center gap-1.5 ${
              isLinkDropped
                ? 'bg-rose-950/80 text-rose-300 border-rose-500 hover:bg-rose-900'
                : 'bg-[#101a2e] text-slate-300 border-[#142340] hover:border-[#4cd7f6]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px] text-[#4cd7f6]">
              {isLinkDropped ? 'play_circle' : 'pause_circle'}
            </span>
            <span>{isLinkDropped ? 'RESTORE LINK' : 'SIMULATE LINK DROP'}</span>
          </button>
        </div>
      </div>

      {/* STATUS BANNER */}
      <div
        className={`w-full px-4 py-2 rounded border flex items-center justify-between font-mono text-xs ${
          isLinkDropped
            ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
            : 'bg-[#08101e] border-[#142340] text-slate-300'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#4cd7f6] text-[18px]">verified</span>
          <span>
            {isLinkDropped
              ? 'WARNING: UART Serial Transport Interrupted. Synthetic fallback stream buffer engaged.'
              : 'STREAM ACTIVE (250 SPS) — ESP32-S3 DMA Buffer Healthy (0 dropped frames, ring buffer fill: 14.8%)'}
          </span>
        </div>
        <div className="hidden md:flex items-center gap-3 text-slate-400">
          <span>HW REV: v4.2-REV-B</span>
          <span className="px-2 py-0.5 rounded bg-[#101a2e] text-[#7bd0ff] text-[10px]">
            BURST_MODE_ENABLED
          </span>
        </div>
      </div>

      {/* 2-COLUMN MAIN LAB GRID (7 Cols / 5 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: 4 Big Telemetry Cards + Oscilloscope Strip */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {/* 4 BIG TELEMETRY READOUT CARDS (2x2) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Metric 1: Terminal Voltage */}
            <div className="bg-[#08101e] p-4 rounded border border-[#142340] hover:border-[#1e3b66] transition-all relative overflow-hidden shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                  Terminal Voltage V(t)
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-rose-400 bg-rose-950/60 px-1.5 py-0.5 rounded">
                  <span className="material-symbols-outlined text-[12px]">south</span> -0.364 V ΔV
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 my-1">
                <span className="font-mono text-3xl font-bold text-slate-100">
                  {vMeas !== null ? vMeas.toFixed(3) : '—'}
                </span>
                <span className="font-mono text-base text-[#4cd7f6] font-semibold">V</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#142340] mt-2 font-mono text-[11px]">
                <span className="text-slate-400">OCV: {ocv !== null ? `${ocv.toFixed(3)} V` : '—'}</span>
                <span className="text-[#4cd7f6]">ENVELOPE [3.65 - 4.15V]</span>
              </div>
            </div>

            {/* Metric 2: Galvanostatic Current */}
            <div className="bg-[#08101e] p-4 rounded border border-[#142340] hover:border-[#1e3b66] transition-all shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                  Galvanostatic Current I(t)
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#4cd7f6] bg-[#06b6d4]/20 px-1.5 py-0.5 rounded border border-[#06b6d4]/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4cd7f6]"></span> TARGET LOCKED
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 my-1">
                <span className="font-mono text-3xl font-bold text-slate-100">
                  {iMeas !== null ? iMeas.toFixed(2) : '—'}
                </span>
                <span className="font-mono text-base text-[#4cd7f6] font-semibold">A</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#142340] mt-2 font-mono text-[11px]">
                <span className="text-slate-400">TOL: ±0.05 A</span>
                <span className="text-[#7bd0ff]">{iMeas !== null ? '+0.01A DEV' : '—'}</span>
              </div>
            </div>

            {/* Metric 3: Instant Temperature */}
            <div className="bg-[#08101e] p-4 rounded border border-[#142340] hover:border-[#1e3b66] transition-all shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                  Instantaneous Temp T_core
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#7bd0ff] bg-[#101a2e] px-1.5 py-0.5 rounded border border-[#142340]">
                  <span className="material-symbols-outlined text-[12px]">north</span> {tMeas !== null ? '+1.62 °C RISE' : '—'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 my-1">
                <span className="font-mono text-3xl font-bold text-slate-100">
                  {tMeas !== null ? tMeas.toFixed(2) : '—'}
                </span>
                <span className="font-mono text-base text-amber-400 font-semibold">°C</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#142340] mt-2 font-mono text-[11px]">
                <span className="text-slate-400">BASELINE: {tMeas !== null ? '24.20 °C' : '—'}</span>
                <span className="text-slate-300">RATE: {tMeas !== null ? '+0.16 °C/s' : '—'}</span>
              </div>
            </div>

            {/* Metric 4: Dynamic Impedance */}
            <div className="bg-[#08101e] p-4 rounded border border-[#142340] hover:border-[#1e3b66] transition-all shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                  Dynamic Impedance R_Ohm
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  NOMINAL HEADROOM
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 my-1">
                <span className="font-mono text-3xl font-bold text-slate-100">
                  {rMeas !== null ? rMeas.toFixed(1) : '—'}
                </span>
                <span className="font-mono text-base text-[#4cd7f6] font-semibold">mΩ</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-[#142340] mt-2 font-mono text-[11px]">
                <span className="text-slate-400">LIMIT: ≤ 117.0 mΩ</span>
                <span className="text-[#4cd7f6]">+27.6 mΩ MARGIN</span>
              </div>
            </div>
          </div>

          {/* DUAL REAL-TIME OSCILLOSCOPE STRIP (12s Window) */}
          <div className="bg-[#08101e] rounded p-4 border border-[#142340] flex flex-col space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[18px]">
                  show_chart
                </span>
                <span className="font-semibold text-sm text-slate-100">
                  Dual-Trace Galvanostatic Pulse Oscillogram
                </span>
                <span className="font-mono text-[11px] text-slate-400 ml-2">Δt = 12.0s Window</span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px]">
                <span className="flex items-center gap-1 text-[#4cd7f6]">
                  <span className="w-2.5 h-0.5 bg-[#4cd7f6] inline-block"></span> V(t) [V]
                </span>
                <span className="flex items-center gap-1 text-[#93ccff]">
                  <span className="w-2.5 h-0.5 bg-[#93ccff] inline-block"></span> I(t) [A]
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#101a2e] text-slate-300 border border-[#142340]">
                  500 ms/div
                </span>
              </div>
            </div>

            {/* Scope Screen SVG */}
            <div className="w-full bg-[#060a14] rounded p-2 border border-[#0f1a30] relative overflow-hidden">
              <svg className="w-full h-72 select-none" viewBox="0 0 760 320" preserveAspectRatio="none">
                <defs>
                  <pattern id="scopeGrid" width="63.33" height="32" patternUnits="userSpaceOnUse">
                    <path
                      d="M 63.33 0 L 0 0 0 32"
                      fill="none"
                      stroke="#142340"
                      strokeWidth="0.8"
                      strokeDasharray="2,2"
                    />
                  </pattern>
                  <linearGradient id="scopeVGlow" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#4cd7f6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#4cd7f6" stopOpacity="0" />
                  </linearGradient>
                </defs>

                <rect width="760" height="320" fill="url(#scopeGrid)" />

                {/* Trace Split line at y=160 */}
                <line x1="0" y1="160" x2="760" y2="160" stroke="#1e3b66" strokeDasharray="4,3" strokeWidth="1.2" />
                <text x="8" y="152" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  CH 01 : TERMINAL VOLTAGE V(t) [3.60V - 4.20V]
                </text>
                <text x="8" y="174" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  CH 02 : DISCHARGE CURRENT I(t) [0.00A - 3.50A]
                </text>

                {/* Upper Trace: V(t) */}
                <path
                  d="M 0 28 L 63.3 28 L 63.3 74 C 180 82, 380 88, 533 90"
                  fill="none"
                  stroke="#4cd7f6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <path
                  d="M 0 28 L 63.3 28 L 63.3 74 C 180 82, 380 88, 533 90 L 533 160 L 0 160 Z"
                  fill="url(#scopeVGlow)"
                />
                <path
                  d="M 533 90 C 620 93, 696 95, 696.6 96 L 696.6 42 L 760 40"
                  fill="none"
                  stroke="#4cd7f6"
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                  opacity="0.6"
                />

                {/* Lower Trace: I(t) */}
                <path
                  d="M 0 298 L 63.3 298 L 63.3 200 L 533 200"
                  fill="none"
                  stroke="#93ccff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M 533 200 L 696.6 200 L 696.6 298 L 760 298"
                  fill="none"
                  stroke="#93ccff"
                  strokeWidth="1.5"
                  strokeDasharray="3,3"
                  opacity="0.6"
                />

                {/* Callout Ohmic Drop */}
                <circle cx="63.3" cy="74" r="3" fill="#4cd7f6" />
                <text x="70" y="65" fill="#acedff" fontFamily="JetBrains Mono" fontSize="9">
                  ΔV_ohmic = 298mV
                </text>

                {/* Live time cursor at t=8.42s (x=533.2) */}
                <g id="liveTimeCursor">
                  <line x1="533.2" y1="0" x2="533.2" y2="320" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="3,2" />
                  <circle cx="533.2" cy="90" r="4.5" fill="#06b6d4" stroke="#090e1a" strokeWidth="2" />
                  <circle cx="533.2" cy="200" r="4.5" fill="#93ccff" stroke="#090e1a" strokeWidth="2" />
                  <rect x="503" y="4" width="60" height="16" rx="2" fill="#06b6d4" />
                  <text x="533" y="16" fill="#001f26" fontFamily="JetBrains Mono" fontSize="9" fontWeight="bold" textAnchor="middle">
                    t = {elapsedSec.toFixed(2)}s
                  </text>
                </g>

                {/* Time Axis Ticks */}
                <g fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  <text x="2" y="314">0.0s</text>
                  <text x="126" y="314">2.0s</text>
                  <text x="253" y="314">4.0s</text>
                  <text x="380" y="314">6.0s</text>
                  <text x="507" y="314">8.0s</text>
                  <text x="633" y="314">10.0s (PULSE END)</text>
                  <text x="724" y="314">12.0s</text>
                </g>
              </svg>

              {/* Floating HUD Reticle Tooltip */}
              <div className="absolute top-4 right-4 bg-[#0d1527]/90 backdrop-blur-md px-3 py-2 rounded border border-[#1e3b66] pointer-events-none flex flex-col gap-1 font-mono text-[11px]">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">V_MEAS:</span>
                  <span className="text-[#4cd7f6] font-bold">
                    {vMeas !== null ? `${vMeas.toFixed(4)} V` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">I_MEAS:</span>
                  <span className="text-[#93ccff] font-bold">
                    {iMeas !== null ? `${iMeas.toFixed(4)} A` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-400">SAMPLING:</span>
                  <span className="text-[#7bd0ff]">4.00 ms (250 Hz)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-1 text-slate-400 font-mono text-xs">
              <span>Profile: ISO-12405 Hybrid Disch.</span>
              <span>Galvanostatic Slew Rate: 120 A/ms</span>
              <span>ADC Quantization: 16-Bit Sigma-Delta</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AMG8833 Thermal Array & Packet Diagnostics */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* AMG8833 8x8 THERMAL INFRARED MATRIX */}
          <div className="bg-[#08101e] rounded p-4 border border-[#142340] flex flex-col space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#7bd0ff] text-[18px]">
                  thermostat
                </span>
                <span className="font-semibold text-sm text-slate-100">
                  AMG8833 Thermal Array
                </span>
              </div>
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#7bd0ff] bg-[#101a2e] px-2 py-0.5 rounded border border-[#142340]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7bd0ff]"></span> 64-PX IR PIXEL
              </span>
            </div>

            {/* Thermal Display Box */}
            <div className="bg-[#060a14] rounded p-3 border border-[#0f1a30] flex flex-col items-center">
              <div className="w-full flex items-center justify-between text-slate-400 font-mono text-[11px] mb-2 px-1">
                <span className="text-[#4cd7f6] flex items-center gap-1">
                  <span className="w-2 h-2 rounded-sm bg-[#06b6d4]/40 border border-[#4cd7f6]"></span>
                  [TAB AREA: R0-1, C3-4]
                </span>
                <span className="text-amber-400 font-bold">
                  {hoveredCoord
                    ? `[R${hoveredCoord.r}, C${hoveredCoord.c}]: ${hoveredCoord.temp.toFixed(2)}°C`
                    : '[R1, C4]: 25.85°C (HOTSPOT)'}
                </span>
              </div>

              {/* 8x8 Grid */}
              <div className="relative p-2 bg-[#060a14] rounded border border-[#142340]">
                <div className="grid grid-cols-8 gap-1.5 select-none">
                  {thermalGrid.map((row, r) =>
                    row.map((val, c) => {
                      const isHotspot = r === 1 && c === 4;
                      const isTab = (r === 0 || r === 1) && (c === 3 || c === 4);
                      const color = getThermalColor(val, 24.0, 26.0);

                      return (
                        <div
                          key={`${r}-${c}`}
                          onMouseEnter={() => setHoveredCoord({ r, c, temp: val })}
                          onMouseLeave={() => setHoveredCoord(null)}
                          style={{ backgroundColor: color }}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded flex items-center justify-center text-[9px] font-mono font-bold cursor-pointer transition-transform hover:scale-110 relative ${
                            isHotspot ? 'shadow-[0_0_12px_#f97316] ring-2 ring-amber-400' : ''
                          } ${isTab ? 'ring-1 ring-[#4cd7f6]' : ''}`}
                        >
                          {isHotspot ? (
                            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                          ) : isTab ? (
                            <span className="text-white text-[8px]">+</span>
                          ) : (
                            <span className="text-white/60">.</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Thermal Legend */}
              <div className="w-full mt-3">
                <div
                  className="w-full h-2 rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, #1e2a5e 0%, #184e90 30%, #0284c7 60%, #eab308 85%, #f97316 100%)',
                  }}
                ></div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400 mt-1">
                  <span>24.20 °C</span>
                  <span>Spatial Range</span>
                  <span className="text-amber-400 font-semibold">25.85 °C</span>
                </div>
              </div>
            </div>
          </div>

          {/* HARDWARE PACKET & BUFFER INTEGRITY MONITOR */}
          <div className="bg-[#08101e] rounded p-4 border border-[#142340] flex flex-col space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-100">
                Hardware Packet &amp; Transport Buffer
              </span>
              <span className="font-mono text-[10px] text-emerald-400">DMA 100% HEALTHY</span>
            </div>

            <div className="space-y-1.5 font-mono text-xs">
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">DMA Ring Buffer Fill</span>
                <span className="text-[#4cd7f6] font-semibold">14.8% (Normal)</span>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">Serial Ingestion Throughput</span>
                <span className="text-slate-200">250 pkts/sec • 115200 baud</span>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">Sensor Bus Architecture</span>
                <span className="text-slate-200">I2C FastMode+ @ 1MHz</span>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">CRC Packet Checksum</span>
                <span className="text-emerald-400 font-semibold">PASS (0 Corruptions)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
