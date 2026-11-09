"""API routes for ML diagnostic predictions and session recall."""
from __future__ import annotations

from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, Path

from app.models.schemas_battery import BatteryPulseTelemetry, DiagnosticPrediction
from app.services.ml_service import screen_telemetry
from app.services.session_store import get_session_store

router = APIRouter(prefix="/api", tags=["diagnostics"])


@router.post("/predict", response_model=DiagnosticPrediction, status_code=200)
def predict_triage_from_pulse(telemetry: BatteryPulseTelemetry) -> DiagnosticPrediction:
    """
    Execute feature extraction and ML decision fusion on an arbitrary BatteryPulseTelemetry payload.
    Persists the diagnostic run to the session store.
    """
    prediction = screen_telemetry(telemetry)
    store = get_session_store()
    store.save_diagnostic_run(telemetry, prediction)
    return prediction


@router.get("/sessions/{session_id}", response_model=Dict[str, Any], status_code=200)
def get_session_by_id(session_id: str = Path(..., description="UUID of the diagnostic session")) -> Dict[str, Any]:
    """Retrieve full diagnostic session including telemetry, features, and prediction by UUID."""
    store = get_session_store()
    session = store.get_diagnostic_run(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Diagnostic session '{session_id}' not found")
    return session


@router.get("/sessions", response_model=List[Dict[str, Any]], status_code=200)
def list_recent_sessions() -> List[Dict[str, Any]]:
    """List recent diagnostic runs across all cells."""
    store = get_session_store()
    return store.list_recent_sessions(limit=25)
