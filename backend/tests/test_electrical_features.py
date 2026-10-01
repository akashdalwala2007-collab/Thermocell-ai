"""Unit tests for electrical feature extraction and protocol validation."""
import pytest
from app.models.schemas_provenance import ProvenanceEnum
from app.services.electrical_pipeline import (
    validate_electrical_vectors,
    extract_electrical_features,
)


class TestElectricalValidation:
    def test_valid_electrical_vectors_pass(self):
        v_pre = 4.15
        ts = [round(i * 0.1, 1) for i in range(100)]
        v = [3.85 - 0.05 * (t / 9.9) for t in ts]
        i = [3.0 for _ in range(100)]
        r_ts = [round(10.0 + k * 0.1, 1) for k in range(20)]
        r_v = [3.80 + 0.20 * (k / 19.0) for k in range(20)]

        validate_electrical_vectors(v_pre, ts, v, i, r_ts, r_v)

    def test_reject_v_pre_out_of_bounds(self):
        ts = [round(i * 0.1, 1) for i in range(100)]
        v = [3.85 for _ in range(100)]
        i = [3.0 for _ in range(100)]
        r_ts = [round(10.0 + k * 0.1, 1) for k in range(20)]
        r_v = [3.90 for _ in range(20)]

        with pytest.raises(ValueError, match="v_pre_pulse .* out of valid range"):
            validate_electrical_vectors(5.2, ts, v, i, r_ts, r_v)

    def test_reject_active_sample_count_mismatch(self):
        ts = [round(i * 0.1, 1) for i in range(99)]
        v = [3.85 for _ in range(99)]
        i = [3.0 for _ in range(99)]
        r_ts = [round(10.0 + k * 0.1, 1) for k in range(20)]
        r_v = [3.90 for _ in range(20)]

        with pytest.raises(ValueError, match="Active pulse timestamps must contain 100 samples"):
            validate_electrical_vectors(4.15, ts, v, i, r_ts, r_v)

    def test_reject_current_contract_violation(self):
        ts = [round(i * 0.1, 1) for i in range(100)]
        v = [3.85 for _ in range(100)]
        i = [3.0 for _ in range(100)]
        i[50] = 3.20  # Violates 3.0 ± 0.05A
        r_ts = [round(10.0 + k * 0.1, 1) for k in range(20)]
        r_v = [3.90 for _ in range(20)]

        with pytest.raises(ValueError, match="violates 3.0A ± 0.05A contract"):
            validate_electrical_vectors(4.15, ts, v, i, r_ts, r_v)


class TestFeatureExtraction:
    def test_exact_feature_calculation(self):
        v_pre = 4.20
        ts = [round(i * 0.1, 1) for i in range(100)]
        # Ohmic drop: V(t=0) = 3.90V -> ΔV0 = 0.30V at 3.0A -> DCIR = 0.10 Ω
        # At t=1.0s (index 10): V = 3.85V
        # At t=9.9s (index 99): V = 3.70V -> ΔV10 = 4.20 - 3.70 = 0.50V
        # dV/dt_slope = (3.70 - 3.85) / 8.9s = -0.15 / 8.9 ≈ -0.01685 V/s
        v = [3.90 - (0.20 * (t / 9.9)) for t in ts]
        i = [3.0 for _ in range(100)]

        # Relaxation: from 3.70V to 4.00V over 2.0s -> rate = +0.30 / 2.0 = +0.15 V/s
        r_ts = [round(10.0 + k * 0.1, 1) for k in range(20)]
        r_v = [3.70 + (0.30 * (k / 19.0)) for k in range(20)]

        feats = extract_electrical_features(v_pre, ts, v, i, r_ts, r_v, provenance=ProvenanceEnum.REAL)
        assert feats.ocv == 4.20
        assert abs(feats.dcir - 0.10) < 1e-4
        assert abs(feats.delta_v10 - 0.50) < 1e-4
        assert abs(feats.v_recovery_rate - 0.15) < 1e-4
        assert feats.provenance == ProvenanceEnum.REAL

