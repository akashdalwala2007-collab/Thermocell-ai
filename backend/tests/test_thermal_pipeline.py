"""Unit tests for AMG8833-compatible 8x8 spatial thermal processing and physics-informed generation."""
import pytest
import numpy as np

from app.models.schemas_provenance import ProvenanceEnum
from app.services.thermal_pipeline import (
    validate_8x8_frame,
    compute_frame_spatial_metrics,
    compute_bulk_thermal_metrics,
    PhysicsInformedThermalGenerator,
)


class TestThermalFrameValidation:
    def test_valid_8x8_frame_passes(self):
        frame = [[25.0 for _ in range(8)] for _ in range(8)]
        validate_8x8_frame(frame)

    def test_reject_wrong_row_count(self):
        frame = [[25.0 for _ in range(8)] for _ in range(7)]
        with pytest.raises(ValueError, match="must be a list of 8 rows"):
            validate_8x8_frame(frame)

    def test_reject_wrong_column_count(self):
        frame = [[25.0 for _ in range(8)] for _ in range(7)]
        frame.append([25.0 for _ in range(7)])
        with pytest.raises(ValueError, match="must contain exactly 8 elements"):
            validate_8x8_frame(frame)

    def test_reject_non_finite_pixel(self):
        frame = [[25.0 for _ in range(8)] for _ in range(8)]
        frame[3][4] = float("nan")
        with pytest.raises(ValueError, match="must be finite float"):
            validate_8x8_frame(frame)

    def test_reject_temperature_out_of_bounds(self):
        frame = [[25.0 for _ in range(8)] for _ in range(8)]
        frame[0][0] = 150.0  # Above 120°C upper limit
        with pytest.raises(ValueError, match="exceeds bounds"):
            validate_8x8_frame(frame)


class TestSpatialMetricsCalculation:
    def test_metrics_on_known_pattern(self):
        # Create a frame with base 24.0°C, cell body at 26.0°C, and hotspot at tab (row 0, col 3) at 30.0°C
        frame = [[24.0 for _ in range(8)] for _ in range(8)]
        for r in range(1, 7):
            for c in range(2, 6):
                frame[r][c] = 26.0
        frame[0][3] = 30.0

        metrics = compute_frame_spatial_metrics(frame, provenance=ProvenanceEnum.SYNTHETIC)
        assert metrics.t_max_pixel == 30.0
        assert metrics.t_mean_cell == 26.0
        assert metrics.thermal_variance > 0.0
        assert metrics.tab_body_gradient > 0.0  # Tab is hotter than body
        # Tab anchor is (0.5, 3.5), peak is at (0, 3) -> distance = sqrt((0-0.5)^2 + (3-3.5)^2) = sqrt(0.25 + 0.25) = sqrt(0.5) ≈ 0.707
        assert abs(metrics.hotspot_eccentricity - 0.707) < 0.01
        assert metrics.provenance == ProvenanceEnum.SYNTHETIC

    def test_sub_quantization_uniform_frame_zero_eccentricity(self):
        # Uniform frame where range < 0.25°C has no resolvable hotspot
        frame = [[24.0 for _ in range(8)] for _ in range(8)]
        metrics = compute_frame_spatial_metrics(frame)
        assert metrics.t_max_pixel == 24.0
        assert metrics.thermal_variance == 0.0
        assert metrics.hotspot_eccentricity == 0.0

    def test_sub_quantization_small_delta_zero_eccentricity(self):
        # Temperature difference 0.10°C < 0.25°C quantization step
        frame = [[24.0 for _ in range(8)] for _ in range(8)]
        frame[7][7] = 24.10  # Range = 0.10°C < 0.25°C
        metrics = compute_frame_spatial_metrics(frame)
        assert metrics.hotspot_eccentricity == 0.0


class TestBulkThermalMetrics:
    def test_metrics_calculation(self):
        ts = [round(i * 0.1, 1) for i in range(100)]
        # Temperature rises linearly from 24.0 to 26.5°C -> ΔT = 2.5°C, rate = 0.25°C/s
        temps = [round(24.0 + (2.5 / 9.9) * t, 3) for t in ts]

        relax_ts = [round(10.0 + i * 0.1, 1) for i in range(20)]
        # Cools from 26.5 to 26.0°C
        relax_temps = [round(26.5 - 0.5 * (i / 19.0), 3) for i in range(20)]

        bulk = compute_bulk_thermal_metrics(ts, temps, relax_ts, relax_temps, provenance=ProvenanceEnum.REAL)
        assert bulk.t_initial == 24.0
        assert bulk.delta_t_bulk == 2.5
        assert bulk.dt_dt_max > 0.0
        assert bulk.tau_cool > 0.0
        assert bulk.provenance == ProvenanceEnum.REAL

    def test_reject_invalid_sample_count(self):
        with pytest.raises(ValueError, match="Active pulse must have exactly 100 samples"):
            compute_bulk_thermal_metrics([0.0], [24.0], [10.0], [25.0])


class TestPhysicsInformedGenerator:
    def test_deterministic_generation(self):
        gen = PhysicsInformedThermalGenerator(ambient_temp=24.0)
        active_bulk, active_frames, relax_ts, relax_bulk = gen.generate_pulse_thermal_sequence(
            dcir=0.10,
            pulse_current=3.0,
        )

        assert len(active_bulk) == 100
        assert len(active_frames) == 100
        assert len(relax_ts) == 20
        assert len(relax_bulk) == 20

        # Check frame dimensions
        for frame in active_frames:
            validate_8x8_frame(frame)

        # Monotonic heating during active pulse: final bulk temperature > initial
        assert active_bulk[-1] > active_bulk[0]

        # Cooling during relaxation: final relax temperature <= end of active pulse
        assert relax_bulk[-1] <= active_bulk[-1]

        # Quantization verification: all frame elements should be multiples of 0.25°C
        for frame in active_frames:
            for r in frame:
                for val in r:
                    rem = round((val * 100) % 25, 2)
                    assert rem == 0.0 or rem == 25.0, f"Pixel {val} not a multiple of 0.25"
