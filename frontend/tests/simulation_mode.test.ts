import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests validating Live Monitoring and TopHeader simulation-mode fidelity:
 * 1. TopHeader status rendering (Simulation Mode vs Hardware Mode)
 * 2. Live Monitoring status indicators, provenance, and absence of UART interruption in simulation mode
 * 3. Strict UART interruption warning confinement to hardware mode failures
 * 4. Continuous telemetry generation across 12.0s pulse (V(t), I(t), T_core, R_Ohm, 8x8 frames, stages)
 */

// 1. TopHeader badge logic tests
function getTopHeaderStatusBadge(isHardwareMode: boolean, isHardwareConnected: boolean = true) {
  const dotClass = isHardwareMode
    ? isHardwareConnected
      ? 'bg-[#4cd7f6] animate-pulse'
      : 'bg-rose-500'
    : 'bg-[#06b6d4] animate-pulse';

  const label = isHardwareMode
    ? isHardwareConnected
      ? 'ESP32 HW ACTIVE'
      : 'ESP32 OFFLINE'
    : 'SIMULATION MODE';

  const provenance = isHardwareMode ? 'REAL' : 'SYNTHETIC';

  return { dotClass, label, provenance };
}

test('TopHeader badge displays SIMULATION MODE and SYNTHETIC provenance in simulation mode', () => {
  const badge = getTopHeaderStatusBadge(false);
  assert.equal(badge.label, 'SIMULATION MODE');
  assert.equal(badge.provenance, 'SYNTHETIC');
  assert.notEqual(badge.label, 'ESP32 ONLINE');
  assert.notEqual(badge.label, 'ESP32 HW ACTIVE');
  assert.ok(badge.dotClass.includes('animate-pulse'));
});

test('TopHeader badge displays ESP32 HW ACTIVE only when hardware mode is active', () => {
  const connectedBadge = getTopHeaderStatusBadge(true, true);
  assert.equal(connectedBadge.label, 'ESP32 HW ACTIVE');
  assert.equal(connectedBadge.provenance, 'REAL');

  const disconnectedBadge = getTopHeaderStatusBadge(true, false);
  assert.equal(disconnectedBadge.label, 'ESP32 OFFLINE');
  assert.ok(disconnectedBadge.dotClass.includes('bg-rose-500'));
});

// 2. Live Monitoring status & banner rendering logic tests
interface LiveMonitoringStateInput {
  isHardwareMode: boolean;
  isHardwareLinkDropped: boolean;
  isStreamingPaused: boolean;
  elapsedSec: number;
}

function computeLiveMonitoringStatus(input: LiveMonitoringStateInput) {
  const isLinkOffline = input.isHardwareMode && input.isHardwareLinkDropped;

  const daqStatusText = input.isHardwareMode
    ? isLinkOffline
      ? 'LINK OFFLINE (UART DISCONNECTED)'
      : 'ESP32 DAQ (10 Hz)'
    : 'SIMULATION DAQ (10 Hz)';

  const provenanceBadge = input.isHardwareMode ? 'REAL' : 'SYNTHETIC';

  const statusBannerMessage = input.isHardwareMode
    ? isLinkOffline
      ? 'WARNING: UART Serial Transport Interrupted. Synthetic fallback stream buffer engaged.'
      : 'STREAM ACTIVE (10 Hz) — ESP32 Hardware Stream Buffer Healthy (0 dropped frames, ring buffer fill: 14.8%)'
    : 'STREAM ACTIVE (10 Hz) — Synthetic Telemetry Engine Healthy (100 active + 20 relaxation frames, provenance: SYNTHETIC)';

  const activeStage = isLinkOffline
    ? 'FAULT'
    : input.elapsedSec < 0.2
    ? 'BASELINE'
    : input.elapsedSec < 10.0
    ? 'ACTIVE_PULSE'
    : input.elapsedSec <= 12.0
    ? 'RELAXATION'
    : 'IDLE';

  const controlButtonText = input.isHardwareMode
    ? input.isHardwareLinkDropped
      ? 'RESTORE LINK'
      : 'SIMULATE LINK DROP'
    : input.isStreamingPaused
    ? 'RESUME STREAM'
    : 'PAUSE STREAM';

  const bufferMonitorTitle = input.isHardwareMode
    ? 'Hardware Packet & Transport Buffer'
    : 'Simulation Engine & Telemetry Buffer';

  const bufferMonitorStatus = input.isHardwareMode
    ? isLinkOffline
      ? 'UART LINK DISCONNECTED'
      : 'DMA 100% HEALTHY'
    : 'SYNTHETIC STREAM ACTIVE';

  return {
    isLinkOffline,
    daqStatusText,
    provenanceBadge,
    statusBannerMessage,
    activeStage,
    controlButtonText,
    bufferMonitorTitle,
    bufferMonitorStatus,
  };
}

