"""Unit tests for ML service, Decision Fusion layer, and safety tripwires."""
import pytest
from app.models.schemas_provenance import ProvenanceEnum, TriageClassEnum
from app.models.schemas_battery import DiagnosticPrediction
from app.services.ml_service import (
    predict_diagnostic_triage,
    screen_telemetry,
    normalize_probabilities,
    get_health_model,
    get_pattern_model,
)
from app.services.telemetry_source import SyntheticPulseSource


@pytest.fixture
def nominal_features():
    """Canonical 14 features representing a healthy, early-life cell (Cycle 1)."""
    return {
        "OCV": 4.143,
        "DCIR": 0.091,
        "ΔV10": 0.2933,
        "dV/dt_slope": -0.00201,
        "V_recovery_rate": 0.1373,
        "T_initial": 24.002,
        "ΔT_bulk": 0.227,
        "dT/dt_max": 0.03,
        "τ_cool": 226.0,
        "T_max_pixel": 24.25,
        "T_mean_cell": 24.016,
        "σ²_T": 0.0082,
        "∇T_tab-body": 0.188,
        "hotspot_eccentricity": 1.0,
    }


@pytest.fixture
def marginal_features():
    """Canonical 14 features representing an intermediate/marginal cell (Cycle 85)."""
    return {
        "OCV": 4.126,
        "DCIR": 0.142,
        "ΔV10": 0.4463,
        "dV/dt_slope": -0.00201,
        "V_recovery_rate": 0.2138,
        "T_initial": 24.004,
        "ΔT_bulk": 0.354,
        "dT/dt_max": 0.04,
        "τ_cool": 176.0,
        "T_max_pixel": 24.25,
        "T_mean_cell": 24.049,
        "σ²_T": 0.0126,
        "∇T_tab-body": 0.125,
        "hotspot_eccentricity": 2.5,
    }


@pytest.fixture
def degraded_features():
    """Canonical 14 features representing an aged, degraded cell (Cycle 160)."""
    return {
        "OCV": 4.116,
        "DCIR": 0.215,
        "ΔV10": 0.6653,
        "dV/dt_slope": -0.00201,
        "V_recovery_rate": 0.3233,
        "T_initial": 24.006,
        "ΔT_bulk": 0.535,
        "dT/dt_max": 0.06,
        "τ_cool": 266.5,
        "T_max_pixel": 24.5,
        "T_mean_cell": 24.106,
        "σ²_T": 0.0193,
        "∇T_tab-body": 0.156,
        "hotspot_eccentricity": 2.55,
    }


def test_models_loaded_successfully():
    """Model 1 and Model 2 serialized artifacts must load successfully."""
    h_model = get_health_model()
    p_model = get_pattern_model()
    assert h_model is not None
    assert p_model is not None
    assert "pipeline" in h_model
    assert "pipeline" in p_model


def test_normalize_probabilities_sum_to_one():
    """Class probabilities must strictly sum to 1.0 within 1e-4."""
    probs = normalize_probabilities({"REUSE": 0.73, "INVESTIGATE": 0.21, "RETIRE": 0.06})
    assert abs(sum(probs.values()) - 1.0) <= 1e-4
    assert all(0.0 <= p <= 1.0 for p in probs.values())


def test_nominal_cell_predicts_reuse(nominal_features):
    """Healthy cell features must classify as REUSE with high confidence."""
    pred = predict_diagnostic_triage(nominal_features, cell_id="B0005", cycle_index=1)
    assert isinstance(pred, DiagnosticPrediction)
    assert pred.triage_class == TriageClassEnum.REUSE
    assert pred.provenance == ProvenanceEnum.PREDICTED
    assert pred.confidence == pred.class_probabilities[TriageClassEnum.REUSE.value]
    assert abs(sum(pred.class_probabilities.values()) - 1.0) <= 1e-4


def test_degraded_cell_predicts_retire(degraded_features):
    """Aged/degraded cell features must classify as RETIRE with safety lockout."""
    pred = predict_diagnostic_triage(degraded_features, cell_id="B0005", cycle_index=160)
    assert pred.triage_class == TriageClassEnum.RETIRE
    assert pred.confidence == pred.class_probabilities[TriageClassEnum.RETIRE.value]
    assert "SAFETY LOCKOUT" in pred.recommendation or "DCIR" in pred.recommendation


def test_safety_tripwire_precedence():
    """Even if voltage is nominal, extreme DCIR (>0.20Ω) must force RETIRE."""
    features = {
        "OCV": 4.143,
        "DCIR": 0.250,  # Extreme resistance: tripwire
        "ΔV10": 0.300,
        "dV/dt_slope": -0.002,
        "V_recovery_rate": 0.150,
        "T_initial": 24.0,
        "ΔT_bulk": 0.25,
        "dT/dt_max": 0.03,
        "τ_cool": 220.0,
        "T_max_pixel": 24.2,
        "T_mean_cell": 24.0,
        "σ²_T": 0.008,
        "∇T_tab-body": 0.15,
        "hotspot_eccentricity": 1.0,
    }
    pred = predict_diagnostic_triage(features, cell_id="B0005")
    assert pred.triage_class == TriageClassEnum.RETIRE
    assert pred.class_probabilities[TriageClassEnum.RETIRE.value] >= 0.90
    assert "SAFETY LOCKOUT" in pred.recommendation


def test_screen_telemetry_end_to_end():
    """screen_telemetry must ingest BatteryPulseTelemetry and output valid DiagnosticPrediction."""
    source = SyntheticPulseSource()
    telemetry = source.get_pulse_telemetry("B0005", cycle_index=40, dcir=0.105)
    pred = screen_telemetry(telemetry)
    assert pred.cell_id == "B0005"
    assert pred.cycle_index == 40
    assert pred.provenance == ProvenanceEnum.PREDICTED
    assert pred.triage_class in [TriageClassEnum.REUSE, TriageClassEnum.INVESTIGATE, TriageClassEnum.RETIRE]
    assert abs(sum(pred.class_probabilities.values()) - 1.0) <= 1e-4


def test_prediction_deep_immutability(nominal_features):
    """DiagnosticPrediction fields and sub-dictionaries must be immutable."""
    pred = predict_diagnostic_triage(nominal_features, cell_id="B0005")
    with pytest.raises(Exception):
        pred.confidence = 0.5
    with pytest.raises(Exception):
        pred.class_probabilities["REUSE"] = 0.5
