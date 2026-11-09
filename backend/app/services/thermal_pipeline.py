"""AMG8833-compatible 8x8 spatial thermal processing pipeline and physics-informed synthetic generator."""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import List, Tuple, Dict, Any, Optional

import numpy as np
from app.models.schemas_provenance import ProvenanceEnum


@dataclass(frozen=True)
class SpatialThermalMetrics:
    """Computed spatial thermal metrics across an 8x8 frame or pulse sequence."""
    t_max_pixel: float
    t_mean_cell: float
    thermal_variance: float  # σ²_T
    tab_body_gradient: float  # ∇T_tab-body
    hotspot_eccentricity: float  # Distance in pixels from grid center to max pixel
    provenance: ProvenanceEnum


@dataclass(frozen=True)
class BulkThermalMetrics:
    """Computed bulk thermal metrics across a 10s active pulse and 2s relaxation."""
    t_initial: float
    delta_t_bulk: float
    dt_dt_max: float
    tau_cool: float
    provenance: ProvenanceEnum


def validate_8x8_frame(frame: List[List[float]], min_temp: float = -10.0, max_temp: float = 120.0) -> None:
    """
    Validate that a thermal frame is exactly 8x8, contains only finite floats,
    and falls within plausible physical battery operating temperatures.
    """
    if not isinstance(frame, list) or len(frame) != 8:
        raise ValueError(f"Thermal frame must be a list of 8 rows, got {len(frame) if isinstance(frame, list) else type(frame)}")

    for r_idx, row in enumerate(frame):
        if not isinstance(row, list) or len(row) != 8:
            raise ValueError(f"Thermal frame row {r_idx} must contain exactly 8 elements, got {len(row) if isinstance(row, list) else type(row)}")
        for c_idx, val in enumerate(row):
            if not isinstance(val, (int, float)) or not math.isfinite(val):
                raise ValueError(f"Thermal pixel at ({r_idx}, {c_idx}) must be finite float, got {val}")
            if val < min_temp or val > max_temp:
                raise ValueError(f"Thermal pixel at ({r_idx}, {c_idx}) ({val:.2f}°C) exceeds bounds [{min_temp}, {max_temp}]°C")


def compute_frame_spatial_metrics(
    frame: List[List[float]],
    provenance: ProvenanceEnum = ProvenanceEnum.SYNTHETIC,
    tab_anchor: Tuple[float, float] = (0.5, 3.5),
) -> SpatialThermalMetrics:
    """
    Extract AMG8833 8x8 spatial metrics from a single frame:
    - T_max_pixel: Maximum temperature across all 64 pixels.
    - T_mean_cell: Mean temperature across active cell body area (rows 1-6, cols 2-5).
    - thermal_variance (σ²_T): Spatial temperature variance across all 64 pixels.
    - tab_body_gradient (∇T_tab-body): T_mean(tab region: rows 0-1, cols 3-4) - T_mean(body: rows 3-6, cols 2-5).
    - hotspot_eccentricity: Euclidean distance in pixels between thermal peak / center and geometric tab anchor (0.5, 3.5).
    """
    validate_8x8_frame(frame)
    arr = np.array(frame, dtype=float)

    # 1. T_max_pixel and range
    t_max = float(np.max(arr))
    t_min = float(np.min(arr))
    temp_range = t_max - t_min

    # 2. T_mean_cell (active cell region: rows 1 to 6, columns 2 to 5)
    cell_region = arr[1:7, 2:6]
    t_mean_cell = float(np.mean(cell_region))

    # 3. Spatial variance σ²_T across all 64 pixels
    thermal_variance = float(np.var(arr))

    # 4. Tab-to-body thermal gradient
    # Terminal tab region: rows 0 to 1, columns 3 to 4
    tab_region = arr[0:2, 3:5]
    t_tab_mean = float(np.mean(tab_region))
    # Body region: rows 3 to 6, columns 2 to 5
    body_region = arr[3:7, 2:6]
    t_body_mean = float(np.mean(body_region))
    tab_body_gradient = float(t_tab_mean - t_body_mean)

    # 5. Hotspot eccentricity: distance from geometric tab anchor to max pixel.
    # Frames whose temperature range is below the 0.25°C AMG8833 quantization step
    # have no resolvable hotspot: do not report arbitrary np.argmax pixel and set eccentricity to 0.0.
    if temp_range < 0.25:
        eccentricity = 0.0
    else:
        peak_indices = np.unravel_index(np.argmax(arr), arr.shape)
        peak_r, peak_c = float(peak_indices[0]), float(peak_indices[1])
        dr = peak_r - tab_anchor[0]
        dc = peak_c - tab_anchor[1]
        eccentricity = float(math.sqrt(dr * dr + dc * dc))

    return SpatialThermalMetrics(
        t_max_pixel=round(t_max, 3),
        t_mean_cell=round(t_mean_cell, 3),
        thermal_variance=round(thermal_variance, 4),
        tab_body_gradient=round(tab_body_gradient, 3),
        hotspot_eccentricity=round(eccentricity, 3),
        provenance=provenance,
    )