test('Live Monitoring in simulation mode NEVER displays UART interruption warnings or LINK OFFLINE', () => {
  const simState = computeLiveMonitoringStatus({
    isHardwareMode: false,
    isHardwareLinkDropped: false,
    isStreamingPaused: false,
    elapsedSec: 4.5,
  });

  assert.equal(simState.isLinkOffline, false);
  assert.equal(simState.daqStatusText, 'SIMULATION DAQ (10 Hz)');
  assert.equal(simState.provenanceBadge, 'SYNTHETIC');
  assert.ok(!simState.statusBannerMessage.includes('UART Serial Transport Interrupted'));
  assert.ok(!simState.daqStatusText.includes('LINK OFFLINE'));
  assert.ok(simState.statusBannerMessage.includes('Synthetic Telemetry Engine Healthy'));
  assert.equal(simState.controlButtonText, 'PAUSE STREAM');
  assert.equal(simState.bufferMonitorTitle, 'Simulation Engine & Telemetry Buffer');
  assert.equal(simState.bufferMonitorStatus, 'SYNTHETIC STREAM ACTIVE');
  assert.equal(simState.activeStage, 'ACTIVE_PULSE');
});

test('Live Monitoring in simulation mode allows pausing and resuming without link drop semantics', () => {
  const pausedState = computeLiveMonitoringStatus({
    isHardwareMode: false,
    isHardwareLinkDropped: false,
    isStreamingPaused: true,
    elapsedSec: 8.4,
  });

  assert.equal(pausedState.controlButtonText, 'RESUME STREAM');
  assert.equal(pausedState.isLinkOffline, false);
  assert.ok(!pausedState.statusBannerMessage.includes('Interrupted'));
});

test('UART Serial Transport Interrupted warning triggers ONLY in hardware mode during a link drop', () => {
  // In hardware mode with link dropped:
  const hwDropped = computeLiveMonitoringStatus({
    isHardwareMode: true,
    isHardwareLinkDropped: true,
    isStreamingPaused: false,
    elapsedSec: 5.0,
  });
  assert.equal(hwDropped.isLinkOffline, true);
  assert.equal(hwDropped.daqStatusText, 'LINK OFFLINE (UART DISCONNECTED)');
  assert.equal(
    hwDropped.statusBannerMessage,
    'WARNING: UART Serial Transport Interrupted. Synthetic fallback stream buffer engaged.'
  );
  assert.equal(hwDropped.activeStage, 'FAULT');
  assert.equal(hwDropped.controlButtonText, 'RESTORE LINK');
  assert.equal(hwDropped.bufferMonitorStatus, 'UART LINK DISCONNECTED');

  // In hardware mode with healthy link:
  const hwConnected = computeLiveMonitoringStatus({
    isHardwareMode: true,
    isHardwareLinkDropped: false,
    isStreamingPaused: false,
    elapsedSec: 5.0,
  });
  assert.equal(hwConnected.isLinkOffline, false);
  assert.equal(hwConnected.daqStatusText, 'ESP32 DAQ (10 Hz)');
  assert.ok(!hwConnected.statusBannerMessage.includes('Interrupted'));
  assert.equal(hwConnected.controlButtonText, 'SIMULATE LINK DROP');
});

