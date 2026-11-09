"""Runtime ML inference service and Decision Fusion layer for ThermoCell-AI."""
from __future__ import annotations

import os
import math
from typing import Dict, Any, Optional, Tuple, List
import joblib
import pandas as pd
import numpy as np

from app.models.schemas_provenance import ProvenanceEnum, TriageClassEnum, validate_physical_cell_id
from app.models.schemas_battery import (
    DiagnosticPrediction,
    BatteryPulseTelemetry,
    CANONICAL_FEATURES,
)
from app.services.feature_service import extract_canonical_14_features
from app.services.diagnostic_screening import evaluate_screening_hierarchy, RAPID_SCREENING_DISCLAIMER

# Feature sets matching trained models
FEATURE_COLS_MODEL_1 = [
    "OCV",
    "DCIR",
    "ΔV10",
    "dV/dt_slope",
    "V_recovery_rate",
    "T_initial",
    "ΔT_bulk",
    "dT/dt_max",
    "τ_cool",
]

FEATURE_COLS_MODEL_2 = [
    "T_max_pixel",
    "T_mean_cell",
    "σ²_T",
    "∇T_tab-body",
    "hotspot_eccentricity",
    "DCIR",
    "τ_cool",
]

DEFAULT_MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "..", "ml", "saved_models")

_health_model = None
_pattern_model = None


def get_health_model(model_dir: Optional[str] = None):
    """Load or cache Model 1 (Health Classifier) artifact."""
    global _health_model
    if _health_model is None:
        target_dir = model_dir or DEFAULT_MODEL_DIR
        model_path = os.path.join(target_dir, "health_model.joblib")
        if os.path.exists(model_path):
            _health_model = joblib.load(model_path)
    return _health_model


def get_pattern_model(model_dir: Optional[str] = None):
    """Load or cache Model 2 (Spatial Degradation Pattern Classifier) artifact."""
    global _pattern_model
    if _pattern_model is None:
        target_dir = model_dir or DEFAULT_MODEL_DIR
        model_path = os.path.join(target_dir, "pattern_model.joblib")
        if os.path.exists(model_path):
            _pattern_model = joblib.load(model_path)
    return _pattern_model


def normalize_probabilities(raw_probs: Dict[str, float]) -> Dict[str, float]:
    """Ensure class probabilities are non-negative, finite, and strictly sum to 1.0 within 1e-4."""
    keys = [TriageClassEnum.REUSE.value, TriageClassEnum.INVESTIGATE.value, TriageClassEnum.RETIRE.value]
    floats = {k: max(0.0, float(raw_probs.get(k, 0.0))) for k in keys}
    total = sum(floats.values())
    if total <= 1e-9:
        return {TriageClassEnum.INVESTIGATE.value: 1.0, TriageClassEnum.REUSE.value: 0.0, TriageClassEnum.RETIRE.value: 0.0}
    
    # Scale and normalize with exact sum
    normalized = {k: round(v / total, 4) for k, v in floats.items()}
    diff = 1.0 - sum(normalized.values())
    # Adjust largest probability to make sum exactly 1.0
    max_k = max(normalized, key=normalized.get)
    normalized[max_k] = round(normalized[max_k] + diff, 4)
    return normalized


