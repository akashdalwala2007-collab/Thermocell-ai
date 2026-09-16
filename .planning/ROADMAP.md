# Roadmap: ThermoCell-AI

## Overview

ThermoCell-AI is built in 12 structured phases that systematically transition from empirical NASA battery data ingestion to physics-informed pulse simulation, 8×8 thermal frame generation, dual-domain feature extraction, calibrated machine learning classification, full-stack visualization (FastAPI + React), and future hardware integration specifications. Every phase strictly enforces data provenance and prevents information leakage.

## Phases

- [ ] **Phase 1: Project Architecture and Repository Foundation** - Establish modular directory layout, virtual environments, base dependencies, and unified Pydantic schemas with provenance tagging.
- [ ] **Phase 2: NASA Dataset Ingestion and Preprocessing** - Ingest NASA Ames Li-ion cycle data (B0005, B0006, B0007, B0018), clean telemetry, derive SoH ground truth, and export cycle baselines.
- [ ] **Phase 3: Controlled 10-Second Pulse Simulation** - Implement equivalent circuit model (ECM) simulating ohmic drop and polarization during a 10s discharge pulse.
- [ ] **Phase 4: Physics-Informed Synthetic Thermal Response** - Implement lumped-parameter thermodynamic energy balance ($I^2 R$ Joule heating + dissipation) calibrated against NASA bulk thermal rates.
- [ ] **Phase 5: Synthetic 8×8 Thermal-Frame Generation** - Project thermal dissipation onto an 8×8 grid mimicking an AMG8833 sensor with Gaussian tab hotspots, spatial diffusion, and noise.
- [ ] **Phase 6: Thermal + Electrical Feature Extraction** - Build feature engineering pipeline extracting DCIR, voltage slopes, bulk thermal kinetics, and spatial matrix metrics.
- [ ] **Phase 7: ML Training and Evaluation** - Train, calibrate, and benchmark triage classifiers (REUSE/RETIRE/INVESTIGATE) with strict group train/test splits by Cell ID.
- [ ] **Phase 8: FastAPI Diagnostic API** - Implement REST endpoints for pulse simulation, model inference, telemetry streaming, and historical cycle lookup.
- [ ] **Phase 9: React Dashboard** - Build modern React + Vite + Tailwind CSS dashboard with 8×8 thermal heatmap, pulse line graphs, and triage badges.
- [ ] **Phase 10: Live Simulation Using Generated/Recorded Sequences** - Implement interactive 10-second playback controls, benchmark cell profiles, and synchronized multi-chart telemetry.
- [ ] **Phase 11: Testing and Validation** - Execute end-to-end integration tests, verify zero data leakage, and compile scientific validation report.
- [ ] **Phase 12: Future AMG8833 Hardware Integration** - Formulate abstract `TelemetrySource` contract, ESP32 firmware sketch, and hardware wiring specification.

---

## Phase Details

### Phase 1: Project Architecture and Repository Foundation
**Goal**: Establish clean modular directory layout, configuration, dependency management, and core Pydantic schemas with strict data provenance enums.
**Depends on**: Nothing (initial phase)
**Requirements**: [ARCH-01, ARCH-02, ARCH-03]
**Success Criteria**:
1. Repository structure matches modular design (`backend/`, `frontend/`, `ml/`, `hardware/`, `docs/`).
2. Backend virtual environment resolves dependencies without conflicts; frontend installs clean Vite + React + Tailwind setup.
3. Core schemas validate data payloads and strictly enforce `provenance` field (`REAL`, `SYNTHETIC`, `PREDICTED`).
**Plans**: 2 plans

- **Objective**: Lay down solid foundation and data contracts before any computational or UI code is written.
- **Why Needed**: Eliminates architectural drift and dependency conflicts across a 5-member team.
- **Files/Modules Involved**:
  - `backend/requirements.txt`, `backend/app/main.py`, `backend/app/models/schemas_provenance.py`
  - `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`
  - `.gitignore`, `README.md`