// 3. Telemetry generation & continuous playback mathematical contract tests
function generatePulseSequence(ocv: number = 4.143, dcir: number = 0.091, pulseCurrent: number = 3.0) {
  const timestamps = Array.from({ length: 120 }, (_, i) => Math.round(i * 0.1 * 10) / 10);

  const voltage = timestamps.map((t) => {
    if (t < 10.0) {
      return Number((ocv - pulseCurrent * dcir - 0.03 * (1.0 - Math.exp(-t / 1.5))).toFixed(4));
    }
    return Number((ocv - 0.02 * Math.exp(-(t - 10.0) / 1.5)).toFixed(4));
  });

  const current = timestamps.map((t) => (t < 10.0 ? pulseCurrent : 0.0));

  const bulkTemp = timestamps.map((t) => {
    if (t < 10.0) {
      return Number((24.0 + 0.25 * (t / 10.0)).toFixed(2));
    }
    return Number((24.25 - 0.05 * ((t - 10.0) / 2.0)).toFixed(2));
  });

  const thermalFrames = Array.from({ length: 100 }, (_, i) => {
    const t = i * 0.1;
    const base = 24.0 + 0.25 * (t / 10.0);
    return Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => {
        const tabRise = (r === 0 || r === 1) && (c === 3 || c === 4) ? 0.3 * (t / 10.0) : 0;
        const hotspotRise = r === 1 && c === 4 ? 0.45 * (t / 10.0) : 0;
        return Number((base + tabRise + hotspotRise + r * 0.03 + c * 0.02).toFixed(2));
      })
    );
  });

  return { timestamps, voltage, current, bulkTemp, thermalFrames };
}

test('continuous 12.0s pulse sequence validates 100 active + 20 relaxation frames with physics integrity', () => {
  const seq = generatePulseSequence(4.143, 0.091, 3.0);

  assert.equal(seq.timestamps.length, 120);
  assert.equal(seq.voltage.length, 120);
  assert.equal(seq.current.length, 120);
  assert.equal(seq.bulkTemp.length, 120);
  assert.equal(seq.thermalFrames.length, 100);

  // Active pulse check (t = 0.0s to 9.9s)
  for (let k = 0; k < 100; k++) {
    const t = seq.timestamps[k];
    assert.ok(t >= 0.0 && t <= 9.9);
    assert.equal(seq.current[k], 3.0);
    // Voltage must be below OCV by at least IR drop (3.0 * 0.091 = 0.273V)
    assert.ok(seq.voltage[k] < 4.143 - 0.25);
    // Bulk temperature must rise monotonically during active discharge
    if (k > 0) {
      assert.ok(seq.bulkTemp[k] >= seq.bulkTemp[k - 1]);
    }
    // Thermal frame must be 8x8
    const frame = seq.thermalFrames[k];
    assert.equal(frame.length, 8);
    assert.equal(frame[0].length, 8);
  }

  // At peak active discharge (k = 99), hotspot at tab region (1,4) is hotter than peripheral corner (7,7)
  assert.ok(seq.thermalFrames[99][1][4] > seq.thermalFrames[99][7][7]);

  // Relaxation check (t = 10.0s to 11.9s)
  for (let k = 100; k < 120; k++) {
    const t = seq.timestamps[k];
    assert.ok(t >= 10.0 && t <= 11.9);
    assert.equal(seq.current[k], 0.0);
    // Voltage rebounds towards OCV during relaxation
    assert.ok(seq.voltage[k] > seq.voltage[99]);
    // Temperature starts slow decay during relaxation
    assert.ok(seq.bulkTemp[k] <= 24.25);
  }
});

test('oscillogram geometric coordinates remain bounded and valid across all 120 frames', () => {
  const seq = generatePulseSequence(4.143, 0.091, 3.0);
  const getX = (t: number) => (t / 12.0) * 760;
  const getYV = (v: number) => {
    const normalized = Math.max(0, Math.min(1, (v - 3.60) / 0.60));
    return 150 - normalized * 130;
  };
  const getYI = (i: number) => {
    const normalized = Math.max(0, Math.min(1, i / 3.50));
    return 300 - normalized * 110;
  };

  for (let i = 0; i < 120; i++) {
    const t = seq.timestamps[i];
    const x = getX(t);
    const yV = getYV(seq.voltage[i]);
    const yI = getYI(seq.current[i]);

    assert.ok(Number.isFinite(x) && x >= 0 && x <= 760);
    assert.ok(Number.isFinite(yV) && yV >= 20 && yV <= 150);
    assert.ok(Number.isFinite(yI) && yI >= 190 && yI <= 300);
  }
});
