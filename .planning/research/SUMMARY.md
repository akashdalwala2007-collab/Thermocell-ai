# Executive Research Summary: ThermoCell-AI

## Project Mission
ThermoCell-AI demonstrates a rapid (10-second) diagnostic prototype for second-life lithium-ion battery triage (REUSE / RETIRE / INVESTIGATE) using physics-informed synthetic pulse modeling grounded in empirical NASA battery degradation datasets.

---

## Key Research Findings

### 1. NASA Dataset Reality vs. Synthetic Extension
- **Real NASA Data Grounding [REAL]**: Continuous cycling data for 2.0 Ah 18650 cells (B0005, B0006, B0007, B0018) from the NASA Ames Prognostics Center of Excellence.
  - Provided variables: `Voltage_measured`, `Current_measured`, `Temperature_measured` (single-point surface thermocouple), `Current_charge`, `Voltage_charge`, `Time`, and cycle discharge `Capacity`.
  - NASA data establishes empirical capacity fade curves ($SOH(k)$), DCIR growth trajectories, and baseline bulk surface heating rates under 2A discharge. Physical `cell_id` is strictly separated from `cycle_index`.
- **Missing from NASA Telemetry**: NASA did not run 10-second high-rate pulse screening tests, nor does it contain 2D spatial thermal maps or 8×8 thermal-array sensor imagery.
- **Physics-Informed Synthetic Modeling [SYNTHETIC]**:
  - A 1-RC/2-RC Equivalent Circuit Model (ECM) simulates the 10-second constant-current discharge pulse ($I = 3\text{A}$), calculating immediate ohmic drop ($\Delta V_0 \approx 0.24 - 0.30\,\text{V}$ for fresh cells) and polarization dynamics.
  - A lumped thermodynamic energy balance ($m c_p \frac{dT}{dt} = I^2 R_{\text{int}} - h A \Delta T$) computes bulk temperature rise calibrated against NASA thermal rates.
  - A 2D spatial diffusion model projects heat across an 8×8 grid matching the Panasonic AMG8833 sensor spec (60° FOV, active cell bounding box ~3×7, terminal tab hotspot, 0.25°C resolution, 10Hz).

### 2. Canonical 14-Feature Extraction & Machine Learning
- **Canonical 14 Features**: Strictly ordered across electrical (`OCV`, `DCIR`, `ΔV10`, `dV/dt_slope`, `V_recovery_rate`), bulk thermal (`T_initial`, `ΔT_bulk`, `dT/dt_max`, `τ_cool`), and spatial matrix (`T_max_pixel`, `T_mean_cell`, `σ²_T`, `∇T_tab-body`, `hotspot_eccentricity`) domains.
- **Provenance Integrity**: Strict classification of every data item: `REAL` (NASA telemetry), `SYNTHETIC` (10s pulse and 8×8 frames), or `PREDICTED` (ML classifications). `extracted_features.csv` preserves provenance columns before ML ingestion.
- **Leakage Prevention**: **Leave-One-Group-Out (LOGO) Cross-Validation by Battery Cell ID**. Each test fold evaluates on an unseen physical cell (e.g. train on B0006, B0007, B0018; test on B0005). Zero random cycle shuffling.
- **Triage Decision Hierarchy**: Mutually exclusive deterministic hierarchy prioritizing safety: 1) RETIRE tripwires checked first, 2) REUSE if all nominal criteria strictly satisfied, 3) INVESTIGATE catch-all for intermediate or anomalous states.
- **Metrics**: Macro F1-score, Balanced Accuracy, Precision/Recall per class, Confusion Matrix, and probability calibration (Brier score). Naive overall accuracy is rejected.

### 3. Software Architecture & Hardware Bridge
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS. Features an interactive 8×8 Canvas/SVG thermal heatmap with bilinear interpolation, dynamic V(t)/T(t) pulse charts, playback controls, and standardized visual provenance badges (`REAL` blue, `SYNTHETIC` purple, `PREDICTED` emerald).
- **Backend**: FastAPI with async route handlers, Pydantic contracts validating scalar/array dimensions and probability distributions, and zero-database flat-file storage (CSV/JSON in `backend/data/`).
- **Hardware Future Pathway**: Abstract `TelemetrySource` base class and `TelemetryFrame` buffering service (`TelemetryFrame` $\rightarrow$ `TelemetryBufferService` $\rightarrow$ `BatteryPulseTelemetry`), guaranteeing seamless future transition to physical ESP32 + AMG8833 + INA219 hardware (<$40 BOM).

---

## 12-Phase Roadmap Summary
1. **Phase 1**: Project Architecture and Repository Foundation
2. **Phase 2**: NASA Dataset Ingestion and Preprocessing
3. **Phase 3**: Controlled 10-Second Pulse Simulation
4. **Phase 4**: Physics-Informed Synthetic Thermal Response
5. **Phase 5**: Synthetic 8×8 Thermal-Frame Generation
6. **Phase 6**: Thermal + Electrical Feature Extraction
7. **Phase 7**: ML Training and Evaluation
8. **Phase 8**: FastAPI Diagnostic API
9. **Phase 9**: React Dashboard
10. **Phase 10**: Live Simulation Using Generated/Recorded Sequences
11. **Phase 11**: Testing and Validation
12. **Phase 12**: Future AMG8833 Hardware Integration
