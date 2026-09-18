# System Architecture & Technical Design

## Target Architecture Pipeline & Data Provenance

```text
+-------------------------------------------------------------+
|                NASA REAL BATTERY DATA [REAL]                |
|       (Ames Prognostics Center: B0005, B0006, B0007, B0018) |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|            Data Ingestion & Preprocessing [REAL]            |
|     - Extract discharge capacity trajectories C(k)          |
|     - Physical cell_id separated from cycle_index           |
|     - Derive SoH = C(k) / 2.0 Ah and cycle degradation      |
|     - Extract empirical bulk surface thermocouple rates     |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|     Physics-Informed 10s Pulse Simulation [SYNTHETIC]       |
|     - 1-RC / 2-RC Equivalent Circuit Model (ECM)            |
|     - 10s constant-current pulse (I = 3A @ 10Hz, 100 steps) |
|     - Ohmic drop ΔV_0 ≈ 0.24-0.30V & polarization curve V(t)|
|     - 2s post-pulse relaxation window (20 steps)            |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|        Synthetic Bulk Thermal Kinetics [SYNTHETIC]          |
|     - Lumped energy balance: m*Cp*(dT/dt) = I^2*R - h*A*ΔT  |
|     - Calibrated against empirical NASA bulk heating rates  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|        Synthetic 8×8 Thermal Frame Array [SYNTHETIC]        |
|     - 2D anisotropic heat conduction across 64 pixels       |
|     - Active cell FOV bounding box (~3×7) + terminal hotspot|
|     - 0.25°C quantization & realistic sensor noise (AMG8833)|
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|       Canonical 14-Feature Extraction [SYNTHETIC]           |
|     - Electrical (5): OCV, DCIR, ΔV10, dV/dt_slope,         |
|       V_recovery_rate                                       |
|     - Bulk Thermal (4): T_initial, ΔT_bulk, dT/dt_max,      |
|       τ_cool                                                |
|     - Spatial (5): T_max_pixel, T_mean_cell, σ²_T,          |
|       ∇T_tab-body, hotspot_eccentricity                     |
|     - Preserves provenance columns in extracted_features.csv|
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|           ML Diagnostic Classifier [PREDICTED]              |
|     - Leave-One-Group-Out (LOGO) CV grouped by cell_id      |
|     - Mutually exclusive triage: RETIRE > INVESTIGATE       |
|       > REUSE (RETIRE tripwires first; REUSE if all nominal)|
|     - Calibrated class probabilities & feature importance   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                  FastAPI Backend Service                    |
|     - REST Endpoints: /api/simulate, /api/predict,          |
|       /api/cells, /api/stream-thermal, /api/telemetry/ingest|
|     - Strict Pydantic contracts & TelemetryBufferService    |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              React + TypeScript + Vite Dashboard            |
|     - Live 8×8 thermal grid heatmap (bilinear interpolation)|
|     - Dynamic 10s V(t) & T(t) pulse curves                  |
|     - Triage status badge: REUSE / RETIRE / INVESTIGATE     |
|     - Provenance Badges ([REAL], [SYNTHETIC], [PREDICTED])  |
+-------------------------------------------------------------+
```

---

## Canonical Data Contracts (Pydantic Schemas)

To guarantee software/hardware modularity, strict data provenance tracking, and leak-proof data flow, all backend models enforce exact schema validation:

