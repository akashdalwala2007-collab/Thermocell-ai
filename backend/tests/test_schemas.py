"""Comprehensive unit tests for ThermoCell-AI Pydantic domain models and validation rules."""
import math
import pytest
from pydantic import ValidationError

from app.models.schemas_provenance import (
    ProvenanceEnum,
    TriageClassEnum,
    validate_physical_cell_id,
)
from app.models.schemas_battery import (
    TelemetryFrame,
    RelaxationTelemetry,
    BatteryPulseTelemetry,
    DiagnosticPrediction,
    ImmutableDict,
)


# =====================================================================
# 1. PhysicalCellId & Provenance Enums Tests
# =====================================================================

@pytest.mark.parametrize("valid_id", [
    "B0005",
    "HW-001",
    "CELL_A",
    "INR18650-25R",
    "CELL_42_TEST",
    "BICYCLE-01",
    "CELL-CYCLE-LIFE",
])
def test_valid_physical_cell_id(valid_id: str):
    """Physical cell IDs matching alphanumeric format without terminal cycle suffixes must pass."""
    assert validate_physical_cell_id(valid_id) == valid_id


@pytest.mark.parametrize("cycle_qualified_id", [
    "B0005-CYC40",
    "B0005_cycle10",
    "B0005-cyc01",
    "B0005_CYC10",
    "B0005-cycle40",
    "B0005CYC40",
    "HW-001-CYC5",
    "CELL_A_cyc99",
])
def test_reject_cycle_qualified_physical_cell_id(cycle_qualified_id: str):
    """Cycle-qualified identifiers must be explicitly rejected to prevent data leakage."""
    with pytest.raises(ValueError, match="composite cycle strings are prohibited"):
        validate_physical_cell_id(cycle_qualified_id)


@pytest.mark.parametrize("invalid_format", [
    "",
    "   ",
    "B0005@1",
    "B0005/1",
    "B0005#A",
    "-B0005",
    "B0005-",
])
def test_reject_invalid_physical_cell_id_format(invalid_format: str):
    """Malformed, empty, or special-character identifiers must be rejected."""
    with pytest.raises(ValueError):
        validate_physical_cell_id(invalid_format)


def test_reject_non_string_cell_id():
    """Non-string inputs to cell_id must raise ValueError."""
    with pytest.raises(ValueError, match="cell_id must be a string"):
        validate_physical_cell_id(12345)  # type: ignore


def test_provenance_enum_values():
    """Verify exact provenance enum values."""
    assert ProvenanceEnum.REAL.value == "REAL"
    assert ProvenanceEnum.SYNTHETIC.value == "SYNTHETIC"
    assert ProvenanceEnum.PREDICTED.value == "PREDICTED"


def test_triage_class_enum_values():
    """Verify exact triage class categories."""
    assert TriageClassEnum.REUSE.value == "REUSE"
    assert TriageClassEnum.RETIRE.value == "RETIRE"
    assert TriageClassEnum.INVESTIGATE.value == "INVESTIGATE"


# =====================================================================
# 2. TelemetryFrame Tests
# =====================================================================

def test_telemetry_frame_valid():
    """Valid hardware telemetry tick creates successfully."""
    frame_8x8 = [[25.0 + 0.1 * (r + c) for c in range(8)] for r in range(8)]
    frame = TelemetryFrame(
        cell_id="B0005",
        cycle_index=40,
        timestamp=0.1,
        voltage=3.85,
        current=3.0,
        bulk_temperature=25.5,
        thermal_frame_8x8=frame_8x8,
        provenance=ProvenanceEnum.SYNTHETIC,
    )
    assert frame.cell_id == "B0005"
    assert frame.timestamp == 0.1
    assert len(frame.thermal_frame_8x8) == 8