- **Dependencies**: Python 3.10+, Node.js 18+, Git.
- **Inputs**: Architecture specifications and tech stack decisions.
- **Outputs**: Scaffolding directories, lockfiles/requirements, baseline Pydantic schemas.
- **Acceptance Criteria**: Running `pytest` in `backend` and `npm run build` in `frontend` exits with 0 errors.
- **Testing Requirements**: Smoke test validating Pydantic model serialization and rejection of invalid provenance tags.
- **What Must NOT Be Implemented Yet**: No ML training, no physics simulation, no NASA data processing.

---

### Phase 2: NASA Dataset Ingestion and Preprocessing
**Goal**: Ingest, parse, clean, and extract cycle degradation metrics from NASA Ames Li-ion battery datasets (B0005, B0006, B0007, B0018) with ground-truth SoH labels.
**Depends on**: Phase 1
**Requirements**: [DATA-01, DATA-02, DATA-03, DATA-04]
**Success Criteria**:
1. Raw NASA datasets downloaded or loaded from local cache into `backend/data/raw/`.
2. Extracted cycle summaries contain accurate cycle index, discharge capacity, internal resistance, and bulk surface temperature.
3. Derived SoH accurately labeled into REUSE ($\ge 80\%$), RETIRE ($< 70\%$), or INVESTIGATE ($70\%-80\%$).
4. Processed datasets exported to CSV/JSON in `backend/data/processed/` with `provenance: "REAL"`.
**Plans**: 2 plans

- **Objective**: Secure genuine empirical battery degradation data to ground all downstream models.
- **Why Needed**: Diagnostics must be anchored in real-world physical cell degradation histories rather than arbitrary numbers.
- **Files/Modules Involved**:
  - `ml/preprocessing/nasa_downloader.py`, `ml/preprocessing/nasa_parser.py`
  - `backend/data/raw/`, `backend/data/processed/`
- **Dependencies**: pandas, scipy (for `.mat` file parsing if applicable), NumPy.
- **Inputs**: NASA Prognostics Center of Excellence battery datasets (B0005, B0006, B0007, B0018).
- **Outputs**: Clean tabular files (`nasa_cycles_summary.csv`, `nasa_cycles_timeseries.json`).
- **Acceptance Criteria**: Extracted capacity curves match NASA published degradation trajectories (nominal 2.0Ah degrading to ~1.2Ah).
- **Testing Requirements**: Unit tests verifying parser handles missing fields, validates capacity bounds, and verifies cell IDs.
- **What Must NOT Be Implemented Yet**: No thermal array generation, no ML model training, no frontend views.

---

### Phase 3: Controlled 10-Second Pulse Simulation
**Goal**: Implement a physics-grounded Equivalent Circuit Model (ECM) simulating electrical transient response ($V(t)$, $I(t)$) during a 10-second controlled discharge pulse.
**Depends on**: Phase 2
**Requirements**: [SIM-01, SIM-02, SIM-03, SIM-04]
**Success Criteria**:
1. ECM simulator models 1-RC or 2-RC dynamics driven by cell internal resistance and state of health.
2. 10-second pulse at $2\text{A}-5\text{A}$ produces realistic immediate ohmic voltage drop ($\Delta V_0 = I \cdot R_0$) and polarization curve.
3. Output sequence generated at 10Hz (100 time points) and tagged with `provenance: "SYNTHETIC"`.
**Plans**: 2 plans

- **Objective**: Simulate rapid 10s diagnostic pulse testing for cells at various degradation stages.
- **Why Needed**: Full cycling takes 5+ hours; a 10s pulse test represents the rapid screening method being evaluated.
- **Files/Modules Involved**:
  - `backend/app/simulation/ecm_simulator.py`, `ml/simulation/simulate_pulse.py`
  - `backend/data/synthetic/`
- **Dependencies**: NumPy, SciPy.
- **Inputs**: Preprocessed NASA cell degradation parameters (capacity, estimated DCIR per cycle).
- **Outputs**: Synthetic 10s voltage and current time-series arrays for each cycle state.
- **Acceptance Criteria**: High-SoH cells show low voltage drop ($\Delta V < 0.2\text{V}$); degraded cells show pronounced ohmic drop ($\Delta V > 0.5\text{V}$).
- **Testing Requirements**: Unit tests for Ohm's Law consistency, monotonicity of voltage drop with resistance, and time vector integrity.
- **What Must NOT Be Implemented Yet**: No spatial thermal matrices, no ML training.

