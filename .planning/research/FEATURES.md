# Feature Engineering & Triage Taxonomy

## Triage Classification Taxonomy

ThermoCell-AI grades retired 18650 Li-ion cells for second-life applications (e.g., stationary solar energy storage, off-grid backup systems, light electric mobility).

To prevent classification conflicts and ensure electrical safety, triage evaluates two strictly separated stages:

1. **SoH-Based Ground Truth**: Derived directly from empirical NASA discharge capacity.
2. **Diagnostic Safety Override**: Evaluated from 10-second multi-modal telemetry with strict precedence rules.

---

### Part A: Empirical Ground-Truth SoH Classification (NASA Ames 2.0 Ah 18650)

Ground truth labels assigned to cycles based strictly on measured discharge capacity $C_{\text{discharge}}$:

| Ground Truth Label | Residual Capacity Range | State of Health Range | Physical State |
| -------------------- | ------------------------- | ----------------------- | ---------------- |
| **REUSE** | $C_{\text{discharge}} \ge 1.6\,\text{Ah}$ | $\text{SoH} \ge 80.0\%$ | High residual capacity, nominal active material retention |
| **INVESTIGATE** | $1.4\,\text{Ah} \le C_{\text{discharge}} < 1.6\,\text{Ah}$ | $70.0\% \le \text{SoH} < 80.0\%$ | Marginal degradation, knee-point approach |
| **RETIRE** | $C_{\text{discharge}} < 1.4\,\text{Ah}$ | $\text{SoH} < 70.0\%$ | End-of-life, severe active lithium loss |

---

### Part B: Mutually Exclusive Diagnostic Decision Logic (Authoritative Runtime Hierarchy)

During runtime inference (`/api/predict`), the model or rule-based fallback evaluates **strictly the extracted runtime pulse features** from `BatteryPulseTelemetry`. Empirical NASA capacity ($C_{\text{discharge}}$) and $\text{SoH}$ are offline ground-truth values and are NOT available or used during runtime screening.

Outcomes are evaluated using a strict **first-match deterministic override hierarchy** so that classifications are 100% mutually exclusive and exhaustive:

```text
               +-----------------------------------------------+
               | 10-Second Telemetry & 14 Extracted Features   |
               +-----------------------------------------------+
                                      |
                                      v
    [Tier 1: RETIRE Safety Lockout / Severe Degradation Tripwires]
    - DCIR > 0.20 Ω (ΔV_0 > 0.60 V at 3A) OR
    - ΔV10 > 0.60 V OR
    - ΔT_bulk > 4.5°C OR (T_max_pixel - T_initial) > 4.5°C
         |                     |
        YES                    NO
         |                     |
         v                     v
    +----------+   [Tier 2: REUSE Strict Nominal Qualification]
    |  RETIRE  |   - DCIR <= 0.1167 Ω (ΔV_0 <= 0.35 V at 3A) AND
    +----------+   - ΔV10 <= 0.45 V AND
                   - ΔT_bulk <= 2.5°C AND
                   - σ²_T <= 0.25°C² AND
                   - ∇T_tab-body <= 1.5°C AND
                   - hotspot_eccentricity <= 1.0 px
                        |                     |
                       YES                    NO
                        |                     |
                        v                     v
                 +-------------+        +---------------+
                 |    REUSE    |        |  INVESTIGATE  |
                 +-------------+        |  (Catch-all)  |
                                        +---------------+
```

#### Authoritative Runtime Triage Precedence Rules

1. **RETIRE (Highest Precedence — Safety Lockout & Severe Degradation)**:
   A cell is immediately classified as **RETIRE** if ANY of the following safety tripwires occur:
   - **Internal Resistance Tripwire**: $\text{DCIR} > 0.20\,\Omega$ (immediate ohmic drop $\Delta V_0 > 0.60\,\text{V}$ at $3\,\text{A}$, exceeding $2.0\times$ nominal fresh cell resistance $0.10\,\Omega$).
     *(Example: A cell with $\text{DCIR} = 0.21\,\Omega$ deterministically breaches this tripwire and is classified as `RETIRE`.)*
   - **Pulse Voltage Collapse Tripwire**: Total active pulse voltage drop $\Delta V_{10} > 0.60\,\text{V}$.
   - **Bulk Thermal Overheat Tripwire**: Net bulk temperature rise $\Delta T_{\text{bulk}} > 4.5^\circ\text{C}$.
   - **Spatial Hotspot Runaway Tripwire**: Localized peak temperature rise $(T_{\text{max\_pixel}} - T_{\text{initial}}) > 4.5^\circ\text{C}$.
   *Action*: Immediate retirement; cell is locked out from second-life reuse and relegated to certified pyrometallurgical / hydrometallurgical material recycling.