@pytest.mark.parametrize("bad_grid", [
    [[25.0] * 7 for _ in range(8)],       # 8x7
    [[25.0] * 8 for _ in range(7)],       # 7x8
    [[25.0] * 9 for _ in range(8)],       # 8x9
    [],                                   # empty
])
def test_telemetry_frame_reject_invalid_grid_dimensions(bad_grid):
    """Thermal frames not strictly 8x8 must raise ValidationError."""
    with pytest.raises(ValidationError, match="thermal_frame_8x8 must be exactly 8x8"):
        TelemetryFrame(
            cell_id="B0005",
            timestamp=0.0,
            voltage=3.85,
            current=3.0,
            bulk_temperature=25.0,
            thermal_frame_8x8=bad_grid,
            provenance=ProvenanceEnum.SYNTHETIC,
        )


def test_telemetry_frame_reject_non_finite():
    """Non-finite floats in telemetry frame must raise ValidationError."""
    grid_with_nan = [[25.0] * 8 for _ in range(8)]
    grid_with_nan[0][0] = float("nan")
    with pytest.raises(ValidationError, match="non-finite"):
        TelemetryFrame(
            cell_id="B0005",
            timestamp=0.0,
            voltage=3.85,
            current=3.0,
            bulk_temperature=25.0,
            thermal_frame_8x8=grid_with_nan,
            provenance=ProvenanceEnum.SYNTHETIC,
        )


def test_telemetry_frame_reject_cycle_in_cell_id():
    """TelemetryFrame must reject cycle-qualified cell_id."""
    grid = [[25.0] * 8 for _ in range(8)]
    with pytest.raises(ValidationError, match="composite cycle strings are prohibited"):
        TelemetryFrame(
            cell_id="B0005-CYC40",
            timestamp=0.0,
            voltage=3.85,
            current=3.0,
            bulk_temperature=25.0,
            thermal_frame_8x8=grid,
            provenance=ProvenanceEnum.SYNTHETIC,
        )


# =====================================================================
# 3. RelaxationTelemetry Tests
# =====================================================================

def make_valid_relaxation() -> RelaxationTelemetry:
    """Helper to generate valid 20-sample relaxation telemetry."""
    timestamps = [round(10.0 + 0.1 * i, 1) for i in range(20)]
    voltage = [3.60 + 0.005 * i for i in range(20)]
    bulk_temp = [28.0 - 0.02 * i for i in range(20)]
    return RelaxationTelemetry(
        duration_s=2.0,
        timestamps=timestamps,
        voltage=voltage,
        bulk_temperature=bulk_temp,
    )


def test_relaxation_telemetry_valid():
    """Valid 20-sample relaxation telemetry succeeds."""
    rel = make_valid_relaxation()
    assert len(rel.timestamps) == 20
    assert rel.timestamps[0] == 10.0
    assert rel.timestamps[-1] == 11.9
    assert rel.duration_s == 2.0


def test_relaxation_telemetry_reject_wrong_count():
    """Relaxation array length != 20 must raise ValidationError."""
    with pytest.raises(ValidationError, match="must contain exactly 20 samples"):
        RelaxationTelemetry(
            duration_s=2.0,
            timestamps=[round(10.0 + 0.1 * i, 1) for i in range(19)],
            voltage=[3.60] * 19,
            bulk_temperature=[28.0] * 19,
        )


def test_relaxation_telemetry_reject_timestamp_drift():
    """Relaxation timestamps deviating from round(10.0 + 0.1 * i, 1) by > 1e-4 must fail."""
    bad_ts = [round(10.0 + 0.1 * i, 1) for i in range(20)]
    bad_ts[5] = 10.55  # Expected 10.5
    with pytest.raises(ValidationError, match="Relaxation timestamp\\[5\\] must be 10.5"):
        RelaxationTelemetry(
            duration_s=2.0,
            timestamps=bad_ts,
            voltage=[3.60] * 20,
            bulk_temperature=[28.0] * 20,
        )


def test_relaxation_telemetry_reject_non_monotonic():
    """Relaxation timestamps that are non-monotonic or duplicated must fail."""
    bad_ts = [round(10.0 + 0.1 * i, 1) for i in range(20)]
    bad_ts[10] = bad_ts[9]  # duplicate
    with pytest.raises(ValidationError):
        RelaxationTelemetry(
            duration_s=2.0,
            timestamps=bad_ts,
            voltage=[3.60] * 20,
            bulk_temperature=[28.0] * 20,
        )