```python
import math
import re
from enum import Enum
from typing import List, Dict, Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import List, Dict, Optional, Literal, Annotated
from pydantic import BaseModel, Field, ConfigDict, model_validator, AfterValidator

class ProvenanceEnum(str, Enum):
    REAL = "REAL"             # Empirical physical laboratory measurements
    SYNTHETIC = "SYNTHETIC"   # Physically simulated or computationally generated
    PREDICTED = "PREDICTED"   # Machine learning inference or statistical prediction

class TriageClassEnum(str, Enum):
    REUSE = "REUSE"
    RETIRE = "RETIRE"
    INVESTIGATE = "INVESTIGATE"

def validate_physical_cell_id(v: str) -> str:
    """Enforces that cell_id represents strictly a physical cell and rejects composite cycle strings."""
    if not isinstance(v, str):
        raise ValueError("cell_id must be a string")
    v_clean = v.strip()
    if not v_clean:
        raise ValueError("cell_id cannot be empty")
    # Reject composite cycle markers like -CYC40, _cycle10, etc.
    if re.search(r"(?i)[-_]?(cyc|cycle)\d*", v_clean):
        raise ValueError(f"cell_id '{v}' invalid: composite cycle strings are prohibited. Keep cycle in cycle_index.")
    # Must match alphanumeric identifiers (e.g. 'B0005', 'HW-001', 'CELL_A')
    if not re.match(r"^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$", v_clean):
        raise ValueError(f"cell_id '{v}' invalid format: must be a valid physical cell identifier")
    return v_clean

PhysicalCellId = Annotated[str, AfterValidator(validate_physical_cell_id)]

class TelemetryFrame(BaseModel):
    """Represents a single raw 100ms hardware frame streamed from an ESP32 or simulation tick."""
    cell_id: str = Field(..., description="Physical cell identifier, e.g. 'B0005' or 'HW-001'")
    cell_id: PhysicalCellId = Field(..., description="Physical cell identifier, e.g. 'B0005' or 'HW-001'. Does NOT encode cycle.")
    cycle_index: Optional[int] = Field(None, description="Cycle index if known")
    timestamp: float = Field(..., ge=0.0, description="Elapsed time in seconds")
    voltage: float = Field(..., ge=0.0, le=5.0, description="Instantaneous voltage in Volts")
    current: float = Field(..., ge=0.0, le=10.0, description="Instantaneous discharge current in Amperes")
    bulk_temperature: float = Field(..., description="Bulk surface temperature in °C")
    thermal_frame_8x8: List[List[float]] = Field(..., description="Single 8x8 spatial temperature grid in °C")
    provenance: ProvenanceEnum = Field(..., description="Origin of the telemetry tick")

    @model_validator(mode="after")
    def validate_frame_dimensions(self):
        if len(self.thermal_frame_8x8) != 8 or any(len(row) != 8 for row in self.thermal_frame_8x8):
            raise ValueError("thermal_frame_8x8 must be exactly 8x8")
        return self

class RelaxationTelemetry(BaseModel):
    """Represents the 2-second post-pulse relaxation period (20 samples @ 10Hz, t = 10.0 to 11.9s)."""
    duration_s: float = Field(default=2.0, description="Relaxation duration in seconds")
    timestamps: List[float] = Field(..., description="20-element time vector from 10.0 to 11.9s")
    voltage: List[float] = Field(..., description="20-element voltage relaxation curve")
    bulk_temperature: List[float] = Field(..., description="20-element bulk temperature relaxation curve")

    @model_validator(mode="after")
    def validate_relaxation_samples(self):
        # 0. Finite float validation and exact 2.0s duration contract
        if not math.isfinite(self.duration_s):
            raise ValueError("RelaxationTelemetry duration_s must be a finite float")
        if abs(self.duration_s - 2.0) > 1e-4:
            raise ValueError(f"RelaxationTelemetry duration_s must be exactly 2.0s, got {self.duration_s}")

        # 1. Exact sample count and finite float validation
        expected_len = 20
        for field_name, arr in [
            ("timestamps", self.timestamps),
            ("voltage", self.voltage),
            ("bulk_temperature", self.bulk_temperature),
        ]:
            if len(arr) != expected_len:
                raise ValueError(f"RelaxationTelemetry {field_name} must contain exactly {expected_len} samples, got {len(arr)}")
            if any(not math.isfinite(x) for x in arr):
                raise ValueError(f"RelaxationTelemetry {field_name} contains non-finite values (NaN or Inf)")

        # 2. Strict monotonicity and exact timestamp sequence t_i = round(10.0 + 0.1 * i, 1)
        for i in range(expected_len):
            expected_t = round(10.0 + 0.1 * i, 1)
            if abs(self.timestamps[i] - expected_t) > 1e-4:
                raise ValueError(f"Relaxation timestamp[{i}] must be {expected_t}, got {self.timestamps[i]}")
            if i > 0 and self.timestamps[i] <= self.timestamps[i - 1]:
                raise ValueError(f"Relaxation timestamps must be strictly monotonic at index {i}")

        return self

class BatteryPulseTelemetry(BaseModel):
    """Complete 10-second controlled discharge pulse telemetry payload (100 samples @ 10Hz) plus relaxation."""
    cell_id: str = Field(..., description="Physical cell identifier (e.g. 'B0005'). Does NOT encode cycle.")
    cell_id: PhysicalCellId = Field(..., description="Physical cell identifier (e.g. 'B0005'). Does NOT encode cycle.")
    cycle_index: Optional[int] = Field(None, description="Cycle index (e.g. 40). Kept separate from cell_id.")
    provenance: ProvenanceEnum = Field(..., description="Data origin tag: REAL, SYNTHETIC, or PREDICTED")
    v_pre_pulse: float = Field(..., ge=0.0, le=5.0, description="Pre-pulse open-circuit voltage at t=0.0s before load application (I=0)")
    v_pre_pulse: float = Field(..., ge=0.0, le=5.0, description="Pre-pulse open-circuit voltage acquired immediately prior to load application (I=0)")
    sampling_rate_hz: float = Field(default=10.0, description="Sampling rate in Hertz")
    duration_s: float = Field(default=10.0, description="Active pulse duration in seconds")
    timestamps: List[float] = Field(..., description="100-element time vector covering [0.0, 9.9]s with 0.1s step")
    voltage: List[float] = Field(..., description="100-element cell voltage readings (V)")
    current: List[float] = Field(..., description="100-element discharge current readings (A)")
    bulk_temperature: List[float] = Field(..., description="100-element bulk temperature readings (°C)")
    thermal_frames: List[List[List[float]]] = Field(..., description="100 frames of 8x8 spatial temperature matrices (°C)")
    relaxation: RelaxationTelemetry = Field(..., description="Required 2-second post-pulse relaxation telemetry (20 samples @ 10Hz, 10.0-11.9s) for V_recovery_rate and τ_cool")
    metadata: Optional[Dict[str, str]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_fixed_contract(self):
        # 0. Finite float validation on v_pre_pulse
        if not math.isfinite(self.v_pre_pulse):
            raise ValueError("v_pre_pulse must be a finite float")

        # 1. Exact scalar contract
        if self.sampling_rate_hz != 10.0:
            raise ValueError(f"sampling_rate_hz must be exactly 10.0, got {self.sampling_rate_hz}")
        if self.duration_s != 10.0:
            raise ValueError(f"duration_s must be exactly 10.0, got {self.duration_s}")

        # 2. 1-D telemetry array lengths and finite float values
        expected_len = 100
        for field_name, arr in [
            ("timestamps", self.timestamps),
            ("voltage", self.voltage),
            ("current", self.current),
            ("bulk_temperature", self.bulk_temperature),
        ]:
            if len(arr) != expected_len:
                raise ValueError(f"{field_name} must contain exactly {expected_len} samples, got {len(arr)}")
            if any(not math.isfinite(x) for x in arr):
                raise ValueError(f"{field_name} contains non-finite values (NaN or Inf)")

        # 2b. Fixed 3.0A discharge current contract (tolerance ±0.05A for simulated/hardware ADC jitter)
        for idx, c in enumerate(self.current):
            if abs(c - 3.0) > 0.05:
                raise ValueError(
                    f"current[{idx}] ({c:.3f}A) violates fixed 3.0A pulse contract (must be within [2.95, 3.05]A)"
                )

        # 3. Thermal frames dimensions: 100 frames, each 8x8 with finite values
        if len(self.thermal_frames) != expected_len:
            raise ValueError(f"thermal_frames must contain exactly {expected_len} frames, got {len(self.thermal_frames)}")
        for idx, frame in enumerate(self.thermal_frames):
            if len(frame) != 8 or any(len(row) != 8 for row in frame):
                raise ValueError(f"thermal_frame at index {idx} is not 8x8")
            if any(not math.isfinite(val) for row in frame for val in row):
                raise ValueError(f"thermal_frame at index {idx} contains non-finite values")

        # 4. Timestamp monotonicity, 0.1s spacing, and interval coverage [0.0, 9.9]s
        for i in range(expected_len):
            expected_t = round(i * 0.1, 1)
            if abs(self.timestamps[i] - expected_t) > 1e-4:
                raise ValueError(f"timestamp[{i}] must be {expected_t}, got {self.timestamps[i]}")
            if i > 0 and self.timestamps[i] <= self.timestamps[i - 1]:
                raise ValueError(f"timestamps must be strictly monotonic at index {i}")

        return self

class DiagnosticPrediction(BaseModel):
    """Machine learning diagnostic triage verdict with strictly enforced PREDICTED provenance (immutable)."""
    model_config = ConfigDict(frozen=True)

    cell_id: PhysicalCellId = Field(..., description="Physical cell identifier")
    cycle_index: Optional[int] = Field(None, description="Cycle index if applicable")
    provenance: Literal[ProvenanceEnum.PREDICTED] = ProvenanceEnum.PREDICTED
    triage_class: TriageClassEnum = Field(..., description="Triage decision: REUSE, RETIRE, or INVESTIGATE")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Calibrated confidence score")
    class_probabilities: Dict[str, float] = Field(..., description="Class probability distribution")
    extracted_features: Dict[str, float] = Field(..., description="Extracted canonical 14 features")
    recommendation: str = Field(..., description="Actionable triage recommendation text")

    @model_validator(mode="after")
    def validate_prediction_invariants(self):
        # 1. Enforce exact class probability labels
        expected_keys = {TriageClassEnum.REUSE.value, TriageClassEnum.RETIRE.value, TriageClassEnum.INVESTIGATE.value}
        if set(self.class_probabilities.keys()) != expected_keys:
            raise ValueError(f"class_probabilities must contain exactly {expected_keys}, got {set(self.class_probabilities.keys())}")

        # 2. Enforce probability range [0.0, 1.0] and sum to 1.0 within tolerance
        prob_sum = 0.0
        for k, p in self.class_probabilities.items():
            if p < 0.0 or p > 1.0:
                raise ValueError(f"Probability for {k} must be in [0.0, 1.0], got {p}")
            prob_sum += p
        if abs(prob_sum - 1.0) > 1e-4:
            raise ValueError(f"class_probabilities must sum to 1.0, got {prob_sum}")

        # 3. Enforce confidence equals the selected class probability
        selected_prob = self.class_probabilities[self.triage_class.value]
        if abs(self.confidence - selected_prob) > 1e-4:
            raise ValueError(f"confidence ({self.confidence}) must match class_probabilities[{self.triage_class.value}] ({selected_prob})")

        return self
```

