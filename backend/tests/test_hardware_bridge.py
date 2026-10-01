"""Unit tests for hardware bridge streaming and buffer ingestion."""
import pytest
from app.models.schemas_provenance import ProvenanceEnum, TriageClassEnum
from app.models.schemas_battery import BatteryPulseTelemetry, DiagnosticPrediction
from app.services.telemetry_source import HardwareBufferSource
from app.services.ml_service import screen_telemetry
from hardware.serial_bridge import generate_mock_hardware_stream, ingest_stream_into_buffer


def test_mock_hardware_stream_packet_counts():
    """Mock hardware stream must emit exactly 1 baseline, 100 active frames, 20 relax frames, and 1 complete event."""
    packets = list(generate_mock_hardware_stream(cell_id="HW-001", cycle_index=1))
    assert len(packets) == 122  # 1 baseline + 100 active + 20 relaxation + 1 completion
    assert packets[0]["event"] == "PRE_PULSE_BASELINE"
    assert packets[-1]["event"] == "PULSE_SEQUENCE_COMPLETE"


def test_hardware_bridge_buffer_aggregation():
    """Hardware buffer must aggregate streamed frames into valid BatteryPulseTelemetry with REAL provenance."""
    buffer = HardwareBufferSource()
    stream = generate_mock_hardware_stream(cell_id="HW-001", cycle_index=5, v_pre_pulse=4.15)
    
    ingest_stream_into_buffer(stream, buffer)
    telemetry = buffer.get_pulse_telemetry(cell_id="HW-001", cycle_index=5)

    assert isinstance(telemetry, BatteryPulseTelemetry)
    assert telemetry.cell_id == "HW-001"
    assert telemetry.cycle_index == 5
    assert telemetry.provenance == ProvenanceEnum.REAL
    assert telemetry.v_pre_pulse == 4.15
    assert len(telemetry.timestamps) == 100
    assert len(telemetry.voltage) == 100
    assert len(telemetry.current) == 100
    assert len(telemetry.bulk_temperature) == 100
    assert len(telemetry.thermal_frames) == 100
    assert len(telemetry.relaxation.timestamps) == 20


def test_hardware_payload_decision_fusion():
    """Aggregated hardware telemetry must run through feature extraction and ML decision fusion."""
    buffer = HardwareBufferSource()
    stream = generate_mock_hardware_stream(cell_id="HW-002", dcir=0.092, v_pre_pulse=4.14)
    ingest_stream_into_buffer(stream, buffer)
    telemetry = buffer.get_pulse_telemetry(cell_id="HW-002")

    prediction = screen_telemetry(telemetry)
    assert isinstance(prediction, DiagnosticPrediction)
    assert prediction.cell_id == "HW-002"
    assert prediction.provenance == ProvenanceEnum.PREDICTED
    assert prediction.triage_class in [TriageClassEnum.REUSE, TriageClassEnum.INVESTIGATE, TriageClassEnum.RETIRE]
    assert abs(sum(prediction.class_probabilities.values()) - 1.0) <= 1e-4