2. **INVESTIGATE (Secondary Precedence / Exhaustive Catch-All — Marginal & Anomalous Screening)**:
   If a cell does NOT breach any RETIRE safety tripwires, but fails one or more strict nominal REUSE criteria, it is classified as **INVESTIGATE**.
   This state captures all intermediate degradation and spatial anomalies without compromising safety, including:
   - Intermediate internal resistance: $0.1167\,\Omega < \text{DCIR} \le 0.20\,\Omega$ ($0.35\,\text{V} < \Delta V_0 \le 0.60\,\text{V}$ at $3\,\text{A}$).
   - Intermediate pulse voltage drop: $0.45\,\text{V} < \Delta V_{10} \le 0.60\,\text{V}$.
   - Moderate bulk thermal rise: $2.5^\circ\text{C} < \Delta T_{\text{bulk}} \le 4.5^\circ\text{C}$.
   - Spatial thermal heterogeneity: $\sigma^2_T > 0.25^\circ\text{C}^2$.
   - Elevated tab-to-body thermal gradient: $\nabla T_{\text{tab-body}} > 1.5^\circ\text{C}$.
   - Off-axis localized thermal hotspot: $\text{hotspot\_eccentricity} > 1.0\,\text{pixel}$.
   *Action*: Quarantined for secondary multi-hour laboratory capacity cycling and electrochemical impedance spectroscopy (EIS) before final grading.

3. **REUSE (Strict Positive Eligibility State — Certified for Second-Life Pack Integration)**:
   A cell is classified as **REUSE** IF AND ONLY IF all nominal operational criteria are simultaneously satisfied:
   - Low internal resistance: $\text{DCIR} \le 0.1167\,\Omega$ (immediate ohmic drop $\Delta V_0 \le 0.35\,\text{V}$ at $3\,\text{A}$).
   - Stable pulse voltage drop: $\Delta V_{10} \le 0.45\,\text{V}$.
   - Nominal bulk thermal rise: $\Delta T_{\text{bulk}} \le 2.5^\circ\text{C}$.
   - Uniform spatial thermal distribution: $\sigma^2_T \le 0.25^\circ\text{C}^2$.
   - Nominal tab-to-body gradient: $\nabla T_{\text{tab-body}} \le 1.5^\circ\text{C}$.
   - Centered thermal profile: $\text{hotspot\_eccentricity} \le 1.0\,\text{pixel}$.
   *Action*: Approved and certified for second-life battery pack assembly (e.g., stationary energy storage, backup power).

---

## Canonical 14-Dimensional Feature Vector

#### Payload & Acquired Sample Shape Contract

To eliminate ambiguity across simulation generators, feature extractors, and ML inference services, all telemetry payloads adhere to an explicit sample-count contract:

