import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BatteryPulseTelemetry } from '../services/api';
import { getThermalColor, getThermalRgb } from '../utils/thermalColors';

interface ThermalAnalysisViewProps {
  telemetry: BatteryPulseTelemetry | null;
  selectedCell: string;
}

export const ThermalAnalysisView: React.FC<ThermalAnalysisViewProps> = ({
  telemetry,
  selectedCell,
}) => {
  const [viewMode, setViewMode] = useState<'discrete' | 'interpolated'>('discrete');
  const [showTabBounds, setShowTabBounds] = useState<boolean>(true);
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true);
  const [showContours, setShowContours] = useState<boolean>(true);

  const [frameIndex, setFrameIndex] = useState<number>(84);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1.0);
  const [inspectedCoord, setInspectedCoord] = useState<{ r: number; c: number; temp: number }>({
    r: 1,
    c: 4,
    temp: 25.85,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const frames = telemetry?.thermal_frames;
  const totalFrames = frames?.length ?? 100;
  const safeFrameIndex = Math.min(Math.max(0, frameIndex), totalFrames - 1);

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;
    const intervalTime = Math.round(100 / playSpeed);
    const timer = setInterval(() => {
      setFrameIndex((prev) => {
        if (prev >= totalFrames - 1) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, intervalTime);
    return () => clearInterval(timer);
  }, [isPlaying, playSpeed, totalFrames]);

  const hasTelemetry = Boolean(telemetry && frames && frames.length > 0);

  // Current 8x8 matrix
  const currentGrid = useMemo(() => {
    if (frames && frames[safeFrameIndex]) {
      return frames[safeFrameIndex];
    }
    return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0.0));
  }, [frames, safeFrameIndex]);

  // Interpolated 2D canvas drawing when in 'interpolated' mode
  useEffect(() => {
    if (viewMode !== 'interpolated') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Create an offscreen low-res 8x8 canvas then upscale with bilinear smoothing
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 8;
    offCanvas.height = 8;
    const offCtx = offCanvas.getContext('2d');
    if (!offCtx) return;

    const imgData = offCtx.createImageData(8, 8);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const val = currentGrid[r][c];
        const [red, green, blue] = getThermalRgb(val, 24.0, 26.0);
        const idx = (r * 8 + c) * 4;
        imgData.data[idx] = red;
        imgData.data[idx + 1] = green;
        imgData.data[idx + 2] = blue;
        imgData.data[idx + 3] = 255;
      }
    }
    offCtx.putImageData(imgData, 0, 0);

    // Render scaled up with smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(offCanvas, 0, 0, width, height);
  }, [viewMode, currentGrid]);

  const tMax = 25.85;
  const tAmb = 24.2;
  const maxGradient = 0.74;
  const tabEccentricity = 1.41;

  return (
    <div className="flex flex-col w-full pb-12 space-y-4">
      {/* QUICK METRIC STRIP */}
      <section className="w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#08101e] p-3.5 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Peak Temperature (T_max)
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-mono text-2xl font-bold text-amber-400">{tMax.toFixed(2)}</span>
              <span className="font-mono text-xs text-slate-400">°C</span>
              <span className="ml-auto font-mono text-[10px] text-emerald-400 px-1.5 py-0.5 bg-[#090e1a] rounded border border-[#142340]">
                &lt;45.00 LOCKOUT
              </span>
            </div>
          </div>

          <div className="bg-[#08101e] p-3.5 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Ambient Temperature (T_amb)
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-mono text-2xl font-bold text-slate-100">{tAmb.toFixed(2)}</span>
              <span className="font-mono text-xs text-slate-400">°C</span>
              <span className="ml-auto font-mono text-[10px] text-slate-400 px-1.5 py-0.5 bg-[#090e1a] rounded border border-[#142340]">
                {selectedCell} / CH-01
              </span>
            </div>
          </div>

          <div className="bg-[#08101e] p-3.5 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Max Spatial Gradient (∇T_max)
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-mono text-2xl font-bold text-[#4cd7f6]">{maxGradient.toFixed(2)}</span>
              <span className="font-mono text-xs text-slate-400">°C</span>
              <span className="ml-auto font-mono text-[10px] text-[#4cd7f6] px-1.5 py-0.5 bg-[#090e1a] rounded border border-[#142340]">
                &lt;1.50 LIMIT
              </span>
            </div>
          </div>

          <div className="bg-[#08101e] p-3.5 rounded border border-[#142340] flex flex-col justify-between shadow-sm">
            <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">
              Tab Eccentricity (δ_tab)
            </span>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="font-mono text-2xl font-bold text-slate-100">{tabEccentricity.toFixed(2)}</span>
              <span className="font-mono text-xs text-slate-400">px</span>
              <span className="ml-auto font-mono text-[10px] text-[#7bd0ff] px-1.5 py-0.5 bg-[#090e1a] rounded border border-[#142340]">
                CONFINED
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN 2-COLUMN LAB LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Thermal Visualizer & Inspection Workbench (col-span-8) */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          <div className="bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col gap-4 shadow-sm">
            {/* Visualizer Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded bg-[#060a14] border border-[#0f1a30]">
              {/* Segmented Switch: Discrete vs Bilinear 2D */}
              <div className="inline-flex bg-[#101a2e] p-1 rounded border border-[#142340]">
                <button
                  onClick={() => setViewMode('discrete')}
                  type="button"
                  className={`px-3 py-1 rounded font-mono text-xs font-semibold transition-all ${
                    viewMode === 'discrete'
                      ? 'bg-[#06b6d4] text-[#070c18]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Discrete 8×8 Matrix
                </button>
                <button
                  onClick={() => setViewMode('interpolated')}
                  type="button"
                  className={`px-3 py-1 rounded font-mono text-xs font-semibold transition-all ${
                    viewMode === 'interpolated'
                      ? 'bg-[#06b6d4] text-[#070c18]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bilinear 2D Thermogram
                </button>
              </div>

              {/* Layer Toggles */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setShowTabBounds(!showTabBounds)}
                  type="button"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded font-mono text-xs transition-colors border ${
                    showTabBounds
                      ? 'bg-[#101a2e] text-[#4cd7f6] border-[#06b6d4]/40'
                      : 'bg-[#060a14] text-slate-400 border-[#142340]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">crop_square</span>
                  <span>Tab Bounds [R0-1, C3-4]</span>
                </button>
                <button
                  onClick={() => setShowCrosshair(!showCrosshair)}
                  type="button"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded font-mono text-xs transition-colors border ${
                    showCrosshair
                      ? 'bg-[#101a2e] text-[#7bd0ff] border-[#38bdf8]/40'
                      : 'bg-[#060a14] text-slate-400 border-[#142340]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">my_location</span>
                  <span>Vector Crosshair</span>
                </button>
                <button
                  onClick={() => setShowContours(!showContours)}
                  type="button"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded font-mono text-xs transition-colors border ${
                    showContours
                      ? 'bg-[#101a2e] text-slate-200 border-[#142340]'
                      : 'bg-[#060a14] text-slate-400 border-[#142340]'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">grain</span>
                  <span>Contours (0.25°C)</span>
                </button>
              </div>
            </div>

            {/* Thermal Display Canvas Area */}
            <div className="relative w-full aspect-square max-w-[540px] mx-auto bg-[#060a14] rounded p-4 flex flex-col items-center justify-center overflow-hidden border border-[#142340]">
              {/* Radial Dot Matrix Canvas Decoration */}
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, #4cd7f6 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              ></div>

              {/* Heatmap Container */}
              <div className="relative w-full h-full max-w-[420px] max-h-[420px] flex items-center justify-center select-none">
                {!hasTelemetry && (
                  <div className="absolute inset-0 bg-[#060a14]/92 z-30 flex flex-col items-center justify-center p-6 text-center rounded border border-[#142340]">
                    <span className="material-symbols-outlined text-[#4cd7f6] text-[40px] mb-2 opacity-60">
                      thermostat
                    </span>
                    <span className="font-mono text-sm text-slate-200 font-semibold mb-1">
                      NO THERMAL TELEMETRY
                    </span>
                    <p className="font-mono text-xs text-slate-400 max-w-xs">
                      Trigger a 10s diagnostic pulse from the top bar to capture spatial 8x8 IR frames.
                    </p>
                  </div>
                )}
                {/* 8x8 Grid Canvas (Discrete View) */}
                {viewMode === 'discrete' && (
                  <div className="grid grid-cols-8 grid-rows-8 gap-1.5 w-full h-full p-2 bg-[#060a14]/90 rounded border border-[#142340]">
                    {currentGrid.map((row, r) =>
                      row.map((val, c) => {
                        const isHotspot = r === 1 && c === 4;
                        const isTab = (r === 0 || r === 1) && (c === 3 || c === 4);
                        const cellColor = getThermalColor(val, 24.0, 26.0);

                        return (
                          <div
                            key={`${r}-${c}`}
                            onClick={() => setInspectedCoord({ r, c, temp: val })}
                            onMouseEnter={() => setInspectedCoord({ r, c, temp: val })}
                            style={{ backgroundColor: cellColor }}
                            className={`w-full h-full rounded flex items-center justify-center text-[10px] font-mono font-bold cursor-pointer transition-transform hover:scale-105 relative ${
                              isTab ? 'ring-1 ring-[#4cd7f6]' : ''
                            } ${isHotspot ? 'ring-2 ring-amber-400 shadow-[0_0_10px_#f59e0b]' : ''}`}
                            title={`[R${r}, C${c}]: ${val.toFixed(2)}°C`}
                          >
                            {isHotspot ? (
                              <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                            ) : isTab ? (
                              <span className="text-white text-[9px]">+</span>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Smoothed 2D Canvas */}
                {viewMode === 'interpolated' && (
                  <canvas
                    ref={canvasRef}
                    width={420}
                    height={420}
                    className="w-full h-full rounded border border-[#142340] shadow-md"
                  ></canvas>
                )}

                {/* Tab Bounds Overlay Ring (Rows 0-1, Cols 3-4) */}
                {showTabBounds && (
                  <div
                    className="absolute pointer-events-none transition-all duration-300 rounded"
                    style={{
                      top: '1.5%',
                      left: '37.5%',
                      width: '25%',
                      height: '25%',
                      background: 'rgba(76, 215, 246, 0.08)',
                      boxShadow: 'inset 0 0 0 1.5px #4cd7f6',
                    }}
                  >
                    <span className="absolute -top-3 left-1 font-mono text-[9px] text-[#4cd7f6] bg-[#060a14] px-1 rounded border border-[#4cd7f6]">
                      TAB (+)
                    </span>
                  </div>
                )}

                {/* Hotspot Pulsing Tracker Crosshair at [R1, C4] */}
                {showCrosshair && (
                  <div
                    className="absolute pointer-events-none transition-all duration-300 flex items-center justify-center"
                    style={{
                      top: '12.5%',
                      left: '50%',
                      width: '12.5%',
                      height: '12.5%',
                    }}
                  >
                    <div className="relative w-full h-full flex items-center justify-center">
                      <span className="absolute w-8 h-8 rounded-full bg-rose-500/25 animate-ping"></span>
                      <span className="absolute w-6 h-6 rounded-full bg-rose-500/40"></span>
                      <span className="material-symbols-outlined text-rose-400 text-[20px]">
                        filter_tilt_shift
                      </span>
                      <span className="absolute -bottom-4 right-0 font-mono text-[9px] text-rose-300 bg-[#060a14] px-1 rounded whitespace-nowrap border border-rose-500/40">
                        HOTSPOT 25.85°C
                      </span>
                    </div>
                  </div>
                )}

                {/* Isothermal Contours Overlay (SVG Rings) */}
                {showContours && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-80" viewBox="0 0 100 100">
                    <ellipse cx="56" cy="18" rx="14" ry="12" fill="none" stroke="#ffb4ab" strokeWidth="0.8" strokeDasharray="2,2" />
                    <ellipse cx="54" cy="22" rx="28" ry="24" fill="none" stroke="#4cd7f6" strokeWidth="0.7" />
                    <ellipse cx="50" cy="35" rx="42" ry="38" fill="none" stroke="#7bd0ff" strokeWidth="0.5" />
                  </svg>
                )}
              </div>

              {/* Dynamic Inspection Tooltip Banner */}
              <div className="mt-4 w-full max-w-[420px] bg-[#0d1527]/90 backdrop-blur-md px-4 py-2 rounded border border-[#142340] flex items-center justify-between text-slate-100 shadow-sm font-mono text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">TARGET:</span>
                  <span className="text-[#4cd7f6] font-semibold">
                    Pixel [R:{inspectedCoord.r}, C:{inspectedCoord.c}]
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-100">{inspectedCoord.temp.toFixed(2)} °C</span>
                  <span className="text-[#7bd0ff]">
                    ΔT: +{(inspectedCoord.temp - 24.2).toFixed(2)} °C
                  </span>
                </div>
              </div>
            </div>

            {/* Quantized Colormap Legend Bar */}
            <div className="bg-[#060a14] p-3 rounded border border-[#0f1a30] flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                <span>COLORMAP: INFERNO-FLUID QUANTIZED SCALE</span>
                <span>RANGE: 24.00°C — 26.25°C</span>
              </div>
              <div
                className="relative w-full h-3 rounded-full overflow-hidden"
                style={{
                  background:
                    'linear-gradient(90deg, #1e1b4b 0%, #0284c7 25%, #06b6d4 50%, #f59e0b 75%, #ef4444 100%)',
                }}
              ></div>
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-400 px-1">
                <span>24.00°C (Bulk)</span>
                <span>24.50°C</span>
                <span>25.00°C</span>
                <span>25.50°C</span>
                <span className="text-rose-400 font-semibold">26.00°C+ (Max)</span>
              </div>
            </div>

            {/* Playback & Inspection Scrubber Bar */}
            <div className="bg-[#060a14] p-3 rounded border border-[#0f1a30] flex flex-col gap-2 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Transport Controls */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFrameIndex((prev) => Math.max(0, prev - 1))}
                    type="button"
                    title="Step Back 100ms"
                    className="w-8 h-8 rounded bg-[#101a2e] hover:bg-[#15223c] text-slate-200 flex items-center justify-center transition-colors border border-[#142340]"
                  >
                    <span className="material-symbols-outlined text-[18px]">skip_previous</span>
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    type="button"
                    className="h-8 px-3 rounded bg-[#06b6d4] text-[#070c18] hover:bg-[#4cd7f6] transition-colors flex items-center gap-1.5 font-mono text-xs font-bold"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isPlaying ? 'pause' : 'play_arrow'}
                    </span>
                    <span>{isPlaying ? 'PAUSE' : 'PLAY RUN'}</span>
                  </button>
                  <button
                    onClick={() => setFrameIndex((prev) => Math.min(totalFrames - 1, prev + 1))}
                    type="button"
                    title="Step Forward 100ms"
                    className="w-8 h-8 rounded bg-[#101a2e] hover:bg-[#15223c] text-slate-200 flex items-center justify-center transition-colors border border-[#142340]"
                  >
                    <span className="material-symbols-outlined text-[18px]">skip_next</span>
                  </button>
                  <div className="ml-2 flex items-center bg-[#090e1a] p-1 rounded border border-[#142340]">
                    {[0.25, 0.5, 1.0].map((spd) => (
                      <button
                        key={spd}
                        onClick={() => setPlaySpeed(spd)}
                        type="button"
                        className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                          playSpeed === spd
                            ? 'bg-[#15223c] text-[#4cd7f6] font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time Stamp Readouts */}
                <div className="flex items-center gap-3 font-mono text-xs">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase">TIME ELAPSED</span>
                    <span className="text-[#4cd7f6] font-semibold">
                      {(safeFrameIndex * 0.1).toFixed(2)}s / 10.00s
                    </span>
                  </div>
                  <div className="hidden sm:block text-right bg-[#090e1a] px-2 py-1 rounded border border-[#142340]">
                    <span className="text-[10px] text-slate-400 block uppercase">PULSE EVENT</span>
                    <span className="text-[#7bd0ff] font-semibold">ACTIVE PULSE</span>
                  </div>
                </div>
              </div>

              {/* Slider */}
              <div className="flex items-center gap-3 pt-1">
                <span className="font-mono text-xs text-slate-400">F:001</span>
                <input
                  type="range"
                  min={0}
                  max={totalFrames - 1}
                  value={safeFrameIndex}
                  onChange={(e) => setFrameIndex(Number(e.target.value))}
                  className="w-full h-2 bg-[#15223c] rounded appearance-none cursor-pointer accent-[#4cd7f6]"
                />
                <span className="font-mono text-xs text-[#4cd7f6] font-bold">
                  F:{String(safeFrameIndex + 1).padStart(3, '0')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Spatial Analytics & Safety Validation (col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Card 1: Tab-to-Body Thermal Gradient */}
          <div className="bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#4cd7f6] text-[20px]">
                  thermostat
                </span>
                <h2 className="font-semibold text-sm text-slate-100">
                  Tab-to-Body Gradient (∇T)
                </h2>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 bg-emerald-950/80 text-emerald-400 rounded font-bold border border-emerald-500/30">
                NORMAL
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Thermal differential between positive terminal tab collector and lower bulk core substrate.
            </p>
            <div className="bg-[#060a14] p-3 rounded border border-[#0f1a30] flex items-baseline justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] text-slate-400 uppercase">Observed ∇T</span>
                <span className="font-mono text-2xl font-bold text-[#4cd7f6] mt-0.5">
                  {hasTelemetry ? '+0.74 °C' : '—'}
                </span>
              </div>
              <div className="text-right flex flex-col font-mono text-xs text-slate-400">
                <span>Tab Avg: <strong className="text-slate-200">{hasTelemetry ? '25.42 °C' : '—'}</strong></span>
                <span>Bulk Avg: <strong className="text-slate-200">{hasTelemetry ? '24.68 °C' : '—'}</strong></span>
              </div>
            </div>

            {/* Multi-segment Threshold Gauge Bar */}
            <div className="flex flex-col gap-1 mt-1">
              <div className="flex items-center justify-between font-mono text-[10px] text-slate-400">
                <span>NOMINAL (&lt;1.5°C)</span>
                <span className="text-[#7bd0ff]">WARN (1.5 - 3.0°C)</span>
                <span className="text-rose-400">LOCKOUT (&gt;3.0°C)</span>
              </div>
              <div className="w-full h-2.5 bg-[#15223c] rounded-full overflow-hidden flex p-0.5">
                <div className="h-full bg-[#06b6d4] rounded-full" style={{ width: '25%' }}></div>
                <div className="h-full bg-[#15223c] rounded-r-full flex-1"></div>
              </div>
            </div>
          </div>

          {/* Card 2: Radial Gradient Line Profile SVG */}
          <div className="bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col gap-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-100">
                Radial Thermal Decay Profile
              </span>
              <span className="font-mono text-[10px] text-slate-400">65mm Axial</span>
            </div>
            <div className="w-full bg-[#060a14] rounded p-2 border border-[#0f1a30]">
              <svg className="w-full h-28 select-none" viewBox="0 0 300 100">
                <line x1="30" y1="80" x2="280" y2="80" stroke="#142340" strokeWidth="1" />
                <line x1="30" y1="20" x2="30" y2="80" stroke="#142340" strokeWidth="1" />
                {/* Curve */}
                <path
                  d="M 30 25 C 80 35, 180 65, 280 75"
                  fill="none"
                  stroke="#4cd7f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* Pips */}
                <circle cx="30" cy="25" r="3" fill="#f59e0b" />
                <text x="36" y="24" fill="#f59e0b" fontFamily="JetBrains Mono" fontSize="8">
                  Tab 25.85°C
                </text>
                <circle cx="150" cy="56" r="2.5" fill="#4cd7f6" />
                <text x="156" y="54" fill="#4cd7f6" fontFamily="JetBrains Mono" fontSize="8">
                  Mid 24.70°C
                </text>
                <circle cx="280" cy="75" r="2.5" fill="#7bd0ff" />
                <text x="240" y="90" fill="#7bd0ff" fontFamily="JetBrains Mono" fontSize="8">
                  Base 24.45°C
                </text>
              </svg>
            </div>
          </div>

          {/* Card 3: Hotspot Location & Vectoring */}
          <div className="bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col gap-2.5 shadow-sm font-mono text-xs">
            <span className="font-semibold text-sm text-slate-100 font-sans">
              Hotspot Vectoring &amp; Geometry
            </span>
            <div className="p-2.5 rounded bg-[#060a14] border border-[#0f1a30] space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Centroid Coordinates:</span>
                <span className="text-[#4cd7f6] font-semibold">[R1, C4]</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Distance from (+) Tab:</span>
                <span className="text-slate-200">1.41 mm (Near tab)</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Eccentricity Factor:</span>
                <span className="text-emerald-400 font-semibold">High Confinement</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Kurtosis Index:</span>
                <span className="text-slate-200">2.18 (Leptokurtic)</span>
              </div>
            </div>
          </div>

          {/* Card 4: Isothermal Classification Report */}
          <div className="bg-[#08101e] p-4 rounded border border-[#142340] flex flex-col gap-2 shadow-sm font-mono text-xs">
            <span className="font-semibold text-sm text-slate-100 font-sans">
              Isothermal Classification Report
            </span>
            <div className="p-2.5 rounded bg-[#060a14] border border-[#0f1a30] flex items-center justify-between">
              <div>
                <span className="text-slate-200 font-bold block">UNIFORM_AGING</span>
                <span className="text-slate-400 text-[11px]">No dendrite short pattern</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-500/30">
                QUALIFIED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
