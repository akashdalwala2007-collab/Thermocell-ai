"""API routes for physics-informed pulse simulation."""
from __future__ import annotations

from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

from app.models.schemas_battery import BatteryPulseTelemetry, DiagnosticPrediction
from app.models.schemas_provenance import validate_physical_cell_id, TriageClassEnum
from app.services.telemetry_source import SyntheticPulseSource
from app.services.nasa_service import get_nasa_cycle_record
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
    soh: Optional[float] = Field(default=None, description="Empirical State of Health (%) from NASA literature benchmark")
    discharge_capacity: Optional[float] = Field(default=None, description="Discharge capacity (Ah) from NASA literature benchmark")


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

    profile = request.profile_type.lower().strip()
    if profile not in {"nominal", "marginal", "degraded"}:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid profile_type '{request.profile_type}'. Expected 'nominal', 'marginal', or 'degraded'.",
        )

    # Query NASA Ames empirical cycle benchmark for cell
    record = get_nasa_cycle_record(
        validated_cell_id,
        cycle_index=request.cycle_index,
        profile_type=profile,
    )

    if record is not None:
        dcir = record.baseline_dcir if record.baseline_dcir is not None else 0.092
        cycle = record.cycle_index
        soh = record.soh
        discharge_capacity = record.discharge_capacity
        nominal_capacity = record.nominal_capacity
        ambient_temp = 24.0

        if record.triage_label == TriageClassEnum.REUSE:
            ocv = 4.143
        elif record.triage_label == TriageClassEnum.INVESTIGATE:
            ocv = 4.126
        else:
            ocv = 4.110

        metadata = {
            "generator": "1RC_ECM_Thermodynamic",
            "type": "synthetic_profile",
            "soh": f"{soh:.2f}",
            "discharge_capacity": f"{discharge_capacity:.4f}",
            "nominal_capacity": f"{nominal_capacity:.1f}",
            "baseline_dcir": f"{dcir:.4f}",
            "empirical_triage": record.triage_label.value,
            "provenance_soh": "REAL",
            "source": record.source,
        }
    else:
        # Fallback for non-benchmark physical cell identifiers (e.g. 'HW-001')
        if profile == "nominal":
            ocv = 4.143
            dcir = 0.095
            cycle = request.cycle_index if request.cycle_index is not None else 1
            soh = 95.0
        elif profile == "marginal":
            ocv = 4.126
            dcir = 0.145
            cycle = request.cycle_index if request.cycle_index is not None else 85
            soh = 75.0
        else:
            ocv = 4.110
            dcir = 0.220
            cycle = request.cycle_index if request.cycle_index is not None else 160
            soh = 65.0

        discharge_capacity = round(2.0 * (soh / 100.0), 4)
        nominal_capacity = 2.0
        ambient_temp = 24.0
        metadata = {
            "generator": "1RC_ECM_Thermodynamic",
            "type": "synthetic_profile",
            "soh": f"{soh:.2f}",
            "discharge_capacity": f"{discharge_capacity:.4f}",
            "nominal_capacity": f"{nominal_capacity:.1f}",
            "baseline_dcir": f"{dcir:.4f}",
            "provenance_soh": "SYNTHETIC",
            "source": "SYNTHETIC_FALLBACK",
        }

    source = SyntheticPulseSource(ambient_temp=ambient_temp)
    telemetry = source.get_pulse_telemetry(
        cell_id=validated_cell_id,
        cycle_index=cycle,
        ocv=ocv,
        dcir=dcir,
        metadata=metadata,
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
        soh=soh,
        discharge_capacity=discharge_capacity,
    )
