# ThermoCell-AI Scientific & System Validation Report

> **Rapid Physics-Informed Second-Life Lithium-Ion Battery Screening**
> **Validation Baseline**: NASA Ames Li-ion Aging Telemetry (Cells B0005, B0006, B0007, B0018) + 10s ECM Pulse Simulation + AMG8833/INA219 Hardware Ingestion Pipeline
> **Audit Status**: `VERIFIED_ZERO_LEAKAGE` (Strict Leave-One-Group-Out Cross-Validation)

---

## 1. Executive Summary

ThermoCell-AI addresses the bottleneck of second-life lithium-ion battery repurposing. Traditional grading requires multi-hour full charge-discharge cycles on expensive battery analyzers ($5,000–$50,000 per rack). ThermoCell-AI provides a rapid **10-second controlled discharge screening** that characterizes:
1. Ohmic drop ($\Delta V_0$) and internal resistance ($R_0$ / DCIR).
2. Transient diffusion polarization ($\Delta V_{10}$).
3. Open-circuit voltage recovery dynamics ($V_{\text{recovery\_rate}}$).
4. Bulk thermal generation ($\Delta T_{\text{bulk}}$) and thermal relaxation ($\tau_{\text{cool}}$).
5. Spatial thermal non-uniformity and localized hotspot formation via an 8×8 thermal grid (simulated or AMG8833 sensor).

The dual-model machine learning architecture fuses electrical health estimates with spatial thermal risk classification to assign cells into **REUSE**, **RETIRE**, or **INVESTIGATE** categories with deterministic safety lockout tripwires.

---

## 2. Scientific Data Provenance Framework

To guarantee scientific transparency and prevent misleading claims, ThermoCell-AI enforces a 3-tier provenance classification across all endpoints, database records, and UI views:

| Provenance Level | Definition | Sources in ThermoCell-AI |
|---|---|---|
| `REAL` | Empirical laboratory or physical sensor measurements. | NASA Ames reference cycles (terminal voltage, discharge capacity, cycle index, surface thermocouple); live measurements from physical ESP32 + INA219 + AMG8833 bench. |
| `SYNTHETIC` | Numerically simulated telemetry generated via validated physical models. | 10-second pulse discharge simulation (Thevenin Equivalent Circuit Model + Joule heating + 2D thermal conduction grid resembling AMG8833). |
| `PREDICTED` | Statistical model outputs and algorithmic inferences. | ML Model 1 health tiers, ML Model 2 degradation patterns, Decision Fusion triage classifications, calibrated class probabilities, and explainability factors. |

> ### Strict Scientific Integrity Boundaries
> - **NASA Ames Dataset Scope**: The NASA Ames repository provides terminal voltage, current, capacity, and thermocouple readings from single surface points. **The NASA dataset does NOT contain 8×8 spatial thermal frames.**
> - **Synthetic Heatmap Transparency**: All 8×8 thermal frame heatmaps generated for NASA benchmark cells are explicitly labeled `SYNTHETIC`.
> - **Physical Sensor Designation**: 8×8 thermal frames and voltage/current telemetry are labeled `REAL` **only** when streamed directly from physical hardware sensors (AMG8833 Grid-EYE infrared sensor and INA219 current/voltage monitor).

---

## 3. Canonical 14 Diagnostic Features

The diagnostic engine extracts 14 physics-grounded electrical, bulk thermal, and spatial thermal features from each 10-second discharge pulse and subsequent relaxation period:

