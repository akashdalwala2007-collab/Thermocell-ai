# Technical Pitfalls & Mitigation Strategies

## 1. Data Provenance & Scientific Integrity Pitfalls

| Pitfall | Why It Happens | Severe Consequence | Mitigation in ThermoCell-AI |
|---------|----------------|--------------------|-----------------------------|
| **Assuming NASA Data Contains 8×8 Thermal Images** | NASA battery papers mention temperature, leading developers to assume thermal imaging exists. | NASA datasets (e.g. B0005) only contain a single thermocouple attached to the cell surface (`Temperature_measured`). Claiming 8×8 images are from NASA is scientifically false. | Treat all 8×8 thermal array data as purely **SYNTHETIC**. Explicitly label spatial matrices in code, schemas, and UI as `provenance: "SYNTHETIC"`. |
| **Assuming NASA Performed 10s Pulse Tests** | Conflating the rapid diagnostic goal with the NASA dataset testing protocol. | Misrepresenting NASA's continuous 2A discharge cycles as pulsed telemetry. | NASA data is used strictly to extract real capacity degradation trajectories ($SOH(k)$), bulk surface heating rates under 2A load, and DCIR growth. The 10s pulse is an ECM-generated **SYNTHETIC** test driven by those empirical parameters. |
| **Masking Synthetic Telemetry as Real Hardware Sensor Data** | Wanting to make the hackathon demo look fully "built" before hardware is wired. | Loss of credibility, instant disqualification in technical judging, dangerous false confidence. | Hardcode visual badges in UI (`[REAL: NASA Ames]`, `[SYNTHETIC: ECM+Diffusion]`, `[PREDICTED: scikit-learn]`). Never disguise simulated readings. |
| **Claiming 98%+ Classification Accuracy** | Overfitting or evaluating on leaked test cycles with identical cell identities. | Scientific dishonesty. No battery triage model achieves 98% generalized accuracy across unknown cell histories from a 10s pulse. | Report balanced F1-score, confusion matrix, and explicit confidence intervals. Document that performance reflects synthetic-pulse classification under controlled simulation conditions. |

## 2. Machine Learning & Statistical Pitfalls

### Train/Test Data Leakage & Cell ID Definition
- **The Pitfall**: Splitting rows randomly across cycles (e.g. `train_test_split(df, test_size=0.2, shuffle=True)`), OR encoding cycle identifiers inside `cell_id` (e.g. `cell_id = "B0005-CYC40"`).
- **Why It Fails**: A single battery cell degrades gradually over 160+ cycles. If cycle 40 is in train and cycle 41 is in test, or if `GroupKFold` splits on composite strings, the model memorizes cell-specific manufacturing variations rather than generalized degradation mechanics.
- **The Solution**: **Strict Separation of `cell_id` and `cycle_index` with Leave-One-Group-Out (LOGO) Cross-Validation**:
  - `cell_id` strictly identifies the physical battery cell (`"B0005"`, `"B0006"`, `"B0007"`, `"B0018"`).
  - `cycle_index` remains a separate integer field (`40`, `41`, etc.).
  - LOGO CV partitions groups by `cell_id` alone:
    - Fold 1: Train on B0006, B0007, B0018 → Test on B0005
    - Fold 2: Train on B0005, B0007, B0018 → Test on B0006
    - Fold 3: Train on B0005, B0006, B0018 → Test on B0007
    - Fold 4: Train on B0005, B0006, B0007 → Test on B0018
  This guarantees that all cycles from a physical cell remain in the same fold, completely eliminating cell-identity leakage.

### Small-N Cell Dataset Generalization Bounds
- **The Pitfall**: Training on only 4 NASA cells and claiming universal generalization to all 18650 lithium-ion chemistries.
- **Why It Fails**: The NASA Ames dataset comprises specific 2.0 Ah NCA/graphite 18650 cells cycled under fixed temperature (24°C). Other chemistries (e.g. LFP, NMC) have different OCV-SOC curves and internal resistance profiles.
- **The Solution**: Explicitly state the scientific boundaries: the model is calibrated for 18650 cylindrical cells with similar nominal specifications; full generalization requires expanded multi-chemistry training datasets in future milestones (v2).

### Multicollinearity Between Electrical Drop & Thermal Rise
- **The Pitfall**: Both $\Delta V_{10}$ and $\Delta T_{\text{bulk}}$ strongly correlate with internal resistance ($R_{\text{int}}$) because $\Delta V \propto I R_{\text{int}}$ and $Q \propto I^2 R_{\text{int}}$. Linear models can experience unstable coefficients.
- **The Solution**: Normalize features using `StandardScaler` or `RobustScaler`; evaluate tree-based ensembles (Random Forest, GBDT) which handle correlated features robustly; compute feature variance inflation factors (VIF).