---

### Phase 4: Physics-Informed Synthetic Thermal Response
**Goal**: Model synthetic bulk thermal evolution during the 10-second pulse using thermodynamic energy balance ($I^2 R$ Joule heating and convective dissipation) calibrated against empirical NASA thermocouple heating rates.
**Depends on**: Phase 3
**Requirements**: [THERM-01, THERM-02, THERM-03, THERM-04]
**Success Criteria**:
1. Thermodynamic differential equation $m c_p \frac{dT}{dt} = I(t)^2 R_{\text{int}} - h A (T - T_{\text{amb}})$ implemented accurately.
2. Calculated bulk $\Delta T$ matches physical orders of magnitude ($0.5^\circ\text{C}-4.0^\circ\text{C}$ for a 10s high-current pulse on an 18650 cell).
3. Simulated bulk heating rates validated for thermodynamic plausibility against NASA empirical discharge thermal curves.
4. Output labeled strictly as `provenance: "SYNTHETIC"`.
**Plans**: 2 plans

- **Objective**: Model the thermodynamic heat generation accompanying the electrical pulse.
- **Why Needed**: Internal resistance directly governs heat generation ($Q \propto R_{\text{int}}$), providing a secondary orthogonal diagnostic signal.
- **Files/Modules Involved**:
  - `backend/app/simulation/thermal_model.py`, `ml/simulation/thermal_kinetics.py`
- **Dependencies**: NumPy, SciPy.
- **Inputs**: 10-second current profile $I(t)$ and cell internal resistance $R_{\text{int}}$ from Phase 3.
- **Outputs**: 100-point bulk temperature time-series $T(t)$.
- **Acceptance Criteria**: Net $\Delta T$ strictly positive during discharge; rate of temperature rise scales quadratically with pulse current.
- **Testing Requirements**: Conservation of energy checks and unit tests verifying zero heating when $I=0$.
- **What Must NOT Be Implemented Yet**: No 8×8 grid spatial expansion yet.

---

### Phase 5: Synthetic 8×8 Thermal-Frame Generation
**Goal**: Project the synthetic bulk thermal response onto a dynamic 8×8 spatial matrix representing an AMG8833 infrared sensor, modeling terminal tab hotspot diffusion and realistic sensor noise.
**Depends on**: Phase 4
**Requirements**: [GRID-01, GRID-02, GRID-03, GRID-04]
**Success Criteria**:
1. 8×8 spatial matrix generated at 10 fps for 10 seconds (100 frames of 64 pixels).
2. 2D Gaussian hotspot centered at battery terminals with radial heat conduction into the cylindrical cell body.
3. Quantization noise and thermal sensitivity calibrated to AMG8833 hardware specs (0.25°C resolution, $\pm 0.05^\circ\text{C}$ noise).
4. All frames explicitly stamped with `provenance: "SYNTHETIC"`.
**Plans**: 2 plans

- **Objective**: Provide a realistic spatial thermal telemetry stream matching low-cost thermal camera hardware.
- **Why Needed**: Enables the development and testing of spatial thermal feature extractors and UI heatmaps without claiming real hardware data.
- **Files/Modules Involved**:
  - `backend/app/simulation/amg8833_synthesizer.py`, `ml/simulation/generate_frames.py`
- **Dependencies**: NumPy, OpenCV (headless) or SciPy `ndimage`.
- **Inputs**: 10-second bulk temperature profile $T(t)$ from Phase 4.
- **Outputs**: 100 8×8 thermal matrices per simulated pulse, serialized to JSON/NumPy.
- **Acceptance Criteria**: Mean of 8×8 frame closely matches bulk temperature; tab pixel cluster is hottest; pixel values quantized to 0.25°C steps.
- **Testing Requirements**: Matrix dimension checks ($8 \times 8 \times 100$), non-negative spatial gradient checks, noise distribution verification.
- **What Must NOT Be Implemented Yet**: No ML training, no frontend integration.

---

