# Requirements: ThermoCell-AI

**Defined:** 2026-09-16
**Core Value:** Rapid (10-second), physics-grounded second-life battery classification (REUSE / RETIRE / INVESTIGATE) with uncompromised data integrity labeling (REAL vs. SYNTHETIC vs. PREDICTED) and a direct path to low-cost hardware validation.

## v1 Requirements

### Architecture & Repository Foundation (Phase 1)
- [ ] **ARCH-01**: Initialize clean repository structure containing `backend/`, `frontend/`, `ml/`, `hardware/`, and `docs/` with `.gitignore` and `README.md`.
- [ ] **ARCH-02**: Define backend dependencies in `backend/requirements.txt` and frontend dependencies in `frontend/package.json`.
- [ ] **ARCH-03**: Establish unified Pydantic data schemas enforcing strict `provenance` metadata tags (`"REAL"`, `"SYNTHETIC"`, `"PREDICTED"`).

### NASA Dataset Ingestion & Preprocessing (Phase 2)
- [ ] **DATA-01**: Ingest NASA Ames battery aging datasets (B0005, B0006, B0007, B0018) from raw `.mat` or clean CSV sources.
- [ ] **DATA-02**: Clean and extract cycle metadata: cycle index, discharge capacity, voltage, current, and single-point surface temperature.
- [ ] **DATA-03**: Derive ground-truth State of Health (SoH = Capacity / Nominal_Capacity) and assign triage labels (REUSE: $\ge 80\%$, RETIRE: $< 70\%$, INVESTIGATE: $70\%-80\%$).
- [ ] **DATA-04**: Export clean, structured cycle summaries to `backend/data/processed/` without data corruption.

### Controlled 10-Second Pulse Simulation (Phase 3)
- [ ] **SIM-01**: Implement Equivalent Circuit Model (1-RC / 2-RC ECM) parameterized by battery degradation state and cycle history.
- [ ] **SIM-02**: Simulate a 10-second constant-current discharge pulse ($I = 2\text{A}-5\text{A}$) at 10Hz sampling rate (100 time points).
- [ ] **SIM-03**: Accurately calculate immediate ohmic voltage drop ($\Delta V_0$), continuous polarization curve, and post-pulse voltage rebound.
- [ ] **SIM-04**: Tag all generated pulse sequences with `provenance: "SYNTHETIC"`.

### Physics-Informed Synthetic Thermal Response (Phase 4)
- [ ] **THERM-01**: Implement lumped-parameter thermodynamic energy balance: $m c_p \frac{dT}{dt} = I^2 R_{\text{int}} - h A (T - T_{\text{amb}})$.
- [ ] **THERM-02**: Model internal resistance growth as a function of cycle degradation and correlate Joule heating with SoH loss.
- [ ] **THERM-03**: Validate synthetic bulk temperature rise rate against empirical NASA thermocouple rise rates for thermodynamic plausibility.
- [ ] **THERM-04**: Explicitly tag bulk thermal signals as `provenance: "SYNTHETIC"`.

### Synthetic 8×8 Thermal-Frame Generation (Phase 5)
- [ ] **GRID-01**: Project cell thermal dynamics onto an 8×8 pixel spatial grid representing an AMG8833 sensor field of view.
- [ ] **GRID-02**: Implement 2D Gaussian hotspot distribution centered around terminal tabs with radial conduction and edge dissipation.
- [ ] **GRID-03**: Quantize synthetic pixel readings to 0.25°C thermal sensitivity with simulated Gaussian sensor noise ($\sigma = 0.05^\circ\text{C}$).
- [ ] **GRID-04**: Generate 10-second temporal sequences of 8×8 frames (10 fps = 100 frames) tagged strictly with `provenance: "SYNTHETIC"`.