# =====================================================================
# 4. BatteryPulseTelemetry Tests
# =====================================================================

def make_valid_pulse_payload() -> dict:
    """Helper to build a valid 100-sample 3A active pulse payload."""
    timestamps = [round(0.1 * i, 1) for i in range(100)]
    voltage = [4.10 - 0.004 * i for i in range(100)]
    current = [3.0] * 100
    bulk_temp = [25.0 + 0.05 * i for i in range(100)]
    frames = [[[25.0 + 0.05 * i] * 8 for _ in range(8)] for i in range(100)]
    relaxation = make_valid_relaxation()

    return {
        "cell_id": "B0005",
        "cycle_index": 40,
        "provenance": ProvenanceEnum.SYNTHETIC,
        "v_pre_pulse": 4.15,
        "sampling_rate_hz": 10.0,
        "duration_s": 10.0,
        "timestamps": timestamps,
        "voltage": voltage,
        "current": current,
        "bulk_temperature": bulk_temp,
        "thermal_frames": frames,
        "relaxation": relaxation,
    }


def test_battery_pulse_telemetry_valid():
    """Compliant 10-second pulse payload validates cleanly."""
    payload = make_valid_pulse_payload()
    pulse = BatteryPulseTelemetry(**payload)
    assert pulse.cell_id == "B0005"
    assert len(pulse.timestamps) == 100
    assert len(pulse.thermal_frames) == 100
    assert pulse.relaxation.duration_s == 2.0


def test_battery_pulse_reject_sample_count():
    """Active pulse array length != 100 must fail."""
    payload = make_valid_pulse_payload()
    payload["timestamps"] = payload["timestamps"][:-1]  # 99 samples
    payload["voltage"] = payload["voltage"][:-1]
    payload["current"] = payload["current"][:-1]
    payload["bulk_temperature"] = payload["bulk_temperature"][:-1]
    payload["thermal_frames"] = payload["thermal_frames"][:-1]
    with pytest.raises(ValidationError, match="must contain exactly 100 samples"):
        BatteryPulseTelemetry(**payload)


def test_battery_pulse_reject_duplicate_timestamps():
    """Duplicate timestamps in active pulse must fail."""
    payload = make_valid_pulse_payload()
    payload["timestamps"][5] = payload["timestamps"][4]  # duplicate 0.4
    with pytest.raises(ValidationError):
        BatteryPulseTelemetry(**payload)


def test_battery_pulse_reject_out_of_order_timestamps():
    """Out-of-order timestamps must fail."""
    payload = make_valid_pulse_payload()
    payload["timestamps"][10], payload["timestamps"][11] = payload["timestamps"][11], payload["timestamps"][10]
    with pytest.raises(ValidationError):
        BatteryPulseTelemetry(**payload)


def test_battery_pulse_reject_current_out_of_bounds():
    """Discharge current deviating from 3.0A by > 0.05A must fail."""
    payload = make_valid_pulse_payload()
    payload["current"][10] = 3.10  # exceeds [2.95, 3.05]A
    with pytest.raises(ValidationError, match="violates fixed 3.0A pulse contract"):
        BatteryPulseTelemetry(**payload)


def test_battery_pulse_reject_non_8x8_thermal_frame():
    """Any frame inside thermal_frames not strictly 8x8 must fail."""
    payload = make_valid_pulse_payload()
    payload["thermal_frames"][5] = [[25.0] * 7 for _ in range(8)]
    with pytest.raises(ValidationError, match="thermal_frame at index 5 is not 8x8"):
        BatteryPulseTelemetry(**payload)


