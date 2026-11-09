import React from 'react';
import { Play, BatteryCharging, AlertCircle, ShieldAlert, Cpu } from 'lucide-react';

interface DemoControlBarProps {
  selectedProfile: 'nominal' | 'marginal' | 'degraded';
  onSelectProfile: (profile: 'nominal' | 'marginal' | 'degraded') => void;
  selectedCellId: string;
  onSelectCellId: (cellId: string) => void;
  onRunTest: () => void;
  isLoading: boolean;
}

export const DemoControlBar: React.FC<DemoControlBarProps> = ({
  selectedProfile,
  onSelectProfile,
  selectedCellId,
  onSelectCellId,
  onRunTest,
  isLoading,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
      {/* Profile Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
          <Cpu className="w-3.5 h-3.5" />
          Test Profile:
        </span>

        <button
          onClick={() => onSelectProfile('nominal')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
            selectedProfile === 'nominal'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-600 shadow-sm'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
          Healthy (Cyc 10)
        </button>

        <button
          onClick={() => onSelectProfile('marginal')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
            selectedProfile === 'marginal'
              ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          Marginal (Cyc 85)
        </button>

        <button
          onClick={() => onSelectProfile('degraded')}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
            selectedProfile === 'degraded'
              ? 'bg-rose-950 text-rose-300 border-rose-600 shadow-sm'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          Degraded (Cyc 160)
        </button>
      </div>

      {/* Cell Selector & Run Trigger */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        <select
          value={selectedCellId}
          onChange={(e) => onSelectCellId(e.target.value)}
          className="bg-slate-950 text-slate-200 text-xs rounded-lg border border-slate-800 px-3 py-1.5 font-mono focus:outline-none focus:border-indigo-500"
        >
          <option value="B0005">Cell: B0005 (NASA)</option>
          <option value="B0006">Cell: B0006 (NASA)</option>
          <option value="B0007">Cell: B0007 (NASA)</option>
          <option value="B0018">Cell: B0018 (NASA)</option>
          <option value="HW-001">Cell: HW-001 (Hardware Bench)</option>
        </select>

        <button
          onClick={onRunTest}
          disabled={isLoading}
          className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-900/30"
        >
          <Play className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {isLoading ? 'Executing Pulse (10s)...' : 'Run 10s Diagnostic'}
        </button>
      </div>
    </div>
  );
};
