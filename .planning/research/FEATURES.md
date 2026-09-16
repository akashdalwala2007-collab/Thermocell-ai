# Feature Engineering & Triage Taxonomy

## Triage Classification Taxonomy

The diagnostic goal is rapid sorting of retired 18650 Li-ion cells for second-life applications (e.g., solar stationary storage, power banks, low-speed electric light vehicles):

| Class | Definition | Typical Criteria | Action |
|-------|------------|------------------|--------|
| **REUSE** | High residual capacity, low internal resistance, normal uniform thermal dissipation | SoH $\ge 80\%$, DCIR $\le 1.5\times$ nominal, max $\Delta T \le 4^\circ\text{C}$, low spatial variance | Graded for second-life pack assembly |
| **RETIRE** | Severely degraded capacity, high internal resistance, excessive Joule heating, dangerous hotspots | SoH $< 70\%$, DCIR $> 2.2\times$ nominal, extreme $\Delta T$ or severe tab hotspots | Sent to certified material recycling |
| **INVESTIGATE** | Borderline metrics, abnormal thermal gradients, internal resistance anomalies, or high prediction uncertainty | $70\% \le \text{SoH} < 80\%$, or mismatched electrical vs. thermal signals (e.g., low resistance but asymmetric hotspot) | Flagged for full laboratory cycle testing |

## Battery Telemetry & Feature Vector

A 10-second controlled constant-current discharge pulse (e.g., 2C or 3A–5A load) yields rich transient behavior. The extracted feature vector combines electrical and thermal domains:

### 1. Electrical Features (Derived from 10s $V(t)$ and $I(t)$)
- **$V_{\text{initial}}$ / OCV**: Initial open-circuit voltage right before pulse onset.
- **$V_{\text{instant\_drop}}$ ($\Delta V_{0}$)**: Immediate ohmic voltage drop at $t = 0.1\,\text{s}$.
- **$\text{DCIR}$**: Direct current internal resistance calculated via Ohm's Law:
  $$\text{DCIR} = \frac{|V_{\text{initial}} - V_{\text{instant\_drop}}|}{I_{\text{pulse}}}$$
- **$V_{\text{transient\_drop}}$ ($\Delta V_{10}$)**: Total voltage drop after 10 seconds of discharge.
- **$dV/dt_{\text{slope}}$**: Average rate of voltage decline during the 10-second pulse window ($\text{V/s}$).
- **$V_{\text{recovery}}$**: Voltage rebound slope in 2 seconds post-pulse.

### 2. Bulk Thermal Features (Derived from Bulk Temperature $T_{\text{bulk}}(t)$)
- **$T_{\text{initial}}$**: Starting ambient/cell temperature ($^\circ\text{C}$).
- **$T_{\text{final}}$**: Temperature at the end of the 10-second pulse.
- **$\Delta T_{\text{rise}}$**: Net bulk temperature increase:
  $$\Delta T = T_{\text{final}} - T_{\text{initial}}$$
- **$dT/dt_{\text{max}}$**: Peak rate of thermal increase ($^\circ\text{C/s}$).
- **Thermal Dissipation Factor ($\tau_{\text{cool}}$)**: Exponential cooling decay rate post-pulse.

### 3. Spatial Thermal Features (Derived from 8×8 AMG8833 Thermal Array)
- **$T_{\text{max\_pixel}}$**: Maximum localized temperature observed on the 64-pixel matrix.
- **$T_{\text{mean\_pixel}}$**: Mean temperature across all 64 pixels.
- **Spatial Variance ($\sigma^2_{T}$)**: Temperature dispersion across the cell surface; indicates non-uniform degradation.
- **Tab-to-Can Gradient ($\nabla T_{\text{tab-body}}$)**: Difference between the hottest tab cluster (top row) and the cylinder body.
- **Hotspot Eccentricity**: Measure of localized thermal asymmetry (indicates localized internal resistance spikes or micro-dendrite activity).

## Machine Learning Models for Evaluation
1. **Baseline**: Rule-based physics threshold heuristic (transparent sanity check).
2. **Logistic Regression (Multinomial)**: Calibrated baseline with feature importance interpretable via odds ratios.
3. **Random Forest Classifier**: Non-linear tree ensemble; robust against multicollinearity between electrical drop and thermal rise.
4. **Gradient Boosting (XGBoost / LightGBM / HistGradientBoostingClassifier)**: High-performance gradient booster for tabular classification.