def test_battery_pulse_reject_missing_v_pre_pulse():
    """Missing, non-finite, or out-of-range v_pre_pulse baseline must fail."""
    # 1. Missing baseline
    payload_missing = make_valid_pulse_payload()
    del payload_missing["v_pre_pulse"]
    with pytest.raises(ValidationError, match="Field required"):
        BatteryPulseTelemetry(**payload_missing)

    # 2. Non-finite baseline (NaN)
    payload_nan = make_valid_pulse_payload()
    payload_nan["v_pre_pulse"] = float("nan")
    with pytest.raises(ValidationError):
        BatteryPulseTelemetry(**payload_nan)

    # 3. Out-of-range baseline (> 5.0V)
    payload_high = make_valid_pulse_payload()
    payload_high["v_pre_pulse"] = 5.5
    with pytest.raises(ValidationError):
        BatteryPulseTelemetry(**payload_high)


def test_battery_pulse_reject_cycle_qualified_cell_id():
    """BatteryPulseTelemetry must reject cycle-qualified cell IDs."""
    payload = make_valid_pulse_payload()
    payload["cell_id"] = "B0005_cycle10"
    with pytest.raises(ValidationError, match="composite cycle strings are prohibited"):
        BatteryPulseTelemetry(**payload)


def test_battery_pulse_voltage_range_accepted():
    """Voltage samples at exact 0.0V and 5.0V boundaries must be accepted."""
    payload = make_valid_pulse_payload()
    # 0.0V boundary accepted
    payload["voltage"] = [0.0] * 100
    pulse_low = BatteryPulseTelemetry(**payload)
    assert pulse_low.voltage[0] == 0.0

    # 5.0V boundary accepted
    payload["voltage"] = [5.0] * 100
    pulse_high = BatteryPulseTelemetry(**payload)
    assert pulse_high.voltage[-1] == 5.0


@pytest.mark.parametrize("invalid_voltage", [-0.01, -1.0, 5.01, 6.0])
def test_battery_pulse_voltage_range_rejected(invalid_voltage: float):
    """Voltage samples outside [0.0, 5.0]V must be rejected with ValueError."""
    payload = make_valid_pulse_payload()
    payload["voltage"][50] = invalid_voltage
    with pytest.raises(ValidationError, match="out of valid range \\[0.0, 5.0\\]V"):
        BatteryPulseTelemetry(**payload)



# =====================================================================
# 5. DiagnosticPrediction Tests & Deep Immutability
# =====================================================================

def make_valid_prediction_payload() -> dict:
    """Helper to build a valid DiagnosticPrediction payload."""
    canonical_features = {
        "OCV": 4.15,
        "DCIR": 0.095,
        "ΔV10": 0.38,
        "dV/dt_slope": 0.012,
        "V_recovery_rate": 0.025,
        "T_initial": 25.1,
        "ΔT_bulk": 2.4,
        "dT/dt_max": 0.35,
        "τ_cool": 45.2,
        "T_max_pixel": 28.5,
        "T_mean_cell": 26.8,
        "σ²_T": 0.42,
        "∇T_tab-body": 1.85,
        "hotspot_eccentricity": 0.22,
    }
    return {
        "cell_id": "B0005",
        "cycle_index": 40,
        "provenance": ProvenanceEnum.PREDICTED,
        "triage_class": TriageClassEnum.REUSE,
        "confidence": 0.85,
        "class_probabilities": {
            "REUSE": 0.85,
            "RETIRE": 0.05,
            "INVESTIGATE": 0.10,
        },
        "extracted_features": canonical_features,
        "recommendation": "Cell certified for Second-Life Tier 1 reuse.",
    }


def test_diagnostic_prediction_valid():
    """Valid diagnostic prediction validates cleanly."""
    payload = make_valid_prediction_payload()
    pred = DiagnosticPrediction(**payload)
    assert pred.triage_class == TriageClassEnum.REUSE
    assert pred.provenance == ProvenanceEnum.PREDICTED
    assert pred.confidence == 0.85
    assert pred.class_probabilities["REUSE"] == 0.85


def test_diagnostic_prediction_reject_non_predicted_provenance():
    """DiagnosticPrediction must strictly require provenance: PREDICTED."""
    payload = make_valid_prediction_payload()
    payload["provenance"] = ProvenanceEnum.REAL
    with pytest.raises(ValidationError):
        DiagnosticPrediction(**payload)