---

## Telemetry Ingestion & Hardware Buffering Architecture

To support physical hardware integration (ESP32 + AMG8833 + INA219) without rewriting downstream ML or dashboard components, the telemetry pipeline enforces a strict 3-state ingestion lifecycle managed by `TelemetryBufferService`:

```text
[ Physical Sensors ]
  AMG8833 (8x8 I2C) + INA219 (V/I I2C)
          |
          v
[ ESP32 Firmware ] -- Serial / HTTP POST --> POST /api/telemetry/ingest
                                                    |
                                            (TelemetryFrame)
                                                    |
                                                    v
                                      [ TelemetryBufferService ]
                                       State 1: PRE_PULSE_BASELINE (I=0A -> v_pre_pulse)
                                       State 2: ACTIVE_PULSE (100 ticks @ 3A, [0.0, 9.9]s)
                                       State 3: RELAXATION (20 ticks @ 0A, [10.0, 11.9]s)
                                                    |
                                                    v
                                         [ BatteryPulseTelemetry ]
                                                    |
                                                    v
                                      [ FeatureExtractor (14 feats) ]
                                                    |
                                                    v
                                         [ ML Diagnostic Service ]
                                                    |
                                                    v
                                           [ DiagnosticPrediction ]
```

### 3-State Hardware Ingestion Lifecycle

