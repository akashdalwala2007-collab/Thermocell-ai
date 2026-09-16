# ThermoCell-AI

## What This Is

ThermoCell-AI is a software-first diagnostic prototype designed for rapid, low-cost second-life lithium-ion battery grading and triage in college and hackathon settings. It combines real-world NASA battery degradation telemetry with a physics-informed 10-second controlled pulse discharge simulation, generating synthetic thermal responses (including 8×8 thermal frames resembling an AMG8833 sensor) to classify batteries into REUSE, RETIRE, or INVESTIGATE categories with strict data provenance integrity.

## Core Value

Rapid (10-second), physics-grounded second-life battery classification (REUSE / RETIRE / INVESTIGATE) with uncompromised data integrity labeling (REAL vs. SYNTHETIC vs. PREDICTED) and a direct path to low-cost hardware validation.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — initialize project planning)

### Active

<!-- Current scope. Building toward these. -->

- [ ] Ingest and preprocess NASA Ames Li-ion battery datasets (B0005, B0006, B0007, B0018) extracting baseline discharge cycles, capacities, and internal resistance.
- [ ] Implement a physics-informed 10-second controlled discharge pulse simulation with equivalent circuit modeling (ECM) for internal resistance voltage drop.
- [ ] Model synthetic bulk thermal response using coupled Joule heating ($I^2 R$) and convective cooling validated against NASA thermal rates.
- [ ] Generate synthetic 8×8 thermal-array frames with spatial temperature gradients and tab hotspot diffusion representing an AMG8833 infrared grid.
- [ ] Extract combined electrical features (DCIR, $\Delta V$, $dV/dt$) and spatial/temporal thermal features (mean $T$, max $T$, gradient, rate of rise $\Delta T/\Delta t$, hotspot variance).
- [ ] Train, evaluate, and calibrate ML classification models (Random Forest / Gradient Boosting / Logistic Regression) with strict cell-level group train/test splits.
- [ ] Provide a FastAPI diagnostic backend with REST endpoints for running pulse simulations, streaming thermal frames, and obtaining tri-state triage classifications.
- [ ] Deliver a responsive React + Vite + Tailwind CSS dashboard with 8×8 heatmap visualization, electrical pulse curves, and transparent data provenance badges.
- [ ] Implement playback and live simulation for pre-generated cell profiles.
- [ ] Define modular telemetry ingestion contracts allowing drop-in replacement of synthetic inputs with ESP32 + AMG8833 + INA219 hardware.

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- User Authentication & Role Management — Not needed for hackathon prototype; adds unnecessary complexity.
- PostgreSQL / External Database Engine — Local file-based storage (CSV, JSON) suffices for demonstration and simplifies setup for a 5-member student team.
- Real-time Hardware Physical Benchmarking in v1 — Hardware integration is designed via modular contracts; actual physical soldering/breadboarding is reserved for Phase 12 / v2.
- Real-world 98%+ Accuracy Claims — Unscientific on small datasets and uncalibrated synthetic spatial frames; claims will be honest and bounded by proper cross-validation.
- Microservices & Cloud Infrastructure — Monolithic FastAPI backend and single-page React frontend ensure reproducible local execution.
- Direct 8×8 Thermal Field in NASA Datasets — NASA datasets do not contain thermal imagery; claiming NASA data has 8×8 arrays is prohibited.

## Context

- Second-life battery sorting typically requires full charge-discharge cycles taking hours. ThermoCell-AI investigates whether rapid 10-second high-load pulse dynamics (electrical transient + thermal diffusion signature) can provide high-confidence triage for repurposing 18650 cells into energy storage systems (ESS).
- NASA Ames Prognostics Center of Excellence battery datasets provide real charge/discharge/impedance cycles to end-of-life (EOL), but record only single-point surface thermocouple readings.
- Synthetic thermal modeling bridges the sensor gap by calculating thermodynamic heat generation and simulating spatial diffusion across an 8×8 grid matching the popular AMG8833 low-cost IR sensor.
- Team consists of 5 student developers needing clear separation of concerns (backend API, simulation/ML, frontend visualization).

## Constraints

- **Tech Stack**: Frontend in React (TypeScript, Vite, Tailwind CSS); Backend in Python 3.10+ (FastAPI, Uvicorn); ML in scikit-learn, NumPy, pandas.
- **Data Integrity**: Every piece of data displayed or exported must carry explicit provenance labels: `REAL` (NASA telemetry), `SYNTHETIC` (10s pulse and 8×8 spatial frames), or `PREDICTED` (ML classifications and health probabilities).
- **Leakage Prevention**: ML validation must split by Battery Cell ID (e.g. Train on cells B0005 & B0006, Test on B0007 & B0018), never randomly by cycle or time step.
- **Budget / Hardware**: Total potential hardware cost must remain under $30–$40 (ESP32 ~$5, AMG8833 ~$15, INA219 ~$3, dummy load resistor/MOSFET ~$5).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| File-based CSV/JSON storage instead of PostgreSQL | Eliminates DB setup friction, enables simple Git/zip sharing across 5 student teammates | ✅ Good |
| Cell-grouped train/test split | Prevents spatial/temporal data leakage between identical degradation trajectories | ✅ Good |
| Physics-informed thermal generation with explicit SYNTHETIC tagging | Preserves scientific integrity while enabling full-stack sensor-array UI/UX prototyping | ✅ Good |
| Dual-modal feature vector (electrical + thermal) | Captures both immediate ohmic resistance and heat dissipation properties indicative of SEI layer growth | ✅ Good |

---
*Last updated: 2026-09-16 after GSD Project Initialization*