- **Pre-Pulse Baseline**: 1 explicit scalar voltage sample (`v_pre_pulse`, $I = 0\,\text{A}$) acquired at $t_{\text{pre}}$ immediately prior to current load application at $t = 0.0\,\text{s}$. Used strictly for `OCV`, `DCIR` / ohmic-drop ($\Delta V_0$), and `ΔV10` calculation. It is an unloaded scalar float measurement, completely distinct from the active pulse time-series array, eliminating timestamp collisions.
- **Active Pulse Window**: 100 synchronized multi-modal samples at 10Hz covering timestamps $[0.0, 9.9]\,\text{s}$ ($t_i = \text{round}(0.1 \cdot i, 1)$, $i \in [0, 99]$), representing the 10.0s active pulse duration where $t = 0.0\,\text{s}$ is the first post-load active measurement and $t = 9.9\,\text{s}$ is the final sampled active timestamp under $3.0\,\text{A}$ discharge load. Each sample contains $V(t)$, $I(t)$, $T_{\text{bulk}}(t)$, and an 8×8 spatial thermal frame.
- **Post-Pulse Relaxation Window**: 20 synchronized samples at 10Hz covering timestamps $[10.0, 11.9]\,\text{s}$ ($t_i = \text{round}(10.0 + 0.1 \cdot i, 1)$, $i \in [0, 19]$), representing 2.0s of post-cutoff relaxation ($I = 0\,\text{A}$). Each sample contains $V_{\text{relax}}(t)$ and $T_{\text{bulk\_relax}}(t)$.
- **Total Acquired Sample Records**:
  $$1\,\text{pre-pulse voltage sample} + 100\,\text{active-pulse samples} + 20\,\text{relaxation samples} = 121\,\text{acquired sample records}$$

The 10-second active pulse and 2-second relaxation window yield exactly 14 canonical features in fixed order:

### 1. Electrical Features (Features 1–5)

1. **`OCV`**: Open-circuit voltage measured from the explicit unloaded pre-pulse voltage sample `v_pre_pulse` immediately prior to load application ($I = 0\,\text{A}$) ($\text{V}$).
2. **`DCIR`**: Direct Current Internal Resistance derived from the immediate ohmic drop $\Delta V_0$ between unloaded pre-pulse baseline `v_pre_pulse` ($I = 0\,\text{A}$) and the first post-load active pulse sample $V(t = 0.0\,\text{s})$ under $3\,\text{A}$ discharge load ($\Omega$):
   $$\Delta V_0 = v_{\text{pre\_pulse}} - V(t = 0.0\,\text{s})$$
   $$\text{DCIR} = \frac{\Delta V_0}{I_{\text{pulse}}} = R_0$$
   *(Nominal fresh cell: $\text{DCIR} \approx 0.08 - 0.10\,\Omega \implies \Delta V_0 \approx 0.24 - 0.30\,\text{V}$ at $3\,\text{A}$. REUSE eligibility requires $\text{DCIR} \le 0.1167\,\Omega \implies \Delta V_0 \le 0.35\,\text{V}$; RETIRE safety tripwire triggers at $\text{DCIR} > 0.20\,\Omega \implies \Delta V_0 > 0.60\,\text{V}$.)*
3. **`ΔV10`**: Total voltage drop over the 10-second active pulse from pre-pulse baseline to final active sample $t = 9.9\,\text{s}$ ($\text{V}$):
   $$\Delta V_{10} = v_{\text{pre\_pulse}} - V(t = 9.9\,\text{s})$$
4. **`dV/dt_slope`**: Linear regression slope of cell voltage decline from $t = 1.0\,\text{s}$ to $9.9\,\text{s}$ across active pulse samples ($\text{V/s}$), capturing electrochemical polarization and diffusion dynamics.
5. **`V_recovery_rate`**: Voltage rebound rate during the 20-sample relaxation window from $t = 10.0\,\text{s}$ to $11.9\,\text{s}$ ($\Delta t = 1.9\,\text{s}$, $\text{V/s}$):
   $$V_{\text{recovery\_rate}} = \frac{V_{\text{relax}}(t = 11.9\,\text{s}) - V_{\text{relax}}(t = 10.0\,\text{s})}{1.9\,\text{s}}$$

### 2. Bulk Thermal Features (Features 6–9)

6. **`T_initial`**: Starting ambient/cell bulk temperature measured at pulse onset $t = 0.0\,\text{s}$ ($^\circ\text{C}$).
7. **`ΔT_bulk`**: Net bulk temperature rise at pulse termination ($t = 9.9\,\text{s}$):
   $$\Delta T_{\text{bulk}} = T_{\text{bulk}}(t = 9.9\,\text{s}) - T_{\text{initial}}$$
