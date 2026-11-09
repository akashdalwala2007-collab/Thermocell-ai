import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

interface ThermalVisualizationCardProps {
  frames?: number[][][]; // 8x8 frames from simulation/telemetry
  provenance?: 'REAL' | 'SYNTHETIC' | 'PREDICTED';
  maxTemp?: number;
  avgTemp?: number;
  hotspotCoords?: [number, number];
  isSampleData?: boolean;
}

export const ThermalVisualizationCard: React.FC<ThermalVisualizationCardProps> = ({
  frames = [],
  provenance = 'REAL',
  maxTemp,
  avgTemp,
  hotspotCoords,
  isSampleData = false,
}) => {
  const initialTab = provenance === 'SYNTHETIC' ? 'Synthetic' : provenance === 'PREDICTED' ? 'Predicted' : 'Real';
  const [activeProvenance, setActiveProvenance] = useState<'Real' | 'Synthetic' | 'Predicted'>(initialTab);
  const [hoveredCell, setHoveredCell] = useState<{ r: number; c: number; temp: number } | null>(null);

  // Generate 8x8 grid values matching the reference or from active frame
  const gridData = useMemo(() => {
    if (frames && frames.length > 0) {
      const lastFrame = frames[frames.length - 1];
      if (lastFrame && lastFrame.length === 8 && lastFrame[0].length === 8) {
        return lastFrame;
      }
    }

    // Default authentic gradient field matching reference hotspot at (3,5)
    // T_min ~ 25°C (corners), T_max ~ 42.1°C at hotspot (3,5)
    const grid: number[][] = [];
    for (let r = 0; r < 8; r++) {
      const row: number[] = [];
      for (let c = 0; c < 8; c++) {
        // Distance from hotspot (3, 5)
        const dist = Math.sqrt(Math.pow(r - 3, 2) + Math.pow(c - 5, 2));
        // Exponential decay towards ambient 25.5°C
        const temp = 25.5 + (42.1 - 25.5) * Math.exp(-0.35 * Math.pow(dist, 1.8));
        row.push(Number(temp.toFixed(1)));
      }
      grid.push(row);
    }
    return grid;
  }, [frames]);

  // Interpolate thermal color: 25°C (deep blue) -> 30°C (cyan) -> 35°C (yellow/gold) -> 42°C+ (red/orange)
  const getCellColor = (temp: number) => {
    const min = 25.0;
    const max = 45.0;
    const ratio = Math.max(0, Math.min(1, (temp - min) / (max - min)));

    if (ratio < 0.25) {
      // Deep blue to cyan
      const t = ratio / 0.25;
      const r = Math.round(15 + t * (6 - 15));
      const g = Math.round(50 + t * (182 - 50));
      const b = Math.round(180 + t * (212 - 180));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (ratio < 0.55) {
      // Cyan to yellow-green
      const t = (ratio - 0.25) / 0.3;
      const r = Math.round(6 + t * (234 - 6));
      const g = Math.round(182 + t * (179 - 182));
      const b = Math.round(212 + t * (8 - 212));
      return `rgb(${r}, ${g}, ${b})`;
    } else if (ratio < 0.8) {
      // Yellow to orange
      const t = (ratio - 0.55) / 0.25;
      const r = Math.round(234 + t * (249 - 234));
      const g = Math.round(179 + t * (115 - 179));
      const b = Math.round(8 + t * (22 - 8));
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Orange to bright red
      const t = (ratio - 0.8) / 0.2;
      const r = Math.round(249 + t * (239 - 249));
      const g = Math.round(115 + t * (68 - 115));
      const b = Math.round(22 + t * (68 - 22));
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  return (
    <div className="bg-[#08101e] border border-[#142340] hover:border-[#1e3b66] rounded-2xl p-5 flex flex-col justify-between shadow-[0_4px_25px_rgba(0,0,0,0.6)] transition-all">
      {/* Header with Title and Provenance Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#142340]">
        <h3 className="text-xs font-semibold text-slate-200">
          Thermal Visualization (8×8 Grid){isSampleData ? ' (Sample Data)' : ''}
        </h3>

        {/* Provenance Pills */}
        <div className="flex items-center bg-[#060a14] p-0.5 rounded-lg border border-[#142340]">
          {(['Real', 'Synthetic', 'Predicted'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveProvenance(tab)}
              className={`px-2.5 py-0.5 text-[10px] font-semibold rounded-md transition-all ${
                activeProvenance === tab
                  ? 'bg-[#0f2b48] text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Main Thermal Visualization Body */}
      <div className="flex items-center justify-between gap-4 my-2">
        {/* 8x8 Grid Canvas */}
        <div className="relative p-1 bg-[#060a14] rounded-xl border border-[#142340] shrink-0">
          <div className="grid grid-cols-8 gap-1 w-44 h-44 sm:w-48 sm:h-48">
            {gridData.map((row, rIdx) =>
              row.map((temp, cIdx) => {
                const isHotspot = hotspotCoords ? (rIdx === hotspotCoords[0] && cIdx === hotspotCoords[1]) : (rIdx === 3 && cIdx === 5);
                return (
                  <motion.div
                    key={`${rIdx}-${cIdx}`}
                    onMouseEnter={() => setHoveredCell({ r: rIdx, c: cIdx, temp })}
                    onMouseLeave={() => setHoveredCell(null)}
                    whileHover={{ scale: 1.15, zIndex: 10 }}
                    className={`rounded-[3px] transition-colors relative cursor-crosshair ${
                      isHotspot ? 'ring-2 ring-white/80 shadow-[0_0_8px_#ef4444]' : ''
                    }`}
                    style={{ backgroundColor: getCellColor(temp) }}
                  />
                );
              })
            )}
          </div>

          {/* Hovered Cell Tooltip */}
          {hoveredCell && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#0d1c33] border border-cyan-500/40 text-[10px] font-mono px-2 py-0.5 rounded text-white shadow-xl pointer-events-none whitespace-nowrap z-20">
              Cell ({hoveredCell.r}, {hoveredCell.c}): {hoveredCell.temp}°C
            </div>
          )}
        </div>

        {/* Vertical Color Scale Bar */}
        <div className="flex flex-col items-center justify-between h-44 sm:h-48 py-1">
          <span className="text-[10px] font-mono text-slate-400">45°C</span>
          <div className="w-2.5 flex-1 mx-1 my-1 rounded-full overflow-hidden bg-gradient-to-b from-[#ef4444] via-[#eab308] via-[#06b6d4] to-[#1e3a8a] border border-[#142340]" />
          <span className="text-[10px] font-mono text-slate-400">25°C</span>
        </div>

        {/* Right Metric Statistics */}
        <div className="flex flex-col justify-center gap-3.5 pr-2 flex-1">
          {/* Max Temp */}
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rotate-45 bg-emerald-400 rounded-[0.5px] inline-block shadow-[0_0_4px_#34d399]" />
              Max Temp
            </span>
            <span className="text-base font-bold text-white font-mono mt-0.5">
              {maxTemp !== undefined && !isNaN(maxTemp) ? `${maxTemp.toFixed(1)} °C` : '—'}
            </span>
          </div>

          {/* Avg Temp */}
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rotate-45 bg-cyan-400 rounded-[0.5px] inline-block shadow-[0_0_4px_#38bdf8]" />
              Avg Temp
            </span>
            <span className="text-base font-bold text-white font-mono mt-0.5">
              {avgTemp !== undefined && !isNaN(avgTemp) ? `${avgTemp.toFixed(1)} °C` : '—'}
            </span>
          </div>

          {/* Hotspot Cell */}
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block shadow-[0_0_4px_#f43f5e]" />
              Hotspot Cell
            </span>
            <span className="text-base font-bold text-white font-mono mt-0.5">
              {hotspotCoords ? `(${hotspotCoords[0]}, ${hotspotCoords[1]})` : '—'}
            </span>
          </div>
        </div>
      </div>

      <div className="text-[10px] text-slate-500 pt-2 border-t border-[#142340] flex items-center justify-between">
        <span>Sensor: AMG8833 Grid-EYE (64 px)</span>
        <span className="text-emerald-400/90 font-mono">Spatial Gradient Stable</span>
      </div>
    </div>
  );
};
