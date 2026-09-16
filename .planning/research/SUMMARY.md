# Executive Research Summary: ThermoCell-AI

## Project Mission
ThermoCell-AI demonstrates a rapid (10-second) diagnostic system for second-life lithium-ion battery triage (REUSE / RETIRE / INVESTIGATE) using physics-informed synthetic pulse modeling grounded in empirical NASA battery degradation datasets.

## Key Research Findings

### 1. NASA Dataset Reality vs. Synthetic Extension
- **Real NASA Data Available**: Continuous cycling data for 18650 cells (B0005, B0006, B0007, B0018) from the NASA Ames Prognostics Center of Excellence.
  - Provided variables: `Voltage_measured`, `Current_measured`, `Temperature_measured` (single surface thermocouple), `Current_charge`, `Voltage_charge`, `Time`, and cycle discharge `Capacity`.
- **Derived Variables**: State of Health ($\text{SoH} = \text{Capacity} / \text{Nominal Capacity}$), DC Internal Resistance ($\text{DCIR}$ via voltage drop $\Delta V / \Delta I$), cycle degradation trends.
- **Missing from NASA Telemetry**: Spatial 2D temperature distribution, localized hotspot formation, 8×8 thermal-array sensor field.
- **Physics-Informed Solution**: Use an Equivalent Circuit Model (ECM) coupled with a lumped thermodynamic heat balance ($Q = I^2 R$) and a 2D Gaussian heat diffusion field across an 8×8 grid matching the Panasonic AMG8833 specification (0.25°C resolution, 10Hz frame rate).

### 2. Machine Learning & Integrity Blueprint
- **Integrity Rule**: Strict labeling of all data artifacts: `REAL`, `SYNTHETIC`, or `PREDICTED`.
- **Leakage Prevention**: Group-based cross-validation by Cell ID (`GroupKFold` or `GroupShuffleSplit`). Cells B0005 & B0006 for training, B0007 & B0018 for testing. No temporal cycle shuffling.
- **Metrics**: Macro F1-score, Balanced Accuracy, Precision/Recall by class (REUSE/RETIRE/INVESTIGATE), Confusion Matrix, ROC-AUC. Naive accuracy is rejected due to class imbalance.
- **Model Portfolio**: Rule-based physics baseline, Multinomial Logistic Regression, Random Forest, and Gradient Boosted Trees.

### 3. Software Architecture & Hackathon Fit
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS. Features an interactive 8×8 Canvas/SVG thermal heatmap with bilinear interpolation, dynamic V(t)/T(t) pulse charts, and provenance inspect badges.
- **Backend**: FastAPI with async route handlers, Pydantic schemas enforcing provenance metadata, and file-based local storage (CSV/JSON). No PostgreSQL or authentication overhead.
- **Hardware Future Pathway**: Abstract `TelemetrySource` base class that accepts either `SyntheticPulseSource` or `HardwareSerialSource` (ESP32 + AMG8833 + INA219), guaranteeing zero-friction transition to physical sensors in Phase 12.

## Roadmap Phasing at a Glance
- **Phases 1–3**: Foundation, NASA Ingestion, 10-Second Pulse Simulation
- **Phases 4–6**: Thermal Lumped Model, 8×8 Synthetic Matrix, Feature Extraction Pipeline
- **Phases 7–9**: ML Training/Calibration, FastAPI Diagnostic Service, React Dashboard
- **Phases 10–12**: Live Simulation / Playback, System Testing & Validation, AMG8833 Hardware Spec & Telemetry Ingest

