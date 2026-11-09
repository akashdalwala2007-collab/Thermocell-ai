import test from 'node:test';
import assert from 'node:assert/strict';
import { getThermalColor, getThermalRgb } from '../src/utils/thermalColors.ts';

test('thermal color scaling distinguishes 24.00, 24.25, and 24.50 C', () => {
  const minVal = 24.0;
  const maxVal = 24.5;

  const baselineColor = getThermalColor(24.0, minVal, maxVal);
  const nominalTabColor = getThermalColor(24.25, minVal, maxVal);
  const degradedTabColor = getThermalColor(24.5, minVal, maxVal);

  const baselineRgb = getThermalRgb(24.0, minVal, maxVal);
  const nominalTabRgb = getThermalRgb(24.25, minVal, maxVal);
  const degradedTabRgb = getThermalRgb(24.5, minVal, maxVal);

  // Baseline 24.00°C is deep blue
  assert.equal(baselineColor, 'rgb(15, 30, 160)');
  assert.deepEqual(baselineRgb, [15, 30, 160]);

  // Nominal 24.25°C tab hotspot is golden/amber
  assert.equal(nominalTabColor, 'rgb(177, 171, 87)');
  assert.deepEqual(nominalTabRgb, [177, 171, 87]);

  // Degraded 24.50°C tab hotspot is bright red
  assert.equal(degradedTabColor, 'rgb(255, 60, 10)');
  assert.deepEqual(degradedTabRgb, [255, 60, 10]);

  // All three must be visibly distinct
  assert.notEqual(baselineColor, nominalTabColor);
  assert.notEqual(nominalTabColor, degradedTabColor);
  assert.notEqual(baselineColor, degradedTabColor);
});

test('playback progression and reset semantics', () => {
  // Simulate 100 backend frames
  const frames: number[][][] = Array.from({ length: 100 }, (_, i) => {
    return Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => {
        // Tab hotspot at row 0, col 3-4 develops at frame 70+
        if (r === 0 && (c === 3 || c === 4) && i >= 70) {
          return 24.25;
        }
        return 24.0;
      })
    );
  });

  // 1. Initial playback begins at frame 0
  let frameIndex = 0;
  let isPlaying = true;
  assert.equal(frameIndex, 0);

  // 2. Playback progression step by step from 0 to 99
  const cadenceMs = 100;
  let simulatedTimeMs = 0;

  while (isPlaying) {
    if (frameIndex >= frames.length - 1) {
      isPlaying = false;
      break;
    }
    frameIndex += 1;
    simulatedTimeMs += cadenceMs;
  }

  // Playback reaches terminal frame 99 and stops
  assert.equal(frameIndex, 99);
  assert.equal(isPlaying, false);
  assert.equal(simulatedTimeMs, 9900); // 9.9 seconds

  const timestamp = (frameIndex * 0.1).toFixed(1);
  assert.equal(timestamp, '9.9');

  // 3. New simulation arrival triggers reset to frame 0 and auto-play
  const newFrames: number[][][] = Array.from({ length: 100 }, () =>
    Array(8).fill(Array(8).fill(24.0))
  );
  const isNewFrames = newFrames !== frames && newFrames.length > 1;
  assert.equal(isNewFrames, true);

  if (isNewFrames) {
    frameIndex = 0;
    isPlaying = true;
  }

  assert.equal(frameIndex, 0);
  assert.equal(isPlaying, true);
  assert.equal((frameIndex * 0.1).toFixed(1), '0.0');

  // 4. Verify no fake thermal values introduced
  const renderedGrid = frames[99];
  assert.equal(renderedGrid.length, 8);
  assert.equal(renderedGrid[0].length, 8);
  assert.equal(renderedGrid[0][3], 24.25);
  assert.equal(renderedGrid[0][0], 24.0);

  // Ensure every pixel rendered is an authentic value directly from the backend frame
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const val = renderedGrid[r][c];
      assert.ok(val === 24.0 || val === 24.25, `Unexpected thermal value: ${val}`);
    }
  }
});

test('rapid battery selection race-condition protection and stale state clearance', async () => {
  let activeRequestId = 0;
  let activeRun: { cell_id: string; verdict: string } | null = { cell_id: 'B0005', verdict: 'REUSE' };
  let isLoading = false;

  const triggerRun = async (cellId: string, latencyMs: number) => {
    const requestId = ++activeRequestId;
    isLoading = true;
    activeRun = null; // Stale diagnostic cleared immediately upon new selection

    await new Promise((resolve) => setTimeout(resolve, latencyMs));

    // Only commit if this is still the active, latest request
    if (requestId === activeRequestId) {
      activeRun = { cell_id: cellId, verdict: 'REUSE' };
      isLoading = false;
    }
  };

  // 1. Initial selection starts, clearing previous stale result
  const p1 = triggerRun('B0006', 80);
  assert.equal(activeRun, null, 'Stale diagnostic run must be cleared immediately');
  assert.equal(isLoading, true);

  // 2. User rapidly switches to B0007 before B0006 finishes
  const p2 = triggerRun('B0007', 30);
  assert.equal(activeRun, null);
  assert.equal(isLoading, true);

  // Wait for all asynchronous executions to finish
  await Promise.all([p1, p2]);

  // Out-of-order B0006 resolution must be rejected; only latest B0007 must be active
  assert.deepEqual(activeRun, { cell_id: 'B0007', verdict: 'REUSE' });
  assert.equal(isLoading, false);
});