def predict_diagnostic_triage(
    features: Dict[str, float],
    cell_id: str = "B0005",
    cycle_index: Optional[int] = None,
    model_dir: Optional[str] = None,
) -> DiagnosticPrediction:
    """
    Execute dual-model inference and Decision Fusion hierarchy:
    
    Step 1: Check Deterministic Safety Tripwires (Highest Precedence) -> Force RETIRE
    Step 2: ML Model 1 (Health) + Model 2 (Degradation Pattern) probability inference
    Step 3: Decision Fusion & Triage Qualification
    Step 4: Construct deeply immutable DiagnosticPrediction with calibrated probabilities
    """
    validated_cell_id = validate_physical_cell_id(cell_id)

    # Validate all 14 canonical features exist and are finite
    missing = CANONICAL_FEATURES - set(features.keys())
    if missing:
        raise ValueError(f"Features dictionary missing canonical keys: {sorted(missing)}")
    for k, v in features.items():
        if not math.isfinite(v):
            raise ValueError(f"Feature '{k}' is non-finite: {v}")

    dcir = features["DCIR"]
    delta_v10 = features["ΔV10"]
    delta_t_bulk = features["ΔT_bulk"]
    t_max_pixel = features["T_max_pixel"]
    t_initial = features["T_initial"]
    pixel_rise = t_max_pixel - t_initial
    variance_t = features["σ²_T"]
    tab_body_gradient = features["∇T_tab-body"]
    eccentricity = features["hotspot_eccentricity"]

    # Step 1: Check Deterministic Safety Tripwires
    retire_tripwires: List[str] = []
    if dcir > 0.20:
        retire_tripwires.append(f"DCIR ({dcir:.4f} Ω) exceeds safety limit (0.20 Ω)")
    if delta_v10 > 0.60:
        retire_tripwires.append(f"Pulse drop ΔV10 ({delta_v10:.3f} V) exceeds collapse limit (0.60 V)")
    if delta_t_bulk > 4.5:
        retire_tripwires.append(f"Bulk temperature rise ΔT ({delta_t_bulk:.2f} °C) exceeds overheat limit (4.5 °C)")
    if pixel_rise > 4.5:
        retire_tripwires.append(f"Peak localized pixel rise ({pixel_rise:.2f} °C) exceeds hotspot runaway limit (4.5 °C)")
    if variance_t > 0.50 or tab_body_gradient > 3.0:
        retire_tripwires.append(f"Extreme spatial thermal gradient ({tab_body_gradient:.2f} °C) triggers runaway tripwire")

    tripwire_triggered = len(retire_tripwires) > 0

    if tripwire_triggered:
        # Safety lockout triggered: Override ML probabilities to dominant RETIRE
        triage_class = TriageClassEnum.RETIRE
        probabilities = normalize_probabilities({
            TriageClassEnum.RETIRE.value: 0.98,
            TriageClassEnum.INVESTIGATE.value: 0.015,
            TriageClassEnum.REUSE.value: 0.005,
        })
        recommendation = (
            f"SAFETY LOCKOUT: {retire_tripwires[0]}. "
            "Cell exhibits severe electrochemical degradation or hazardous runaway risk. "
            "Relegated to recycling; unfit for second-life applications."
        )
    else:
        # Step 2: ML Model Inference
        health_art = get_health_model(model_dir)
        pattern_art = get_pattern_model(model_dir)

        if health_art is not None:
            # Model 1 probability prediction
            h_pipe = health_art["pipeline"]
            h_cols = health_art["feature_names"]
            h_classes = health_art["classes"]
            X1 = pd.DataFrame([{col: features[col] for col in h_cols}])
            h_probs_raw = h_pipe.predict_proba(X1)[0]
            raw_model_probs = {cls_name: float(prob) for cls_name, prob in zip(h_classes, h_probs_raw)}
        else:
            # Fallback baseline heuristic if model artifact not yet available
            if dcir <= 0.1167 and delta_v10 <= 0.45 and delta_t_bulk <= 2.5:
                raw_model_probs = {TriageClassEnum.REUSE.value: 0.85, TriageClassEnum.INVESTIGATE.value: 0.12, TriageClassEnum.RETIRE.value: 0.03}
            elif dcir > 0.18:
                raw_model_probs = {TriageClassEnum.RETIRE.value: 0.85, TriageClassEnum.INVESTIGATE.value: 0.12, TriageClassEnum.REUSE.value: 0.03}
            else:
                raw_model_probs = {TriageClassEnum.INVESTIGATE.value: 0.70, TriageClassEnum.REUSE.value: 0.20, TriageClassEnum.RETIRE.value: 0.10}

        # Model 2 spatial degradation modulation
        if pattern_art is not None:
            p_pipe = pattern_art["pipeline"]
            p_cols = pattern_art["feature_names"]
            p_classes = pattern_art["classes"]
            X2 = pd.DataFrame([{col: features[col] for col in p_cols}])
            p_probs_raw = p_pipe.predict_proba(X2)[0]
            pattern_probs = {cls_name: float(prob) for cls_name, prob in zip(p_classes, p_probs_raw)}
            
            # If spatial non-uniformity detected, modulate probability away from REUSE
            tab_risk = pattern_probs.get("TAB_CONTACT_RESISTANCE", 0.0)
            hotspot_risk = pattern_probs.get("HOTSPOT_RUNAWAY_RISK", 0.0)
            if hotspot_risk > 0.35 or tab_risk > 0.45:
                shift = max(0.15, (hotspot_risk + tab_risk) * 0.25)
                reuse_val = raw_model_probs.get(TriageClassEnum.REUSE.value, 0.0)
                raw_model_probs[TriageClassEnum.REUSE.value] = max(0.0, reuse_val - shift)
                raw_model_probs[TriageClassEnum.INVESTIGATE.value] = raw_model_probs.get(TriageClassEnum.INVESTIGATE.value, 0.0) + shift

        probabilities = normalize_probabilities(raw_model_probs)

        # Step 3: Decision Fusion & Qualification Thresholding
        nominal_criteria_met = (
            dcir <= 0.1167
            and delta_v10 <= 0.45
            and delta_t_bulk <= 2.5
            and variance_t <= 0.25
            and tab_body_gradient <= 1.5
            and eccentricity <= 1.0
        )

        p_reuse = probabilities[TriageClassEnum.REUSE.value]
        p_retire = probabilities[TriageClassEnum.RETIRE.value]

        if nominal_criteria_met and p_reuse >= 0.50:
            triage_class = TriageClassEnum.REUSE
            recommendation = (
                "Rapid screening eligibility result: Cell passed initial rapid screening thresholds. "
                "Candidate suitable for secondary evaluation for stationary battery applications."
            )
        elif p_retire >= 0.50 or dcir > 0.18:
            triage_class = TriageClassEnum.RETIRE
            recommendation = (
                "High impedance degradation detected: Cell capacity is severely diminished. "
                "Relegated to recycling; unfit for second-life applications."
            )
        else:
            triage_class = TriageClassEnum.INVESTIGATE
            recommendation = (
                "Quarantine for secondary laboratory testing: Cell exhibits intermediate impedance or "
                "spatial thermal non-uniformity requiring multi-hour cycling and EIS before final classification."
            )

    confidence = round(probabilities[triage_class.value], 4)

    # Step 4: Construct and return frozen DiagnosticPrediction
    return DiagnosticPrediction(
        cell_id=validated_cell_id,
        cycle_index=cycle_index,
        provenance=ProvenanceEnum.PREDICTED,
        triage_class=triage_class,
        confidence=confidence,
        class_probabilities=probabilities,
        extracted_features=features,
        recommendation=recommendation,
    )


def screen_telemetry(telemetry: BatteryPulseTelemetry) -> DiagnosticPrediction:
    """Extract canonical 14 features from telemetry and execute decision fusion triage."""
    features = extract_canonical_14_features(telemetry)
    return predict_diagnostic_triage(
        features=features,
        cell_id=telemetry.cell_id,
        cycle_index=telemetry.cycle_index,
    )