| Feature Index | Feature Name | Symbol / Key | Unit | Domain | Physical Significance |
|---|---|---|---|---|---|
| 1 | Open Circuit Voltage | `OCV` | V | Electrical | Thermodynamic state-of-charge baseline prior to pulse load. |
| 2 | Direct Current Internal Resistance | `DCIR` | $\Omega$ | Electrical | Ohmic resistance ($R_0 = \Delta V_{\text{ohmic}} / I_{\text{load}}$). Strong indicator of SEI layer growth and electrolyte dry-out. |
| 3 | Active Voltage Sag at 10s | `ΔV10` | V | Electrical | Total drop from $V_{\text{pre}}$ to $V(t=10\text{s})$, combining ohmic and charge-transfer diffusion polarization. |
| 4 | Discharge Voltage Sag Slope | `dV/dt_slope` | V/s | Electrical | Linear rate of voltage degradation during active 10s discharge. |
| 5 | Post-Pulse Voltage Recovery Rate | `V_recovery_rate` | V/s | Electrical | Rate of open-circuit voltage relaxation after load release ($\Delta V_{\text{relax}} / \Delta t_{\text{relax}}$). Reflects solid-state diffusion kinetics. |
| 6 | Initial Cell Temperature | `T_initial` | $^\circ\text{C}$ | Thermal (Bulk) | Baseline ambient temperature before load application. |
| 7 | Bulk Temperature Rise | `ΔT_bulk` | $^\circ\text{C}$ | Thermal (Bulk) | Net temperature rise over 10s active discharge ($\Delta T = T_{\text{end}} - T_{\text{initial}}$). Reflects integrated $I^2 R$ Joule heating. |
| 8 | Maximum Heating Rate | `dT/dt_max` | $^\circ\text{C/s}$ | Thermal (Bulk) | Maximum instantaneous first derivative of bulk temperature rise. |
| 9 | Thermal Cooling Constant | `τ_cool` | s | Thermal (Bulk) | Exponential decay time constant during post-pulse relaxation, reflecting convective/conductive heat dissipation capability. |
| 10 | Peak Pixel Temperature | `T_max_pixel` | $^\circ\text{C}$ | Thermal (Spatial) | Maximum pixel temperature observed across the 8×8 sensor frame at end of pulse. Detects localized hot spots. |
| 11 | Mean Cell Temperature | `T_mean_cell` | $^\circ\text{C}$ | Thermal (Spatial) | Spatial average across all active 8×8 pixels covering the battery body. |
| 12 | Spatial Temperature Variance | `σ²_T` | $(^\circ\text{C})^2$ | Thermal (Spatial) | Spatial variance across active pixels ($\mathrm{Var}(T_{i,j})$). Detects non-uniform internal current distribution or localized internal resistance anomalies. |
| 13 | Tab-to-Body Thermal Gradient | `∇T_tab-body` | $^\circ\text{C}$ | Thermal (Spatial) | Temperature difference between tab terminals and cell body center. High values reveal tab contact degradation or terminal welding fatigue. |
| 14 | Hotspot Spatial Eccentricity | `hotspot_eccentricity` | [0, 1] | Thermal (Spatial) | Normalized radial distance of the thermal peak from cell geometric center. Differentiates normal central Joule heating from asymmetric terminal defects. |

---

## 4. Machine Learning Methodology & Leakage Audit

### 4.1 Dual-Model Architecture & Decision Fusion

1. **Model 1: Battery Health / SOH Tier Classifier**
   - **Inputs**: Electrical and bulk thermal features (`OCV`, `DCIR`, `ΔV10`, `dV/dt_slope`, `V_recovery_rate`, `T_initial`, `ΔT_bulk`, `dT/dt_max`, `τ_cool`).
   - **Algorithm**: Calibrated Logistic Regression / Random Forest pipeline with `StandardScaler`.
   - **Target**: SOH tier based on nominal capacity retention ($>80\%$ Healthy/REUSE, $70–80\%$ Marginal/INVESTIGATE, $<70\%$ Degraded/RETIRE).

2. **Model 2: Spatial Degradation Pattern Classifier**
   - **Inputs**: Spatial thermal and impedance features (`T_max_pixel`, `T_mean_cell`, `σ²_T`, `∇T_tab-body`, `hotspot_eccentricity`, `DCIR`, `τ_cool`).
   - **Algorithm**: Multi-class classifier with `StandardScaler`.
   - **Target**: Degradation pattern (`UNIFORM_AGING`, `TAB_CONTACT_RESISTANCE`, `HOTSPOT_RUNAWAY_RISK`).

3. **Decision Fusion Layer with Deterministic Safety Lockouts**
   - Safety tripwires execute first: If `DCIR > 0.25\,\Omega`, `ΔT_bulk > 1.2\,^\circ\text{C}`, `σ²_T > 0.05\,(^\circ\text{C})^2`, or Model 2 flags `HOTSPOT_RUNAWAY_RISK`, the cell is immediately classified as **`RETIRE`** regardless of capacity.
   - If Model 2 identifies `TAB_CONTACT_RESISTANCE`, probability is shifted toward **`INVESTIGATE`** for physical terminal inspection.
   - If all parameters remain within nominal limits, Model 1 posterior probabilities govern the **`REUSE`** verdict.

### 4.2 Leave-One-Group-Out (LOGO) Cross-Validation

To prevent data leakage, cross-validation is grouped strictly on physical `cell_id` (NASA cells `B0005`, `B0006`, `B0007`, `B0018`). In each fold, all cycles from an entire physical battery are held out exclusively for testing.

```text
Fold 1: Train on [B0006, B0007, B0018] -> Test on B0005
Fold 2: Train on [B0005, B0007, B0018] -> Test on B0006
Fold 3: Train on [B0005, B0006, B0018] -> Test on B0007
Fold 4: Train on [B0005, B0006, B0007] -> Test on B0018
```