## 3. Physics Simulation & Hardware Pitfalls

### Inconsistent Pulse Current & Ohmic Drop Assumptions
- **The Pitfall**: Specifying a 3A discharge pulse while asserting an immediate voltage drop $\Delta V_0 < 0.20\,\text{V}$ for a fresh 18650 cell.
- **Why It Fails**: A fresh 18650 cell has a baseline internal resistance $R_0 \approx 0.08 - 0.10\,\Omega$. By Ohm's Law ($\Delta V_0 = I \cdot R_0$), a $3\,\text{A}$ pulse produces an immediate ohmic drop of $3\,\text{A} \times (0.08 - 0.10\,\Omega) = 0.24 - 0.30\,\text{V}$. Asserting $\Delta V_0 < 0.20\,\text{V}$ violates basic electrical physics.
- **The Solution**:
  - Calibrate the fresh-cell acceptance criteria: immediate ohmic drop $\Delta V_0 \in [0.24, 0.30]\,\text{V}$ (threshold $\le 0.35\,\text{V}$ for REUSE, corresponding to $\text{DCIR} \le 0.35 / 3 \approx 0.1167\,\Omega$) and total 10s drop $\Delta V_{10} \le 0.45\,\text{V}$.
  - Degraded cells ($R_0 > 0.20\,\Omega$) exhibit $\Delta V_0 > 0.60\,\text{V}$ and $\Delta V_{10} > 0.75\,\text{V}$.

### Confusing Raw Hardware Ticks with Full Pulse Payloads
- **The Pitfall**: Claiming `POST /api/telemetry/ingest` receives a single ESP32 packet that directly matches `BatteryPulseTelemetry`.
- **Why It Fails**: An ESP32 streaming at 10Hz transmits a single 100ms time slice (`TelemetryFrame`: voltage, current, temp, single 8×8 grid). A complete `BatteryPulseTelemetry` payload requires 100 synchronized time points (10 seconds) plus relaxation data.
- **The Solution**:
  - Define `TelemetryFrame` for single-tick ingestion.
  - Implement `TelemetryBufferService` in backend to buffer 100 pulse frames + 20 relaxation frames before emitting a validated `BatteryPulseTelemetry` payload for feature extraction.

### Energy Conservation Violation
- **The Pitfall**: Simulating an 8×8 thermal grid with random noise or arbitrary temperature ramps that exceed thermodynamic limits.
- **The Solution**:
  1. Calculate total Joule heating generated during the 10-second pulse:
     $$Q_{\text{gen}} = \int_0^{10} I(t)^2 R_{\text{int}}(SOH)\, dt$$
  2. Compute bulk thermal rise using battery heat capacity $C_{\text{thermal}} = m \cdot c_p$ ($\approx 45\,\text{g} \times 0.9\,\text{J/(g}\cdot\text{K)} \approx 40.5\,\text{J/K}$ for an 18650 cell):
     $$\Delta T_{\text{bulk}} = \frac{Q_{\text{gen}} - Q_{\text{loss}}}{C_{\text{thermal}}}$$
  3. Calibrate simulated bulk rise against real NASA thermocouple rate of rise at equivalent C-rates to ensure thermodynamic realism.

### Spatial Grid Disregard of Sensor Geometry & Field of View
- **The Pitfall**: Treating all 64 pixels of the 8×8 grid as battery surface with homogeneous temperature.
- **The Solution**:
  1. An 18650 cell has dimensions 18mm diameter $\times$ 65mm length.
  2. The AMG8833 sensor has a $60^\circ \times 60^\circ$ FOV. At a typical inspection distance of 3–5 cm, the cell projection occupies an active bounding box of roughly $3 \times 7$ pixels, with ambient background occupying the periphery.
  3. The positive terminal / cap tab has concentrated contact resistance ($R_{\text{tab}} \approx 5-15\,\text{m}\Omega$), creating a localized hotspot at one end of the cell that diffuses axially:
     $$T(x, y, t) = T_{\text{amb}} + \Delta T_{\text{cell}}(x, y, t) + \mathcal{N}(0, \sigma_{\text{sensor}})$$
  4. Quantize final readings to $0.25^\circ\text{C}$ to match the AMG8833 ADC specification.

## 4. Software Engineering & Team Pitfalls

- **Avoid PostgreSQL or Docker requirements for local development**: Rely on versioned CSV/JSON fixtures in `backend/data/` so any team member can run `uvicorn` and `npm run dev` instantly without database setup.
- **Avoid Microservices**: Keep backend as a clean, single FastAPI service and frontend as a single Vite SPA.
- **Avoid Premature Hardware Lock-in**: Build the abstract `TelemetrySource` pattern first. If hardware fails on hackathon day (e.g. burnt sensor, loose breadboard wire), the demo continues seamlessly using the synthetic pulse simulator.
