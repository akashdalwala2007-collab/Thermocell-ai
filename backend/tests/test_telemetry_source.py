"""Unit tests for TelemetrySource abstraction, SyntheticPulseSource, and HardwareBufferSource."""
import pytest
from app.models.schemas_provenance import ProvenanceEnum
from app.models.schemas_battery import BatteryPulseTelemetry, TelemetryFrame
from app.services.telemetry_source import SyntheticPulseSource, HardwareBufferSource


class TestSyntheticPulseSource:
    def test_generates_valid_battery_pulse_telemetry(self):
        source = SyntheticPulseSource(ambient_temp=24.0)
        pulse = source.get_pulse_telemetry(
            cell_id="B0005",
            cycle_index=40,
            ocv=4.12,
            dcir=0.10,
        )

        assert isinstance(pulse, BatteryPulseTelemetry)
        assert pulse.cell_id == "B0005"
        assert pulse.cycle_index == 40
        assert pulse.provenance == ProvenanceEnum.SYNTHETIC
        assert pulse.v_pre_pulse == 4.12
        assert len(pulse.timestamps) == 100
        assert len(pulse.voltage) == 100
        assert len(pulse.current) == 100
        assert len(pulse.bulk_temperature) == 100
        assert len(pulse.thermal_frames) == 100
        assert len(pulse.relaxation.timestamps) == 20
        assert len(pulse.relaxation.voltage) == 20

    def test_reject_composite_cycle_string(self):
        source = SyntheticPulseSource()
        with pytest.raises(ValueError, match="composite cycle strings are prohibited"):
            source.get_pulse_telemetry(cell_id="B0005-CYC40", cycle_index=40)