### Phase 6: Thermal + Electrical Feature Extraction
**Goal**: Build a unified feature extraction pipeline computing electrical and thermal metrics from the 10-second pulse and 8×8 thermal frame sequences.
**Depends on**: Phase 5
**Requirements**: [FEAT-01, FEAT-02, FEAT-03, FEAT-04]
**Success Criteria**:
1. Electrical features calculated: DCIR, instantaneous drop $\Delta V_0$, 10-second drop $\Delta V_{10}$, and $dV/dt$ slope.
2. Bulk thermal features calculated: peak temperature $T_{\text{max}}$, $\Delta T$, and maximum heating rate.
3. Spatial thermal features calculated: 8×8 mean, maximum, spatial variance $\sigma^2_T$, tab-to-can gradient, and hotspot eccentricity.
4. Clean tabular dataset of feature vectors generated and saved to `ml/features/extracted_features.csv`.
**Plans**: 2 plans

- **Objective**: Transform high-dimensional time-series and spatial matrices into a robust tabular feature vector for ML.
- **Why Needed**: Combines dual-domain information (ohmic drop + localized heat dissipation) to empower accurate classification.
- **Files/Modules Involved**:
  - `ml/features/electrical_features.py`, `ml/features/thermal_features.py`, `ml/features/pipeline.py`
  - `backend/app/services/feature_service.py`
- **Dependencies**: pandas, NumPy, scikit-learn.
- **Inputs**: Synthetic 10s pulse electrical arrays and 8×8 thermal frame sequences.
- **Outputs**: Master feature matrix with cycle metadata and ground-truth triage labels.
- **Acceptance Criteria**: No NaN or infinite values in extracted feature table; clear separability between healthy and degraded cells on DCIR and $\Delta T$.
- **Testing Requirements**: Unit tests checking feature calculation on known synthetic test signals.
- **What Must NOT Be Implemented Yet**: No ML model fitting or evaluation.

---

### Phase 7: ML Training and Evaluation
**Goal**: Train, calibrate, and evaluate multi-class classification models (REUSE, RETIRE, INVESTIGATE) with strict group train/test splits by Battery Cell ID to prevent data leakage.
**Depends on**: Phase 6
**Requirements**: [ML-01, ML-02, ML-03, ML-04, ML-05]
**Success Criteria**:
1. Group train/test split executed strictly by Cell ID (e.g., Train: B0005, B0006; Test: B0007, B0018).
2. Models trained: Rule-based Baseline, Multinomial Logistic Regression, Random Forest, and Gradient Boosted Trees.
3. Performance measured via Macro F1, Balanced Accuracy, Precision/Recall per class, and Confusion Matrix (rejecting naive overall accuracy).
4. Production model calibrated and exported to `ml/saved_models/diagnostic_model.joblib`.
5. All prediction outputs labeled `provenance: "PREDICTED"`.
**Plans**: 2 plans

- **Objective**: Develop a scientifically rigorous triage classifier that generalizes to unseen battery cells.
- **Why Needed**: Provides automated, data-driven second-life decisions with well-calibrated confidence intervals.
- **Files/Modules Involved**:
  - `ml/training/train_models.py`, `ml/evaluation/evaluate_models.py`
  - `ml/saved_models/diagnostic_model.joblib`
- **Dependencies**: scikit-learn, joblib, pandas, NumPy.
- **Inputs**: Master feature matrix from Phase 6 with Cell IDs.
- **Outputs**: Serialized model artifact, confusion matrix figures, evaluation metrics summary JSON.
- **Acceptance Criteria**: Model achieves statistically significant improvement over rule-based baseline on unseen test cells; zero overlap of Cell IDs between train and test.
- **Testing Requirements**: Leakage audit script asserting zero cell ID overlap; test verifying `joblib` model loading and inference shapes.
- **What Must NOT Be Implemented Yet**: No web endpoints or UI components.

---

### Phase 8: FastAPI Diagnostic API
**Goal**: Build a robust, async FastAPI backend serving endpoints for pulse simulation, ML inference, historical cell exploration, and telemetry streaming.
**Depends on**: Phase 7
**Requirements**: [API-01, API-02, API-03, API-04, API-05]
**Success Criteria**:
1. FastAPI app running with CORS, structured error handlers, and interactive OpenAPI documentation (`/docs`).
2. `POST /api/simulate` returns 10-second voltage, current, and thermal telemetry.
3. `POST /api/predict` accepts feature vectors and returns triage classification with confidence scores.
4. `GET /api/cells` provides historical NASA cell summaries and cycle degradation curves.
5. All responses strictly include `provenance` metadata badges.
**Plans**: 2 plans

