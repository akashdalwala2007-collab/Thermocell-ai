"""Battery telemetry and diagnostic prediction Pydantic domain models."""
import math
from typing import List, Dict, Optional, Literal, Any
from pydantic import BaseModel, Field, ConfigDict, model_validator

from app.models.schemas_provenance import (
    ProvenanceEnum,
    TriageClassEnum,
    PhysicalCellId,
)


CANONICAL_FEATURES = {
    "OCV",
    "DCIR",
    "ΔV10",
    "dV/dt_slope",
    "V_recovery_rate",
    "T_initial",
    "ΔT_bulk",
    "dT/dt_max",
    "τ_cool",
    "T_max_pixel",
    "T_mean_cell",
    "σ²_T",
    "∇T_tab-body",
    "hotspot_eccentricity",
}


class ImmutableDict(dict):
    """
    Read-only dictionary representation providing deep immutability for model attributes.
    Supports normal dictionary reads, iteration, and JSON serialization, but raises TypeError on mutation.
    """
    def __setitem__(self, key: Any, value: Any) -> None:
        raise TypeError(f"ImmutableDict does not support item assignment (attempted to set {key!r})")

    def __delitem__(self, key: Any) -> None:
        raise TypeError(f"ImmutableDict does not support item deletion (attempted to delete {key!r})")

    def __ior__(self, other: Any) -> Any:
        raise TypeError("ImmutableDict does not support in-place union (|=)")

    def pop(self, *args: Any, **kwargs: Any) -> Any:
        raise TypeError("ImmutableDict does not support item removal via pop()")

    def popitem(self) -> Any:
        raise TypeError("ImmutableDict does not support item removal via popitem()")

    def clear(self) -> None:
        raise TypeError("ImmutableDict does not support clearing")

    def update(self, *args: Any, **kwargs: Any) -> None:
        raise TypeError("ImmutableDict does not support in-place updates")

    def setdefault(self, *args: Any, **kwargs: Any) -> Any:
        raise TypeError("ImmutableDict does not support setdefault()")


class TelemetryFrame(BaseModel):
    """Represents a single raw 100ms hardware frame streamed from an ESP32 or simulation tick."""
    cell_id: PhysicalCellId = Field(..., description="Physical cell identifier, e.g. 'B0005' or 'HW-001'. Does NOT encode cycle.")
    cycle_index: Optional[int] = Field(None, ge=0, description="Cycle index if known")
    timestamp: float = Field(..., ge=0.0, description="Elapsed time in seconds")
    voltage: float = Field(..., ge=0.0, le=5.0, description="Instantaneous voltage in Volts")
    current: float = Field(..., ge=0.0, le=10.0, description="Instantaneous discharge current in Amperes")
    bulk_temperature: float = Field(..., description="Bulk surface temperature in °C")
    thermal_frame_8x8: List[List[float]] = Field(..., description="Single 8x8 spatial temperature grid in °C")
    provenance: ProvenanceEnum = Field(..., description="Origin of the telemetry tick")

    @model_validator(mode="after")
    def validate_frame_dimensions(self):
        # 1. Finite float validation
        for field_name, val in [
            ("timestamp", self.timestamp),
            ("voltage", self.voltage),
            ("current", self.current),
            ("bulk_temperature", self.bulk_temperature),
        ]:
            if not math.isfinite(val):
                raise ValueError(f"TelemetryFrame {field_name} must be a finite float, got {val}")

        # 2. 8x8 spatial thermal frame validation
        if len(self.thermal_frame_8x8) != 8 or any(len(row) != 8 for row in self.thermal_frame_8x8):
            raise ValueError("thermal_frame_8x8 must be exactly 8x8")
        if any(not math.isfinite(val) for row in self.thermal_frame_8x8 for val in row):
            raise ValueError("thermal_frame_8x8 contains non-finite values (NaN or Inf)")

        return self


