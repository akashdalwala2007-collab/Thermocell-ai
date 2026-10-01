"""10-second rapid diagnostic screening representation and explainability evaluation."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Any, List

from app.models.schemas_provenance import TriageClassEnum
from app.services.feature_service import extract_canonical_14_features
from app.models.schemas_battery import BatteryPulseTelemetry

RAPID_SCREENING_DISCLAIMER = (
    "Rapid diagnostic screening test (10-second controlled pulse) for high-throughput second-life triage. "
    "This is an initial screening verdict, not a replacement for full laboratory characterization (such as "
    "multi-hour capacity cycling or electrochemical impedance spectroscopy), and does not certify cells "
    "for pack integration without secondary testing."
)


@dataclass(frozen=True)
class ExplainabilityFactors:
    """Detailed human-interpretable factors explaining the screening triage result."""
    elevated_dcir_severity: str  # NOMINAL (<= 0.1167Ω), MODERATE (> 0.1167Ω, <= 0.20Ω), CRITICAL (> 0.20Ω)
    abnormal_delta_t_severity: str  # NOMINAL (<= 2.5°C), MODERATE (> 2.5°C, <= 4.5°C), CRITICAL (> 4.5°C)
    heating_rate_status: str  # NOMINAL (<= 0.30°C/s), ELEVATED (> 0.30°C/s)
    spatial_uniformity_status: str  # UNIFORM (σ²_T <= 0.25°C² and ∇T <= 1.5°C), ANOMALOUS
    hotspot_location_status: str  # CENTERED (ecc <= 1.0 px), OFF_AXIS (> 1.0 px)
    contributing_reasons: List[str]


@dataclass(frozen=True)
class ScreeningVerdict:
    """Triage verdict produced by the 10-second screening decision hierarchy."""
    triage_class: TriageClassEnum
    features: Dict[str, float]
    explainability: ExplainabilityFactors
    action_recommendation: str
    scientific_disclaimer: str = RAPID_SCREENING_DISCLAIMER


def evaluate_screening_hierarchy(features: Dict[str, float]) -> ScreeningVerdict:
    """
    Evaluate the canonical 14 features against the deterministic decision hierarchy:
    
    Step 1: Check Deterministic Safety Tripwires (Highest Precedence) -> RETIRE
    Step 2: Check Strict Nominal Qualification Criteria -> REUSE
    Step 3: Catch-All / Mixed Signals (Intermediate State) -> INVESTIGATE
    """
    dcir = features["DCIR"]
    delta_v10 = features["ΔV10"]
    delta_t_bulk = features["ΔT_bulk"]
    t_max_pixel = features["T_max_pixel"]
    t_initial = features["T_initial"]
    pixel_rise = t_max_pixel - t_initial
    dt_dt_max = features["dT/dt_max"]
    variance_t = features["σ²_T"]
    tab_body_gradient = features["∇T_tab-body"]
    eccentricity = features["hotspot_eccentricity"]

    # 1. Explainability Severity Assessment
    if dcir <= 0.1167:
        dcir_sev = "NOMINAL"
    elif dcir <= 0.20:
        dcir_sev = "MODERATE"
    else:
        dcir_sev = "CRITICAL"

    if delta_t_bulk <= 2.5:
        delta_t_sev = "NOMINAL"
    elif delta_t_bulk <= 4.5:
        delta_t_sev = "MODERATE"
    else:
        delta_t_sev = "CRITICAL"

    heating_status = "ELEVATED" if dt_dt_max > 0.30 else "NOMINAL"
    uniformity_status = "UNIFORM" if (variance_t <= 0.25 and tab_body_gradient <= 1.5) else "ANOMALOUS"
    hotspot_status = "CENTERED" if eccentricity <= 1.0 else "OFF_AXIS"

    reasons: List[str] = []

    # Step 1: Deterministic Safety Tripwires -> RETIRE
    retire_tripwires = []
    if dcir > 0.20:
        retire_tripwires.append(f"DCIR ({dcir:.4f} Ω) exceeds safety limit (0.20 Ω)")
    if delta_v10 > 0.60:
        retire_tripwires.append(f"Pulse drop ΔV10 ({delta_v10:.3f} V) exceeds collapse limit (0.60 V)")
    if delta_t_bulk > 4.5:
        retire_tripwires.append(f"Bulk temperature rise ΔT ({delta_t_bulk:.2f} °C) exceeds overheat limit (4.5 °C)")
    if pixel_rise > 4.5:
        retire_tripwires.append(f"Peak localized pixel rise ({pixel_rise:.2f} °C) exceeds hotspot runaway limit (4.5 °C)")

    if retire_tripwires:
        reasons.extend(retire_tripwires)
        verdict = TriageClassEnum.RETIRE
        action = (
            "Safety lockout triggered: Cell exhibits severe degradation or runaway thermal risk. "
            "Relegated to recycling; unfit for second-life applications."
        )
    else:
        # Step 2: Strict Nominal Qualification Criteria -> REUSE
        reuse_criteria_met = (
            dcir <= 0.1167
            and delta_v10 <= 0.45
            and delta_t_bulk <= 2.5
            and variance_t <= 0.25
            and tab_body_gradient <= 1.5
            and eccentricity <= 1.0
        )

        if reuse_criteria_met:
            reasons.append("All nominal operational thresholds satisfied: low internal resistance and uniform thermal profile.")
            verdict = TriageClassEnum.REUSE
            action = (
                "Rapid screening eligibility result: Cell passed initial rapid screening thresholds. "
                "Candidate suitable for secondary evaluation for stationary battery applications."
            )
        else:
            # Step 3: Catch-All / Mixed Signals -> INVESTIGATE
            if dcir > 0.1167:
                reasons.append(f"Moderate DCIR ({dcir:.4f} Ω) exceeds nominal threshold (0.1167 Ω)")
            if delta_v10 > 0.45:
                reasons.append(f"Intermediate ΔV10 drop ({delta_v10:.3f} V) exceeds nominal limit (0.45 V)")
            if delta_t_bulk > 2.5:
                reasons.append(f"Moderate bulk temperature rise ({delta_t_bulk:.2f} °C) exceeds nominal limit (2.5 °C)")
            if variance_t > 0.25:
                reasons.append(f"Spatial thermal variance σ²_T ({variance_t:.4f} °C²) indicates thermal non-uniformity")
            if tab_body_gradient > 1.5:
                reasons.append(f"Elevated tab-to-body gradient ({tab_body_gradient:.2f} °C) exceeds nominal threshold (1.5 °C)")
            if eccentricity > 1.0:
                reasons.append(f"Off-axis hotspot eccentricity ({eccentricity:.2f} px) detected")

            verdict = TriageClassEnum.INVESTIGATE
            action = (
                "Quarantine for secondary laboratory testing: Cell exhibits intermediate impedance or "
                "spatial thermal non-uniformity requiring multi-hour cycling and EIS before final classification."
            )

    explainability = ExplainabilityFactors(
        elevated_dcir_severity=dcir_sev,
        abnormal_delta_t_severity=delta_t_sev,
        heating_rate_status=heating_status,
        spatial_uniformity_status=uniformity_status,
        hotspot_location_status=hotspot_status,
        contributing_reasons=reasons,
    )

    return ScreeningVerdict(
        triage_class=verdict,
        features=features,
        explainability=explainability,
        action_recommendation=action,
    )


def screen_battery_pulse(telemetry: BatteryPulseTelemetry) -> ScreeningVerdict:
    """Extract canonical 14 features from telemetry and execute the screening evaluation."""
    features = extract_canonical_14_features(telemetry)
    return evaluate_screening_hierarchy(features)