class TestHardwareBufferSource:
    def test_hardware_buffering_lifecycle(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)

        # Feed 100 active frames
        for i in range(100):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=5,
                timestamp=round(i * 0.1, 1),
                voltage=round(3.85 - 0.05 * (i / 99.0), 3),
                current=3.0,
                bulk_temperature=round(24.0 + 1.5 * (i / 99.0), 2),
                thermal_frame_8x8=[[24.5 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_active_frame(frame)

        # Feed 20 relaxation frames
        for k in range(20):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=5,
                timestamp=round(10.0 + k * 0.1, 1),
                voltage=round(3.80 + 0.20 * (k / 19.0), 3),
                current=0.0,
                bulk_temperature=25.5,
                thermal_frame_8x8=[[25.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_relaxation_frame(frame)

        pulse = source.get_pulse_telemetry("HW-001", cycle_index=5)
        assert isinstance(pulse, BatteryPulseTelemetry)
        assert pulse.cell_id == "HW-001"
        assert pulse.cycle_index == 5
        assert pulse.provenance == ProvenanceEnum.REAL
        assert pulse.v_pre_pulse == 4.15

        # Verify buffer was cleared on success
        assert source._pre_pulse_voltage is None
        assert len(source._active_frames) == 0
        assert len(source._relax_frames) == 0

    def test_manual_reset(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)
        frame = TelemetryFrame(
            cell_id="HW-001",
            cycle_index=1,
            timestamp=0.0,
            voltage=3.85,
            current=3.0,
            bulk_temperature=24.0,
            thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
            provenance=ProvenanceEnum.REAL,
        )
        source.ingest_active_frame(frame)
        source.reset()
        assert source._pre_pulse_voltage is None
        assert len(source._active_frames) == 0
        assert len(source._relax_frames) == 0

    def test_hardware_buffer_rejects_incomplete(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)
        with pytest.raises(ValueError, match="Hardware buffer requires exactly 100 active frames"):
            source.get_pulse_telemetry("HW-001")

    def test_reject_frame_cell_id_mismatch_and_preserves_buffer(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)
        for i in range(100):
            cid = "HW-002" if i == 50 else "HW-001"
            frame = TelemetryFrame(
                cell_id=cid,
                cycle_index=1,
                timestamp=round(i * 0.1, 1),
                voltage=3.85,
                current=3.0,
                bulk_temperature=24.0,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_active_frame(frame)

        for k in range(20):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=1,
                timestamp=round(10.0 + k * 0.1, 1),
                voltage=3.90,
                current=0.0,
                bulk_temperature=24.5,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_relaxation_frame(frame)

        with pytest.raises(ValueError, match="Active frame at index 50 has cell_id 'HW-002'"):
            source.get_pulse_telemetry("HW-001", cycle_index=1)

        # Buffer must be preserved when validation fails
        assert len(source._active_frames) == 100
        assert len(source._relax_frames) == 20
        assert source._pre_pulse_voltage == 4.15

    def test_reject_frame_cycle_index_mismatch_and_preserves_buffer(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)
        for i in range(100):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=1,
                timestamp=round(i * 0.1, 1),
                voltage=3.85,
                current=3.0,
                bulk_temperature=24.0,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_active_frame(frame)

        for k in range(20):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=2 if k == 10 else 1,  # Cycle mismatch
                timestamp=round(10.0 + k * 0.1, 1),
                voltage=3.90,
                current=0.0,
                bulk_temperature=24.5,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_relaxation_frame(frame)

        with pytest.raises(ValueError, match="Relaxation frame at index 10 has cycle_index 2"):
            source.get_pulse_telemetry("HW-001", cycle_index=1)

        assert len(source._relax_frames) == 20

    def test_reject_frame_provenance_not_real_and_preserves_buffer(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)
        for i in range(100):
            prov = ProvenanceEnum.SYNTHETIC if i == 0 else ProvenanceEnum.REAL
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=1,
                timestamp=round(i * 0.1, 1),
                voltage=3.85,
                current=3.0,
                bulk_temperature=24.0,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=prov,
            )
            source.ingest_active_frame(frame)

        for k in range(20):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=1,
                timestamp=round(10.0 + k * 0.1, 1),
                voltage=3.90,
                current=0.0,
                bulk_temperature=24.5,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_relaxation_frame(frame)

        with pytest.raises(ValueError, match="Active frame at index 0 has provenance"):
            source.get_pulse_telemetry("HW-001", cycle_index=1)

        assert len(source._active_frames) == 100

    def test_omitted_cycle_index_derived_from_buffered_frames(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)
        for i in range(100):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=42,  # All frames have cycle_index 42
                timestamp=round(i * 0.1, 1),
                voltage=3.85,
                current=3.0,
                bulk_temperature=24.0,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_active_frame(frame)

        for k in range(20):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=42,
                timestamp=round(10.0 + k * 0.1, 1),
                voltage=3.90,
                current=0.0,
                bulk_temperature=24.5,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_relaxation_frame(frame)

        # Call without cycle_index
        pulse = source.get_pulse_telemetry("HW-001")
        assert pulse.cycle_index == 42
        assert len(source._active_frames) == 0  # Cleared after success

    def test_omitted_cycle_index_disagreement_rejected_and_preserves_buffer(self):
        source = HardwareBufferSource()
        source.set_pre_pulse_baseline(4.15)
        for i in range(100):
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=42,
                timestamp=round(i * 0.1, 1),
                voltage=3.85,
                current=3.0,
                bulk_temperature=24.0,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_active_frame(frame)

        for k in range(20):
            # One relaxation frame disagrees on cycle_index
            c_idx = 43 if k == 5 else 42
            frame = TelemetryFrame(
                cell_id="HW-001",
                cycle_index=c_idx,
                timestamp=round(10.0 + k * 0.1, 1),
                voltage=3.90,
                current=0.0,
                bulk_temperature=24.5,
                thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
                provenance=ProvenanceEnum.REAL,
            )
            source.ingest_relaxation_frame(frame)

        with pytest.raises(ValueError, match="Relaxation frame at index 5 has cycle_index 43, expected 42"):
            source.get_pulse_telemetry("HW-001")

        assert len(source._active_frames) == 100
        assert len(source._relax_frames) == 20

    def test_buffer_lock_exists_and_is_reentrant(self):
        import threading
        source = HardwareBufferSource()
        assert hasattr(source, "_lock")
        # RLock allows re-entrant acquisition by the same thread
        with source._lock:
            with source._lock:
                source.set_pre_pulse_baseline(4.10)
        assert source._pre_pulse_voltage == 4.10

    def test_ingest_appends_exactly_once(self):
        source = HardwareBufferSource()
        frame = TelemetryFrame(
            cell_id="HW-001",
            cycle_index=1,
            timestamp=0.0,
            voltage=3.85,
            current=3.0,
            bulk_temperature=24.0,
            thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
            provenance=ProvenanceEnum.REAL,
        )
        assert len(source._active_frames) == 0
        source.ingest_active_frame(frame)
        assert len(source._active_frames) == 1

        relax_frame = TelemetryFrame(
            cell_id="HW-001",
            cycle_index=1,
            timestamp=10.0,
            voltage=3.90,
            current=0.0,
            bulk_temperature=24.5,
            thermal_frame_8x8=[[24.0 for _ in range(8)] for _ in range(8)],
            provenance=ProvenanceEnum.REAL,
        )
        assert len(source._relax_frames) == 0
        source.ingest_relaxation_frame(relax_frame)
        assert len(source._relax_frames) == 1