class RelaxationTelemetry(BaseModel):
    """Represents the 2-second post-pulse relaxation period (20 samples @ 10Hz, t = 10.0 to 11.9s)."""
    duration_s: float = Field(default=2.0, description="Relaxation duration in seconds")
    timestamps: List[float] = Field(..., description="20-element time vector from 10.0 to 11.9s")
    voltage: List[float] = Field(..., description="20-element voltage relaxation curve")
    bulk_temperature: List[float] = Field(..., description="20-element bulk temperature relaxation curve")

    @model_validator(mode="after")
    def validate_relaxation_samples(self):
        # 0. Finite float validation and exact 2.0s duration contract
        if not math.isfinite(self.duration_s):
            raise ValueError("RelaxationTelemetry duration_s must be a finite float")
        if abs(self.duration_s - 2.0) > 1e-4:
            raise ValueError(f"RelaxationTelemetry duration_s must be exactly 2.0s, got {self.duration_s}")

        # 1. Exact sample count and finite float validation
        expected_len = 20
        for field_name, arr in [
            ("timestamps", self.timestamps),
            ("voltage", self.voltage),
            ("bulk_temperature", self.bulk_temperature),
        ]:
            if len(arr) != expected_len:
                raise ValueError(f"RelaxationTelemetry {field_name} must contain exactly {expected_len} samples, got {len(arr)}")
            if any(not math.isfinite(x) for x in arr):
                raise ValueError(f"RelaxationTelemetry {field_name} contains non-finite values (NaN or Inf)")

        # 2. Strict monotonicity and exact timestamp sequence t_i = round(10.0 + 0.1 * i, 1)
        for i in range(expected_len):
            expected_t = round(10.0 + 0.1 * i, 1)
            if abs(self.timestamps[i] - expected_t) > 1e-4:
                raise ValueError(f"Relaxation timestamp[{i}] must be {expected_t}, got {self.timestamps[i]}")
            if i > 0 and self.timestamps[i] <= self.timestamps[i - 1]:
                raise ValueError(f"Relaxation timestamps must be strictly monotonic at index {i}")

        return self


class BatteryPulseTelemetry(BaseModel):
    """Complete 10-second controlled discharge pulse telemetry payload (100 samples @ 10Hz) plus relaxation."""
    cell_id: PhysicalCellId = Field(..., description="Physical cell identifier (e.g. 'B0005'). Does NOT encode cycle.")
    cycle_index: Optional[int] = Field(None, ge=0, description="Cycle index (e.g. 40). Kept separate from cell_id.")
    provenance: ProvenanceEnum = Field(..., description="Data origin tag: REAL, SYNTHETIC, or PREDICTED")
    v_pre_pulse: float = Field(..., ge=0.0, le=5.0, description="Pre-pulse open-circuit voltage acquired immediately prior to load application (I=0)")
    sampling_rate_hz: float = Field(default=10.0, description="Sampling rate in Hertz")
    duration_s: float = Field(default=10.0, description="Active pulse duration in seconds")
    timestamps: List[float] = Field(..., description="100-element time vector covering [0.0, 9.9]s with 0.1s step")
    voltage: List[float] = Field(..., description="100-element cell voltage readings (V)")
    current: List[float] = Field(..., description="100-element discharge current readings (A)")
    bulk_temperature: List[float] = Field(..., description="100-element bulk temperature readings (°C)")
    thermal_frames: List[List[List[float]]] = Field(..., description="100 frames of 8x8 spatial temperature matrices (°C)")
    relaxation: RelaxationTelemetry = Field(..., description="Required 2-second post-pulse relaxation telemetry (20 samples @ 10Hz, 10.0-11.9s) for V_recovery_rate and τ_cool")
    metadata: Optional[Dict[str, str]] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_fixed_contract(self):
        # 0. Finite float validation on v_pre_pulse
        if not math.isfinite(self.v_pre_pulse):
            raise ValueError("v_pre_pulse must be a finite float")

        # 1. Exact scalar contract
        if self.sampling_rate_hz != 10.0:
            raise ValueError(f"sampling_rate_hz must be exactly 10.0, got {self.sampling_rate_hz}")
        if self.duration_s != 10.0:
            raise ValueError(f"duration_s must be exactly 10.0, got {self.duration_s}")

        # 2. 1-D telemetry array lengths and finite float values
        expected_len = 100
        for field_name, arr in [
            ("timestamps", self.timestamps),
            ("voltage", self.voltage),
            ("current", self.current),
            ("bulk_temperature", self.bulk_temperature),
        ]:
            if len(arr) != expected_len:
                raise ValueError(f"{field_name} must contain exactly {expected_len} samples, got {len(arr)}")
            if any(not math.isfinite(x) for x in arr):
                raise ValueError(f"{field_name} contains non-finite values (NaN or Inf)")

        # 2a. Voltage sample range contract: every sample must be in [0.0, 5.0]V
        for idx, v in enumerate(self.voltage):
            if v < 0.0 or v > 5.0:
                raise ValueError(
                    f"voltage[{idx}] ({v:.3f}V) out of valid range [0.0, 5.0]V"
                )

        # 2b. Fixed 3.0A discharge current contract (tolerance ±0.05A for simulated/hardware ADC jitter)
        for idx, c in enumerate(self.current):
            if abs(c - 3.0) > 0.05:
                raise ValueError(
                    f"current[{idx}] ({c:.3f}A) violates fixed 3.0A pulse contract (must be within [2.95, 3.05]A)"
                )

        # 3. Thermal frames dimensions: 100 frames, each 8x8 with finite values
        if len(self.thermal_frames) != expected_len:
            raise ValueError(f"thermal_frames must contain exactly {expected_len} frames, got {len(self.thermal_frames)}")
        for idx, frame in enumerate(self.thermal_frames):
            if len(frame) != 8 or any(len(row) != 8 for row in frame):
                raise ValueError(f"thermal_frame at index {idx} is not 8x8")
            if any(not math.isfinite(val) for row in frame for val in row):
                raise ValueError(f"thermal_frame at index {idx} contains non-finite values")

        # 4. Timestamp monotonicity, 0.1s spacing, and interval coverage [0.0, 9.9]s
        for i in range(expected_len):
            expected_t = round(i * 0.1, 1)
            if abs(self.timestamps[i] - expected_t) > 1e-4:
                raise ValueError(f"timestamp[{i}] must be {expected_t}, got {self.timestamps[i]}")
            if i > 0 and self.timestamps[i] <= self.timestamps[i - 1]:
                raise ValueError(f"timestamps must be strictly monotonic at index {i}")

        return self


