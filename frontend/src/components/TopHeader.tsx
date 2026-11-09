import React from 'react';
import { ProvenanceBadge } from './ProvenanceBadge';

interface TopHeaderProps {
  selectedCell: string;
  onSelectCell: (cellId: string) => void;
  cellsList: string[];
  selectedCycle?: number | null;
  onSelectCycle?: (cycle: number) => void;
  availableCycles?: number[];
  activeProfile: 'nominal' | 'marginal' | 'degraded';
  onSelectProfile: (profile: 'nominal' | 'marginal' | 'degraded') => void;
  onRunDiagnostic: () => void;
  isRunningDiagnostic: boolean;
  provenance: 'REAL' | 'SYNTHETIC' | 'PREDICTED';
  isHardwareMode: boolean;
  onOpenLoginModal: () => void;
  isAuthenticated: boolean;
  operatorId?: string;
}

const CELL_TIER_CYCLES: Record<string, { nominal: number; marginal: number; degraded: number; all: number[] }> = {
  B0005: { nominal: 1, marginal: 85, degraded: 160, all: [1, 40, 85, 160] },
  B0006: { nominal: 1, marginal: 90, degraded: 155, all: [1, 50, 90, 155] },
  B0007: { nominal: 1, marginal: 110, degraded: 165, all: [1, 60, 110, 165] },
  B0018: { nominal: 1, marginal: 80, degraded: 130, all: [1, 45, 80, 130] },
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  selectedCell,
  onSelectCell,
  cellsList,
  selectedCycle,
  onSelectCycle,
  availableCycles,
  activeProfile,
  onSelectProfile,
  onRunDiagnostic,
  isRunningDiagnostic,
  provenance,
  isHardwareMode,
  onOpenLoginModal,
  isAuthenticated,
  operatorId = 'OP-4482',
}) => {
  const cellTiers = CELL_TIER_CYCLES[selectedCell] || {
    nominal: 1,
    marginal: 85,
    degraded: 160,
    all: availableCycles || [1, 85, 160],
  };

  const cyclesToDisplay = availableCycles && availableCycles.length > 0 ? availableCycles : cellTiers.all;

  return (
    <header className="fixed top-0 left-16 md:left-64 right-0 h-16 bg-[#08101e]/95 backdrop-blur-md z-40 px-4 md:px-6 flex items-center justify-between border-b border-[#142340]">
      {/* Left: Bench Breadcrumb & Bench Status Badges */}
      <div className="flex items-center gap-3 overflow-x-auto py-1">
        <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
          <span className="text-slate-400">LAB</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-100 font-semibold tracking-wider uppercase">
            TEST_BENCH_01
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-2 shrink-0 pl-3 border-l border-[#142340]">
          <ProvenanceBadge provenance={provenance} size="sm" />
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#101a2e] font-mono text-[11px] text-slate-200 border border-[#142340]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4cd7f6] animate-pulse"></span>
            {isHardwareMode ? 'ESP32 HW ACTIVE' : 'ESP32 ONLINE'}
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#090e1a] font-mono text-[11px] text-slate-400 border border-[#142340]">
            {isRunningDiagnostic ? (
              <span className="text-[#4cd7f6] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4cd7f6] animate-ping"></span>
                ACTIVE PULSE
              </span>
            ) : (
              'IDLE STATE'
            )}
          </span>
        </div>

        {/* Cell Selector Dropdown */}
        <div className="flex items-center shrink-0 ml-1">
          <select
            value={selectedCell}
            onChange={(e) => onSelectCell(e.target.value)}
            disabled={isRunningDiagnostic}
            className="bg-[#060a14] text-slate-200 font-mono text-xs px-2.5 py-1.5 rounded border border-[#142340] focus:border-[#4cd7f6] outline-none cursor-pointer transition-colors"
          >
            {cellsList.map((cell) => (
              <option key={cell} value={cell}>
                CELL: {cell}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic Cycle Selector Dropdown for Selected Cell */}
        {cyclesToDisplay && cyclesToDisplay.length > 0 && (
          <div className="flex items-center shrink-0 ml-1">
            <select
              value={selectedCycle ?? cyclesToDisplay[0]}
              onChange={(e) => onSelectCycle?.(Number(e.target.value))}
              disabled={isRunningDiagnostic}
              className="bg-[#060a14] text-[#4cd7f6] font-mono text-xs px-2.5 py-1.5 rounded border border-[#142340] focus:border-[#4cd7f6] outline-none cursor-pointer transition-colors"
              title="Select NASA Aging Cycle"
            >
              {cyclesToDisplay.map((cyc) => (
                <option key={cyc} value={cyc}>
                  CYCLE: {cyc}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Profile Presets, Diagnostic CTA & Security */}
      <div className="flex items-center gap-2.5 shrink-0 ml-2">
        {/* Preset Selectors with Cell-Specific Benchmark Cycle Numbers */}
        <div className="hidden xl:flex items-center bg-[#060a14] p-1 rounded border border-[#142340]">
          <button
            onClick={() => onSelectProfile('nominal')}
            disabled={isRunningDiagnostic}
            type="button"
            className={`px-2 py-1 rounded font-mono text-[11px] transition-colors ${
              activeProfile === 'nominal'
                ? 'bg-[#15223c] text-[#4cd7f6] font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {`Healthy C${cellTiers.nominal}`}
          </button>
          <button
            onClick={() => onSelectProfile('marginal')}
            disabled={isRunningDiagnostic}
            type="button"
            className={`px-2 py-1 rounded font-mono text-[11px] transition-colors ${
              activeProfile === 'marginal'
                ? 'bg-[#15223c] text-amber-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {`Marginal C${cellTiers.marginal}`}
          </button>
          <button
            onClick={() => onSelectProfile('degraded')}
            disabled={isRunningDiagnostic}
            type="button"
            className={`px-2 py-1 rounded font-mono text-[11px] transition-colors ${
              activeProfile === 'degraded'
                ? 'bg-[#15223c] text-rose-400 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {`Degraded C${cellTiers.degraded}`}
          </button>
        </div>

        {/* Primary CTA: Run 10s Diagnostic */}
        <button
          onClick={onRunDiagnostic}
          disabled={isRunningDiagnostic}
          type="button"
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded font-mono text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${
            isRunningDiagnostic
              ? 'bg-[#004e5f] text-slate-300 cursor-not-allowed opacity-90'
              : 'bg-[#06b6d4] hover:bg-[#4cd7f6] active:bg-[#00687a] text-[#070c18]'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isRunningDiagnostic ? 'bg-amber-400 animate-ping' : 'bg-[#070c18]'
            }`}
          ></span>
          <span>{isRunningDiagnostic ? 'SAMPLING (10s)...' : 'RUN 10S DIAGNOSTIC'}</span>
        </button>

        {/* Security / Operator Session Lock Button */}
        <button
          onClick={onOpenLoginModal}
          type="button"
          title={isAuthenticated ? `Authenticated as ${operatorId}` : 'Login Operator'}
          className={`w-8 h-8 rounded flex items-center justify-center transition-colors border ${
            isAuthenticated
              ? 'bg-[#101a2e] text-[#4cd7f6] border-[#06b6d4]/40 hover:bg-[#15223c]'
              : 'bg-[#060a14] text-slate-400 border-[#142340] hover:text-slate-200 hover:bg-[#0d1527]'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {isAuthenticated ? 'lock_open' : 'lock'}
          </span>
        </button>

        {/* Operator Badge Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-[#06b6d4] flex items-center justify-center shrink-0 text-[#070c18] font-bold text-xs"
          title={`Operator: ${operatorId}`}
        >
          <span className="material-symbols-outlined text-[18px]">person</span>
        </div>
      </div>
    </header>
  );
};