def test_diagnostic_prediction_reject_missing_keys():
    """Missing any of the 3 required class probabilities must fail."""
    payload = make_valid_prediction_payload()
    del payload["class_probabilities"]["INVESTIGATE"]
    payload["class_probabilities"]["REUSE"] = 0.95
    with pytest.raises(ValidationError, match="class_probabilities must contain exactly"):
        DiagnosticPrediction(**payload)


def test_diagnostic_prediction_reject_extra_keys():
    """Extra or unknown keys in class_probabilities must fail."""
    payload = make_valid_prediction_payload()
    payload["class_probabilities"]["UNKNOWN"] = 0.0
    with pytest.raises(ValidationError, match="class_probabilities must contain exactly"):
        DiagnosticPrediction(**payload)


def test_diagnostic_prediction_reject_sum_not_one():
    """Class probabilities not summing to 1.0 within 1e-4 tolerance must fail."""
    payload = make_valid_prediction_payload()
    payload["class_probabilities"]["REUSE"] = 0.90  # sum = 1.05
    with pytest.raises(ValidationError, match="class_probabilities must sum to 1.0"):
        DiagnosticPrediction(**payload)


def test_diagnostic_prediction_confidence_matching():
    """Confidence must match selected class probability within 1e-4 tolerance."""
    payload = make_valid_prediction_payload()
    # Deviation > 1e-4 must fail
    payload["confidence"] = 0.80  # Selected prob is 0.85
    with pytest.raises(ValidationError, match="confidence .* must match class_probabilities"):
        DiagnosticPrediction(**payload)

    # Deviation <= 1e-4 must succeed
    payload["confidence"] = 0.85005
    pred = DiagnosticPrediction(**payload)
    assert pred.confidence == 0.85005


def test_diagnostic_prediction_deep_immutability():
    """DiagnosticPrediction nested mappings must be deeply immutable while preserving read access."""
    payload = make_valid_prediction_payload()
    pred = DiagnosticPrediction(**payload)

    # 1. Read operations succeed normally
    assert pred.class_probabilities["REUSE"] == 0.85
    assert pred.class_probabilities.get("RETIRE") == 0.05
    assert "INVESTIGATE" in pred.class_probabilities
    assert len(pred.class_probabilities) == 3
    assert pred.extracted_features["OCV"] == 4.15

    # 2. In-place mutations must raise TypeError
    with pytest.raises(TypeError, match="ImmutableDict does not support item assignment"):
        pred.class_probabilities["REUSE"] = 0.99  # type: ignore

    with pytest.raises(TypeError, match="ImmutableDict does not support item deletion"):
        del pred.class_probabilities["RETIRE"]  # type: ignore

    with pytest.raises(TypeError, match="ImmutableDict does not support item removal"):
        pred.class_probabilities.pop("REUSE")  # type: ignore

    with pytest.raises(TypeError, match="ImmutableDict does not support in-place updates"):
        pred.class_probabilities.update({"REUSE": 0.99})  # type: ignore

    with pytest.raises(TypeError, match="ImmutableDict does not support in-place union"):
        pred.class_probabilities |= {"REUSE": 0.99}  # type: ignore

    with pytest.raises(TypeError, match="ImmutableDict does not support item assignment"):
        pred.extracted_features["OCV"] = 3.20  # type: ignore

    # 3. Model dump and JSON serialization succeed cleanly
    dump = pred.model_dump()
    assert dump["class_probabilities"]["REUSE"] == 0.85
    json_str = pred.model_dump_json()
    assert '"REUSE":0.85' in json_str or '"REUSE": 0.85' in json_str


# =====================================================================
# 6. Canonical 14 Extracted Features Tests
# =====================================================================

def test_diagnostic_prediction_canonical_14_features_accepted():
    """DiagnosticPrediction accepts exactly the canonical 14 features."""
    payload = make_valid_prediction_payload()
    pred = DiagnosticPrediction(**payload)
    assert len(pred.extracted_features) == 14
    assert "OCV" in pred.extracted_features
    assert "hotspot_eccentricity" in pred.extracted_features


