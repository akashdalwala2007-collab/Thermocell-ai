"""Canonical 14-feature extraction service and dataset assembly pipeline."""
from __future__ import annotations

import math
from pathlib import Path
from typing import Dict, List, Any, Optional, Union

import pandas as pd
from app.models.schemas_battery import (
    BatteryPulseTelemetry,
    CANONICAL_FEATURES,
)
from app.services.electrical_pipeline import extract_electrical_features
from app.services.thermal_pipeline import (
    compute_bulk_thermal_metrics,
    compute_frame_spatial_metrics,
)


def extract_canonical_14_features(telemetry: BatteryPulseTelemetry) -> Dict[str, float]:
    """
    Extract the canonical 14-dimensional feature vector from a BatteryPulseTelemetry payload.
    
    1. Electrical Domain (5 features):
       - OCV, DCIR, ΔV10, dV/dt_slope, V_recovery_rate
    2. Bulk Thermal Domain (4 features):
       - T_initial, ΔT_bulk, dT/dt_max, τ_cool
    3. Spatial Thermal Domain (5 features):
       - T_max_pixel, T_mean_cell, σ²_T, ∇T_tab-body, hotspot_eccentricity
    """
    # 1. Electrical Features
    elec = extract_electrical_features(
        v_pre_pulse=telemetry.v_pre_pulse,
        timestamps=telemetry.timestamps,
        voltage=telemetry.voltage,
        current=telemetry.current,
        relax_timestamps=telemetry.relaxation.timestamps,
        relax_voltage=telemetry.relaxation.voltage,
        provenance=telemetry.provenance,
    )

    # 2. Bulk Thermal Features
    bulk = compute_bulk_thermal_metrics(
        timestamps=telemetry.timestamps,
        bulk_temperature=telemetry.bulk_temperature,
        relaxation_timestamps=telemetry.relaxation.timestamps,
        relaxation_temperature=telemetry.relaxation.bulk_temperature,
        provenance=telemetry.provenance,
    )

    # 3. Spatial Thermal Features
    # Evaluated at the final active pulse frame (index 99, t = 9.9s) where heat accumulation is maximal
    final_frame = telemetry.thermal_frames[-1]
    spatial_final = compute_frame_spatial_metrics(final_frame, provenance=telemetry.provenance)

    # Peak pixel across all 100 frames during the active pulse
    t_max_overall = max(
        pixel
        for frame in telemetry.thermal_frames
        for row in frame
        for pixel in row
    )

    # Mean cell temperature over active cell footprint across all 100 frames
    mean_cell_all = []
    for frame in telemetry.thermal_frames:
        for r in range(1, 7):
            for c in range(2, 6):
                mean_cell_all.append(frame[r][c])
    t_mean_overall = sum(mean_cell_all) / len(mean_cell_all) if mean_cell_all else spatial_final.t_mean_cell

    features: Dict[str, float] = {
        "OCV": round(elec.ocv, 4),
        "DCIR": round(elec.dcir, 5),
        "ΔV10": round(elec.delta_v10, 4),
        "dV/dt_slope": round(elec.dv_dt_slope, 5),
        "V_recovery_rate": round(elec.v_recovery_rate, 5),
        "T_initial": round(bulk.t_initial, 3),
        "ΔT_bulk": round(bulk.delta_t_bulk, 3),
        "dT/dt_max": round(bulk.dt_dt_max, 4),
        "τ_cool": round(bulk.tau_cool, 2),
        "T_max_pixel": round(t_max_overall, 3),
        "T_mean_cell": round(t_mean_overall, 3),
        "σ²_T": round(spatial_final.thermal_variance, 4),
        "∇T_tab-body": round(spatial_final.tab_body_gradient, 3),
        "hotspot_eccentricity": round(spatial_final.hotspot_eccentricity, 3),
    }

    # Contract validation: strictly 14 canonical features and finite floats
    if set(features.keys()) != CANONICAL_FEATURES:
        raise ValueError(f"Extracted features mismatch: missing {CANONICAL_FEATURES - set(features.keys())}, extra {set(features.keys()) - CANONICAL_FEATURES}")

    for k, v in features.items():
        if not math.isfinite(v):
            raise ValueError(f"Extracted feature '{k}' is non-finite: {v}")

    return features


def assemble_feature_record(
    telemetry: BatteryPulseTelemetry,
    ground_truth_soh: Optional[float] = None,
    ground_truth_label: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Assemble a single row combining provenance, physical identity, canonical 14 features,
    and optional ground truth labels for ML dataset construction.
    """
    feats = extract_canonical_14_features(telemetry)
    record: Dict[str, Any] = {
        "cell_id": telemetry.cell_id,
        "cycle_index": telemetry.cycle_index,
        "telemetry_provenance": telemetry.provenance.value,
        **feats,
    }
    if ground_truth_soh is not None:
        record["ground_truth_soh"] = round(ground_truth_soh, 2)
    if ground_truth_label is not None:
        record["ground_truth_label"] = ground_truth_label

    return record


def export_features_dataset(records: List[Dict[str, Any]], output_path: Union[str, Path]) -> Path:
    """Export a collection of feature records to a CSV file."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df = pd.DataFrame(records)
    df.to_csv(path, index=False)
    return path
