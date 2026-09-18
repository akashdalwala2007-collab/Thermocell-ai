# Requirements: ThermoCell-AI

**Defined:** 2026-09-16
**Core Value:** Rapid (10-second), physics-grounded second-life battery classification (REUSE / RETIRE / INVESTIGATE) with uncompromised data integrity labeling (REAL vs. SYNTHETIC vs. PREDICTED) and a direct path to low-cost hardware validation.

---

## v1 Requirements

### Architecture & Repository Foundation (Phase 1)
- [ ] **ARCH-01**: Initialize clean repository structure containing `backend/`, `frontend/`, `ml/`, `hardware/`, and `docs/` with `.gitignore` and `README.md`.
- [ ] **ARCH-02**: Define backend dependencies in `backend/requirements.txt` (FastAPI, scikit-learn, OpenCV-headless) and frontend dependencies in `frontend/package.json` (React, TypeScript, Vite, Tailwind CSS).
- [ ] **ARCH-03**: Establish unified Pydantic data schemas (`BatteryPulseTelemetry`, `TelemetryFrame`, `DiagnosticPrediction`) enforcing strict `ProvenanceEnum` tags (`"REAL"`, `"SYNTHETIC"`, `"PREDICTED"`).

### NASA Dataset Ingestion & Preprocessing (Phase 2)
- [ ] **DATA-01**: Ingest NASA Ames battery aging datasets (B0005, B0006, B0007, B0018) from raw `.mat` or clean CSV sources.
- [ ] **DATA-02**: Extract empirical cycle degradation trajectories: physical `cell_id`, separate `cycle_index`, discharge capacity $C(k)$, baseline DCIR, and single-point surface thermocouple heating rate.
- [ ] **DATA-03**: Derive ground-truth State of Health ($\text{SoH} = C_{\text{discharge}} / 2.0\,\text{Ah} \times 100\%$) and assign baseline triage labels (REUSE: $\ge 80\%$, RETIRE: $< 70\%$, INVESTIGATE: $70\%-80\%$).
- [ ] **DATA-04**: Export clean, structured cycle summaries to `backend/data/processed/` with explicit `provenance: "REAL"`.

### Controlled 10-Second Pulse Simulation (Phase 3)
- [ ] **SIM-01**: Implement Equivalent Circuit Model (1-RC / 2-RC ECM) parameterized by empirical cell degradation state and resistance growth.
- [ ] **SIM-02**: Simulate a 10-second constant-current discharge pulse ($I = 3\text{A}$) at 10Hz sampling rate (100 time points from $t = 0.0$ to $9.9\,\text{s}$).
- [ ] **SIM-03**: Calculate immediate ohmic voltage drop ($\Delta V_0 = I \cdot R_0 \approx 0.24 - 0.30\,\text{V}$ for fresh $0.08 - 0.10\,\Omega$ cell), continuous polarization curve, and total 10s drop ($\Delta V_{10}$).
- [ ] **SIM-04**: Tag all generated pulse sequences with `provenance: "SYNTHETIC"`.

### Physics-Informed Synthetic Thermal Response (Phase 4)
- [ ] **THERM-01**: Implement lumped-parameter thermodynamic energy balance: $m c_p \frac{dT}{dt} = I(t)^2 R_{\text{int}} - h A (T - T_{\text{amb}})$.
- [ ] **THERM-02**: Model internal resistance growth as a function of cycle degradation and correlate Joule heating with capacity fade.
- [ ] **THERM-03**: Calibrate simulated bulk temperature rise rate against empirical NASA surface thermocouple heating rates for physical consistency.
- [ ] **THERM-04**: Tag bulk thermal signals strictly as `provenance: "SYNTHETIC"`.

### Synthetic 8×8 Thermal-Frame Generation (Phase 5)
- [ ] **GRID-01**: Project cell thermal dynamics onto an 8×8 spatial grid representing a Panasonic AMG8833 infrared sensor field of view ($60^\circ \times 60^\circ$).
- [ ] **GRID-02**: Model realistic 18650 cell geometry (~3×7 pixel active footprint) with terminal tab contact resistance hotspot ($R_{\text{tab}} \approx 5-15\,\text{m}\Omega$) and 2D anisotropic heat conduction.
- [ ] **GRID-03**: Quantize synthetic pixel readings to 0.25°C thermal sensitivity with simulated Gaussian sensor noise ($\sigma = 0.05^\circ\text{C}$).
- [ ] **GRID-04**: Generate 10-second temporal sequences of 8×8 frames (10 fps = 100 frames) tagged strictly with `provenance: "SYNTHETIC"`.

### Thermal + Electrical Feature Extraction (Phase 6)
- [ ] **FEAT-01**: Extract 5 electrical features strictly named: `OCV`, `DCIR`, `ΔV10`, `dV/dt_slope`, and `V_recovery_rate`.
- [ ] **FEAT-02**: Extract 4 bulk thermal features strictly named: `T_initial`, `ΔT_bulk`, `dT/dt_max`, and `τ_cool`.
- [ ] **FEAT-03**: Extract 5 spatial thermal features strictly named: `T_max_pixel`, `T_mean_cell`, `σ²_T`, `∇T_tab-body`, and `hotspot_eccentricity`.
- [ ] **FEAT-04**: Assemble unified 14-dimensional feature vector into `ml/features/extracted_features.csv` preserving provenance metadata columns (`cell_id`, `cycle_index`, `cycle_provenance: "REAL"`, `telemetry_provenance: "SYNTHETIC"`, `thermal_provenance: "SYNTHETIC"`) BEFORE ML consumption.

