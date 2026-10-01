"""Telemetry source abstraction enabling hot-swappable ingestion between synthetic models and hardware."""
from __future__ import annotations

import abc
import math
import threading
from typing import Optional, List, Dict, Any

from app.models.schemas_provenance import ProvenanceEnum, validate_physical_cell_id
from app.models.schemas_battery import (
    BatteryPulseTelemetry,
    RelaxationTelemetry,
    TelemetryFrame,
)
from app.services.thermal_pipeline import PhysicsInformedThermalGenerator


class TelemetrySource(abc.ABC):
    """
    Abstract base class for telemetry ingestion sources.
    Both physics-informed synthetic generation and live ESP32 serial/HTTP ingestion
    implement this interface to feed the downstream feature extraction pipeline uniformly.
    """

    @abc.abstractmethod
    def get_pulse_telemetry(
        self,
        cell_id: str,
        cycle_index: Optional[int] = None,
        **kwargs: Any,
    ) -> BatteryPulseTelemetry:
        """Acquire or synthesize a complete, validated BatteryPulseTelemetry payload."""
        pass


class SyntheticPulseSource(TelemetrySource):
    """
    Deterministic physics-informed telemetry source combining a 1-RC Equivalent Circuit Model (ECM)
    and lumped thermodynamic spatial thermal diffusion.
    Produces validated BatteryPulseTelemetry payloads with provenance: SYNTHETIC.
    """

    def __init__(
        self,
        ambient_temp: float = 24.0,
        thermal_generator: Optional[PhysicsInformedThermalGenerator] = None,
    ):
        self.ambient_temp = ambient_temp
        self.thermal_gen = thermal_generator or PhysicsInformedThermalGenerator(ambient_temp=ambient_temp)

    def get_pulse_telemetry(
        self,
        cell_id: str,
        cycle_index: Optional[int] = None,
        ocv: float = 4.10,
        dcir: float = 0.095,
        r_polarization: float = 0.020,
        c_polarization: float = 1200.0,
        pulse_current: float = 3.0,
        metadata: Optional[Dict[str, str]] = None,
        **kwargs: Any,
    ) -> BatteryPulseTelemetry:
        """
        Generate a complete 10-second active pulse + 2-second relaxation payload.
        
        Electrical model:
        - Loaded (t in [0.0, 9.9]s): V(t) = OCV - I*R_0 - I*R_1*(1 - exp(-t / (R_1*C_1)))
        - Unloaded (t in [10.0, 11.9]s): V(t) = OCV - V_p(10s)*exp(-(t - 10) / (R_1*C_1))
        """
        validated_cell_id = validate_physical_cell_id(cell_id)

        # 1. Generate Thermal Sequence (100 active frames + 20 relaxation bulk temps)
        active_bulk_t, active_frames, relax_ts, relax_bulk_t = self.thermal_gen.generate_pulse_thermal_sequence(
            dcir=dcir,
            pulse_current=pulse_current,
        )

        # 2. Generate 1-RC Electrical Sequence
        tau_p = r_polarization * c_polarization  # Polarization time constant (seconds)
        active_timestamps = [round(i * 0.1, 1) for i in range(100)]
        active_voltage: List[float] = []
        active_current: List[float] = []

        for t in active_timestamps:
            v_p = pulse_current * r_polarization * (1.0 - math.exp(-t / max(tau_p, 1e-3)))
            v_terminal = ocv - (pulse_current * dcir) - v_p
            active_voltage.append(round(v_terminal, 4))
            active_current.append(round(pulse_current, 3))

        # Relaxation voltage (recovery towards OCV)
        v_p_end = pulse_current * r_polarization * (1.0 - math.exp(-9.9 / max(tau_p, 1e-3)))
        relax_voltage: List[float] = []
        for t in relax_ts:
            dt_relax = t - 10.0
            v_p_decay = v_p_end * math.exp(-dt_relax / max(tau_p, 1e-3))
            v_recovery = ocv - v_p_decay
            relax_voltage.append(round(v_recovery, 4))

        relaxation = RelaxationTelemetry(
            duration_s=2.0,
            timestamps=relax_ts,
            voltage=relax_voltage,
            bulk_temperature=relax_bulk_t,
        )

        pulse_payload = BatteryPulseTelemetry(
            cell_id=validated_cell_id,
            cycle_index=cycle_index,
            provenance=ProvenanceEnum.SYNTHETIC,
            v_pre_pulse=round(ocv, 4),
            sampling_rate_hz=10.0,
            duration_s=10.0,
            timestamps=active_timestamps,
            voltage=active_voltage,
            current=active_current,
            bulk_temperature=active_bulk_t,
            thermal_frames=active_frames,
            relaxation=relaxation,
            metadata=metadata or {"generator": "1RC_ECM_Thermodynamic", "type": "synthetic_profile"},
        )

        return pulse_payload