class DiagnosticPrediction(BaseModel):
    """Machine learning diagnostic triage verdict with strictly enforced PREDICTED provenance (deeply immutable)."""
    model_config = ConfigDict(frozen=True)

    cell_id: PhysicalCellId = Field(..., description="Physical cell identifier")
    cycle_index: Optional[int] = Field(None, ge=0, description="Cycle index if applicable")
    provenance: Literal[ProvenanceEnum.PREDICTED] = ProvenanceEnum.PREDICTED
    triage_class: TriageClassEnum = Field(..., description="Triage decision: REUSE, RETIRE, or INVESTIGATE")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Calibrated confidence score")
    class_probabilities: Dict[str, float] = Field(..., description="Class probability distribution")
    extracted_features: Dict[str, float] = Field(..., description="Extracted canonical 14 features")
    recommendation: str = Field(..., description="Actionable triage recommendation text")

    @model_validator(mode="after")
    def validate_prediction_invariants(self):
        # 1. Enforce exact class probability labels: REUSE, RETIRE, INVESTIGATE
        expected_keys = {TriageClassEnum.REUSE.value, TriageClassEnum.RETIRE.value, TriageClassEnum.INVESTIGATE.value}
        if set(self.class_probabilities.keys()) != expected_keys:
            raise ValueError(f"class_probabilities must contain exactly {expected_keys}, got {set(self.class_probabilities.keys())}")

        # 2. Enforce probability range [0.0, 1.0], finite floats, and sum to 1.0 within tolerance
        prob_sum = 0.0
        for k, p in self.class_probabilities.items():
            if not math.isfinite(p):
                raise ValueError(f"Probability for {k} must be a finite float, got {p}")
            if p < 0.0 or p > 1.0:
                raise ValueError(f"Probability for {k} must be in [0.0, 1.0], got {p}")
            prob_sum += p
        if abs(prob_sum - 1.0) > 1e-4:
            raise ValueError(f"class_probabilities must sum to 1.0, got {prob_sum}")

        # 3. Enforce confidence equals the selected class probability within canonical tolerance
        selected_prob = self.class_probabilities[self.triage_class.value]
        if abs(self.confidence - selected_prob) > 1e-4:
            raise ValueError(f"confidence ({self.confidence}) must match class_probabilities[{self.triage_class.value}] ({selected_prob})")

        # 4. Enforce exact canonical 14 extracted features and finite float values
        if set(self.extracted_features.keys()) != CANONICAL_FEATURES:
            raise ValueError(
                f"extracted_features must contain exactly the 14 canonical features {sorted(CANONICAL_FEATURES)}, got {sorted(self.extracted_features.keys())}"
            )
        for feat_name, val in self.extracted_features.items():
            if not math.isfinite(val):
                raise ValueError(f"extracted_features['{feat_name}'] must be a finite float, got {val}")

        # 5. Deep immutability: freeze nested mappings into ImmutableDict
        object.__setattr__(self, "class_probabilities", ImmutableDict(self.class_probabilities))
        object.__setattr__(self, "extracted_features", ImmutableDict(self.extracted_features))

        return self