8. **`dT/dt_max`**: Maximum instantaneous bulk heating rate observed during the active 10-second pulse window ($t \in [0.0, 9.9]\,\text{s}$, $^\circ\text{C/s}$).
9. **`τ_cool`**: Thermal relaxation exponential decay time constant ($\text{s}$) fitted across the 20 post-pulse relaxation samples ($t \in [10.0, 11.9]\,\text{s}$, $I = 0\,\text{A}$) relative to the pulse-end reference baseline $t_{\text{end}} = 9.9\,\text{s}$:
   $$T_{\text{bulk}}(t) - T_{\text{initial}} = \Delta T_{\text{bulk}} \cdot e^{-(t - 9.9)/\tau_{\text{cool}}}$$
   $$\ln\left(\frac{T_{\text{bulk}}(t) - T_{\text{initial}}}{\Delta T_{\text{bulk}}}\right) = -\frac{t - 9.9}{\tau_{\text{cool}}}$$

### 3. Spatial Thermal Features (Features 10–14, from 8×8 AMG8833 Frames)

10. **`T_max_pixel`**: Maximum localized temperature observed on any pixel of the 64-element spatial array at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}$).
11. **`T_mean_cell`**: Mean temperature across active cell-occupied pixels on the 8×8 grid at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}$).
12. **`σ²_T`**: Spatial temperature variance across active cell pixels at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}^2$):
    $$\sigma^2_T = \frac{1}{N_{\text{active}}} \sum_{i \in \text{active}} (T_i - T_{\text{mean\_cell}})^2$$
13. **`∇T_tab-body`**: Thermal gradient between the terminal tab cluster (top rows) and lower cell body at pulse termination $t = 9.9\,\text{s}$ ($^\circ\text{C}$):
    $$\nabla T_{\text{tab-body}} = T_{\text{tab\_cluster\_mean}} - T_{\text{cell\_body\_mean}}$$
14. **`hotspot_eccentricity`**: Euclidean spatial distance between the thermal center of mass and the geometric tab anchor at pulse termination $t = 9.9\,\text{s}$ (dimensionless / pixels).

---

## Machine Learning Strategy & Cross-Validation

### Canonical Input Feature Matrix $X$ vs Metadata

To eliminate data leakage and guarantee valid second-life generalization:
- **Feature Matrix $X$**: Contains **EXACTLY** the 14 extracted pulse features in canonical order (`OCV`, `DCIR`, `ΔV10`, `dV/dt_slope`, `V_recovery_rate`, `T_initial`, `ΔT_bulk`, `dT/dt_max`, `τ_cool`, `T_max_pixel`, `T_mean_cell`, `σ²_T`, `∇T_tab-body`, `hotspot_eccentricity`).
- **`cell_id`**: Grouping and provenance metadata representing physical cell identity (e.g., `'B0005'`). Used **strictly for Leave-One-Group-Out (LOGO)** cross-validation fold splitting. It is **NEVER** an input feature in $X$.
- **`cycle_index`**: Metadata and provenance tracking column. It is **strictly excluded from feature matrix $X$** so models learn diagnostic physics rather than memorizing cycle numbers.

### Model Portfolio

1. **Rule-Based Baseline**: Evaluates the mutually exclusive triage logic above as an interpretable physics baseline.
2. **Multinomial Logistic Regression**: L2-regularized linear model with feature standardization; provides interpretable odds ratios.
3. **Random Forest Classifier**: Non-linear ensemble (100 estimators) robust against collinearity between electrical drop and thermal heating.
4. **Gradient Boosted Decision Trees (GBDT / HistGradientBoostingClassifier)**: High-performance tabular classifier with probability calibration.

### Validation Protocol

- **Leave-One-Group-Out (LOGO) Cross-Validation**: Folds are partitioned strictly by physical `cell_id` across B0005, B0006, B0007, and B0018. All cycles for a given physical cell remain together in the same fold. Feature matrix $X$ strictly contains the 14 pulse features.
- **Metrics**: Macro F1-Score, Balanced Accuracy, per-class Precision/Recall, Confusion Matrix, and Brier calibration score.
- **Scientific Integrity Clamp**: No claims of $>95\%$ accuracy; all performance metrics must report exact confidence intervals and acknowledge the synthetic nature of the 10s spatial thermal inputs.
