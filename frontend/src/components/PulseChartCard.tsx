import React, { useState } from 'react';

interface PulseChartCardProps {
  timestamps?: number[];
  voltage?: number[];
  current?: number[];
}

export const PulseChartCard: React.FC<PulseChartCardProps> = ({
  timestamps = [],
  voltage = [],
  current = [],
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Default synthetic 10s waveforms matching reference if props are empty
  const sampleCount = 60;
  const timeLabels = ['0s', '2s', '4s', '6s', '8s', '10s'];
  const yTicks = [4.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0];

  const chartData = React.useMemo(() => {
    const data: { t: number; v: number; i: number }[] = [];
    for (let idx = 0; idx < sampleCount; idx++) {
      const t = (idx / (sampleCount - 1)) * 10;
      // Voltage stays around 3.70 - 3.75V with slight drop during pulses
      // Current has periodic pulses every ~1.5s
      const pulsePhase = Math.sin((idx / sampleCount) * Math.PI * 12);
      const isPulse = pulsePhase > 0.6;
      const iVal = isPulse ? 1.2 + 0.3 * Math.sin(idx) : 0.05 + 0.02 * Math.sin(idx * 2);
      const vVal = 3.71 - (isPulse ? 0.08 : 0.01) + 0.02 * (idx / sampleCount);

      data.push({
        t: Number(t.toFixed(1)),
        v: Number(vVal.toFixed(2)),
        i: Number(iVal.toFixed(2)),
      });
    }
    return data;
  }, []);

  // Use provided arrays if non-empty, otherwise chartData
  const activeSeries = React.useMemo(() => {
    if (voltage.length > 0 && timestamps.length > 0) {
      return timestamps.slice(0, 80).map((t, idx) => ({
        t,
        v: voltage[idx] ?? 3.71,
        i: current[idx] ?? 1.24,
      }));
    }
    return chartData;
  }, [voltage, timestamps, current, chartData]);

  // Chart Dimensions
  const svgWidth = 420;
  const svgHeight = 170;
  const padLeft = 32;
  const padRight = 12;
  const padTop = 15;
  const padBottom = 22;

  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  // Scaling
  const getY = (val: number) => {
    const minVal = 0;
    const maxVal = 4.0;
    return padTop + plotHeight - ((val - minVal) / (maxVal - minVal)) * plotHeight;
  };

  const getX = (idx: number, total: number) => {
    return padLeft + (idx / (total - 1)) * plotWidth;
  };

  // Generate paths
  const vPoints = activeSeries.map((d, i) => `${getX(i, activeSeries.length)},${getY(d.v)}`);
  const iPoints = activeSeries.map((d, i) => `${getX(i, activeSeries.length)},${getY(d.i)}`);

  return (
    <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] transition-all">
      {/* Header & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#142340]">
        <h3 className="text-xs font-semibold text-slate-200">
          Voltage & Current Pulse (10s)
        </h3>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[10px] font-medium">
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 bg-[#0284c7] rounded-[2px] shadow-[0_0_6px_#0284c7]" />
            <span>Voltage (V)</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] shadow-[0_0_6px_#10b981]" />
            <span>Current (A)</span>
          </div>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative my-1 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-44 select-none"
        >
          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="#121e36"
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="8"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tick.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* X-Axis Ticks */}
          {timeLabels.map((lbl, idx) => {
            const x = padLeft + (idx / (timeLabels.length - 1)) * plotWidth;
            return (
              <g key={lbl}>
                <line
                  x1={x}
                  y1={padTop + plotHeight}
                  x2={x}
                  y2={padTop + plotHeight + 3}
                  stroke="#1c3258"
                />
                <text
                  x={x}
                  y={svgHeight - 4}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="8"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {lbl}
                </text>
              </g>
            );
          })}

          {/* Current (Green Waveform) */}
          <polyline
            points={iPoints.join(' ')}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]"
          />

          {/* Voltage (Blue Waveform) */}
          <polyline
            points={vPoints.join(' ')}
            fill="none"
            stroke="#0284c7"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-[0_0_8px_rgba(2,132,199,0.7)]"
          />

          {/* Hover interactive scrubber */}
          {hoverIndex !== null && activeSeries[hoverIndex] && (
            <g>
              <line
                x1={getX(hoverIndex, activeSeries.length)}
                y1={padTop}
                x2={getX(hoverIndex, activeSeries.length)}
                y2={padTop + plotHeight}
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoverIndex, activeSeries.length)}
                cy={getY(activeSeries[hoverIndex].v)}
                r="3.5"
                fill="#38bdf8"
                stroke="#08101e"
                strokeWidth="1.5"
              />
              <circle
                cx={getX(hoverIndex, activeSeries.length)}
                cy={getY(activeSeries[hoverIndex].i)}
                r="3.5"
                fill="#10b981"
                stroke="#08101e"
                strokeWidth="1.5"
              />
            </g>
          )}

          {/* Invisible overlay for mouse interaction */}
          <rect
            x={padLeft}
            y={padTop}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, relX / rect.width));
              const idx = Math.round(ratio * (activeSeries.length - 1));
              setHoverIndex(idx);
            }}
            onMouseLeave={() => setHoverIndex(null)}
          />
        </svg>

        {/* Hover Tooltip Float */}
        {hoverIndex !== null && activeSeries[hoverIndex] && (
          <div className="absolute top-1 right-2 bg-[#091326] border border-[#1b345e] px-2 py-0.5 rounded text-[10px] font-mono text-slate-200 pointer-events-none flex gap-2">
            <span>t: {activeSeries[hoverIndex].t}s</span>
            <span className="text-sky-400">V: {activeSeries[hoverIndex].v}V</span>
            <span className="text-emerald-400">I: {activeSeries[hoverIndex].i}A</span>
          </div>
        )}
      </div>

      <div className="text-[10px] text-slate-500 pt-2 border-t border-[#142340] flex items-center justify-between">
        <span>Window: 10.0s Controlled Discharge</span>
        <span className="text-sky-400/80 font-mono">OCV: 3.71V (Pre-Pulse)</span>
      </div>
    </div>
  );
};