- **Objective**: Expose all computational and ML models through standard, documented REST interfaces.
- **Why Needed**: Connects data and simulation models to the frontend dashboard and provides future hardware ingest points.
- **Files/Modules Involved**:
  - `backend/app/main.py`, `backend/app/api/routes_simulation.py`, `backend/app/api/routes_diagnostics.py`, `backend/app/api/routes_cells.py`
  - `backend/app/services/ml_service.py`
- **Dependencies**: FastAPI, Uvicorn, Pydantic, joblib.
- **Inputs**: Serialized ML model and processed dataset files.
- **Outputs**: Functional HTTP API endpoints.
- **Acceptance Criteria**: Automated test client executes all endpoints successfully with valid status codes and JSON payloads.
- **Testing Requirements**: Integration tests with `httpx.AsyncClient` covering valid inputs and edge cases.
- **What Must NOT Be Implemented Yet**: No React UI views.

---

### Phase 9: React Dashboard
**Goal**: Build a responsive React + Vite + Tailwind CSS dashboard with an interactive 8×8 thermal heatmap, dynamic electrical/thermal charts, triage classification cards, and data provenance badges.
**Depends on**: Phase 8
**Requirements**: [UI-01, UI-02, UI-03, UI-04, UI-05]
**Success Criteria**:
1. Responsive dashboard renders cleanly on all modern screen sizes with dark/light themes.
2. 8×8 thermal grid component displays temperature colors with toggleable bilinear interpolation.
3. 10-second voltage, current, and temperature charts render dynamically.
4. Prominent triage status badge displays REUSE (green), RETIRE (red), or INVESTIGATE (yellow) with confidence bars.
5. Every chart, card, and modal displays an unambiguous Data Provenance Badge (`REAL`, `SYNTHETIC`, `PREDICTED`).
**Plans**: 3 plans

- **Objective**: Provide an intuitive, demo-ready user interface for hackathon presentation and battery diagnostics.
- **Why Needed**: Translates complex multi-modal telemetry into actionable triage decisions for operators.
- **Files/Modules Involved**:
  - `frontend/src/components/ThermalGrid8x8.tsx`, `frontend/src/components/PulseChart.tsx`
  - `frontend/src/components/DiagnosticCard.tsx`, `frontend/src/components/ProvenanceBadge.tsx`
  - `frontend/src/pages/DashboardPage.tsx`, `frontend/src/services/api.ts`
- **Dependencies**: React, TypeScript, Vite, Tailwind CSS, Lucide React.
- **Inputs**: FastAPI endpoints from Phase 8.
- **Outputs**: Compiled frontend web application.
- **Acceptance Criteria**: All components render without console errors; API calls successfully populate UI widgets.
- **Testing Requirements**: Component build test (`npm run build`) and manual UI verification checklist.
- **What Must NOT Be Implemented Yet**: No complex playback scrubbers (reserved for Phase 10).

---

### Phase 10: Live Simulation Using Generated/Recorded Sequences
**Goal**: Implement real-time playback controls, synchronized time scrubbing, and pre-configured benchmark cell profiles for interactive hackathon demonstrations.
**Depends on**: Phase 9
**Requirements**: [LIVE-01, LIVE-02, LIVE-03]
**Success Criteria**:
1. Interactive playback controls (Play, Pause, Reset, Scrub, Speed 1x/2x/5x) drive the 10-second diagnostic window.
2. Synchronized tick-by-tick animation across the 8×8 thermal heatmap, $V(t)$ curve, and instantaneous power readouts.
3. Quick-select benchmark profiles for healthy (Cycle 10), marginal (Cycle 80), and degraded (Cycle 160) cells.
**Plans**: 2 plans