1. **`PRE_PULSE_BASELINE` (Unloaded OCV State)**:
   - Acquired immediately prior to load application ($I = 0\,\text{A}$).
   - The buffer captures an initial baseline open-circuit voltage reading and stores it as scalar `v_pre_pulse`.
   - **Authoritative Baseline Policy**: To eliminate ambiguity from continuous streaming and prevent stale idle history from corrupting diagnostics while respecting `TelemetryFrame.timestamp >= 0.0`:
     - The ESP32 transmits an explicit pre-pulse baseline packet (or handshake frame tagged with baseline intent), OR `TelemetryBufferService` deterministically latches the **latest validated low-current frame** ($I < 0.05\,\text{A}$) arriving strictly within the immediate pre-trigger window defined relative to the recorded active pulse trigger timestamp $t_{\text{trigger}}$ (i.e. $t_{\text{frame}} \in [t_{\text{trigger}} - 0.2\,\text{s}, t_{\text{trigger}})$, where all frame timestamps satisfy $t_{\text{frame}} \ge 0.0$).
     - Stale idle frames where $t_{\text{trigger}} - t_{\text{frame}} > 0.5\,\text{s}$ are automatically discarded from baseline evaluation.
     - Once `ACTIVE_PULSE` is triggered at $t_{\text{trigger}}$, `v_pre_pulse` is frozen and immutable; no subsequent frame may overwrite it.
     - The active pulse time vector is then referenced relative to pulse onset, yielding the canonical $[0.0, 9.9]\,\text{s}$ active pulse timestamps.
     - **Baseline Failure Path**: If BOTH the explicit `PRE_PULSE_BASELINE` packet/state and the validated low-current fallback frame ($I < 0.05\,\text{A}$) within $t_{\text{frame}} \in [t_{\text{trigger}} - 0.2\,\text{s}, t_{\text{trigger}})$ are absent or fail validation, pulse acquisition MUST be immediately aborted and rejected. `TelemetryBufferService` MUST NOT emit a `BatteryPulseTelemetry` payload with a missing `v_pre_pulse`, MUST NOT substitute an arbitrary frame, and MUST NOT use stale idle history older than 0.5s.
     - This measurement is preserved as an explicit scalar field in `BatteryPulseTelemetry`, completely separate from the active pulse time-series arrays.

