/**
 * Pure thermal color and dynamic scaling utilities for 8x8 thermal arrays (AMG8833).
 */

export function getThermalRgb(val: number, minVal: number, maxVal: number): [number, number, number] {
  // Normalize value to [0.0, 1.0] with safe range guard
  const norm = Math.max(0.0, Math.min(1.0, (val - minVal) / Math.max(0.01, maxVal - minVal)));

  // 4-stop thermal color gradient: Deep Blue -> Cyan -> Orange/Yellow -> Bright Red
  if (norm < 0.25) {
    const t = norm / 0.25;
    const r = Math.round(15 + t * (20 - 15));
    const g = Math.round(30 + t * (150 - 30));
    const b = Math.round(160 + t * (230 - 160));
    return [r, g, b];
  } else if (norm < 0.6) {
    const t = (norm - 0.25) / 0.35;
    const r = Math.round(20 + t * (240 - 20));
    const g = Math.round(150 + t * (180 - 150));
    const b = Math.round(230 - t * 200);
    return [r, g, b];
  } else {
    const t = (norm - 0.6) / 0.4;
    const r = Math.round(240 + t * 15);
    const g = Math.round(180 - t * 120);
    const b = Math.round(30 - t * 20);
    return [r, g, b];
  }
}

export function getThermalColor(val: number, minVal: number = 24.0, maxVal: number = 24.5): string {
  const [r, g, b] = getThermalRgb(val, minVal, maxVal);
  return `rgb(${r}, ${g}, ${b})`;
}