### ML Training and Evaluation (Phase 7)
- [ ] **ML-01**: Implement Leave-One-Group-Out (LOGO) cross-validation grouped strictly by physical `cell_id` across B0005, B0006, B0007, and B0018 to eliminate data leakage.
- [ ] **ML-02**: Train and benchmark classification models: Rule-Based Baseline (with mutually exclusive precedence), Multinomial Logistic Regression, Random Forest, and Gradient Boosted Trees.
- [ ] **ML-03**: Evaluate models using Macro F1-Score, Balanced Accuracy, per-class Precision/Recall, Confusion Matrix, and Brier calibration score (rejecting naive overall accuracy).
- [ ] **ML-04**: Calibrate probability estimates and export serialized production model to `ml/saved_models/diagnostic_model.joblib`.
- [ ] **ML-05**: Enforce that all prediction model outputs strictly carry immutable `provenance: "PREDICTED"`.

### FastAPI Diagnostic API (Phase 8)
- [ ] **API-01**: Create FastAPI application with CORS middleware, structured error handling, and interactive OpenAPI documentation (`/docs`).
- [ ] **API-02**: Implement `POST /api/simulate` endpoint returning 10s synthetic pulse voltage and thermal telemetry validated against `BatteryPulseTelemetry` (including required `v_pre_pulse` and `RelaxationTelemetry`).
- [ ] **API-03**: Implement `POST /api/predict` endpoint returning immutable `DiagnosticPrediction` validating that `class_probabilities` contains exactly `REUSE`, `RETIRE`, `INVESTIGATE`, sums to $1.0 \pm 10^{-4}$, and `confidence` equals `class_probabilities[triage_class.value]` within $10^{-4}$ tolerance (`abs(confidence - class_probabilities[triage_class.value]) <= 1e-4`).
- [ ] **API-04**: Implement `GET /api/cells` and `GET /api/cells/{cell_id}/history` endpoints serving processed NASA cycle baselines.
- [ ] **API-05**: Implement `GET /api/stream-thermal` for real-time frame streaming and enforce `provenance` field on all responses.

### React Dashboard (Phase 9)
- [ ] **UI-01**: Build responsive dashboard in React, TypeScript, Vite, and Tailwind CSS.
- [ ] **UI-02**: Render interactive 8×8 thermal heatmap with Turbo/Inferno colormap and toggleable bilinear interpolation.
- [ ] **UI-03**: Render dynamic 10-second voltage $V(t)$ and temperature $T(t)$ line charts displaying `OCV`, `DCIR`, and `ΔV10`.
- [ ] **UI-04**: Display prominent triage classification badge (`REUSE` green, `RETIRE` red, `INVESTIGATE` amber) with probability meters for the 3 classes.
- [ ] **UI-05**: Display standardized Data Provenance Badges (`REAL` blue, `SYNTHETIC` purple, `PREDICTED` emerald) across all telemetry panels.

### Live Simulation & Playback (Phase 10)
- [ ] **LIVE-01**: Implement playback controls (Play, Pause, Reset, Scrub, Speed 1x/2x/5x) for the 10-second diagnostic window.
- [ ] **LIVE-02**: Provide pre-configured benchmark profiles for healthy (Cycle 10), marginal (Cycle 80), and degraded (Cycle 160) cells.
- [ ] **LIVE-03**: Display live synchronized tick-by-tick update across 8×8 heatmap, V/I curves, and instantaneous power/heat readouts.

### Testing and Validation (Phase 11)
- [ ] **TEST-01**: Create unit tests for NASA data parser, ECM simulator, thermal generator, and feature extractor using `pytest`.
- [ ] **TEST-02**: Create integration tests for FastAPI endpoints with `httpx.AsyncClient`.
- [ ] **TEST-03**: Execute automated audit script asserting zero `cell_id` overlap between train and test sets in ML pipeline.
- [ ] **TEST-04**: Compile scientific validation report in `docs/VALIDATION_REPORT.md` documenting methodology, metrics, and honest limitations.

### Future AMG8833 Hardware Integration (Phase 12)
- [ ] **HW-01**: Define abstract `TelemetrySource` contract and `TelemetryFrame` schema for single-tick hardware frame streaming from ESP32.
- [ ] **HW-02**: Implement `POST /api/telemetry/ingest` endpoint accepting `TelemetryFrame` streaming packets buffered into complete `BatteryPulseTelemetry` payloads.
- [ ] **HW-03**: Provide Arduino / PlatformIO ESP32 firmware sketch reading I2C AMG8833 (8×8 thermal) and INA219 (voltage/current).
- [ ] **HW-04**: Author hardware assembly guide, wiring schematic, and bill of materials (<$40) in `hardware/README.md`.

---

## v2 Requirements

### Advanced Features (Deferred to Future Milestones)
- **V2-01**: Physical hardware breadboard live bench validation with actual load resistor and 18650 cell.
- **V2-02**: Multi-chemistry adaptation (LiFePO4, NMC, LCO).
- **V2-03**: Automated pack-level cell balancing and re-binning algorithms.
- **V2-04**: Edge ML compilation for on-device ESP32-S3 or Raspberry Pi classification.

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| User Authentication / OAuth / JWT | Hackathon/college prototype does not require user accounts; adds boilerplate. |
| PostgreSQL / MongoDB Database Server | Flat file-based storage (CSV, JSON) satisfies all requirements with zero setup friction. |
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
