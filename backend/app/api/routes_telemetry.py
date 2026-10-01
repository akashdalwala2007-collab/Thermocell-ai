"""API routes for live hardware telemetry buffering and frame ingestion."""
from __future__ import annotations

from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from app.models.schemas_battery import TelemetryFrame, BatteryPulseTelemetry, DiagnosticPrediction
from app.models.schemas_provenance import validate_physical_cell_id
from app.services.telemetry_source import HardwareBufferSource
from app.services.ml_service import screen_telemetry
from app.services.session_store import get_session_store
from app.core.auth import get_hardware_or_operator

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

# Global singleton buffer for active hardware streaming
_hardware_buffer = HardwareBufferSource()


def get_hardware_buffer() -> HardwareBufferSource:
    return _hardware_buffer


class BaselineRequest(BaseModel):
    cell_id: str
    voltage: float = Field(..., ge=0.0, le=5.0)


class BuildPulseRequest(BaseModel):
    cell_id: str
    cycle_index: Optional[int] = None


@router.post("/baseline", status_code=200)
def set_hardware_baseline(
    request: BaselineRequest,
    _auth: Dict[str, Any] = Depends(get_hardware_or_operator),
) -> Dict[str, Any]:
    """Latch unloaded pre-pulse OCV baseline from hardware."""
    try:
        validate_physical_cell_id(request.cell_id)
        buf = get_hardware_buffer()
        buf.set_pre_pulse_baseline(request.voltage)
        return {"status": "BASELINE_LATCHED", "cell_id": request.cell_id, "v_pre_pulse": request.voltage}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/frame", status_code=200)
def ingest_hardware_frame(
    frame: TelemetryFrame,
    _auth: Dict[str, Any] = Depends(get_hardware_or_operator),
) -> Dict[str, Any]:
    """Ingest a single 10Hz TelemetryFrame into the hardware buffer."""
    buf = get_hardware_buffer()
    if frame.timestamp < 10.0:
        buf.ingest_active_frame(frame)
    else:
        buf.ingest_relaxation_frame(frame)

    return {
        "status": "FRAME_BUFFERED",
        "timestamp": frame.timestamp,
        "active_count": len(buf._active_frames),
        "relax_count": len(buf._relax_frames),
    }


@router.post("/build-pulse", status_code=200)
def build_pulse_and_diagnose(
    request: BuildPulseRequest,
    _auth: Dict[str, Any] = Depends(get_hardware_or_operator),
) -> Dict[str, Any]:
    """
    Synthesize 100 active + 20 relaxation frames into BatteryPulseTelemetry,
    execute ML decision fusion, store the run, and return results.
    """
    try:
        validated_cell_id = validate_physical_cell_id(request.cell_id)
        buf = get_hardware_buffer()
        telemetry = buf.get_pulse_telemetry(cell_id=validated_cell_id, cycle_index=request.cycle_index)

        # Run ML triage
        prediction = screen_telemetry(telemetry)

        # Store session
        store = get_session_store()
        session_id = store.save_diagnostic_run(telemetry, prediction)

        return {
            "session_id": session_id,
            "telemetry": telemetry.model_dump(),
            "prediction": prediction.model_dump(),
            "features": dict(prediction.extracted_features),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/reset", status_code=200)
def reset_hardware_buffer(
    _auth: Dict[str, Any] = Depends(get_hardware_or_operator),
) -> Dict[str, str]:
    """Clear hardware buffer state."""
    buf = get_hardware_buffer()
    buf.reset()
    return {"status": "BUFFER_RESET"}
