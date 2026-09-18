# ThermoCell-AI

## What This Is

ThermoCell-AI is a software-first diagnostic prototype designed for rapid, low-cost second-life lithium-ion battery grading and triage in college and hackathon settings. It combines real-world NASA battery degradation telemetry with a physics-informed 10-second controlled pulse discharge simulation, generating synthetic thermal responses (including 8×8 thermal frames resembling an AMG8833 sensor) to classify batteries into REUSE, RETIRE, or INVESTIGATE categories with strict data provenance integrity.

## Core Value

Rapid (10-second), physics-grounded second-life battery classification (REUSE / RETIRE / INVESTIGATE) with uncompromised data integrity labeling (REAL vs. SYNTHETIC vs. PREDICTED) and a direct path to low-cost hardware validation.

## Canonical 14-Feature Schema

All feature extraction, machine learning models, FastAPI endpoints, and UI dashboard cards adhere to ONE canonical ordered 14-feature schema:

1. **`OCV`**: Open-circuit voltage measured from the explicit unloaded pre-pulse voltage sample `v_pre_pulse` immediately prior to load application ($I = 0\,\text{A}$) ($\text{V}$).
2. **`DCIR`**: Direct current internal resistance derived from immediate ohmic drop $\Delta V_0$ between unloaded pre-pulse baseline `v_pre_pulse` ($I = 0\,\text{A}$) and first post-load active-pulse sample $V(t = 0.0\,\text{s})$ under 3A load: $\text{DCIR} = \Delta V_0 / I_{\text{pulse}} = R_0$ ($\Omega$).
3. **`ΔV10`**: Total voltage drop over the 10-second active pulse at final sample $t = 9.9\,\text{s}$: $\Delta V_{10} = v_{\text{pre\_pulse}} - V(t = 9.9\,\text{s})$ ($\text{V}$).
4. **`dV/dt_slope`**: Linear regression slope of voltage decline from $t = 1.0\,\text{s}$ to $9.9\,\text{s}$ across active pulse samples ($\text{V/s}$).
5. **`V_recovery_rate`**: Voltage rebound rate during the 20-sample relaxation window from $t = 10.0\,\text{s}$ to $11.9\,\text{s}$ ($\Delta t = 1.9\,\text{s}$): $\frac{V_{\text{relax}}(t = 11.9\,\text{s}) - V_{\text{relax}}(t = 10.0\,\text{s})}{1.9\,\text{s}}$ ($\text{V/s}$).
6. **`T_initial`**: Starting bulk/ambient temperature at pulse onset at $t = 0.0\,\text{s}$ ($^\circ\text{C}$).
7. **`ΔT_bulk`**: Net bulk temperature rise at pulse termination ($t = 9.9\,\text{s}$): $T_{\text{bulk}}(t = 9.9\,\text{s}) - T_{\text{initial}}$ ($^\circ\text{C}$).
8. **`dT/dt_max`**: Maximum instantaneous heating rate observed during the active 10-second pulse window ($t \in [0.0, 9.9]\,\text{s}$, $^\circ\text{C/s}$).
9. **`τ_cool`**: Thermal relaxation exponential decay time constant fitted across the 20 post-pulse relaxation samples ($t \in [10.0, 11.9]\,\text{s}$) relative to pulse-end baseline $t = 9.9\,\text{s}$ ($\text{s}$).
10. **`T_max_pixel`**: Peak temperature observed across any pixel of the 8×8 spatial array at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}$).
11. **`T_mean_cell`**: Average temperature across active cell pixels on the 8×8 grid at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}$).
12. **`σ²_T`**: Spatial temperature variance across active cell pixels at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}^2$).
13. **`∇T_tab-body`**: Thermal gradient between the terminal tab cluster and lower cell body at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}$).
14. **`hotspot_eccentricity`**: Spatial distance between thermal center of mass and geometric tab anchor at pulse termination $t = 9.9\,\text{s}$ (dimensionless / pixel units).

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — initialize project planning)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Ingest and preprocess NASA Ames Li-ion battery aging datasets (B0005, B0006, B0007, B0018) extracting baseline discharge capacity degradation, cycle indices, and surface thermocouple rates.
- [ ] Implement a physics-informed 10-second controlled discharge pulse simulation with equivalent circuit modeling (ECM) for internal resistance voltage drop, distinct from NASA's continuous 2A discharge.
- [ ] Model synthetic bulk thermal response using coupled Joule heating ($I^2 R$) and convective cooling calibrated against empirical NASA bulk thermal rates.
- [ ] Generate synthetic 8×8 thermal-array frames with spatial temperature gradients, terminal tab hotspot diffusion, and realistic field-of-view (FOV) geometry matching an AMG8833 infrared grid.
- [ ] Extract the canonical 14-dimensional feature vector (`OCV`, `DCIR`, `ΔV10`, `dV/dt_slope`, `V_recovery_rate`, `T_initial`, `ΔT_bulk`, `dT/dt_max`, `τ_cool`, `T_max_pixel`, `T_mean_cell`, `σ²_T`, `∇T_tab-body`, `hotspot_eccentricity`) with strict provenance metadata preservation.
- [ ] Train, evaluate, and calibrate ML classification models (Rule Baseline, Logistic Regression, Random Forest, Gradient Boosted Trees) with Leave-One-Group-Out (LOGO) cross-validation grouped strictly by physical `cell_id`.
- [ ] Provide a FastAPI diagnostic backend with REST endpoints for running pulse simulations, streaming thermal frames, serving historical NASA cell baselines, and predicting triage categories.
- [ ] Deliver a responsive React + Vite + Tailwind CSS dashboard with an interactive 8×8 heatmap (toggleable bilinear interpolation), electrical/thermal pulse curves, and transparent data provenance badges.
- [ ] Implement interactive playback and live simulation controls (play/pause/scrub/speed) for pre-generated cell degradation profiles (healthy, marginal, degraded).
- [ ] Define modular telemetry ingestion contracts (`TelemetrySource`, `TelemetryFrame`) allowing drop-in replacement of synthetic inputs with physical ESP32 + AMG8833 + INA219 hardware without rewriting backend or UI logic.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- User Authentication & Role Management — Not needed for hackathon prototype; adds unnecessary complexity.
- PostgreSQL / External Database Server — Flat file-based storage (CSV, JSON) in `backend/data/` suffices for demonstration and simplifies setup for a 5-member student team.
- Physical Hardware Benchmarking in v1 — Hardware integration is architected via modular contracts and firmware sketches; physical soldering/bench assembly is reserved for Phase 12 / v2.
- Real-world 98%+ Accuracy Claims — Scientifically invalid on small-N cell datasets and uncalibrated synthetic spatial frames; claims must remain honest, transparent, and bounded by cross-validation metrics.
- Microservices & Cloud Infrastructure — Monolithic FastAPI backend and single-page React frontend ensure reproducible local execution.
- Direct 8×8 Thermal Field in NASA Datasets — NASA datasets do not contain thermal imagery; claiming NASA data has 8×8 arrays is prohibited.