def compute_bulk_thermal_metrics(
    timestamps: List[float],
    bulk_temperature: List[float],
    relaxation_timestamps: List[float],
    relaxation_temperature: List[float],
    provenance: ProvenanceEnum = ProvenanceEnum.SYNTHETIC,
) -> BulkThermalMetrics:
    """
    Extract bulk thermal metrics across 10s active pulse and 2s relaxation:
    - T_initial: Temperature at t = 0.0s.
    - ΔT_bulk: T(t = 9.9s) - T(t = 0.0s).
    - dT/dt_max: Maximum instantaneous heating rate during active pulse.
    - τ_cool: Exponential thermal cooling time constant estimated from relaxation decay.
    """
    if len(timestamps) != 100 or len(bulk_temperature) != 100:
        raise ValueError(f"Active pulse must have exactly 100 samples, got {len(timestamps)} timestamps, {len(bulk_temperature)} temps")
    if len(relaxation_timestamps) != 20 or len(relaxation_temperature) != 20:
        raise ValueError(f"Relaxation must have exactly 20 samples, got {len(relaxation_timestamps)} timestamps, {len(relaxation_temperature)} temps")

    t_initial = float(bulk_temperature[0])
    t_final = float(bulk_temperature[-1])
    delta_t_bulk = float(t_final - t_initial)

    # Maximum instantaneous heating rate (central / forward differences)
    rates = []
    for i in range(1, len(bulk_temperature)):
        dt = timestamps[i] - timestamps[i - 1]
        if dt > 1e-4:
            rate = (bulk_temperature[i] - bulk_temperature[i - 1]) / dt
            rates.append(rate)
    dt_dt_max = float(max(rates)) if rates else 0.0

    # Cooling time constant τ_cool:
    # Model: ΔT(t) = ΔT(t_end) * exp(-t / τ_cool)
    # Estimate from relaxation drop:
    t_relax_end = float(relaxation_temperature[-1])
    cooling_drop = t_final - t_relax_end
    if delta_t_bulk > 0.05 and cooling_drop > 0.001:
        # ΔT_end / (ΔT_end - cooling_drop)
        ratio = (t_relax_end - t_initial) / max(delta_t_bulk, 1e-4)
        if 0.0 < ratio < 1.0:
            tau_cool = float(-2.0 / math.log(ratio))
        else:
            tau_cool = 45.0  # Physical default thermal time constant for 18650 in still air
    else:
        tau_cool = 45.0

    # Clamp tau_cool to physically realistic range for cylindrical cell
    tau_cool = max(5.0, min(tau_cool, 300.0))

    return BulkThermalMetrics(
        t_initial=round(t_initial, 3),
        delta_t_bulk=round(delta_t_bulk, 3),
        dt_dt_max=round(dt_dt_max, 4),
        tau_cool=round(tau_cool, 2),
        provenance=provenance,
    )