2. **`ACTIVE_PULSE` (Loaded Discharge State)**:
   - Initiated when the ESP32 engages the discharge load switch (commanded $I = 3.0\,\text{A}$).
   - The buffer captures exactly 100 synchronized multi-modal frames at 10 Hz across timestamps $[0.0, 9.9]\,\text{s}$ ($t_i = \text{round}(0.1 \cdot i, 1)$ for $i \in [0, 99]$).
   - Timestamp $t = 0.0\,\text{s}$ corresponds to the first post-load active pulse sample under $3.0\,\text{A}$ discharge.

3. **`RELAXATION` (Post-Cutoff Recovery State)**:
   - Initiated when the discharge load is disengaged ($I = 0\,\text{A}$).
   - The buffer captures exactly 20 synchronized recovery frames at 10 Hz across timestamps $[10.0, 11.9]\,\text{s}$ ($t_i = \text{round}(10.0 + 0.1 \cdot i, 1)$ for $i \in [0, 19]$), representing 2.0s duration.
   - Upon receiving the 20th relaxation frame, `TelemetryBufferService` synthesizes and validates the complete immutable `BatteryPulseTelemetry` payload containing `v_pre_pulse`, active arrays, and the nested `RelaxationTelemetry` model.

### Abstract `TelemetrySource` Strategy Pattern

```python
from abc import ABC, abstractmethod

class PulseTelemetryRequest(BaseModel):
    """Validated request model for acquiring 10-second pulse telemetry."""
    model_config = ConfigDict(frozen=True)
    cell_id: PhysicalCellId = Field(..., description="Validated physical cell identifier")
    cycle_index: Optional[int] = Field(None, description="Cycle index if applicable")

class TelemetrySource(ABC):
    @abstractmethod
    async def get_pulse_telemetry(self, cell_id: str, cycle_index: Optional[int] = None) -> BatteryPulseTelemetry:
        """Acquire a complete 10-second pulse telemetry payload after runtime boundary validation."""
        pass

class SyntheticPulseSource(TelemetrySource):
    """Physics-informed 10-second pulse simulation (Phases 3-5)."""
    async def get_pulse_telemetry(self, cell_id: str, cycle_index: Optional[int] = None) -> BatteryPulseTelemetry:
        # Runtime boundary validation: explicitly reject composite cycle identifiers (e.g. 'B0005-CYC40')
        validated_cell_id = validate_physical_cell_id(cell_id)
        # Executes ECM simulation + lumped thermal kinetics + 8x8 grid projection for validated_cell_id
        ...

class HardwareSerialSource(TelemetrySource):
    """Aggregated telemetry from ESP32 micro-controller via TelemetryBufferService (Phase 12)."""
    async def get_pulse_telemetry(self, cell_id: str, cycle_index: Optional[int] = None) -> BatteryPulseTelemetry:
        # Runtime boundary validation: explicitly reject composite cycle identifiers (e.g. 'B0005-CYC40')
        validated_cell_id = validate_physical_cell_id(cell_id)
        # Reads complete aggregated payload from buffer service for validated_cell_id
        ...
```

