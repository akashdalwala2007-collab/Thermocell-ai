# Technical Pitfalls & Mitigation Strategies

## 1. Data Provenance & Misrepresentation Pitfalls

| Pitfall | Why It Happens | Severe Consequence | Mitigation in ThermoCell-AI |
|---------|----------------|--------------------|-----------------------------|
| **Assuming NASA Data Contains 8×8 Thermal Images** | NASA battery papers mention temperature, leading developers to assume thermal imaging exists. | NASA datasets (e.g. B0005) only contain a single thermocouple attached to the cell surface (`Temperature_measured`). Claiming 8×8 images are from NASA is scientifically false. | Treat all 8×8 thermal array data as purely **SYNTHETIC**. Explicitly label spatial matrices in code, schemas, and UI as `provenance: "SYNTHETIC"`. |
| **Masking Synthetic Telemetry as Real Hardware Sensor Data** | Wanting to make the hackathon demo look fully "built" before hardware is wired. | Loss of credibility, instant disqualification in technical judging, dangerous false confidence. | Hardcode visual badges in UI (`[REAL: NASA Ames]`, `[SYNTHETIC: ECM+Diffusion]`, `[PREDICTED: scikit-learn]`). Never disguise simulated readings. |
| **Claiming 98%+ Classification Accuracy** | Overfitting or evaluating on leaked test cycles with identical cell identities. | Scientific dishonesty. No battery triage model achieves 98% generalized accuracy across unknown cell histories from a 10s pulse. | Report balanced F1-score, confusion matrix, and explicit confidence intervals. Document that performance reflects synthetic-pulse classification under controlled simulation conditions. |

## 2. Machine Learning & Statistical Pitfalls

### Train/Test Data Leakage
- **The Pitfall**: Splitting rows randomly across cycles (e.g. `train_test_split(df, test_size=0.2, shuffle=True)`).
- **Why It Fails**: A single battery cell (e.g., B0005) degrades gradually over 160+ cycles. Adjacent cycles ($N$ and $N+1$) have nearly identical impedance, capacity, and thermal signatures. If cycle 40 is in train and cycle 41 is in test, the model memorizes cell-specific quirks rather than learning generalized degradation mechanics.
- **The Solution**: **Group-based cross-validation (`GroupKFold` or `GroupShuffleSplit`) by Battery Cell ID**. For example:
  - **Training Set**: Cell B0005 (168 cycles) + Cell B0006 (168 cycles)
  - **Testing Set**: Cell B0007 (168 cycles) + Cell B0018 (132 cycles)
  This guarantees the model is evaluated exclusively on battery cells it has *never seen before*.

### Multicollinearity Between Electrical Drop & Thermal Rise
- **The Pitfall**: Both $\Delta V_{\text{drop}}$ and $\Delta T_{\text{rise}}$ strongly correlate with internal resistance ($R_{\text{int}}$) because $\Delta V = I R_{\text{int}}$ and $Q = I^2 R_{\text{int}}$. Linear models can experience unstable coefficients.
- **The Solution**: Normalize features using `StandardScaler` or `RobustScaler`; evaluate tree-based ensembles (Random Forest, GBDT) which handle correlated features robustly; compute feature variance inflation factors (VIF).

## 3. Physics Simulation Pitfalls

### Energy Conservation Violation
- **The Pitfall**: Simulating an 8×8 thermal grid with random noise or arbitrary temperature ramps that exceed thermodynamic limits.
- **The Solution**:
  1. Calculate total Joule heating generated during the 10-second pulse:
     $$Q_{\text{gen}} = \int_0^{10} I(t)^2 R_{\text{int}}(SOH)\, dt$$
  2. Compute bulk thermal rise using battery heat capacity $C_{\text{thermal}} = m \cdot c_p$ ($\approx 45\,\text{g} \times 0.9\,\text{J/(g}\cdot\text{K)} \approx 40.5\,\text{J/K}$ for an 18650 cell):
     $$\Delta T_{\text{bulk}} = \frac{Q_{\text{gen}} - Q_{\text{loss}}}{C_{\text{thermal}}}$$
  3. Calibrate simulated bulk rise against real NASA thermocouple rate of rise at equivalent C-rates to ensure thermodynamic realism.
  4. Project bulk temperature onto the 8×8 grid using a 2D Gaussian point source at the cathode/anode tab terminals ($x_0, y_0$) plus radial heat conduction and convective boundary dissipation:
     $$T(x, y, t) = T_{\text{amb}} + \Delta T_{\text{bulk}}(t) \cdot \exp\left(-\frac{(x - x_0)^2 + (y - y_0)^2}{2\sigma_{\text{diff}}^2}\right) + \mathcal{N}(0, \sigma_{\text{sensor}})$$

## 4. Software Engineering & Team Pitfalls

- **Avoid PostgreSQL or Docker requirements for local development**: Rely on versioned CSV/JSON fixtures in `backend/data/` so any team member can run `uvicorn` and `npm run dev` instantly without database setup.
- **Avoid Microservices**: Keep backend as a clean, single FastAPI service and frontend as a single Vite SPA.
- **Avoid Premature Hardware Lock-in**: Build the abstract `TelemetrySource` pattern first. If hardware fails on hackathon day (e.g. burnt sensor, loose breadboard wire), the demo continues seamlessly using the synthetic pulse simulator.
