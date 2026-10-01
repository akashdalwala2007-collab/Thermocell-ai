import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Eye, Sparkles } from 'lucide-react';

interface ThermalGrid8x8Props {
  frames: number[][][]; // 100 8x8 frames
  provenance?: 'REAL' | 'SYNTHETIC' | 'PREDICTED';
}

function getThermalColor(val: number, minVal: number = 22.0, maxVal: number = 32.0): string {
  // Normalize value to [0.0, 1.0]
  const norm = Math.max(0.0, Math.min(1.0, (val - minVal) / Math.max(0.1, maxVal - minVal)));

  // 4-stop thermal color gradient: Deep Blue -> Cyan -> Orange -> Bright Red/Yellow
  if (norm < 0.25) {
    const t = norm / 0.25;
    const r = Math.round(15 + t * (20 - 15));
    const g = Math.round(30 + t * (150 - 30));
    const b = Math.round(160 + t * (230 - 160));
    return `rgb(${r}, ${g}, ${b})`;
  } else if (norm < 0.6) {
    const t = (norm - 0.25) / 0.35;
    const r = Math.round(20 + t * (240 - 20));
    const g = Math.round(150 + t * (180 - 150));
    const b = Math.round(230 - t * 200);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const t = (norm - 0.6) / 0.4;
    const r = Math.round(240 + t * 15);
    const g = Math.round(180 - t * 120);
    const b = Math.round(30 - t * 20);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export const ThermalGrid8x8: React.FC<ThermalGrid8x8Props> = ({ frames, provenance = 'SYNTHETIC' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [frameIndex, setFrameIndex] = useState<number>(99); // default to end of pulse (max heat)
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [interpolate, setInterpolate] = useState<boolean>(true);

  const safeFrames = frames && frames.length > 0 ? frames : [Array(8).fill(Array(8).fill(24.0))];
  const currentGrid = safeFrames[Math.min(frameIndex, safeFrames.length - 1)];

  // Compute metrics for current frame
  let tMin = Infinity;
  let tMax = -Infinity;
  let tSum = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const v = currentGrid[r][c];
      if (v < tMin) tMin = v;
      if (v > tMax) tMax = v;
      tSum += v;
    }
  }
  const tMean = tSum / 64;

  // Play animation loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setFrameIndex((prev) => {
        if (prev >= safeFrames.length - 1) {
          setIsPlaying(false);
          return safeFrames.length - 1;
        }
        return prev + 1;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [isPlaying, safeFrames.length]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    if (interpolate) {
      // Draw smooth interpolated field using low-res canvas scaled with imageSmoothing
      const offscreen = document.createElement('canvas');
      offscreen.width = 8;
      offscreen.height = 8;
      const offCtx = offscreen.getContext('2d');
      if (offCtx) {
        const imgData = offCtx.createImageData(8, 8);
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            const val = currentGrid[r][c];
            const norm = Math.max(0, Math.min(1, (val - 22.0) / 10.0));
            const idx = (r * 8 + c) * 4;
            // Map norm to RGBA
            imgData.data[idx] = Math.round(norm * 255);
            imgData.data[idx + 1] = Math.round((1 - Math.abs(norm - 0.5) * 2) * 220);
            imgData.data[idx + 2] = Math.round((1 - norm) * 255);
            imgData.data[idx + 3] = 255;
          }
        }
        offCtx.putImageData(imgData, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offscreen, 0, 0, width, height);
      }
    } else {
      // Discrete 8x8 sensor pixel blocks
      const cellW = width / 8;
      const cellH = height / 8;
      ctx.clearRect(0, 0, width, height);

      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const val = currentGrid[r][c];
          ctx.fillStyle = getThermalColor(val, 22.0, 30.0);
          ctx.fillRect(c * cellW, r * cellH, cellW - 1, cellH - 1);
        }
      }
    }

    // Highlight terminal tab position (Row 0, Cols 3-4)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    const tabX = (width / 8) * 3;
    const tabW = (width / 8) * 2;
    ctx.strokeRect(tabX, 0, tabW, 6);
  }, [currentGrid, interpolate]);

  const timestamp = (frameIndex * 0.1).toFixed(1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            AMG8833 8×8 Spatial Thermal Array
          </h3>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
              provenance === 'REAL'
                ? 'bg-blue-950 text-blue-300 border-blue-800'
                : 'bg-purple-950 text-purple-300 border-purple-800'
            }`}
          >
            {provenance}
          </span>
        </div>
        <button
          onClick={() => setInterpolate(!interpolate)}
          className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded transition-colors border ${
            interpolate
              ? 'bg-indigo-950 text-indigo-300 border-indigo-800'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}
          title="Toggle bilinear interpolation"
        >
          {interpolate ? <Sparkles className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {interpolate ? 'Bilinear Smooth' : '8×8 Discrete'}
        </button>
      </div>

      {/* Main Canvas & Overlay */}
      <div className="relative mx-auto flex items-center justify-center p-2 bg-slate-950 rounded-lg border border-slate-800/80">
        <canvas
          ref={canvasRef}
          width={256}
          height={256}
          className="rounded shadow-inner cursor-crosshair"
        />
        {/* Terminal Tab Label */}
        <span className="absolute top-1 text-[9px] font-mono text-sky-400 bg-slate-950/80 px-1.5 rounded border border-sky-800/60">
          ▲ Positive Tab Area
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Peak Hotspot</span>
          <span className="text-rose-400 font-mono font-bold">{tMax.toFixed(2)} °C</span>
        </div>
        <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Mean Cell Temp</span>
          <span className="text-amber-400 font-mono font-bold">{tMean.toFixed(2)} °C</span>
        </div>
        <div className="bg-slate-950/60 p-2 rounded border border-slate-800">
          <span className="text-slate-400 text-[10px] block">Tab-Body ΔT</span>
          <span className="text-sky-400 font-mono font-bold">{(tMax - tMin).toFixed(2)} °C</span>
        </div>
      </div>

      {/* Controls & Scrubber */}
      <div className="flex items-center gap-3 pt-1 border-t border-slate-800">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          onClick={() => {
            setIsPlaying(false);
            setFrameIndex(0);
          }}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
          title="Reset to 0s"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(0, safeFrames.length - 1)}
          value={frameIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setFrameIndex(Number(e.target.value));
          }}
          className="flex-1 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />

        <span className="text-xs font-mono text-slate-300 w-12 text-right">
          {timestamp}s
        </span>
      </div>
    </div>
  );
};
