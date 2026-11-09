import React from 'react';
import { Activity, Zap, Gauge, Thermometer, Cpu } from 'lucide-react';

interface LiveTelemetryPanelProps {
  voltage?: number;
  current?: number;
  temperature?: number;
  internalResistance?: number;
  voltageTrend?: string;
  currentTrend?: string;
  tempTrend?: string;
  irTrend?: string;
  isLive?: boolean;
  isSampleData?: boolean;
}

export const LiveTelemetryPanel: React.FC<LiveTelemetryPanelProps> = ({
  voltage,
  current,
  temperature,
  internalResistance,
  voltageTrend,
  currentTrend,
  tempTrend,
  irTrend,
  isLive = true,
  isSampleData = false,
}) => {
  const telemetryItems = [
    {
      id: 'voltage',
      label: 'Voltage',
      value: voltage !== undefined && !isNaN(voltage) ? `${voltage.toFixed(2)} V` : '—',
      trend: voltageTrend || (isSampleData ? '↑ 0.8%' : '—'),
      trendPositive: true,
      Icon: Zap,
    },
    {
      id: 'current',
      label: 'Current',
      value: current !== undefined && !isNaN(current) ? `${current.toFixed(2)} A` : '—',
      trend: currentTrend || (isSampleData ? '↑ 2.1%' : '—'),
      trendPositive: true,
      Icon: Gauge,
    },
    {
      id: 'temp',
      label: 'Temperature',
      value: temperature !== undefined && !isNaN(temperature) ? `${temperature.toFixed(1)} °C` : '—',
      trend: tempTrend || (isSampleData ? '↓ 4.6%' : '—'),
      trendPositive: true,
      Icon: Thermometer,
    },
    {
      id: 'ir',
      label: 'Internal Resistance',
      value: internalResistance !== undefined && !isNaN(internalResistance) ? `${internalResistance.toFixed(3)} Ω` : '—',
      trend: irTrend || (isSampleData ? '↓ 12.3%' : '—'),
      trendPositive: true,
      Icon: Cpu,
    },
  ];

  return (
    <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#142340]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-semibold text-slate-200">
            {isSampleData ? 'Sensor Readings (Sample Data)' : 'Live Sensor Readings'}
          </h3>
        </div>

        {/* Live Status Badge */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
            isSampleData
              ? 'bg-amber-950/70 border-amber-500/40 text-amber-300'
              : isLive
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-900 border-slate-700 text-slate-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isSampleData
                ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                : isLive
                ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]'
                : 'bg-slate-500'
            }`}
          />
          <span>{isSampleData ? 'Sample Data' : isLive ? 'Live ›' : 'Standby'}</span>
        </div>
      </div>

      {/* 4 Telemetry Rows */}
      <div className="flex flex-col gap-3.5 my-2">
        {telemetryItems.map((item) => {
          const Icon = item.Icon;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between py-1 group/item"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#0c1a30] border border-cyan-500/25 flex items-center justify-center text-cyan-400 group-hover/item:border-cyan-400 transition-colors">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium text-slate-400 group-hover/item:text-slate-200 transition-colors">
                  {item.label}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-white font-mono">
                  {item.value}
                </span>
                <span className="text-[11px] font-mono font-semibold text-emerald-400 w-14 text-right">
                  {item.trend}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-500 pt-2 border-t border-[#142340] flex items-center justify-between">
        <span>Sampling Cadence: 10 Hz</span>
        <span className="text-cyan-400/80 font-mono">Continuous Stream</span>
      </div>
    </div>
  );
};
