"""Unit tests for canonical 14-feature extraction service and dataset assembly."""
import math
from pathlib import Path
from app.models.schemas_battery import CANONICAL_FEATURES
from app.services.telemetry_source import SyntheticPulseSource
from app.services.feature_service import (
    extract_canonical_14_features,
    assemble_feature_record,
    export_features_dataset,
)


class TestFeatureService:
    def test_extract_all_14_canonical_features(self):
        source = SyntheticPulseSource()
        telemetry = source.get_pulse_telemetry("B0005", cycle_index=1, dcir=0.095)

        feats = extract_canonical_14_features(telemetry)
        assert set(feats.keys()) == CANONICAL_FEATURES
        assert len(feats) == 14

        for k, v in feats.items():
            assert isinstance(v, (int, float))
            assert math.isfinite(v), f"Feature {k} must be finite float"

        # Check physical expectations for healthy 0.095Ω cell
        assert 3.5 <= feats["OCV"] <= 4.3
        assert 0.08 <= feats["DCIR"] <= 0.12
        assert feats["ΔV10"] > feats["DCIR"] * 3.0  # Total drop includes ohmic + polarization
        assert feats["ΔT_bulk"] > 0.0
        assert feats["T_max_pixel"] >= feats["T_initial"]

    def test_assemble_feature_record(self):
        source = SyntheticPulseSource()
        telemetry = source.get_pulse_telemetry("B0006", cycle_index=50, dcir=0.115)

        record = assemble_feature_record(telemetry, ground_truth_soh=81.05, ground_truth_label="REUSE")
        assert record["cell_id"] == "B0006"
        assert record["cycle_index"] == 50
        assert record["telemetry_provenance"] == "SYNTHETIC"
        assert record["ground_truth_soh"] == 81.05
        assert record["ground_truth_label"] == "REUSE"

        for feat_name in CANONICAL_FEATURES:
            assert feat_name in record

    def test_export_features_dataset(self, tmp_path: Path):
        source = SyntheticPulseSource()
        telemetry = source.get_pulse_telemetry("B0007", cycle_index=1, dcir=0.09)
        record = assemble_feature_record(telemetry)

        out_csv = tmp_path / "test_features.csv"
        saved = export_features_dataset([record], out_csv)
        assert saved.exists()

        content = saved.read_text(encoding="utf-8")
        assert "cell_id" in content
        assert "B0007" in content
        assert "DCIR" in content