class PhysicsInformedThermalGenerator:
    """
    Deterministic physics-informed thermal generator producing AMG8833-compatible 8x8 frames.
    
    Model:
    - Lumped capacitance thermal energy balance: m*c_p*(dT/dt) = I²*R_int - h*A*(T - T_amb)
    - 2D spatial Gaussian diffusion for terminal tab hotspot and cylindrical battery footprint.
    - Quantized to 0.25°C matching Panasonic AMG8833 sensor hardware resolution.
    - All generated frames carry explicit provenance: ProvenanceEnum.SYNTHETIC.
    """

    def __init__(
        self,
        ambient_temp: float = 24.0,
        thermal_mass_m_cp: float = 35.0,  # J/K (approx 45g cell * 800 J/(kg*K))
        convective_coeff_ha: float = 0.15,  # W/K (natural convection in air)
        quantization_step: float = 0.25,  # AMG8833 hardware quantization (0.25°C)
    ):
        self.ambient_temp = ambient_temp
        self.m_cp = thermal_mass_m_cp
        self.h_a = convective_coeff_ha
        self.quantization_step = quantization_step

    def generate_pulse_thermal_sequence(
        self,
        dcir: float,
        pulse_current: float = 3.0,
        active_duration_s: float = 10.0,
        relax_duration_s: float = 2.0,
        sample_rate_hz: float = 10.0,
        tab_resistance_ratio: float = 0.12,  # Localized tab contact resistance ratio
    ) -> Tuple[List[float], List[List[List[float]]], List[float], List[float]]:
        """
        Generate 100 active pulse thermal frames and 20 relaxation bulk temperatures.
        
        Returns:
        - active_bulk_temps: 100 bulk temperature readings
        - active_thermal_frames: 100 8x8 spatial temperature matrices (AMG8833 format)
        - relax_timestamps: 20 relaxation timestamps [10.0, 11.9]
        - relax_bulk_temps: 20 relaxation temperature readings
        """
        dt = 1.0 / sample_rate_hz
        num_active = int(round(active_duration_s * sample_rate_hz))
        num_relax = int(round(relax_duration_s * sample_rate_hz))

        current_temp = self.ambient_temp
        active_bulk: List[float] = []
        active_frames: List[List[List[float]]] = []

        # Coordinate grid for 8x8 AMG8833
        # Cell footprint centered along columns 3-4, spanning rows 1-6
        # Terminal tab located at row 0.5, col 3.5
        rows, cols = np.meshgrid(np.arange(8), np.arange(8), indexing='ij')
        tab_dist_sq = (rows - 0.5) ** 2 + (cols - 3.5) ** 2
        body_dist_sq = (rows - 3.5) ** 2 + ((cols - 3.5) * 1.5) ** 2

        # 1. Active Pulse Phase (Loaded: I = 3.0A)
        joule_heat = (pulse_current ** 2) * dcir  # Watts (I²R)
        tab_heat = (pulse_current ** 2) * (dcir * tab_resistance_ratio)

        for i in range(num_active):
            # Thermal bulk update
            dissipation = self.h_a * (current_temp - self.ambient_temp)
            dt_bulk = ((joule_heat - dissipation) / self.m_cp) * dt
            current_temp += dt_bulk
            active_bulk.append(round(current_temp, 3))

            # Spatial projection
            delta_t = max(0.0, current_temp - self.ambient_temp)
            # Body heat distribution (smooth Gaussian)
            body_pattern = np.exp(-body_dist_sq / 8.0)
            # Tab hotspot distribution (tighter Gaussian at top tab)
            tab_pattern = np.exp(-tab_dist_sq / 2.5) * 1.8

            frame_arr = self.ambient_temp + delta_t * (0.65 * body_pattern + 0.35 * tab_pattern)
            # Apply AMG8833 sensor quantization (0.25°C)
            if self.quantization_step > 0:
                frame_arr = np.round(frame_arr / self.quantization_step) * self.quantization_step

            # Convert to list of lists
            frame_list = [[round(float(frame_arr[r, c]), 2) for c in range(8)] for r in range(8)]
            active_frames.append(frame_list)

        # 2. Post-Pulse Relaxation Phase (Unloaded: I = 0.0A)
        relax_timestamps = [round(active_duration_s + i * dt, 1) for i in range(num_relax)]
        relax_bulk: List[float] = []

        for _ in range(num_relax):
            dissipation = self.h_a * (current_temp - self.ambient_temp)
            dt_bulk = (-dissipation / self.m_cp) * dt
            current_temp += dt_bulk
            relax_bulk.append(round(current_temp, 3))

        return active_bulk, active_frames, relax_timestamps, relax_bulk
