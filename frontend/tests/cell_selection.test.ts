import test from 'node:test';
import assert from 'node:assert/strict';

interface DiagnosticRunMock {
  session_id: string;
  telemetry: {
    cell_id: string;
    cycle_index: number | null;
    provenance: 'REAL' | 'SYNTHETIC' | 'PREDICTED';
    v_pre_pulse: number;
    metadata?: Record<string, string>;
  };
  prediction: {
    cell_id: string;
    cycle_index: number | null;
    provenance: 'PREDICTED';
    triage_class: 'REUSE' | 'RETIRE' | 'INVESTIGATE';
    confidence: number;
    extracted_features: Record<string, number>;
  };
  features: Record<string, number>;
  soh?: number;
  discharge_capacity?: number;
}

// Empirical NASA dataset fixtures
const NASA_BENCHMARK_CELLS: Record<
  string,
  {
    cycles: Record<
      number,
      {
        soh: number;
        dcir: number;
        capacity: number;
        triage: 'REUSE' | 'RETIRE' | 'INVESTIGATE';
      }
    >;
  }
> = {
  B0005: {
    cycles: {
      1: { soh: 92.83, dcir: 0.091, capacity: 1.8565, triage: 'REUSE' },
      40: { soh: 86.07, dcir: 0.108, capacity: 1.7214, triage: 'REUSE' },
      85: { soh: 76.20, dcir: 0.142, capacity: 1.5240, triage: 'INVESTIGATE' },
      160: { soh: 65.63, dcir: 0.215, capacity: 1.3125, triage: 'RETIRE' },
    },
  },
  B0006: {
    cycles: {
      1: { soh: 101.77, dcir: 0.088, capacity: 2.0353, triage: 'REUSE' },
      50: { soh: 81.05, dcir: 0.115, capacity: 1.6210, triage: 'REUSE' },
      90: { soh: 72.51, dcir: 0.158, capacity: 1.4502, triage: 'INVESTIGATE' },
      155: { soh: 59.25, dcir: 0.235, capacity: 1.1850, triage: 'RETIRE' },
    },
  },
  B0007: {
    cycles: {
      1: { soh: 94.55, dcir: 0.090, capacity: 1.8910, triage: 'REUSE' },
      60: { soh: 82.50, dcir: 0.112, capacity: 1.6500, triage: 'REUSE' },
      110: { soh: 74.00, dcir: 0.150, capacity: 1.4800, triage: 'INVESTIGATE' },
      165: { soh: 62.00, dcir: 0.220, capacity: 1.2400, triage: 'RETIRE' },
    },
  },
  B0018: {
    cycles: {
      1: { soh: 92.75, dcir: 0.092, capacity: 1.8550, triage: 'REUSE' },
      45: { soh: 84.00, dcir: 0.110, capacity: 1.6800, triage: 'REUSE' },
      80: { soh: 75.50, dcir: 0.145, capacity: 1.5100, triage: 'INVESTIGATE' },
      130: { soh: 64.00, dcir: 0.225, capacity: 1.2800, triage: 'RETIRE' },
    },
  },
};

function createDiagnosticPayload(cellId: string, cycleIndex: number = 1): DiagnosticRunMock {
  const cellData = NASA_BENCHMARK_CELLS[cellId];
  if (!cellData) throw new Error(`Unknown cell ${cellId}`);
  const cycData = cellData.cycles[cycleIndex];
  if (!cycData) throw new Error(`Unknown cycle ${cycleIndex} for cell ${cellId}`);

  return {
    session_id: `SES-${cellId}-C${cycleIndex}`,
    telemetry: {
      cell_id: cellId,
      cycle_index: cycleIndex,
      provenance: 'SYNTHETIC',
      v_pre_pulse: 4.143,
      metadata: {
        soh: cycData.soh.toFixed(2),
        discharge_capacity: cycData.capacity.toFixed(4),
        baseline_dcir: cycData.dcir.toFixed(4),
        provenance_soh: 'REAL',
        source: 'LITERATURE_BENCHMARK',
      },
    },
    prediction: {
      cell_id: cellId,
      cycle_index: cycleIndex,
      provenance: 'PREDICTED',
      triage_class: cycData.triage,
      confidence: 0.94,
      extracted_features: {
        DCIR: cycData.dcir,
        OCV: 4.143,
      },
    },
    features: {
      DCIR: cycData.dcir,
      OCV: 4.143,
    },
    soh: cycData.soh,
    discharge_capacity: cycData.capacity,
  };
}

/**
 * Mirror of DashboardView logic: extracts display values from diagnostic payload.
 */