### 4.3 Automated Leakage Audit Results

The automated audit script (`ml/evaluation/leakage_audit.py`) validated 100% strict cell-level isolation:
- **Audit Verification Status**: `VERIFIED_ZERO_LEAKAGE`
- **Cell ID Overlap**: Exactly `0.0%` (Zero physical cells shared across train/test splits).
- **Model 1 (Health) LOGO Balanced Accuracy**: `0.8750`
- **Model 2 (Degradation Pattern) LOGO Balanced Accuracy**: `0.9167`

---

## 5. Hardware Bench Design & Target Bill of Materials

ThermoCell-AI was engineered to bridge software simulation with an ultra-low-cost physical test bench designed for student laboratories and hackathons:

| Component | Part / Specification | Interface | Approximate Cost |
|---|---|---|---|
| Microcontroller | ESP32-WROOM-32 (Dual Core 240MHz, Wi-Fi/BLE) | USB UART / I2C | ~$5.00 |
| Spatial Thermal Array | AMG8833 Grid-EYE (8×8 IR array, 10Hz, $\pm 2.5\,^\circ\text{C}$) | I2C (`0x69`) | ~$15.00 |
| Voltage/Current Sensor | INA219 (Bi-directional high-side $I^2C$ monitor, 12-bit ADC) | I2C (`0x40`) | ~$3.00 |
| Controlled Pulse Load | IRLZ44N N-Channel Power MOSFET + $1.5\,\Omega$ / 25W Wirewound Load | GPIO Pulled-Low Gate | ~$5.00 |
| Battery Test Fixture | Keystone 18650 PCB Holder + Gold Plated Contacts | Screw Terminals | ~$2.00 |
| **Total Hardware BOM** | | | **~$30.00** |

The total bill of materials remains comfortably within the project constraint budget of under **$30–$40**.

---

## 6. Physical Hardware Verification Status

- **Host Serial Detection**: Windows Plug-and-Play enumeration detected COM3 and COM4 (`BTHENUM` Bluetooth Serial Links). No physical USB-UART silicon bridge (CP2102, CH340, FTDI) was attached to the development machine during validation.
- **Verification Protocol**: In strict compliance with scientific integrity rules, **physical hardware bench validation is recorded as `NOT PHYSICALLY VERIFIED` on this host**.
- **Ingestion & Buffer Validation**: The hardware streaming architecture was thoroughly validated using the deterministic hardware serial bridge mock pipeline:
  ```bash
  python hardware/serial_bridge.py --mock --cell-id HW-BENCH-01 --api-url http://127.0.0.1:8000
  ```
  The mock pipeline streamed 100 active frames (10Hz) and 20 relaxation frames (2Hz) through FastAPI endpoints (`POST /api/telemetry/baseline` and `POST /api/telemetry/frame`), synthesized the payload via `POST /api/telemetry/build-pulse`, extracted canonical features, executed ML inference, and persisted the complete run into the session store.

---

## 7. System Limitations & Deployment Caveats

1. **Short-Pulse vs. Full-Cycle SOH**:
   - A 10-second discharge pulse measures immediate polarization, ohmic resistance ($R_0$), and transient heat generation. It does not measure total discharge capacity (Ah) directly; rather, it infers capacity retention from impedance growth and polarization dynamics.
2. **Thermal Inertia in 18650 Cans**:
   - Steel-canned 18650 cells have significant thermal mass. In a 10-second pulse at $1\text{C}–2\text{C}$ discharge, surface temperature rises by $0.2\,^\circ\text{C}–1.5\,^\circ\text{C}$. The AMG8833 sensor ($\pm 2.5\,^\circ\text{C}$ absolute accuracy, $0.25\,^\circ\text{C}$ noise NETD) detects differential spatial hotspots effectively, but requires steady ambient calibration.
3. **Chemistry Generalization**:
   - The primary empirical training data derives from NASA Ames LiCoO2 (LCO) 18650 cells. Application to Lithium Iron Phosphate ($LiFePO_4$ / LFP) or Nickel Manganese Cobalt (NMC) cells requires chemistry-specific OCV lookups and impedance baselines due to differing plateau characteristics.
4. **Triage Recommendation Protocol**:
   - Cells flagged as **`RETIRE`** must be decommissioned from second-life energy storage applications.
   - Cells flagged as **`INVESTIGATE`** (marginal capacity, elevated tab gradient, or borderline confidence) should be routed to a secondary C/5 cycling bench before deployment into high-demand packs.