## Context

- **Second-Life Challenge**: Traditional second-life battery grading requires full charge-discharge cycles taking 4–6 hours per cell. ThermoCell-AI explores whether a rapid 10-second high-load pulse test (capturing coupled electrical voltage drop and thermal diffusion signatures) can provide effective initial triage for repurposing 18650 cells into stationary energy storage systems (ESS).
- **NASA Dataset Role**: NASA Ames Prognostics Center of Excellence battery datasets (B0005, B0006, B0007, B0018) provide empirical ground truth for cell capacity degradation (2.0 Ah down to ~1.2 Ah), DCIR growth over 130–168 cycles, and single-point bulk surface temperature rise. NASA data grounds the physics parameters; it is not a direct 10-second pulse dataset.
- **Synthetic Modeling Role**: The 10-second pulse excitation and the 8×8 spatial infrared grid are synthetic extensions created by physical models (1-RC/2-RC ECM + 2D anisotropic thermal diffusion equation) to prototype the end-to-end diagnostic pipeline ahead of physical sensor availability.
- **Team Dynamic**: 5 student developers requiring clean architectural decoupling between backend REST API, simulation/ML routines, and frontend interactive visualization.

## Constraints

- **Tech Stack**: Frontend in React (TypeScript, Vite, Tailwind CSS); Backend in Python 3.10+ (FastAPI, Uvicorn); ML in scikit-learn, NumPy, pandas.
- **Data Integrity**: Every piece of data displayed or exported must carry explicit provenance labels:
  - `REAL`: Empirical NASA measurements (capacity, cycle index, surface thermocouple readings).
  - `SYNTHETIC`: Numerically simulated 10-second discharge pulse and 8×8 spatial thermal frames.
  - `PREDICTED`: Machine learning triage classifications and calibrated probability distributions.
- **Leakage Prevention & Cell ID Definition**: `cell_id` represents ONLY the physical battery cell (e.g. `"B0005"`). The cycle identifier must remain in a separate `cycle_index` field (e.g. `40`). Cross-validation and leakage audits group strictly on `cell_id` so that all cycles from a physical cell remain in the same fold (Leave-One-Group-Out CV).
- **Hardware Budget**: Total prospective hardware bill of materials must remain under $30–$40 (ESP32 ~$5, AMG8833 ~$15, INA219 ~$3, power MOSFET / dummy load resistor ~$5).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Flat CSV/JSON file storage over PostgreSQL | Eliminates database installation/migration friction, enabling zero-config setup for student team | ✅ Good |
| Leave-One-Group-Out (LOGO) cross-validation by Cell ID | Prevents cell-identity and temporal leakage; rigorously evaluates generalization to unobserved cells | ✅ Good |
| Explicit Provenance Tagging (`REAL` / `SYNTHETIC` / `PREDICTED`) | Guarantees scientific honesty; prevents confusion between empirical NASA data and simulated 8×8 IR frames | ✅ Good |
| Canonical 14-Feature Schema | Standardizes naming across electrical, bulk thermal, and spatial matrix domains to prevent pipeline drift | ✅ Good |
| Telemetry Buffering Pipeline (`TelemetryFrame` $\rightarrow$ `BatteryPulseTelemetry`) | Decouples raw tick ingestion from pulse aggregation, enabling clean ESP32 streaming | ✅ Good |

---
*Last updated: 2026-09-16 after CodeRabbit Finding Reconciliation*
