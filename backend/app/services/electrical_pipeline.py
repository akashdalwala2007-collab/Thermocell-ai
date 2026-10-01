"""Electrical pulse feature extraction and validation pipeline."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Optional

from app.models.schemas_provenance import ProvenanceEnum


@dataclass(frozen=True)
class ElectricalMetrics:
    """Computed electrical diagnostic metrics from 10s pulse and 2s relaxation."""
    ocv: float  # Pre-pulse open circuit voltage (V)
    dcir: float  # Ohmic direct current internal resistance (Ω)
    delta_v10: float  # Total 10-second voltage drop (V)
    dv_dt_slope: float  # Polarization slope between 1.0s and 9.9s (V/s)
    v_recovery_rate: float  # Post-pulse relaxation recovery rate (V/s)
    v_end_pulse: float  # Final loaded pulse voltage at t = 9.9s (V)
    v_end_relax: float  # Final recovery voltage at t = 11.9s (V)
    provenance: ProvenanceEnum


def validate_electrical_vectors(
    v_pre_pulse: float,
    timestamps: List[float],
    voltage: List[float],
    current: List[float],
    relax_timestamps: List[float],
    relax_voltage: List[float],
    nominal_current: float = 3.0,
    current_tolerance: float = 0.05,
) -> None:
    """Validate electrical data vectors against physical constraints and protocol contracts."""
    if not math.isfinite(v_pre_pulse) or v_pre_pulse < 0.0 or v_pre_pulse > 5.0:
        raise ValueError(f"v_pre_pulse ({v_pre_pulse}V) out of valid range [0.0, 5.0]V")

    if len(timestamps) != 100:
        raise ValueError(f"Active pulse timestamps must contain 100 samples, got {len(timestamps)}")
    if len(voltage) != 100:
        raise ValueError(f"Active pulse voltage must contain 100 samples, got {len(voltage)}")
    if len(current) != 100:
        raise ValueError(f"Active pulse current must contain 100 samples, got {len(current)}")

    if len(relax_timestamps) != 20:
        raise ValueError(f"Relaxation timestamps must contain 20 samples, got {len(relax_timestamps)}")
    if len(relax_voltage) != 20:
        raise ValueError(f"Relaxation voltage must contain 20 samples, got {len(relax_voltage)}")

    # Voltage range bounds
    for i, v in enumerate(voltage):
        if not math.isfinite(v) or v < 0.0 or v > 5.0:
            raise ValueError(f"Active voltage[{i}] ({v}V) out of valid range [0.0, 5.0]V")

    for i, v in enumerate(relax_voltage):
        if not math.isfinite(v) or v < 0.0 or v > 5.0:
            raise ValueError(f"Relaxation voltage[{i}] ({v}V) out of valid range [0.0, 5.0]V")

    # Current contract bounds (3.0A ± 0.05A)
    for i, c in enumerate(current):
        if not math.isfinite(c) or abs(c - nominal_current) > current_tolerance:
            raise ValueError(
                f"Current[{i}] ({c}A) violates {nominal_current}A ± {current_tolerance}A contract"
            )


def extract_electrical_features(
    v_pre_pulse: float,
    timestamps: List[float],
    voltage: List[float],
    current: List[float],
    relax_timestamps: List[float],
    relax_voltage: List[float],
    provenance: ProvenanceEnum = ProvenanceEnum.SYNTHETIC,
) -> ElectricalMetrics:
    """
    Extract canonical electrical features from 10s pulse and 2s relaxation:
    1. OCV: v_pre_pulse (unloaded OCV prior to pulse).
    2. DCIR: (v_pre_pulse - V(t = 0.0s)) / I(t = 0.0s).
    3. ΔV10: v_pre_pulse - V(t = 9.9s).
    4. dV/dt_slope: (V(t = 9.9s) - V(t = 1.0s)) / (9.9 - 1.0) s.
    5. V_recovery_rate: (V_relax(t = 11.9s) - V(t = 9.9s)) / 2.0 s.
    """
    validate_electrical_vectors(
        v_pre_pulse=v_pre_pulse,
        timestamps=timestamps,
        voltage=voltage,
        current=current,
        relax_timestamps=relax_timestamps,
        relax_voltage=relax_voltage,
    )

    ocv = float(v_pre_pulse)
    v_0 = float(voltage[0])
    i_0 = float(current[0])
    v_end = float(voltage[-1])
    v_relax_end = float(relax_voltage[-1])

    # 1. DCIR (immediate ohmic drop)
    ohmic_drop = max(0.0, ocv - v_0)
    dcir = ohmic_drop / i_0

    # 2. ΔV10 (total pulse drop)
    delta_v10 = max(0.0, ocv - v_end)

    # 3. dV/dt_slope (polarization rate between index 10 [1.0s] and index 99 [9.9s])
    # index 10 corresponds to t = 1.0s
    v_1s = float(voltage[10])
    dt_polarization = timestamps[-1] - timestamps[10]  # 9.9 - 1.0 = 8.9s
    dv_dt_slope = (v_end - v_1s) / dt_polarization if dt_polarization > 0 else 0.0

    # 4. V_recovery_rate (recovery over 2.0s relaxation)
    dt_relax = relax_timestamps[-1] - timestamps[-1]  # 11.9 - 9.9 = 2.0s
    v_recovery_rate = (v_relax_end - v_end) / dt_relax if dt_relax > 0 else 0.0

    return ElectricalMetrics(
        ocv=round(ocv, 4),
        dcir=round(dcir, 5),
        delta_v10=round(delta_v10, 4),
        dv_dt_slope=round(dv_dt_slope, 5),
        v_recovery_rate=round(v_recovery_rate, 5),
        v_end_pulse=round(v_end, 4),
        v_end_relax=round(v_relax_end, 4),
        provenance=provenance,
    )