def test_diagnostic_prediction_reject_missing_feature():
    """Missing any of the canonical 14 features must raise ValidationError."""
    payload = make_valid_prediction_payload()
    del payload["extracted_features"]["hotspot_eccentricity"]
    with pytest.raises(ValidationError, match="extracted_features must contain exactly the 14 canonical features"):
        DiagnosticPrediction(**payload)


def test_diagnostic_prediction_reject_extra_feature():
    """Extra or unknown features in extracted_features must raise ValidationError."""
    payload = make_valid_prediction_payload()
    payload["extracted_features"]["EXTRA_FEATURE"] = 1.0
    with pytest.raises(ValidationError, match="extracted_features must contain exactly the 14 canonical features"):
        DiagnosticPrediction(**payload)


def test_diagnostic_prediction_reject_empty_features():
    """Empty extracted_features mapping must raise ValidationError."""
    payload = make_valid_prediction_payload()
    payload["extracted_features"] = {}
    with pytest.raises(ValidationError, match="extracted_features must contain exactly the 14 canonical features"):
        DiagnosticPrediction(**payload)


def test_diagnostic_prediction_reject_non_finite_feature():
    """Non-finite value (NaN/Inf) in extracted_features must raise ValidationError."""
    payload = make_valid_prediction_payload()
    payload["extracted_features"]["OCV"] = float("nan")
    with pytest.raises(ValidationError, match="extracted_features\\['OCV'\\] must be a finite float"):
        DiagnosticPrediction(**payload)


# =====================================================================
# 7. cycle_index Constraints Tests (TelemetryFrame, Pulse, Prediction)
# =====================================================================

@pytest.mark.parametrize("valid_cycle", [None, 0, 1, 40, 1000])
def test_cycle_index_valid_values(valid_cycle):
    """cycle_index must accept None (unknown), 0, or positive integers across all models."""
    # 1. TelemetryFrame
    frame = TelemetryFrame(
        cell_id="B0005",
        cycle_index=valid_cycle,
        timestamp=0.0,
        voltage=3.85,
        current=3.0,
        bulk_temperature=25.0,
        thermal_frame_8x8=[[25.0] * 8 for _ in range(8)],
        provenance=ProvenanceEnum.SYNTHETIC,
    )
    assert frame.cycle_index == valid_cycle

    # 2. BatteryPulseTelemetry
    pulse_payload = make_valid_pulse_payload()
    pulse_payload["cycle_index"] = valid_cycle
    pulse = BatteryPulseTelemetry(**pulse_payload)
    assert pulse.cycle_index == valid_cycle

    # 3. DiagnosticPrediction
    pred_payload = make_valid_prediction_payload()
    pred_payload["cycle_index"] = valid_cycle
    pred = DiagnosticPrediction(**pred_payload)
    assert pred.cycle_index == valid_cycle


@pytest.mark.parametrize("invalid_cycle", [-1, -40])
def test_cycle_index_reject_negative(invalid_cycle):
    """Negative cycle_index values must be rejected across all models."""
    # 1. TelemetryFrame
    with pytest.raises(ValidationError):
        TelemetryFrame(
            cell_id="B0005",
            cycle_index=invalid_cycle,
            timestamp=0.0,
            voltage=3.85,
            current=3.0,
            bulk_temperature=25.0,
            thermal_frame_8x8=[[25.0] * 8 for _ in range(8)],
            provenance=ProvenanceEnum.SYNTHETIC,
        )

    # 2. BatteryPulseTelemetry
    pulse_payload = make_valid_pulse_payload()
    pulse_payload["cycle_index"] = invalid_cycle
    with pytest.raises(ValidationError):
        BatteryPulseTelemetry(**pulse_payload)

    # 3. DiagnosticPrediction
    pred_payload = make_valid_prediction_payload()
    pred_payload["cycle_index"] = invalid_cycle
    with pytest.raises(ValidationError):
        DiagnosticPrediction(**pred_payload)