class HardwareBufferSource(TelemetrySource):
    """
    Hardware-ingested telemetry source that buffers stream frames (from ESP32 / INA219 / AMG8833).
    When 100 active pulse ticks and 20 relaxation ticks are collected, builds a validated
    BatteryPulseTelemetry payload with provenance: REAL.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._pre_pulse_voltage: Optional[float] = None
        self._active_frames: List[TelemetryFrame] = []
        self._relax_frames: List[TelemetryFrame] = []

    def set_pre_pulse_baseline(self, voltage: float) -> None:
        """Latch the unloaded pre-pulse baseline OCV (I = 0A)."""
        with self._lock:
            if not math.isfinite(voltage) or voltage < 0.0 or voltage > 5.0:
                raise ValueError(f"Invalid pre-pulse voltage: {voltage}")
            self._pre_pulse_voltage = voltage

    def ingest_active_frame(self, frame: TelemetryFrame) -> None:
        """Append an active pulse frame (100 required)."""
        with self._lock:
            self._active_frames.append(frame)

    def ingest_relaxation_frame(self, frame: TelemetryFrame) -> None:
        """Append a relaxation frame (20 required)."""
        with self._lock:
            self._relax_frames.append(frame)

    def reset(self) -> None:
        """Reset the buffer state for the next pulse acquisition."""
        with self._lock:
            self._pre_pulse_voltage = None
            self._active_frames.clear()
            self._relax_frames.clear()

    def get_pulse_telemetry(
        self,
        cell_id: str,
        cycle_index: Optional[int] = None,
        **kwargs: Any,
    ) -> BatteryPulseTelemetry:
        """Synthesize buffered hardware frames into a complete BatteryPulseTelemetry payload."""
        with self._lock:
            validated_cell_id = validate_physical_cell_id(cell_id)

            if self._pre_pulse_voltage is None:
                raise ValueError("Cannot build BatteryPulseTelemetry: pre_pulse_voltage is missing")

            if len(self._active_frames) != 100:
                raise ValueError(f"Hardware buffer requires exactly 100 active frames, got {len(self._active_frames)}")

            if len(self._relax_frames) != 20:
                raise ValueError(f"Hardware buffer requires exactly 20 relaxation frames, got {len(self._relax_frames)}")

            # Determine target cycle_index before validating frame cycle indexes
            target_cycle_index = cycle_index if cycle_index is not None else self._active_frames[0].cycle_index

            # Validate every active frame matches requested identity, target cycle, and REAL provenance
            for idx, f in enumerate(self._active_frames):
                if f.cell_id != validated_cell_id:
                    raise ValueError(
                        f"Active frame at index {idx} has cell_id '{f.cell_id}', expected '{validated_cell_id}'"
                    )
                if f.cycle_index != target_cycle_index:
                    raise ValueError(
                        f"Active frame at index {idx} has cycle_index {f.cycle_index}, expected {target_cycle_index}"
                    )
                if f.provenance != ProvenanceEnum.REAL:
                    raise ValueError(
                        f"Active frame at index {idx} has provenance {f.provenance}, expected {ProvenanceEnum.REAL}"
                    )

            # Validate every relaxation frame matches requested identity, target cycle, and REAL provenance
            for idx, f in enumerate(self._relax_frames):
                if f.cell_id != validated_cell_id:
                    raise ValueError(
                        f"Relaxation frame at index {idx} has cell_id '{f.cell_id}', expected '{validated_cell_id}'"
                    )
                if f.cycle_index != target_cycle_index:
                    raise ValueError(
                        f"Relaxation frame at index {idx} has cycle_index {f.cycle_index}, expected {target_cycle_index}"
                    )
                if f.provenance != ProvenanceEnum.REAL:
                    raise ValueError(
                        f"Relaxation frame at index {idx} has provenance {f.provenance}, expected {ProvenanceEnum.REAL}"
                    )

            active_ts = [f.timestamp for f in self._active_frames]
            active_v = [f.voltage for f in self._active_frames]
            active_i = [f.current for f in self._active_frames]
            active_t = [f.bulk_temperature for f in self._active_frames]
            active_grids = [f.thermal_frame_8x8 for f in self._active_frames]

            relax_ts = [f.timestamp for f in self._relax_frames]
            relax_v = [f.voltage for f in self._relax_frames]
            relax_t = [f.bulk_temperature for f in self._relax_frames]

            relaxation = RelaxationTelemetry(
                duration_s=2.0,
                timestamps=relax_ts,
                voltage=relax_v,
                bulk_temperature=relax_t,
            )

            payload = BatteryPulseTelemetry(
                cell_id=validated_cell_id,
                cycle_index=target_cycle_index,
                provenance=ProvenanceEnum.REAL,
                v_pre_pulse=self._pre_pulse_voltage,
                sampling_rate_hz=10.0,
                duration_s=10.0,
                timestamps=active_ts,
                voltage=active_v,
                current=active_i,
                bulk_temperature=active_t,
                thermal_frames=active_grids,
                relaxation=relaxation,
                metadata={"source": "ESP32_INA219_AMG8833"},
            )

            # Reset buffer state only after successful construction and validation
            self.reset()
            return payload

