import React from 'react';
import { Activity, Thermometer } from 'lucide-react';

interface PulseChartProps {
  timestamps: number[];
  voltage: number[];
  bulkTemperature: number[];
  vPrePulse: number;
}

export const PulseChart: React.FC<PulseChartProps> = ({
  timestamps,
  voltage,
  bulkTemperature,
  vPrePulse,
}) => {
  const count = timestamps.length || 100;
  const safeVoltage = voltage.length ? voltage : Array(100).fill(4.14);
  const safeTemp = bulkTemperature.length ? bulkTemperature : Array(100).fill(24.0);

  // Voltage scaling
  const minV = Math.min(...safeVoltage) - 0.05;
  const maxV = Math.max(vPrePulse, Math.max(...safeVoltage)) + 0.02;

  // Temperature scaling
  const minT = Math.min(...safeTemp) - 0.1;
  const maxT = Math.max(...safeTemp) + 0.2;

  // Generate SVG path points (width=400, height=120)
  const chartW = 380;
  const chartH = 100;

  const pointsV = safeVoltage.map((v, i) => {
    const x = (i / (count - 1)) * chartW;
    const y = chartH - ((v - minV) / (maxV - minV)) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pointsT = safeTemp.map((t, i) => {
    const x = (i / (count - 1)) * chartW;
    const y = chartH - ((t - minT) / (maxT - minT)) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const vDrop = (vPrePulse - safeVoltage[safeVoltage.length - 1]).toFixed(3);
  const tRise = (safeTemp[safeTemp.length - 1] - safeTemp[0]).toFixed(2);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          10-Second 3A Discharge Pulse Waveforms
        </h3>
        <span className="text-xs font-mono text-slate-400">100 Samples @ 10Hz</span>
      </div>

      {/* Voltage Chart */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-sky-400 font-semibold flex items-center gap-1.5">
            Cell Voltage V(t)
          </span>
          <div className="flex items-center gap-3 font-mono text-slate-300">
            <span>OCV: <strong className="text-white">{vPrePulse.toFixed(3)}V</strong></span>
            <span>ΔV₁₀: <strong className="text-sky-300">-{vDrop}V</strong></span>
          </div>
        </div>
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-24 overflow-visible">
            {/* Gridlines */}
            <line x1="0" y1="0" x2={chartW} y2="0" stroke="#1e293b" strokeDasharray="3 3" />
            <line x1="0" y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="#1e293b" strokeDasharray="3 3" />
            <line x1="0" y1={chartH} x2={chartW} y2={chartH} stroke="#1e293b" strokeDasharray="3 3" />
            
            {/* Waveform curve */}
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsV.join(' ')}
            />
          </svg>
        </div>
      </div>

      {/* Temperature Chart */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-amber-400 font-semibold flex items-center gap-1.5">
            <Thermometer className="w-3.5 h-3.5" />
            Bulk Temperature T(t)
          </span>
          <div className="flex items-center gap-3 font-mono text-slate-300">
            <span>T₀: <strong className="text-white">{safeTemp[0].toFixed(2)}°C</strong></span>
            <span>ΔT: <strong className="text-amber-300">+{tRise}°C</strong></span>
          </div>
        </div>
        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800/80">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-24 overflow-visible">
            {/* Gridlines */}
            <line x1="0" y1="0" x2={chartW} y2="0" stroke="#1e293b" strokeDasharray="3 3" />
            <line x1="0" y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="#1e293b" strokeDasharray="3 3" />
            <line x1="0" y1={chartH} x2={chartW} y2={chartH} stroke="#1e293b" strokeDasharray="3 3" />
            
            {/* Temperature curve */}
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsT.join(' ')}
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
