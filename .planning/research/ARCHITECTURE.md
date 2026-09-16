# System Architecture & Technical Design

## Target Architecture Pipeline

```text
+-------------------------------------------------------------+
|                NASA REAL BATTERY DATA (REAL)                |
|       (Ames Prognostics Center: B0005, B0006, B0007, B0018) |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|               Data Ingestion & Preprocessing                |
|     - Extract discharge cycles, capacity, bulk temp         |
|     - Derive SoH ground truth and nominal parameters        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|       Physics-Informed 10s Pulse Simulation (SYNTHETIC)     |
|     - 1-RC / 2-RC Equivalent Circuit Model (ECM)            |
|     - Current pulse excitation (I = 2A-5A for 10s)          |
|     - Calculates ohmic drop ΔV_0 and polarization curve     |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|          Synthetic Thermal Response (SYNTHETIC)             |
|     - Lumped-parameter heat balance:                        |
|       m*Cp*(dT/dt) = I^2*R_int - h*A*(T - T_amb)            |
|     - Validated bulk ΔT against real NASA discharge rates   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|         Synthetic 8×8 Thermal Frames (SYNTHETIC)            |
|     - 2D Gaussian hotspot model centered at terminal tabs   |
|     - Spatial heat diffusion equation across 64 pixels      |
|     - Sensor noise & AMG8833 resolution (0.25°C step)       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|            Feature Extraction & Vector Assembly             |
|     - Electrical: DCIR, ΔV_0, ΔV_10, dV/dt, V_recovery      |
|     - Thermal: Mean T, Max T, ΔT/Δt, spatial variance,      |
|       tab-to-can gradient, hotspot eccentricity             |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              ML Diagnostic Classifier (PREDICTED)           |
|     - Calibrated Classifier (Random Forest / GBDT)          |
|     - Outputs: REUSE / RETIRE / INVESTIGATE                 |
|     - Confidence probabilities & feature importance         |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    FastAPI Backend Service                  |
|     - REST Endpoints: /api/simulate, /api/predict,          |
|       /api/stream-thermal, /api/telemetry/ingest            |
|     - Strict Pydantic schemas with provenance badges        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                React + TypeScript Dashboard                 |
|     - Live 8×8 thermal grid heatmap with interpolation      |
|     - Real-time 10s V(t) & T(t) pulse curves                |
|     - Diagnostic result badge: REUSE / RETIRE / INVESTIGATE |
|     - Provenance Inspector (REAL vs SYNTHETIC vs PREDICTED) |
+-------------------------------------------------------------+
```

## Review of Proposed Codebase Structure

The proposed structure from the specification is modular, clean, and well-aligned with hackathon team dynamics:

```text
thermocell-ai/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI application entrypoint & CORS
│   │   ├── api/                     # REST route handlers
│   │   │   ├── routes_diagnostics.py
│   │   │   ├── routes_simulation.py
│   │   │   └── routes_telemetry.py  # Hardware/live ingest endpoint
│   │   ├── models/                  # Pydantic request/response schemas
│   │   │   ├── schemas_battery.py
│   │   │   └── schemas_provenance.py
│   │   ├── services/                # Business logic & ML inference service
│   │   │   ├── ml_service.py
│   │   │   └── diagnostic_service.py
│   │   ├── simulation/              # Physics engine & thermal grid generator
│   │   │   ├── ecm_simulator.py
│   │   │   ├── thermal_model.py
│   │   │   └── amg8833_synthesizer.py
│   │   └── utils/                   # Data helpers & logging
│   ├── data/
│   │   ├── raw/                     # NASA raw CSV/MAT files
│   │   ├── processed/               # Extracted cycle summaries
│   │   └── synthetic/               # Pre-generated 10s pulse datasets
│   ├── tests/                       # Backend unit and integration tests
│   ├── requirements.txt
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── components/              # UI components
│   │   │   ├── ThermalGrid8x8.tsx   # Canvas/SVG 8x8 IR visualizer
│   │   │   ├── PulseChart.tsx       # 10s V(t) & I(t) curve
│   │   │   ├── DiagnosticCard.tsx   # REUSE / RETIRE / INVESTIGATE badge
│   │   │   ├── ProvenanceBadge.tsx  # REAL / SYNTHETIC / PREDICTED indicator
│   │   │   └── SimulationControls.tsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   └── ComparisonPage.tsx
│   │   ├── services/                # API client (Axios / Fetch)
│   │   │   └── api.ts
│   │   └── types/                   # TypeScript interfaces
│   │       └── telemetry.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── ml/
│   ├── preprocessing/               # NASA dataset download & parser
│   ├── simulation/                  # Standalone simulation scripts
│   ├── features/                    # Feature extractor pipeline
│   ├── training/                    # Model training & hyperparameter tuning
│   ├── evaluation/                  # Cross-validation & confusion matrix plots
│   └── saved_models/                # Serialized model artifacts (.joblib/.pkl)
│
├── hardware/                        # Future AMG8833 + ESP32 integration
│   ├── esp32_firmware/              # Arduino / PlatformIO sketch
│   ├── schemas/                     # Serial / HTTP JSON packet definition
│   └── README.md                    # Hardware wiring and test instructions
│
├── docs/                            # Architecture specs, diagrams & API docs
├── .planning/                       # GSD planning & project management files
├── .gitignore
├── GEMINI.md
└── README.md
```

### Architectural Recommendations for Student Teams
1. **Separation of ML Training and Backend Serving**: ML model artifacts are trained in `ml/` and exported via `joblib.dump()` into `ml/saved_models/diagnostic_model.joblib`. The FastAPI backend loads this single artifact into memory on startup inside `ml_service.py`. This decouples the training script dependencies from the fast serving runtime.
2. **Abstract Hardware Interface (`TelemetrySource`)**:
   Create a polymorphic base class `TelemetrySource` with two implementations:
   - `SyntheticPulseSource`: Runs the physics-informed 10-second ECM and 8×8 thermal frame generator.
   - `HardwareSerialSource`: Reads live JSON frames sent by an ESP32 micro-controller over USB Serial or HTTP POST.
   Both sources emit the exact same `BatteryPulseTelemetry` Pydantic model. This completely isolates the UI and ML layers from hardware changes.