### Thermal + Electrical Feature Extraction (Phase 6)
- [ ] **FEAT-01**: Extract electrical features: DCIR ($\Delta V_0 / I$), total drop ($\Delta V_{10}$), voltage slope ($dV/dt$), and recovery rate.
- [ ] **FEAT-02**: Extract bulk thermal features: peak temperature ($T_{\text{max}}$), net rise ($\Delta T$), and maximum heating rate ($dT/dt_{\text{max}}$).
- [ ] **FEAT-03**: Extract spatial thermal features: 8×8 mean, maximum, spatial variance ($\sigma^2_T$), tab-to-can gradient, and hotspot eccentricity.
- [ ] **FEAT-04**: Assemble unified normalized feature vector into `ml/features/` pipeline with feature documentation.

### ML Training and Evaluation (Phase 7)
- [ ] **ML-01**: Implement group-based train/test splitting grouped strictly by Battery Cell ID (e.g. Train: B0005, B0006; Test: B0007, B0018) to prevent data leakage.
- [ ] **ML-02**: Train and benchmark classification models: Rule-based Baseline, Multinomial Logistic Regression, Random Forest, and Gradient Boosted Trees.
- [ ] **ML-03**: Evaluate models using Macro F1-Score, Balanced Accuracy, Precision/Recall per class, Confusion Matrix, and ROC-AUC.
- [ ] **ML-04**: Calibrate probability estimates and export serialized production model to `ml/saved_models/diagnostic_model.joblib`.
- [ ] **ML-05**: Tag all model outputs as `provenance: "PREDICTED"`.

### FastAPI Diagnostic API (Phase 8)
- [ ] **API-01**: Create FastAPI application with CORS middleware, structured error handling, and Pydantic validation.
- [ ] **API-02**: Implement `POST /api/simulate` endpoint returning 10s synthetic pulse voltage and thermal telemetry.
- [ ] **API-03**: Implement `POST /api/predict` endpoint accepting electrical/thermal features and returning triage classification (REUSE/RETIRE/INVESTIGATE) with confidence scores.
- [ ] **API-04**: Implement `GET /api/cells` and `GET /api/cells/{cell_id}/history` endpoints serving processed NASA cycle baselines.
- [ ] **API-05**: Implement `GET /api/stream-thermal` (SSE or WebSocket or chunked frames) for real-time 8×8 playback.

### React Dashboard (Phase 9)
- [ ] **UI-01**: Build responsive dashboard in React, Vite, and Tailwind CSS.
- [ ] **UI-02**: Render interactive 8×8 thermal heatmap with color scale (e.g., Turbo/Inferno) and toggleable bilinear interpolation.
- [ ] **UI-03**: Render dynamic 10-second voltage $V(t)$ and temperature $T(t)$ line charts.
- [ ] **UI-04**: Display prominent triage classification badge (`REUSE` in green, `RETIRE` in red, `INVESTIGATE` in yellow) with confidence meters.
- [ ] **UI-05**: Display omnipresent Data Provenance Badges (`REAL`, `SYNTHETIC`, `PREDICTED`) on every card and chart.

### Live Simulation & Playback (Phase 10)
- [ ] **LIVE-01**: Implement playback controls (Play, Pause, Scrub, Speed 1x/2x/5x) for the 10-second diagnostic window.
- [ ] **LIVE-02**: Provide pre-configured benchmark profiles (Healthy Cell ~ Cycle 10, Marginal Cell ~ Cycle 80, Degraded Cell ~ Cycle 160).
- [ ] **LIVE-03**: Display live synchronized tick-by-tick update across 8×8 heatmap, V/I curves, and instantaneous power/heat readouts.

### Testing and Validation (Phase 11)
- [ ] **TEST-01**: Create unit tests for NASA data parser, ECM simulator, thermal generator, and feature extractor using `pytest`.
- [ ] **TEST-02**: Create integration tests for FastAPI endpoints with `httpx.AsyncClient`.
- [ ] **TEST-03**: Validate that ML pipeline enforces zero data leakage between train and test cell IDs.
- [ ] **TEST-04**: Document test coverage and performance benchmarks in `docs/VALIDATION_REPORT.md`.