function extractDashboardMetrics(run: DiagnosticRunMock | null) {
  if (!run) {
    return {
      cellId: '—',
      cycleIndex: null,
      estSoh: null,
      dcir: null,
      dischargeCapacity: null,
      verdict: null,
    };
  }

  const rawSoh = run.telemetry.metadata?.soh;
  const parsedSoh = rawSoh ? parseFloat(rawSoh) : run.soh ?? null;
  const dcir = run.features['DCIR'] ?? null;
  const cap = run.telemetry.metadata?.discharge_capacity
    ? parseFloat(run.telemetry.metadata.discharge_capacity)
    : run.discharge_capacity ?? null;

  return {
    cellId: run.telemetry.cell_id,
    cycleIndex: run.telemetry.cycle_index,
    estSoh: parsedSoh,
    dcir,
    dischargeCapacity: cap,
    verdict: run.prediction.triage_class,
  };
}

test('changing selected cell updates displayed diagnostic parameter values to true NASA values', () => {
  // 1. Initial selection: B0005 cycle 1
  let run = createDiagnosticPayload('B0005', 1);
  let metrics = extractDashboardMetrics(run);

  assert.equal(metrics.cellId, 'B0005');
  assert.equal(metrics.cycleIndex, 1);
  assert.equal(metrics.estSoh, 92.83);
  assert.equal(metrics.dcir, 0.091);
  assert.equal(metrics.dischargeCapacity, 1.8565);
  assert.equal(metrics.verdict, 'REUSE');

  // 2. User switches to B0006 cycle 1
  run = createDiagnosticPayload('B0006', 1);
  metrics = extractDashboardMetrics(run);

  assert.equal(metrics.cellId, 'B0006');
  assert.equal(metrics.cycleIndex, 1);
  assert.equal(metrics.estSoh, 101.77);
  assert.equal(metrics.dcir, 0.088);
  assert.equal(metrics.dischargeCapacity, 2.0353);
  assert.equal(metrics.verdict, 'REUSE');

  // 3. User switches to B0007 cycle 1
  run = createDiagnosticPayload('B0007', 1);
  metrics = extractDashboardMetrics(run);

  assert.equal(metrics.cellId, 'B0007');
  assert.equal(metrics.cycleIndex, 1);
  assert.equal(metrics.estSoh, 94.55);
  assert.equal(metrics.dcir, 0.090);
  assert.equal(metrics.dischargeCapacity, 1.8910);
  assert.equal(metrics.verdict, 'REUSE');

  // 4. User switches to B0018 cycle 1
  run = createDiagnosticPayload('B0018', 1);
  metrics = extractDashboardMetrics(run);

  assert.equal(metrics.cellId, 'B0018');
  assert.equal(metrics.cycleIndex, 1);
  assert.equal(metrics.estSoh, 92.75);
  assert.equal(metrics.dcir, 0.092);
  assert.equal(metrics.dischargeCapacity, 1.8550);
  assert.equal(metrics.verdict, 'REUSE');
});

test('cycle selection updates displayed diagnostic data across degradation tiers', () => {
  // Test B0005 across cycles: 1 -> 40 -> 85 -> 160
  const c1 = extractDashboardMetrics(createDiagnosticPayload('B0005', 1));
  assert.equal(c1.cycleIndex, 1);
  assert.equal(c1.estSoh, 92.83);
  assert.equal(c1.dcir, 0.091);
  assert.equal(c1.verdict, 'REUSE');

  const c40 = extractDashboardMetrics(createDiagnosticPayload('B0005', 40));
  assert.equal(c40.cycleIndex, 40);
  assert.equal(c40.estSoh, 86.07);
  assert.equal(c40.dcir, 0.108);
  assert.equal(c40.verdict, 'REUSE');

  const c85 = extractDashboardMetrics(createDiagnosticPayload('B0005', 85));
  assert.equal(c85.cycleIndex, 85);
  assert.equal(c85.estSoh, 76.20);
  assert.equal(c85.dcir, 0.142);
  assert.equal(c85.verdict, 'INVESTIGATE');

  const c160 = extractDashboardMetrics(createDiagnosticPayload('B0005', 160));
  assert.equal(c160.cycleIndex, 160);
  assert.equal(c160.estSoh, 65.63);
  assert.equal(c160.dcir, 0.215);
  assert.equal(c160.verdict, 'RETIRE');

  // Values across cycles must strictly change and reflect progressive degradation
  assert.ok(c1.dcir < c40.dcir && c40.dcir < c85.dcir && c85.dcir < c160.dcir);
  assert.ok(c1.estSoh! > c40.estSoh! && c40.estSoh! > c85.estSoh! && c85.estSoh! > c160.estSoh!);
});

