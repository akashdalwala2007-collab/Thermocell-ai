"""Unit tests for 10-second rapid diagnostic screening representation."""
import pytest
from app.models.schemas_provenance import TriageClassEnum
from app.services.diagnostic_screening import (
    evaluate_screening_hierarchy,
    screen_battery_pulse,
    RAPID_SCREENING_DISCLAIMER,
)
from app.services.telemetry_source import SyntheticPulseSource


def get_base_features() -> dict:
    """Nominal base features qualifying for REUSE."""
    return {
        "OCV": 4.15,
        "DCIR": 0.095,
        "ΔV10": 0.35,
        "dV/dt_slope": -0.002,
        "V_recovery_rate": 0.14,
        "T_initial": 24.0,
        "ΔT_bulk": 1.2,
        "dT/dt_max": 0.15,
        "τ_cool": 45.0,
        "T_max_pixel": 25.5,
        "T_mean_cell": 24.5,
        "σ²_T": 0.08,
        "∇T_tab-body": 0.8,
        "hotspot_eccentricity": 0.5,
    }


class TestScreeningHierarchy:
    def test_nominal_criteria_yields_reuse(self):
        feats = get_base_features()
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.REUSE
        assert "Rapid screening eligibility result" in verdict.action_recommendation
        assert verdict.explainability.elevated_dcir_severity == "NOMINAL"
        assert verdict.explainability.abnormal_delta_t_severity == "NOMINAL"
        assert verdict.explainability.spatial_uniformity_status == "UNIFORM"
        assert verdict.scientific_disclaimer == RAPID_SCREENING_DISCLAIMER

    def test_dcir_retire_tripwire(self):
        feats = get_base_features()
        feats["DCIR"] = 0.22  # Exceeds 0.20Ω limit
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.RETIRE
        assert "Safety lockout triggered" in verdict.action_recommendation
        assert verdict.explainability.elevated_dcir_severity == "CRITICAL"

    def test_delta_v10_retire_tripwire(self):
        feats = get_base_features()
        feats["ΔV10"] = 0.65  # Exceeds 0.60V collapse limit
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.RETIRE
        assert "Pulse drop ΔV10" in verdict.explainability.contributing_reasons[0]

    def test_bulk_thermal_retire_tripwire(self):
        feats = get_base_features()
        feats["ΔT_bulk"] = 5.0  # Exceeds 4.5°C overheat limit
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.RETIRE
        assert verdict.explainability.abnormal_delta_t_severity == "CRITICAL"

    def test_pixel_thermal_retire_tripwire(self):
        feats = get_base_features()
        feats["T_initial"] = 24.0
        feats["T_max_pixel"] = 29.0  # Rise = 5.0°C > 4.5°C
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.RETIRE
        assert any("hotspot runaway" in r for r in verdict.explainability.contributing_reasons)

    def test_intermediate_dcir_yields_investigate(self):
        feats = get_base_features()
        feats["DCIR"] = 0.15  # Between 0.1167 and 0.20Ω
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.INVESTIGATE
        assert "Quarantine for secondary laboratory testing" in verdict.action_recommendation
        assert verdict.explainability.elevated_dcir_severity == "MODERATE"

    def test_spatial_thermal_anomaly_yields_investigate(self):
        feats = get_base_features()
        feats["σ²_T"] = 0.35  # Exceeds 0.25°C² limit
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.INVESTIGATE
        assert verdict.explainability.spatial_uniformity_status == "ANOMALOUS"

    def test_tab_body_gradient_yields_investigate(self):
        feats = get_base_features()
        feats["∇T_tab-body"] = 1.8  # Exceeds 1.5°C limit
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.INVESTIGATE

    def test_hotspot_eccentricity_yields_investigate(self):
        feats = get_base_features()
        feats["hotspot_eccentricity"] = 2.2  # Exceeds 1.0 px limit
        verdict = evaluate_screening_hierarchy(feats)
        assert verdict.triage_class == TriageClassEnum.INVESTIGATE
        assert verdict.explainability.hotspot_location_status == "OFF_AXIS"


class TestEndToEndScreening:
    def test_screen_battery_pulse_healthy(self):
        source = SyntheticPulseSource()
        telemetry = source.get_pulse_telemetry("B0005", cycle_index=1, dcir=0.09)
        verdict = screen_battery_pulse(telemetry)
        assert verdict.triage_class == TriageClassEnum.REUSE
        assert verdict.scientific_disclaimer == RAPID_SCREENING_DISCLAIMER

    def test_screen_battery_pulse_degraded(self):
        source = SyntheticPulseSource()
        telemetry = source.get_pulse_telemetry("B0005", cycle_index=160, dcir=0.22)
        verdict = screen_battery_pulse(telemetry)
        assert verdict.triage_class == TriageClassEnum.RETIRE

