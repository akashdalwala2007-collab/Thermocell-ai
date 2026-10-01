"""API routes for physics-informed pulse simulation."""
from __future__ import annotations

from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from app.models.schemas_battery import BatteryPulseTelemetry, DiagnosticPrediction
from app.models.schemas_provenance import validate_physical_cell_id
from app.services.telemetry_source import SyntheticPulseSource
from app.services.ml_service import screen_telemetry
from app.services.session_store import get_session_store
from app.core.auth import get_current_operator

router = APIRouter(prefix="/api", tags=["simulation"])


class SimulationRequest(BaseModel):
    """Request model for pulse simulation."""
    cell_id: str = Field(default="B0005", description="Physical cell identifier (e.g. 'B0005')")
    cycle_index: Optional[int] = Field(default=None, ge=0, description="Cycle index if applicable")
    profile_type: str = Field(
        default="nominal",
        description="Benchmark simulation profile: 'nominal', 'marginal', or 'degraded'",
    )


class DiagnosticRunResponse(BaseModel):
    """Complete diagnostic run response combining telemetry, prediction, and session metadata."""
    session_id: str
    telemetry: BatteryPulseTelemetry
    prediction: DiagnosticPrediction
    features: Dict[str, float]


@router.post("/simulate", response_model=DiagnosticRunResponse, status_code=200)
def simulate_diagnostic_pulse(
    request: SimulationRequest,
    _operator: Dict[str, Any] = Depends(get_current_operator),
) -> DiagnosticRunResponse:
    """
    Generate 10-second controlled pulse discharge telemetry, execute dual-model
    ML decision fusion triage, persist the session, and return results.
    """
    try:
        validated_cell_id = validate_physical_cell_id(request.cell_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Configure profile parameters based on benchmark degradation tier
    profile = request.profile_type.lower()
    if profile == "nominal":
        ocv = 4.143
        dcir = 0.092
        cycle = request.cycle_index if request.cycle_index is not None else 10
    elif profile == "marginal":
        ocv = 4.126
        dcir = 0.145
        cycle = request.cycle_index if request.cycle_index is not None else 85
    elif profile == "degraded":
        ocv = 4.110
        dcir = 0.220
        cycle = request.cycle_index if request.cycle_index is not None else 160
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid profile_type '{request.profile_type}'. Expected 'nominal', 'marginal', or 'degraded'.",
        )

    source = SyntheticPulseSource()
    telemetry = source.get_pulse_telemetry(
        cell_id=validated_cell_id,
        cycle_index=cycle,
        ocv=ocv,
        dcir=dcir,
    )

    # Execute ML decision fusion
    prediction = screen_telemetry(telemetry)

    # Persist run to session store
    store = get_session_store()
    session_id = store.save_diagnostic_run(telemetry, prediction)

    return DiagnosticRunResponse(
        session_id=session_id,
        telemetry=telemetry,
        prediction=prediction,
        features=dict(prediction.extracted_features),
    )
