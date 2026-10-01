"""API routes for cell catalog and historical diagnostic records."""
from __future__ import annotations

import os
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, Path, Depends
import pandas as pd

from app.models.schemas_provenance import validate_physical_cell_id
from app.services.session_store import get_session_store
from app.core.auth import get_current_operator

router = APIRouter(prefix="/api", tags=["cells"])

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "nasa_cycles_summary.csv")


@router.get("/cells", response_model=List[Dict[str, Any]], status_code=200)
def list_benchmark_cells() -> List[Dict[str, Any]]:
    """Return catalog of NASA empirical reference cells and summary metadata."""
    if not os.path.exists(CSV_PATH):
        # Fallback benchmark definitions if CSV not present
        return [
            {"cell_id": "B0005", "nominal_capacity_ah": 2.0, "chemistry": "LITHIUM_ION", "cycles_available": 4},
            {"cell_id": "B0006", "nominal_capacity_ah": 2.0, "chemistry": "LITHIUM_ION", "cycles_available": 4},
            {"cell_id": "B0007", "nominal_capacity_ah": 2.0, "chemistry": "LITHIUM_ION", "cycles_available": 4},
            {"cell_id": "B0018", "nominal_capacity_ah": 2.0, "chemistry": "LITHIUM_ION", "cycles_available": 4},
        ]

    df = pd.read_csv(CSV_PATH)
    cells = []
    for cell_id, group in df.groupby("cell_id"):
        cells.append({
            "cell_id": cell_id,
            "nominal_capacity_ah": 2.0,
            "chemistry": "LITHIUM_ION",
            "cycle_count": len(group),
            "cycles": group["cycle_index"].tolist(),
            "soh_range": [float(group["soh"].min()), float(group["soh"].max())],
            "provenance": "REAL",
        })
    return cells


@router.get("/cells/{cell_id}/history", response_model=List[Dict[str, Any]], status_code=200)
def get_cell_diagnostic_history(
    cell_id: str = Path(..., description="Physical cell identifier (e.g. 'B0005')"),
    _operator: Dict[str, Any] = Depends(get_current_operator),
) -> List[Dict[str, Any]]:
    """Return historical diagnostic sessions for a specific cell ordered by timestamp descending."""
    try:
        validated_cell_id = validate_physical_cell_id(cell_id)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    store = get_session_store()
    history = store.list_cell_sessions(validated_cell_id)
    return history