- **Objective**: Deliver a polished, high-engagement live demonstration mode for hackathon judges.
- **Why Needed**: Allows judges to see simulated 10-second testing in real time and observe the diagnostic verdict trigger.
- **Files/Modules Involved**:
  - `frontend/src/components/SimulationControls.tsx`, `frontend/src/hooks/useSimulationPlayer.ts`
  - `backend/app/api/routes_simulation.py`
- **Dependencies**: React state management, Web Animation / interval hooks.
- **Inputs**: Pre-generated 100-tick pulse sequences from Phase 3 & 5.
- **Outputs**: Interactive live simulation UI experience.
- **Acceptance Criteria**: Smooth 10Hz/20Hz animation playback with responsive pause and scrub functionality.
- **Testing Requirements**: UI state transition tests and browser rendering validation.
- **What Must NOT Be Implemented Yet**: No physical hardware firmware yet.

---

### Phase 11: Testing and Validation
**Goal**: Perform comprehensive system testing, rigorous data integrity audits, and author the scientific validation report.
**Depends on**: Phase 10
**Requirements**: [TEST-01, TEST-02, TEST-03, TEST-04]
**Success Criteria**:
1. Comprehensive test suite passes with high coverage across backend, ML pipeline, and API endpoints.
2. Zero data leakage verified between train and test cell IDs.
3. Energy conservation and thermodynamic boundary checks verified in simulation modules.
4. Scientific validation report compiled in `docs/VALIDATION_REPORT.md` documenting methodology, metrics, and honest limitations.
**Plans**: 2 plans

- **Objective**: Confirm end-to-end system correctness and produce transparent documentation of technical capabilities.
- **Why Needed**: Ensures the project meets all hackathon integrity requirements and stands up to technical scrutiny.
- **Files/Modules Involved**:
  - `backend/tests/`, `ml/evaluation/leakage_audit.py`, `docs/VALIDATION_REPORT.md`
- **Dependencies**: pytest, pytest-asyncio, httpx.
- **Inputs**: All implemented codebase modules.
- **Outputs**: Test reports and published validation document.
- **Acceptance Criteria**: 100% test pass rate on automated suite; validation report explicitly notes claims and non-claims.
- **Testing Requirements**: Automated test run (`pytest`) and CI/CD script check.
- **What Must NOT Be Implemented Yet**: No physical hardware soldering.

---

### Phase 12: Future AMG8833 Hardware Integration
**Goal**: Define abstract `TelemetrySource` contract, implement live ingest endpoint, formulate ESP32 firmware sketch, and document low-cost hardware bill of materials.
**Depends on**: Phase 11
**Requirements**: [HW-01, HW-02, HW-03, HW-04]
**Success Criteria**:
1. Backend `TelemetrySource` interface allows seamless switching between `SyntheticPulseSource` and `HardwareSerialSource`.
2. `POST /api/telemetry/ingest` endpoint accepts raw ESP32 JSON frames without requiring UI or ML changes.
3. Functional Arduino/PlatformIO ESP32 firmware sketch created for I2C AMG8833 and INA219 sensor reading.
4. Comprehensive hardware integration guide and wiring schematic completed in `hardware/README.md`.
**Plans**: 2 plans

- **Objective**: Establish the software and hardware bridge for transition to physical battery bench testing.
- **Why Needed**: Proves the prototype is an extensible foundation for a real physical diagnostic device costing under $40.
- **Files/Modules Involved**:
  - `backend/app/services/telemetry_source.py`, `backend/app/api/routes_telemetry.py`
  - `hardware/esp32_firmware/src/main.cpp`, `hardware/schemas/telemetry_packet.json`, `hardware/README.md`
- **Dependencies**: Arduino / PlatformIO, C++ / C, Wire library (I2C).
- **Inputs**: AMG8833 and INA219 sensor datasheets.
- **Outputs**: Hardware firmware, schematics, and ingest adapter.
- **Acceptance Criteria**: Synthetic source and hardware ingest emit identical Pydantic models; firmware compiles cleanly in PlatformIO.
- **Testing Requirements**: Mock packet ingestion test verifying `POST /api/telemetry/ingest` triggers downstream ML inference.
- **What Must NOT Be Implemented Yet**: No physical circuit production required for software milestone completion.