### Future AMG8833 Hardware Integration (Phase 12)
- [ ] **HW-01**: Define abstract `TelemetrySource` contract in backend allowing interchangeable data ingestion.
- [ ] **HW-02**: Implement `POST /api/telemetry/ingest` endpoint for streaming frames from an external micro-controller.
- [ ] **HW-03**: Provide Arduino / PlatformIO ESP32 firmware sketch reading I2C AMG8833 (8×8 thermal) and INA219 (voltage/current).
- [ ] **HW-04**: Author hardware assembly guide, wiring schematic, and bill of materials (<$40) in `hardware/README.md`.

---

## v2 Requirements

### Advanced Features (Deferred to Future Milestones)
- **V2-01**: Physical hardware breadboard live validation in bench testing.
- **V2-02**: Multi-chemistry adaptation (LiFePO4, NMC, LCO).
- **V2-03**: Automated pack-level cell balancing and re-binning algorithms.
- **V2-04**: Edge ML compilation for on-device ESP32-S3 or Raspberry Pi classification.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| User Authentication / OAuth / JWT | Hackathon/college prototype does not require user accounts; adds boilerplate. |
| PostgreSQL / MongoDB Database Server | File-based storage (CSV, JSON) satisfies all requirements with zero setup friction. |
| Cloud Deployment / Microservices | Localhost execution (FastAPI + Vite) is reliable, offline-capable, and simple. |
| Claiming 98%+ Accuracy | Scientifically unjustified without large physical testing batches; honest reporting is mandatory. |
| Claiming NASA Data Has 8×8 Thermal Images | NASA datasets only provide single-point thermocouple data; claiming 8×8 NASA imagery is fraudulent. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ARCH-01 | Phase 1 | Pending |
| ARCH-02 | Phase 1 | Pending |
| ARCH-03 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| SIM-01 | Phase 3 | Pending |
| SIM-02 | Phase 3 | Pending |
| SIM-03 | Phase 3 | Pending |
| SIM-04 | Phase 3 | Pending |
| THERM-01 | Phase 4 | Pending |
| THERM-02 | Phase 4 | Pending |
| THERM-03 | Phase 4 | Pending |
| THERM-04 | Phase 4 | Pending |
| GRID-01 | Phase 5 | Pending |
| GRID-02 | Phase 5 | Pending |
| GRID-03 | Phase 5 | Pending |
| GRID-04 | Phase 5 | Pending |
| FEAT-01 | Phase 6 | Pending |
| FEAT-02 | Phase 6 | Pending |
| FEAT-03 | Phase 6 | Pending |
| FEAT-04 | Phase 6 | Pending |
| ML-01 | Phase 7 | Pending |
| ML-02 | Phase 7 | Pending |
| ML-03 | Phase 7 | Pending |
| ML-04 | Phase 7 | Pending |
| ML-05 | Phase 7 | Pending |
| API-01 | Phase 8 | Pending |
| API-02 | Phase 8 | Pending |
| API-03 | Phase 8 | Pending |
| API-04 | Phase 8 | Pending |
| API-05 | Phase 8 | Pending |
| UI-01 | Phase 9 | Pending |
| UI-02 | Phase 9 | Pending |
| UI-03 | Phase 9 | Pending |
| UI-04 | Phase 9 | Pending |
| UI-05 | Phase 9 | Pending |
| LIVE-01 | Phase 10 | Pending |
| LIVE-02 | Phase 10 | Pending |
| LIVE-03 | Phase 10 | Pending |
| TEST-01 | Phase 11 | Pending |
| TEST-02 | Phase 11 | Pending |
| TEST-03 | Phase 11 | Pending |
| TEST-04 | Phase 11 | Pending |
| HW-01 | Phase 12 | Pending |
| HW-02 | Phase 12 | Pending |
| HW-03 | Phase 12 | Pending |
| HW-04 | Phase 12 | Pending |
