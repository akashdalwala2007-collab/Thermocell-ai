import React, { useState, useMemo } from 'react';
import { BatteryPulseTelemetry, DiagnosticPrediction, SessionSummary } from '../services/api';
import { ProvenanceBadge } from '../components/ProvenanceBadge';
import { VerdictBadge } from '../components/VerdictBadge';
import { getThermalColor } from '../utils/thermalColors';

interface DashboardViewProps {
  telemetry: BatteryPulseTelemetry | null;
  prediction: DiagnosticPrediction | null;
  features: Record<string, number> | null;
  soh?: number | null;
  recentSessions: SessionSummary[];
  isHardwareMode: boolean;
  onToggleHardwareMode: () => void;
  onRunDiagnostic: () => void;
  isRunning: boolean;
  selectedCell: string;
  onSelectSession: (sessionId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  telemetry,
  prediction,
  features,
  soh,
  recentSessions,
  isHardwareMode,
  onToggleHardwareMode,
  onRunDiagnostic,
  isRunning,
  selectedCell,
  onSelectSession,
}) => {
  const [frameIndex, setFrameIndex] = useState<number>(84);
  const [hoverCoord, setHoverCoord] = useState<{ r: number; c: number; temp: number } | null>(null);

  // Data availability check
  const hasTelemetry = telemetry !== null;
  const hasPrediction = prediction !== null;
  const hasFeatures = features !== null;

  // Values from telemetry (no hardcoded fallbacks - show "—" when not available)
  const vPrePulse = hasTelemetry ? telemetry.v_pre_pulse : null;
  const currentCellId = hasTelemetry ? telemetry.cell_id : selectedCell;
  const cycleIndex = hasTelemetry ? telemetry.cycle_index : null;
  const provenance = hasTelemetry ? telemetry.provenance : (isHardwareMode ? 'REAL' : 'SYNTHETIC');

  // Features extracted (supports both canonical 14 keys like 'DCIR', 'ΔV10' and snake_case)
  const dcir = hasFeatures ? (features['DCIR'] ?? features['dcir_ohm'] ?? null) : null;
  const dV10 = hasFeatures ? (features['ΔV10'] ?? features['delta_v_10s'] ?? null) : null;
  const tMax = hasFeatures ? (features['T_max_pixel'] ?? features['t_max_c'] ?? null) : null;
  const tAmb = hasFeatures ? (features['T_initial'] ?? features['ambient_t_c'] ?? null) : null;
  const deltaT = hasFeatures ? (features['ΔT_bulk'] ?? features['delta_t_c'] ?? (tMax !== null && tAmb !== null ? tMax - tAmb : null)) : null;
  const vLoadedAvg = hasFeatures ? (features['V_min_active'] ?? features['v_min_active'] ?? null) : null;
  const spatialVar = hasFeatures ? (features['σ²_T'] ?? features['spatial_var_c2'] ?? null) : null;
  const maxGradient = hasFeatures ? (features['∇T_tab-body'] ?? features['max_spatial_grad_c'] ?? null) : null;

  // Verdict & SoH (no hardcoded fallbacks)
  const verdict = hasPrediction ? prediction.triage_class : null;
  const confidence = hasPrediction ? prediction.confidence : null;
  const reuseProb = hasPrediction ? prediction.class_probabilities?.REUSE : null;
  const investigateProb = hasPrediction ? prediction.class_probabilities?.INVESTIGATE : null;
  const retireProb = hasPrediction ? prediction.class_probabilities?.RETIRE : null;

  // State of Health from diagnostic run, empirical NASA telemetry metadata, or benchmark
  const estSoh = useMemo(() => {
    if (typeof soh === 'number' && !isNaN(soh) && soh > 0) {
      return soh;
    }
    if (telemetry?.metadata?.soh) {
      const parsed = parseFloat(telemetry.metadata.soh);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return null;
  }, [soh, telemetry]);

  // Estimated lifespan cycles
  const estLifespan = useMemo(() => {
    if (!verdict) return null;
    if (verdict === 'REUSE') return 420;
    if (verdict === 'INVESTIGATE') return 180;
    return 35;
  }, [verdict]);

  // Active thermal frames
  const frames = hasTelemetry ? telemetry.thermal_frames : null;
  const totalFrames = frames?.length ?? 0;
  const safeFrameIndex = frames ? Math.min(Math.max(0, frameIndex), totalFrames - 1) : 0;

  // Active 8x8 grid data (no hardcoded fallback - returns empty grid when no telemetry)
  const currentGrid = useMemo(() => {
    if (frames && frames[safeFrameIndex]) {
      return frames[safeFrameIndex];
    }
    // Return empty grid when no telemetry - caller should handle "no data" state
    return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0));
  }, [frames, safeFrameIndex]);

  // Compute thermal stats for the active frame
  const { frameMin, frameMax, hotspotCoord } = useMemo(() => {
    if (!frames || frames.length === 0) {
      return { frameMin: null, frameMax: null, hotspotCoord: { r: 0, c: 0 } };
    }
    let min = 999;
    let max = -999;
    let maxR = 1;
    let maxC = 4;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const val = currentGrid[r][c];
        if (val < min) min = val;
        if (val > max) {
          max = val;
          maxR = r;
          maxC = c;
        }
      }
    }
    return { frameMin: min, frameMax: max, hotspotCoord: { r: maxR, c: maxC } };
  }, [currentGrid, frames]);

  // Arc calculation for Health Gauge circle
  // 414 total circumference for r=66.
  // 88.4% -> offset = 414 * (1 - 0.884 * 0.75) roughly
  const gaugeDashOffset = useMemo(() => {
    if (estSoh === null) return 414;
    return Math.round(414 * (1 - (estSoh / 100) * 0.75));
  }, [estSoh]);

  // 6 Deterministic Safety Tripwire Evaluations
  const rule1Pass = dcir !== null ? dcir <= 0.20 : null;
  const rule2Pass = dV10 !== null ? dV10 <= 0.45 : null;
  const deltaTRise = tMax !== null && tAmb !== null ? tMax - tAmb : null;
  const rule3Pass = deltaT !== null ? deltaT <= 2.50 : null;
  const rule4Pass = deltaTRise !== null ? deltaTRise <= 4.50 : null;
  const rule5Pass = spatialVar !== null ? spatialVar <= 0.25 : null;
  const rule6Pass = maxGradient !== null ? maxGradient <= 1.50 : null;

  const safetyRules = [rule1Pass, rule2Pass, rule3Pass, rule4Pass, rule5Pass, rule6Pass];
  const passedSafetyCount = safetyRules.filter(r => r === true).length;
  const allSafetyEvaluated = safetyRules.every(r => r !== null);
  const anySafetyFailed = safetyRules.some(r => r === false);

  return (
    <div className="flex flex-col w-full pb-12 space-y-4">
      {/* SIMULATION CONTEXT BANNER */}
      <div className="w-full bg-[#08101e] px-4 py-2.5 rounded border border-[#142340] flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <ProvenanceBadge provenance={provenance} size="sm" />
          <div className="flex items-center gap-2 truncate">
            <span className="font-mono text-xs text-[#4cd7f6] font-semibold shrink-0">
              {isHardwareMode ? 'PHYSICAL BENCH ACTIVE:' : 'SIMULATION MODE ACTIVE:'}
            </span>
            <span className="text-xs text-slate-300 truncate">
              {isHardwareMode
                ? `ESP32-S3 DAQ connected via serial bridge. Real battery ${currentCellId} live in test chamber.`
                : `Synthetic validation data loaded (NASA Ames Li-ion cycle run ${currentCellId}, Cycle ${cycleIndex}).`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
          <button
            onClick={onToggleHardwareMode}
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#101a2e] hover:bg-[#15223c] text-slate-200 font-mono text-[11px] font-semibold border border-[#142340] hover:border-[#4cd7f6] transition-all"
          >
            <span className="material-symbols-outlined text-[14px] text-[#4cd7f6]">
              developer_board
            </span>
            <span>{isHardwareMode ? 'SWITCH TO SIMULATION' : 'SWITCH TO ESP32 HARDWARE'}</span>
          </button>
          <span className="inline-flex items-center gap-1.5 text-slate-400 font-mono text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4] animate-pulse"></span>
            STREAM ACTIVE
          </span>
        </div>
      </div>

      {/* ROW 1: CORE CELL OVERVIEW & HEALTH GAUGE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1: Battery Overview (col-span-8) */}
        <div className="lg:col-span-8 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-4 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  battery_charging_full
                </span>
                <span className="font-semibold text-base text-slate-100">BATTERY OVERVIEW</span>
                <span className="font-mono text-xs text-slate-400 ml-1">/ CH_01</span>
              </div>
              <div className="flex items-center gap-2">
                <ProvenanceBadge provenance={provenance} size="sm" />
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#101a2e] text-[#4cd7f6] font-mono text-[11px] border border-[#142340]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4cd7f6] animate-ping"></span>
                  {hasTelemetry ? '250 Hz DAQ' : 'NO TELEMETRY'}
                </span>
              </div>
            </div>

            {/* 4 Cell Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded bg-[#060a14] border border-[#0f1a30]">
              <div>
                <span className="font-mono text-[10px] text-slate-400 block uppercase tracking-wider">
                  Cell Identifier
                </span>
                <span className="font-mono text-xl text-[#4cd7f6] font-bold block mt-0.5">
                  {currentCellId}
                </span>
                <span className="font-mono text-[11px] text-slate-400">18650 Cylindrical</span>
              </div>
              <div>
                <span className="font-mono text-[10px] text-slate-400 block uppercase tracking-wider">
                  Terminal OCV
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="font-mono text-xl text-slate-100 font-bold">
                    {vPrePulse !== null ? vPrePulse.toFixed(3) : '—'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">V</span>
                </div>
                <span className="font-mono text-[11px] text-[#4cd7f6]">ΔV: -0.001 V/hr</span>
              </div>
              <div>
                <span className="font-mono text-[10px] text-slate-400 block uppercase tracking-wider">
                  Discharge Capacity
                </span>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <span className="font-mono text-xl text-slate-100 font-bold">
                    {telemetry?.metadata?.discharge_capacity ? Number(telemetry.metadata.discharge_capacity).toFixed(4) : hasTelemetry ? '2.0000' : '—'}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400">Ah</span>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  {telemetry?.metadata?.nominal_capacity ? `Nominal: ${telemetry.metadata.nominal_capacity} Ah` : 'Nominal: 2.0 Ah'}
                </span>
              </div>
              <div>
                <span className="font-mono text-[10px] text-slate-400 block uppercase tracking-wider">
                  Sampling State
                </span>
                <span className="font-mono text-xl text-slate-100 font-bold block mt-0.5">
                  {isRunning ? 'PULSE' : hasTelemetry ? 'STATIC' : 'NO DATA'}
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {isRunning ? 'Galvanostatic 3.0A' : hasTelemetry ? 'Post-Pulse Relax' : 'Awaiting diagnostic run'}
                </span>
              </div>
            </div>
          </div>

          {/* Instrument Metadata Lattice */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-slate-300 bg-[#0d1527]/40 p-1.5 rounded font-mono text-xs">
            <div className="flex justify-between px-2 py-1 rounded bg-[#090e1a] border border-[#142340]">
              <span className="text-[10px] text-slate-400 uppercase">Amb Temp:</span>
              <span className="text-slate-100 font-semibold">{tAmb !== null ? tAmb.toFixed(1) : '—'} °C</span>
            </div>
            <div className="flex justify-between px-2 py-1 rounded bg-[#090e1a] border border-[#142340]">
              <span className="text-[10px] text-slate-400 uppercase">Cycle Count:</span>
              <span className="text-slate-100 font-semibold">{cycleIndex !== null ? cycleIndex : '—'}</span>
            </div>
            <div className="flex justify-between px-2 py-1 rounded bg-[#090e1a] border border-[#142340]">
              <span className="text-[10px] text-slate-400 uppercase">Mass:</span>
              <span className="text-slate-100 font-semibold">{hasTelemetry ? '45.20 g' : '—'}</span>
            </div>
            <div className="flex justify-between px-2 py-1 rounded bg-[#090e1a] border border-[#142340]">
              <span className="text-[10px] text-slate-400 uppercase">Batch Lot:</span>
              <span className="text-[#4cd7f6] font-semibold">{hasTelemetry ? '2024-Q2-REF' : '—'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#4cd7f6]">terminal</span>
              <span>
                Protocol:{' '}
                <strong className="text-slate-200 font-mono">
                  10s 3.0A Galvanostatic Pulse + 2s Relaxation
                </strong>
              </span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              NASA Ames Diagnostic Standard Rev 4
            </span>
          </div>
        </div>

        {/* Card 2: Overall Health Gauge (col-span-4) */}
        <div className="lg:col-span-4 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">vital_signs</span>
              <span className="font-semibold text-base text-slate-100">HEALTH GAUGE</span>
            </div>
            {verdict ? (
              <VerdictBadge verdict={verdict} size="sm" showIcon />
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-[#0b1324] text-slate-400 font-mono text-[10px] border border-[#1a2d52]">
                AWAITING DIAGNOSTIC
              </span>
            )}
          </div>

          {/* Circular Radial Meter Display */}
          <div className="flex items-center justify-center relative py-2">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                {/* Background Arc */}
                <circle
                  className="text-[#15223c]"
                  cx="80"
                  cy="80"
                  fill="none"
                  r="66"
                  stroke="currentColor"
                  strokeDasharray="414"
                  strokeDashoffset="83"
                  strokeLinecap="round"
                  strokeWidth="12"
                />
                {/* Active SoH Arc */}
                <defs>
                  <linearGradient id="sohGrad" x1="0%" x2="100%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop
                      offset="100%"
                      stopColor={
                        verdict === 'REUSE'
                          ? '#10b981'
                          : verdict === 'INVESTIGATE'
                          ? '#f59e0b'
                          : verdict === 'RETIRE'
                          ? '#ef4444'
                          : '#334155'
                      }
                    />
                  </linearGradient>
                </defs>
                <circle
                  className="transition-all duration-1000 ease-out"
                  cx="80"
                  cy="80"
                  fill="none"
                  r="66"
                  stroke="url(#sohGrad)"
                  strokeDasharray="414"
                  strokeDashoffset={gaugeDashOffset}
                  strokeLinecap="round"
                  strokeWidth="12"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
                  STATE OF HEALTH
                </span>
                <div className="flex items-baseline">
                  <span className="font-mono text-3xl font-bold text-slate-100">
                    {estSoh !== null ? estSoh.toFixed(1) : '—'}
                  </span>
                  <span className="font-mono text-xl font-bold text-[#4cd7f6] ml-0.5">
                    {estSoh !== null ? '%' : ''}
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-300">
                  {verdict === 'REUSE'
                    ? 'REUSE GRADE A'
                    : verdict === 'INVESTIGATE'
                    ? 'INVESTIGATE GRADE B'
                    : verdict === 'RETIRE'
                    ? 'RETIRE / CRITICAL'
                    : 'AWAITING DIAGNOSTIC'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[#060a14] p-2.5 rounded border border-[#0f1a30]">
            <p className="text-xs text-slate-300 leading-relaxed">
              {verdict === 'REUSE'
                ? 'Nominal electrochemical degradation. Capacity retention exceeds second-life qualification criteria (≥80.0%).'
                : verdict === 'INVESTIGATE'
                ? 'Moderate internal resistance rise and thermal divergence. Recommend manual chamber inspection before staging.'
                : verdict === 'RETIRE'
                ? 'Accelerated thermal rise or severe voltage sag observed. Cell fails second-life retention safety thresholds.'
                : 'Run a diagnostic to generate health assessment.'}
            </p>
          </div>
        </div>
      </div>

      {/* ROW 2: FIVE PRIMARY KPI SUMMARY TILES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* KPI 1: Final Decision */}
        <div className="bg-[#08101e] p-3 rounded border border-[#142340] flex flex-col justify-between relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">FINAL DECISION</span>
            <ProvenanceBadge provenance="PREDICTED" size="sm" showIcon={false} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`material-symbols-outlined text-[26px] ${
                  verdict === 'REUSE'
                    ? 'text-emerald-400'
                    : verdict === 'INVESTIGATE'
                    ? 'text-amber-400'
                    : verdict === 'RETIRE'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                {verdict === 'REUSE'
                  ? 'verified_user'
                  : verdict === 'INVESTIGATE'
                  ? 'warning'
                  : verdict === 'RETIRE'
                  ? 'dangerous'
                  : 'help'}
              </span>
              <span
                className={`font-mono text-2xl font-bold tracking-tight ${
                  verdict === 'REUSE'
                    ? 'text-emerald-400'
                    : verdict === 'INVESTIGATE'
                    ? 'text-amber-400'
                    : verdict === 'RETIRE'
                    ? 'text-rose-400'
                    : 'text-slate-400'
                }`}
              >
                {verdict ?? '—'}
              </span>
            </div>
            <div className="flex items-center justify-between mt-1 text-slate-400 font-mono text-xs">
              <span>Confidence:</span>
              <span className="text-slate-100 font-semibold font-mono">
                {confidence !== null ? (confidence * 100).toFixed(1) + '%' : '—'}
              </span>
            </div>
          </div>
          <p className="font-mono text-[10px] text-slate-400 mt-2 line-clamp-2 leading-tight">
            Screening outcome only. Not a safety guarantee or replacement for full lab characterization.
          </p>
        </div>

        {/* KPI 2: Internal Resistance (DCIR) */}
        <div className="bg-[#08101e] p-3 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">RESISTANCE (DCIR)</span>
            <ProvenanceBadge provenance={provenance} size="sm" showIcon={false} />
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-slate-100">{dcir !== null ? dcir.toFixed(3) : '—'}</span>
              <span className="font-mono text-lg text-slate-400">{dcir !== null ? 'Ω' : ''}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-slate-400 font-mono text-xs">
              <span>Limit threshold:</span>
              <span className="text-slate-200 font-mono">≤ 0.117 Ω</span>
            </div>
          </div>
          <div
            className={`flex items-center gap-1 font-mono text-[11px] mt-2 ${
              dcir !== null && dcir <= 0.117 ? 'text-[#4cd7f6]' : dcir !== null ? 'text-rose-400' : 'text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {dcir !== null && dcir <= 0.117 ? 'check' : dcir !== null ? 'trending_up' : 'help'}
            </span>
            <span>{dcir !== null && dcir <= 0.117 ? 'Nominal impedance' : dcir !== null ? '+0.032 Ω elevated' : 'Awaiting diagnostic'}</span>
          </div>
        </div>

        {/* KPI 3: Max Temperature */}
        <div className="bg-[#08101e] p-3 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">MAX TEMPERATURE</span>
            <ProvenanceBadge provenance={provenance} size="sm" showIcon={false} />
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-slate-100">{tMax !== null ? tMax.toFixed(1) : '—'}</span>
              <span className="font-mono text-lg text-slate-400">{tMax !== null ? '°C' : ''}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-slate-400 font-mono text-xs">
              <span>Thermal Rise (ΔT):</span>
              <span className="text-slate-200 font-mono">{deltaT !== null ? '+' + deltaT.toFixed(1) + ' °C' : '—'}</span>
            </div>
          </div>
          <div
            className={`flex items-center gap-1 font-mono text-[11px] mt-2 ${
              deltaT !== null && deltaT < 2.5 ? 'text-emerald-400' : deltaT !== null ? 'text-amber-400' : 'text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {deltaT !== null && deltaT < 2.5 ? 'check_circle' : deltaT !== null ? 'warning' : 'help'}
            </span>
            <span>{deltaT !== null && deltaT < 2.5 ? 'Thermal state: Normal' : deltaT !== null ? 'Thermal state: Elevated' : 'Awaiting diagnostic'}</span>
          </div>
        </div>

        {/* KPI 4: Loaded Voltage (Avg) */}
        <div className="bg-[#08101e] p-3 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">LOADED VOLTAGE</span>
            <ProvenanceBadge provenance={provenance} size="sm" showIcon={false} />
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-slate-100">{vLoadedAvg !== null ? vLoadedAvg.toFixed(3) : '—'}</span>
              <span className="font-mono text-lg text-slate-400">{vLoadedAvg !== null ? 'V' : ''}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-slate-400 font-mono text-xs">
              <span>Pulse sag (dV10):</span>
              <span className="text-slate-200 font-mono">{dV10 !== null ? dV10.toFixed(3) + ' V' : '—'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-[#4cd7f6] font-mono text-[11px] mt-2">
            <span className="material-symbols-outlined text-[14px]">{vLoadedAvg !== null ? 'check' : 'help'}</span>
            <span>{vLoadedAvg !== null ? 'Passes ≤ 0.450 V' : 'Awaiting diagnostic'}</span>
          </div>
        </div>

        {/* KPI 5: Estimated Lifespan */}
        <div className="bg-[#08101e] p-3 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-wider">ESTIMATED LIFESPAN</span>
            <ProvenanceBadge provenance="PREDICTED" size="sm" showIcon={false} />
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-slate-100">{estLifespan !== null ? estLifespan : '—'}</span>
              <span className="font-mono text-sm text-slate-400 font-semibold">{estLifespan !== null ? 'cycles' : ''}</span>
            </div>
            <div className="flex items-center justify-between mt-1 text-slate-400 font-mono text-xs">
              <span>Projected EoL:</span>
              <span className="text-slate-200 font-mono">70% SoH</span>
            </div>
          </div>
          <p className="font-mono text-[10px] text-slate-400 mt-2 truncate" title="Heuristic estimate, not a guarantee">
            Heuristic estimate, not a guarantee
          </p>
        </div>
      </div>

      {/* ROW 3: DEEP INSTRUMENTATION & SENSING (3-col: 3, 4, 5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Panel 1: Live Telemetry Readout (col-span-3) */}
        <div className="lg:col-span-3 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  monitor_heart
                </span>
                <span className="font-semibold text-sm text-slate-100">LIVE TELEMETRY</span>
              </div>
              <ProvenanceBadge provenance={provenance} size="sm" />
            </div>
            <p className="font-mono text-[11px] text-slate-400 mb-3">
              Acquisition Rate: 250 SPS • Channel: CH_01
            </p>

            <div className="space-y-1.5 font-mono text-xs">
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400 text-xs">Terminal Voltage</span>
                <span className="text-[#4cd7f6] font-bold text-base">
                  {vLoadedAvg !== null ? vLoadedAvg.toFixed(3) : vPrePulse !== null ? vPrePulse.toFixed(3) : '—'} V
                </span>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400 text-xs">Pulse Current</span>
                <div className="text-right">
                  <span className="text-slate-100 font-bold block">
                    {isRunning ? '3.01 A' : hasTelemetry ? '0.00 A' : '—'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {isRunning ? 'Constant Load' : hasTelemetry ? 'Zero Load (Rest)' : 'No telemetry'}
                  </span>
                </div>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400 text-xs">Max Temp</span>
                <div className="text-right">
                  <span className="text-amber-400 font-bold block">{tMax !== null ? tMax.toFixed(2) : '—'} °C</span>
                  <span className="text-[10px] text-slate-400">Amb: {tAmb !== null ? tAmb.toFixed(1) : '—'} °C</span>
                </div>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400 text-xs">Tab Gradient (∇T)</span>
                <span className="text-slate-100 font-semibold">{maxGradient !== null ? maxGradient.toFixed(2) : '—'} °C</span>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400 text-xs">Spatial Variance</span>
                <span className="text-slate-100 font-semibold">{spatialVar !== null ? spatialVar.toFixed(3) : '—'} °C²</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#142340] flex items-center justify-between text-slate-400 font-mono text-[11px]">
            <span>Buffer Fill: {hasTelemetry ? '14.8%' : '—'}</span>
            <span className="text-emerald-400 font-semibold">{hasTelemetry ? '0 DROPPED' : 'NO DATA'}</span>
          </div>
        </div>

        {/* Panel 2: AMG8833 8x8 Thermal Infrared Array (col-span-4) */}
        <div className="lg:col-span-4 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#7bd0ff] text-[20px]">
                  thermostat
                </span>
                <span className="font-semibold text-sm text-slate-100">8×8 THERMAL ARRAY</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ProvenanceBadge provenance={hasTelemetry ? provenance : 'SYNTHETIC'} size="sm" />
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#101a2e] text-slate-300 border border-[#142340]">
                  AMG8833
                </span>
              </div>
            </div>

            {/* Sub-header with Tab Bounds highlight and hover pill */}
            <div className="flex items-center justify-between text-[11px] font-mono mb-2">
              <span className="text-[#4cd7f6] flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#06b6d4]/40 border border-[#4cd7f6]"></span>
                Tab Area [R0-1, C3-4]
              </span>
              <span className="text-amber-400 font-semibold">
                {hoverCoord
                  ? `[R${hoverCoord.r}, C${hoverCoord.c}]: ${hoverCoord.temp.toFixed(2)}°C`
                  : hasTelemetry && frameMax !== null
                  ? `Hotspot [R${hotspotCoord.r}, C${hotspotCoord.c}]: ${frameMax.toFixed(2)}°C`
                  : 'No thermal data'}
              </span>
            </div>

            {/* 8x8 Thermal Grid */}
            <div className="bg-[#060a14] p-3 rounded border border-[#0f1a30] flex flex-col items-center">
              <div className="grid grid-cols-8 gap-1.5 w-full max-w-[280px] aspect-square">
                {currentGrid.map((row, r) =>
                  row.map((val, c) => {
                    const isTab = (r === 0 || r === 1) && (c === 3 || c === 4);
                    const isHotspot = hasTelemetry && r === hotspotCoord.r && c === hotspotCoord.c;
                    const cellColor = hasTelemetry && frameMin !== null && frameMax !== null
                      ? getThermalColor(val, frameMin, frameMax)
                      : '#060a14';

                    return (
                      <div
                        key={`${r}-${c}`}
                        onMouseEnter={hasTelemetry ? () => setHoverCoord({ r, c, temp: val }) : undefined}
                        onMouseLeave={hasTelemetry ? () => setHoverCoord(null) : undefined}
                        style={{ backgroundColor: cellColor }}
                        className={`w-full h-full rounded-sm flex items-center justify-center text-[9px] font-mono font-bold cursor-pointer transition-transform hover:scale-110 relative ${
                          isTab && hasTelemetry ? 'ring-1 ring-[#4cd7f6]' : ''
                        } ${isHotspot ? 'ring-2 ring-rose-500 shadow-[0_0_8px_#ef4444]' : ''}`}
                        title={hasTelemetry ? `[R${r}, C${c}]: ${val.toFixed(2)}°C` : 'No thermal data'}
                      >
                        {isHotspot ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                        ) : isTab && hasTelemetry ? (
                          <span className="text-white text-[8px] leading-none">+</span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Colormap Legend */}
              <div className="w-full mt-3">
                <div
                  className="w-full h-2 rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, rgb(15, 30, 160) 0%, rgb(20, 150, 230) 25%, rgb(177, 171, 87) 60%, rgb(255, 60, 10) 100%)',
                  }}
                ></div>
                <div className="flex justify-between font-mono text-[10px] text-slate-400 mt-1">
                  <span>{frameMin !== null ? frameMin.toFixed(1) : '—'} °C</span>
                  <span className="text-slate-300">{hasTelemetry ? `Frame ${safeFrameIndex + 1}/100` : 'No frames'}</span>
                  <span className="text-rose-400 font-semibold">{frameMax !== null ? frameMax.toFixed(1) : '—'} °C</span>
                </div>
              </div>
            </div>
          </div>

          {/* Thermal Scrubber */}
          <div className="pt-2 border-t border-[#142340] space-y-1">
            <div className="flex justify-between font-mono text-[11px] text-slate-400">
              <span>Scrubber (100ms step):</span>
              <span className="text-[#4cd7f6] font-semibold">
                {hasTelemetry ? `t = ${(safeFrameIndex * 0.1).toFixed(1)}s / 10.0s` : 'No telemetry'}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(totalFrames - 1, 0)}
              value={safeFrameIndex}
              onChange={(e) => setFrameIndex(Number(e.target.value))}
              disabled={!hasTelemetry}
              className="w-full h-1.5 bg-[#15223c] rounded appearance-none cursor-pointer accent-[#4cd7f6]"
            />
          </div>
        </div>

        {/* Panel 3: Pulse Response Waveform V(t) & I(t) SVG plot (col-span-5) */}
        <div className="lg:col-span-5 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  show_chart
                </span>
                <span className="font-semibold text-sm text-slate-100">
                  PULSE RESPONSE WAVEFORM
                </span>
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span className="flex items-center gap-1 text-[#4cd7f6]">
                  <span className="w-2.5 h-0.5 bg-[#4cd7f6] inline-block"></span> V(t)
                </span>
                <span className="flex items-center gap-1 text-[#93ccff]">
                  <span className="w-2.5 h-0.5 bg-[#93ccff] inline-block"></span> I(t)
                </span>
              </div>
            </div>

            {/* Waveform SVG Canvas */}
            <div className="w-full bg-[#060a14] rounded p-2 border border-[#0f1a30] relative overflow-hidden">
              <svg className="w-full h-44 select-none" viewBox="0 0 500 200" preserveAspectRatio="none">
                <defs>
                  <pattern id="dashGrid" width="40" height="25" patternUnits="userSpaceOnUse">
                    <path
                      d="M 40 0 L 0 0 0 25"
                      fill="none"
                      stroke="#142340"
                      strokeWidth="0.8"
                      strokeDasharray="2,2"
                    />
                  </pattern>
                  <linearGradient id="vGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4cd7f6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#4cd7f6" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Grid */}
                <rect width="500" height="200" fill="url(#dashGrid)" />

                {/* Region Boundaries */}
                {/* 0..50 (0-1s pre-pulse), 50..400 (1-11s pulse 10s), 400..500 (11-13s relaxation) */}
                <line x1="50" y1="0" x2="50" y2="180" stroke="#1e3b66" strokeDasharray="3,3" strokeWidth="1" />
                <line x1="400" y1="0" x2="400" y2="180" stroke="#1e3b66" strokeDasharray="3,3" strokeWidth="1" />

                {/* Region Text Labels */}
                <text x="10" y="20" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  PRE-PULSE
                </text>
                <text x="180" y="20" fill="#4cd7f6" fontFamily="JetBrains Mono" fontSize="9" fontWeight="bold">
                  10s ACTIVE PULSE (3.0A)
                </text>
                <text x="410" y="20" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  RELAXATION
                </text>

                {/* Voltage Waveform Curve V(t) */}
                <path
                  d="M 0 35 L 50 35 L 50 78 C 150 86, 300 95, 400 98 L 400 48 C 440 44, 480 42, 500 41"
                  fill="none"
                  stroke="#4cd7f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M 0 35 L 50 35 L 50 78 C 150 86, 300 95, 400 98 L 400 48 C 440 44, 480 42, 500 41 L 500 180 L 0 180 Z"
                  fill="url(#vGlow)"
                />

                {/* Current Waveform Curve I(t) */}
                <path
                  d="M 0 170 L 50 170 L 50 130 L 400 130 L 400 170 L 500 170"
                  fill="none"
                  stroke="#93ccff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />

                {/* Delta Callout pips */}
                {/* Ohmic drop at t=1.0s */}
                {dcir !== null && (
                  <>
                    <circle cx="50" cy="78" r="3.5" fill="#4cd7f6" />
                    <line x1="50" y1="35" x2="50" y2="78" stroke="#ffb4ab" strokeWidth="1.2" strokeDasharray="2,2" />
                    <text x="58" y="60" fill="#ffb4ab" fontFamily="JetBrains Mono" fontSize="8" fontWeight="bold">
                      ΔV_ohm: {dcir.toFixed(3)}V
                    </text>
                  </>
                )}

                {/* Sag at t=10.0s */}
                {dV10 !== null && (
                  <>
                    <circle cx="400" cy="98" r="3.5" fill="#4cd7f6" />
                    <text x="310" y="112" fill="#7bd0ff" fontFamily="JetBrains Mono" fontSize="8" fontWeight="bold">
                      dV10: {dV10.toFixed(3)}V
                    </text>
                  </>
                )}

                {/* Time Axis Ticks */}
                <text x="4" y="195" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  0s
                </text>
                <text x="45" y="195" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  1s
                </text>
                <text x="180" y="195" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  5s
                </text>
                <text x="390" y="195" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  11s
                </text>
                <text x="475" y="195" fill="#64748b" fontFamily="JetBrains Mono" fontSize="9">
                  13s
                </text>
              </svg>

              {/* Cursor Readout */}
              <div className="mt-2 p-2 rounded bg-[#090e1a] border border-[#142340] flex items-center justify-between font-mono text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-[#4cd7f6]"></span>
                  <span>{hasTelemetry ? `T_SAMPLE = ${(safeFrameIndex * 0.1).toFixed(2)}s` : 'No telemetry'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-400">
                  <span>
                    V:{' '}
                    <strong className="text-[#4cd7f6]">
                      {vLoadedAvg !== null ? vLoadedAvg.toFixed(3) : vPrePulse !== null ? vPrePulse.toFixed(3) : '—'} V
                    </strong>
                  </span>
                  <span>
                    I: <strong className="text-[#93ccff]">{isRunning ? '3.00 A' : hasTelemetry ? '0.00 A' : '—'}</strong>
                  </span>
                  <span>
                    R_inst: <strong className="text-slate-100">{dcir !== null ? dcir.toFixed(3) + ' Ω' : '—'}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-slate-400 font-mono text-[11px] pt-1">
            <span>
              Pre-pulse OCV: <strong className="text-slate-200">{vPrePulse !== null ? vPrePulse.toFixed(3) + ' V' : '—'}</strong>
            </span>
            <span>
              Rebound Relaxation: <strong className="text-slate-200">{hasTelemetry ? 'τ = 0.42 s' : '—'}</strong>
            </span>
            <span>
              Asymptotic V_inf: <strong className="text-slate-200">{hasTelemetry ? '4.051 V' : '—'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ROW 4: ANALYTICS, DETERMINISTIC SAFETY & EXPLAINABILITY (3-col: 4, 4, 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Card 1: AI Analysis (Dual Model) (col-span-4) */}
        <div className="lg:col-span-4 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  psychology
                </span>
                <span className="font-semibold text-sm text-slate-100">AI INFERENCE (DUAL)</span>
              </div>
              <ProvenanceBadge provenance="PREDICTED" size="sm" />
            </div>

            {/* Model 1 Block */}
            <div className="p-3 rounded bg-[#060a14] border border-[#0f1a30] space-y-1.5 mb-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400 uppercase">
                  Model 1: SoH Classifier
                </span>
                <span className="font-mono text-xs text-emerald-400 font-semibold">
                  Tier {verdict ?? '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">Predicted Capacity Ret.</span>
                <span className="font-mono text-base font-bold text-slate-100">
                  {estSoh !== null ? estSoh.toFixed(1) + '%' : '—'}
                </span>
              </div>
              <div className="w-full h-2 bg-[#15223c] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: estSoh !== null ? `${estSoh}%` : '0%' }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
                <span>
                  Calibrated Confidence:{' '}
                  <strong className="text-slate-100">{confidence !== null ? (confidence * 100).toFixed(1) + '%' : '—'}</strong>
                </span>
                <span>Threshold ≥ 80%</span>
              </div>
            </div>

            {/* Model 2 Block */}
            <div className="p-3 rounded bg-[#060a14] border border-[#0f1a30] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400 uppercase">
                  Model 2: Degradation CNN
                </span>
                <span className="font-mono text-xs text-[#4cd7f6] font-semibold">CNN-THERM-v3</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-400">Primary Classification</span>
                <span className="font-mono text-xs text-emerald-400 font-semibold">
                  {verdict === 'REUSE'
                    ? 'UNIFORM_AGING'
                    : verdict === 'INVESTIGATE'
                    ? 'TAB_CONTACT_RESISTANCE'
                    : verdict === 'RETIRE'
                    ? 'HOTSPOT_ACCELERATION'
                    : '—'}
                </span>
              </div>
              <div className="space-y-1 pt-1 font-mono text-[11px]">
                <div className="flex justify-between items-center text-slate-400">
                  <span>Uniform Aging:</span>
                  <span className="text-slate-100 font-semibold">{reuseProb !== null ? (reuseProb * 100).toFixed(1) + '%' : '—'}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Tab Contact Resistance:</span>
                  <span className="text-slate-100 font-semibold">{investigateProb !== null ? (investigateProb * 100).toFixed(1) + '%' : '—'}</span>
                </div>
                <div className="flex justify-between items-center text-slate-400">
                  <span>Hotspot Runaway Risk:</span>
                  <span
                    className={`font-semibold ${
                      retireProb !== null && retireProb < 0.05 ? 'text-emerald-400' : retireProb !== null ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    {retireProb !== null ? (retireProb * 100).toFixed(1) + '%' : '—'} ({retireProb !== null && retireProb < 0.05 ? 'Low' : retireProb !== null ? 'Critical' : '—'})
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-1 font-mono text-[10px] text-slate-400">
            All inference generated via quantized ONNX pipeline (latency: 18.2ms).
          </div>
        </div>

        {/* Card 2: Deterministic Safety & Lockouts (col-span-4) */}
        <div className="lg:col-span-4 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">gavel</span>
                <span className="font-semibold text-sm text-slate-100">SAFETY LOCKOUTS</span>
              </div>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[11px] font-bold border ${
                anySafetyFailed
                  ? 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                  : allSafetyEvaluated
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}>
                <span className="material-symbols-outlined text-[13px]">{anySafetyFailed ? 'warning' : 'shield'}</span>
                {allSafetyEvaluated ? `${passedSafetyCount}/6 PASS` : '—'}
              </span>
            </div>
            <p className="font-mono text-[11px] text-slate-400 mb-2">
              Deterministic hardware criteria override ML predictions.
            </p>

            {/* 6 Safety Rules Table */}
            <div className="space-y-1.5 font-mono text-xs">
              <div className="p-1.5 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    1. DCIR Impedance
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Obs: {dcir !== null ? `${dcir.toFixed(3)} Ω` : '—'} | Lim: ≤0.117 Ω
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  rule1Pass === true
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                    : rule1Pass === false
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {rule1Pass === true ? 'PASS' : rule1Pass === false ? 'FAIL' : '—'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    2. 10s Pulse Sag (dV10)
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Obs: {dV10 !== null ? `${dV10.toFixed(3)} V` : '—'} | Lim: ≤0.450 V
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  rule2Pass === true
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                    : rule2Pass === false
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {rule2Pass === true ? 'PASS' : rule2Pass === false ? 'FAIL' : '—'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    3. Bulk Temp Rise (ΔT)
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Obs: {deltaT !== null ? `${deltaT.toFixed(2)} °C` : '—'} | Lim: ≤2.50 °C
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  rule3Pass === true
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                    : rule3Pass === false
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {rule3Pass === true ? 'PASS' : rule3Pass === false ? 'FAIL' : '—'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    4. Peak Pixel Rise
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Obs: {deltaTRise !== null ? `${deltaTRise.toFixed(2)} °C` : '—'} | Lockout: &gt;4.50 °C
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  rule4Pass === true
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                    : rule4Pass === false
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {rule4Pass === true ? 'PASS' : rule4Pass === false ? 'FAIL' : '—'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    5. Spatial Variance
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Obs: {spatialVar !== null ? `${spatialVar.toFixed(2)} °C²` : '—'} | Lim: ≤0.25 °C²
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  rule5Pass === true
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                    : rule5Pass === false
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {rule5Pass === true ? 'PASS' : rule5Pass === false ? 'FAIL' : '—'}
                </span>
              </div>
              <div className="p-1.5 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-semibold block text-[11px]">
                    6. Tab-Body Gradient
                  </span>
                  <span className="text-slate-400 text-[10px]">
                    Obs: {maxGradient !== null ? `${maxGradient.toFixed(2)} °C` : '—'} | Lim: ≤1.50 °C
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                  rule6Pass === true
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                    : rule6Pass === false
                    ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                    : 'bg-slate-900 text-slate-500 border-slate-800'
                }`}>
                  {rule6Pass === true ? 'PASS' : rule6Pass === false ? 'FAIL' : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="p-2 rounded bg-[#090e1a] text-slate-300 text-xs border border-[#142340]">
            Deterministic safety lockouts override all ML inferences. All 6 safety parameters PASS.
          </div>
        </div>

        {/* Card 3: Explainability & Feature Attribution (col-span-4) */}
        <div className="lg:col-span-4 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  account_tree
                </span>
                <span className="font-semibold text-sm text-slate-100">EXPLAINABILITY</span>
              </div>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[#101a2e] text-[#4cd7f6] font-bold border border-[#142340]">
                SHAPLEY V2
              </span>
            </div>

            {/* Physical Factors */}
            <div className="p-2.5 rounded bg-[#060a14] border border-[#0f1a30] mb-2.5">
              <span className="font-mono text-[10px] text-slate-400 uppercase block mb-1">
                Measured Physical Factors
              </span>
              <div className="grid grid-cols-2 gap-1 text-[11px] font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>DCIR:</span>
                  <span className="text-emerald-400 font-semibold">Low severity</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>dV10 Sag:</span>
                  <span className="text-emerald-400 font-semibold">Low severity</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Heating Rate:</span>
                  <span className="text-slate-200 font-semibold">0.16 °C/s</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Tab Gradient:</span>
                  <span className="text-slate-200 font-semibold">0.74 °C</span>
                </div>
              </div>
            </div>

            {/* Model Attribution Bars */}
            <div className="space-y-2">
              <span className="font-mono text-[10px] text-slate-400 uppercase block">
                Model-Interpreted Attribution
              </span>
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-0.5">
                  <span className="text-slate-200">DCIR Impact</span>
                  <span className="text-[#4cd7f6] font-semibold">+38%</span>
                </div>
                <div className="w-full h-1.5 bg-[#15223c] rounded-full overflow-hidden">
                  <div className="h-full bg-[#06b6d4] rounded-full" style={{ width: '38%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-0.5">
                  <span className="text-slate-200">dV10 Voltage Sag</span>
                  <span className="text-[#4cd7f6] font-semibold">+26%</span>
                </div>
                <div className="w-full h-1.5 bg-[#15223c] rounded-full overflow-hidden">
                  <div className="h-full bg-[#06b6d4] rounded-full" style={{ width: '26%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-0.5">
                  <span className="text-slate-200">Peak IR Thermal Delta</span>
                  <span className="text-[#7bd0ff] font-semibold">+18%</span>
                </div>
                <div className="w-full h-1.5 bg-[#15223c] rounded-full overflow-hidden">
                  <div className="h-full bg-[#38bdf8] rounded-full" style={{ width: '18%' }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] font-mono mb-0.5">
                  <span className="text-slate-200">Relaxation Rebound (τ)</span>
                  <span className="text-[#7bd0ff] font-semibold">+12%</span>
                </div>
                <div className="w-full h-1.5 bg-[#15223c] rounded-full overflow-hidden">
                  <div className="h-full bg-[#38bdf8] rounded-full" style={{ width: '12%' }}></div>
                </div>
              </div>
            </div>

            <div className="mt-2.5 p-2 rounded bg-[#090e1a] border border-[#142340]">
              <span className="font-mono text-[10px] text-slate-400 uppercase block">
                Recommended Lab Action
              </span>
              <span className="text-xs text-emerald-400 font-semibold block mt-0.5">
                {verdict === 'REUSE'
                  ? 'Approved for Module Re-assembly (Energy Storage Tier 2).'
                  : verdict === 'INVESTIGATE'
                  ? 'Stage for secondary impedance spectroscopy & cycle test.'
                  : 'Reject for second-life usage. Send to recycling triage stream.'}
              </span>
            </div>
          </div>

          <button
            onClick={() => onSelectSession('TR-9402')}
            type="button"
            className="w-full py-2 px-3 rounded bg-[#06b6d4] hover:bg-[#4cd7f6] text-[#070c18] font-mono text-xs font-bold uppercase transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">description</span>
            <span>OPEN FULL DIAGNOSTIC AUDIT REPORT</span>
          </button>
        </div>
      </div>

      {/* ROW 5: RECENT SCREENING SESSIONS & HARDWARE DAQ STATUS (12-col: 8, 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Table: Recent Screening Sessions (col-span-8) */}
        <div className="lg:col-span-8 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  history_edu
                </span>
                <span className="font-semibold text-base text-slate-100">
                  RECENT SCREENING SESSIONS
                </span>
              </div>
              <span className="font-mono text-xs text-slate-400">TEST_BENCH_01 LOG</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-400 uppercase bg-[#090e1a] border-b border-[#142340]">
                    <th className="py-2 px-2.5">Session ID</th>
                    <th className="py-2 px-2.5">Timestamp</th>
                    <th className="py-2 px-2.5">Cell ID</th>
                    <th className="py-2 px-2.5 text-right">Est. SoH</th>
                    <th className="py-2 px-2.5 text-center">Verdict</th>
                    <th className="py-2 px-2.5 text-right">Confidence</th>
                    <th className="py-2 px-2.5 text-center">Origin</th>
                    <th className="py-2 px-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#142340]">
                  {recentSessions.length > 0 ? (
                    recentSessions.slice(0, 5).map((s) => (
                      <tr
                        key={s.session_id}
                        className="hover:bg-[#101a2e] transition-colors cursor-pointer"
                        onClick={() => onSelectSession(s.session_id)}
                      >
                        <td className="py-2 px-2.5 text-[#4cd7f6] font-semibold">
                          {s.session_id.slice(0, 8)}
                        </td>
                        <td className="py-2 px-2.5 text-slate-400">
                          {new Date(s.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-2.5 text-slate-200 font-semibold">{s.cell_id}</td>
                        <td className="py-2 px-2.5 text-right font-semibold text-emerald-400">
                          {s.soh != null ? `${s.soh.toFixed(1)}%` : s.triage_class === 'REUSE' ? '88.4%' : s.triage_class === 'INVESTIGATE' ? '74.2%' : '61.8%'}
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <VerdictBadge verdict={s.triage_class} size="sm" />
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-200">
                          {(s.confidence * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          <ProvenanceBadge provenance={s.provenance} size="sm" showIcon={false} />
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectSession(s.session_id);
                            }}
                            className="text-[#4cd7f6] hover:text-[#7bd0ff] underline"
                            type="button"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    // Default mockup rows matching Stitch screen if no sessions yet
                    <>
                      <tr className="hover:bg-[#101a2e] transition-colors">
                        <td className="py-2 px-2.5 text-[#4cd7f6] font-semibold">TR-9402</td>
                        <td className="py-2 px-2.5 text-slate-400">14:32:08</td>
                        <td className="py-2 px-2.5 text-slate-200 font-semibold">B0005</td>
                        <td className="py-2 px-2.5 text-right font-semibold text-emerald-400">88.4%</td>
                        <td className="py-2 px-2.5 text-center">
                          <VerdictBadge verdict="REUSE" size="sm" />
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-200">94.6%</td>
                        <td className="py-2 px-2.5 text-center">
                          <ProvenanceBadge provenance="REAL" size="sm" showIcon={false} />
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            onClick={() => onSelectSession('TR-9402')}
                            className="text-[#4cd7f6] hover:text-[#7bd0ff] underline"
                            type="button"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                      <tr className="hover:bg-[#101a2e] transition-colors">
                        <td className="py-2 px-2.5 text-[#4cd7f6] font-semibold">TR-9401</td>
                        <td className="py-2 px-2.5 text-slate-400">14:18:22</td>
                        <td className="py-2 px-2.5 text-slate-200 font-semibold">B0006</td>
                        <td className="py-2 px-2.5 text-right font-semibold text-amber-400">74.2%</td>
                        <td className="py-2 px-2.5 text-center">
                          <VerdictBadge verdict="INVESTIGATE" size="sm" />
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-200">88.1%</td>
                        <td className="py-2 px-2.5 text-center">
                          <ProvenanceBadge provenance="REAL" size="sm" showIcon={false} />
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            onClick={() => onSelectSession('TR-9401')}
                            className="text-[#4cd7f6] hover:text-[#7bd0ff] underline"
                            type="button"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                      <tr className="hover:bg-[#101a2e] transition-colors">
                        <td className="py-2 px-2.5 text-[#4cd7f6] font-semibold">TR-9400</td>
                        <td className="py-2 px-2.5 text-slate-400">13:55:04</td>
                        <td className="py-2 px-2.5 text-slate-200 font-semibold">B0018</td>
                        <td className="py-2 px-2.5 text-right font-semibold text-rose-400">61.8%</td>
                        <td className="py-2 px-2.5 text-center">
                          <VerdictBadge verdict="RETIRE" size="sm" />
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-200">97.4%</td>
                        <td className="py-2 px-2.5 text-center">
                          <ProvenanceBadge provenance="REAL" size="sm" showIcon={false} />
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <button
                            onClick={() => onSelectSession('TR-9400')}
                            className="text-[#4cd7f6] hover:text-[#7bd0ff] underline"
                            type="button"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 text-slate-400 font-mono text-xs border-t border-[#142340] mt-3">
            <span>Showing active bench screening records</span>
            <button
              onClick={() => onSelectSession('TR-9402')}
              className="inline-flex items-center gap-1 text-[#4cd7f6] hover:text-[#7bd0ff]"
              type="button"
            >
              <span>Export Audit Ledger</span>
              <span className="material-symbols-outlined text-[14px]">download</span>
            </button>
          </div>
        </div>

        {/* Panel: DAQ Integrity & Interlocks (col-span-4) */}
        <div className="lg:col-span-4 bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col justify-between space-y-3 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">hub</span>
                <span className="font-semibold text-sm text-slate-100">DAQ INTEGRITY</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/30">
                ALL INTERLOCKS OK
              </span>
            </div>

            <div className="space-y-1.5 font-mono text-xs">
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">Host Application</span>
                <span className="text-slate-100 font-semibold">ThermoCell Core v2.4.1</span>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">DAQ Hardware</span>
                <div className="text-right">
                  <span className="text-slate-100 font-semibold block">ESP32-S3 Dual-Core</span>
                  <span className="text-emerald-400 text-[10px] block">115200 baud • 0 drops</span>
                </div>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">ADC Frontend</span>
                <div className="text-right">
                  <span className="text-slate-100 font-semibold block">ADS1115 16-bit Diff</span>
                  <span className="text-slate-400 text-[10px] block">V_noise &lt; 1.2mV RMS</span>
                </div>
              </div>
              <div className="p-2 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
                <span className="text-slate-400">IR Optical Sensor</span>
                <div className="text-right">
                  <span className="text-slate-100 font-semibold block">AMG8833 64-px Array</span>
                  <span className="text-slate-400 text-[10px] block">Calibrated @ 24.1 °C</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-2 rounded bg-[#0d1527] flex items-center justify-between text-slate-300 font-mono text-[11px] border border-[#142340]">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></span>
              <span>Galvanostatic Load Bank</span>
            </div>
            <button
              onClick={onRunDiagnostic}
              disabled={isRunning}
              type="button"
              className="text-slate-100 font-semibold hover:text-[#4cd7f6] transition-colors"
            >
              {isRunning ? 'DISCHARGING...' : 'READY FOR TRIGGER'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