---

## UI Provenance Visual Language

Every card, chart, and modal in the React dashboard displays a standardized visual provenance badge:

| Provenance | Definition | Tailwind Styling |
|---|---|---|
| **REAL** | Empirical measurements from NASA Ames battery cyclers | `bg-blue-950/60 text-blue-300 border border-blue-500/50` |
| **SYNTHETIC** | Numerically modeled 10s pulse and 8×8 thermal frames | `bg-purple-950/60 text-purple-300 border border-purple-500/50` |
| **PREDICTED** | Classification verdicts and probabilities from ML model | `bg-emerald-950/60 text-emerald-300 border border-emerald-500/50` |

---

## Review of Proposed Codebase Structure

```text
thermocell-ai/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI entrypoint, CORS, exception handlers
│   │   ├── api/                     # REST route handlers
│   │   │   ├── routes_diagnostics.py# /api/predict
│   │   │   ├── routes_simulation.py # /api/simulate
│   │   │   ├── routes_cells.py      # /api/cells (NASA historical data)
│   │   │   └── routes_telemetry.py  # /api/telemetry/ingest (Hardware streaming)
│   │   ├── models/                  # Pydantic request/response schemas
│   │   │   ├── schemas_battery.py   # TelemetryFrame, BatteryPulseTelemetry, RelaxationTelemetry
│   │   │   └── schemas_provenance.py# ProvenanceEnum, DiagnosticPrediction
│   │   ├── services/                # Business logic & ML inference service
│   │   │   ├── ml_service.py        # Model loading & inference
│   │   │   ├── feature_service.py   # 14-feature extractor
│   │   │   ├── telemetry_buffer.py  # TelemetryBufferService (ticks -> pulse)
│   │   │   └── telemetry_source.py  # Abstract source interface
│   │   ├── simulation/              # Physics engine & thermal grid generator
│   │   │   ├── ecm_simulator.py     # 1-RC / 2-RC electrical model
│   │   │   ├── thermal_model.py     # Lumped thermodynamic kinetics
│   │   │   └── amg8833_synthesizer.py # 8x8 IR grid projection
│   │   └── utils/                   # File helpers & JSON serializers
│   ├── data/
│   │   ├── raw/                     # NASA raw CSV/MAT files
│   │   ├── processed/               # Extracted cycle degradation summaries
│   │   └── synthetic/               # Pre-generated 10s pulse datasets
│   ├── tests/                       # Pytest unit and integration tests
│   ├── requirements.txt
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── components/              # UI components
│   │   │   ├── ThermalGrid8x8.tsx   # Canvas 8x8 IR visualizer with interpolation
│   │   │   ├── PulseChart.tsx       # Dynamic 10s V(t) & T(t) pulse curves (OCV, DCIR, ΔV10)
│   │   │   ├── DiagnosticCard.tsx   # REUSE / RETIRE / INVESTIGATE card
│   │   │   ├── ProvenanceBadge.tsx  # REAL / SYNTHETIC / PREDICTED indicator
│   │   │   └── SimulationControls.tsx # Play / Pause / Scrub / Speed controls
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx    # Live diagnostic workstation
│   │   │   └── ComparisonPage.tsx   # Side-by-side cell comparison
│   │   ├── services/                # Axios/fetch API client
│   │   │   └── api.ts
│   │   └── types/                   # TypeScript interfaces matching backend models
│   │       └── telemetry.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── ml/
│   ├── preprocessing/               # NASA dataset download & parser
│   ├── simulation/                  # Standalone simulation scripts
│   ├── features/                    # Canonical 14-feature extraction pipeline
│   ├── training/                    # Leave-One-Group-Out model training
│   ├── evaluation/                  # Cross-validation & confusion matrix plots
│   └── saved_models/                # Serialized model artifacts (.joblib)
│
├── hardware/                        # Future AMG8833 + ESP32 integration
│   ├── esp32_firmware/              # Arduino / PlatformIO sketch
│   ├── schemas/                     # Serial / HTTP JSON packet definition
│   └── README.md                    # Hardware wiring and BOM (<$40)
│
├── docs/                            # Architecture specs, diagrams & API docs
├── .planning/                       # GSD planning & project management files
├── .gitignore
├── GEMINI.md
└── README.md
```
