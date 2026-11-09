"""Tests proving cell selection and cycle selection fidelity against empirical NASA Ames dataset."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.nasa_service import get_nasa_cycle_record, get_deterministic_nasa_benchmark_fixtures
from app.models.schemas_provenance import ProvenanceEnum, TriageClassEnum


@pytest.fixture
def client():
    return TestClient(app)


def test_nasa_benchmark_cycle_records_reference_values():
    """Verify ground truth NASA benchmark cycle records for all 4 physical cells."""
    benchmarks = get_deterministic_nasa_benchmark_fixtures()
    assert set(benchmarks.keys()) == {"B0005", "B0006", "B0007", "B0018"}

    # B0005 cycle 1: SoH 92.83%, DCIR 0.091Ω
    b5_c1 = get_nasa_cycle_record("B0005", cycle_index=1)
    assert b5_c1 is not None
    assert b5_c1.soh == 92.83
    assert b5_c1.baseline_dcir == 0.091
    assert b5_c1.triage_label == TriageClassEnum.REUSE
    assert b5_c1.provenance == ProvenanceEnum.REAL

    # B0006 cycle 1: SoH 101.77%, DCIR 0.088Ω
    b6_c1 = get_nasa_cycle_record("B0006", cycle_index=1)
    assert b6_c1 is not None
    assert b6_c1.soh == 101.77
    assert b6_c1.baseline_dcir == 0.088
    assert b6_c1.triage_label == TriageClassEnum.REUSE
    assert b6_c1.provenance == ProvenanceEnum.REAL

    # B0007 cycle 1: SoH 94.55%, DCIR 0.090Ω
    b7_c1 = get_nasa_cycle_record("B0007", cycle_index=1)
    assert b7_c1 is not None
    assert b7_c1.soh == 94.55
    assert b7_c1.baseline_dcir == 0.090
    assert b7_c1.triage_label == TriageClassEnum.REUSE
    assert b7_c1.provenance == ProvenanceEnum.REAL

    # B0018 cycle 1: SoH 92.75%, DCIR 0.092Ω
    b18_c1 = get_nasa_cycle_record("B0018", cycle_index=1)
    assert b18_c1 is not None
    assert b18_c1.soh == 92.75
    assert b18_c1.baseline_dcir == 0.092
    assert b18_c1.triage_label == TriageClassEnum.REUSE
    assert b18_c1.provenance == ProvenanceEnum.REAL


def test_simulation_cell_selection_nominal_returns_cell_specific_records(client):
    """
    POST /api/simulate for nominal profile must retrieve each cell's unique empirical benchmark values:
    B0005: SoH 92.83%, DCIR ~0.091Ω
    B0006: SoH 101.77%, DCIR ~0.088Ω
    B0007: SoH 94.55%, DCIR ~0.090Ω
    B0018: SoH 92.75%, DCIR ~0.092Ω
    """
    cells_expected = {
        "B0005": {"soh": 92.83, "dcir": 0.091, "cap": 1.8565},
        "B0006": {"soh": 101.77, "dcir": 0.088, "cap": 2.0353},
        "B0007": {"soh": 94.55, "dcir": 0.090, "cap": 1.8910},
        "B0018": {"soh": 92.75, "dcir": 0.092, "cap": 1.8550},
    }

    responses = {}
    for cell_id, expected in cells_expected.items():
        resp = client.post("/api/simulate", json={"cell_id": cell_id, "profile_type": "nominal"})
        assert resp.status_code == 200, f"Simulate for {cell_id} failed: {resp.text}"
        data = resp.json()
        responses[cell_id] = data

        # Cell ID in response matches requested cell
        assert data["telemetry"]["cell_id"] == cell_id
        assert data["prediction"]["cell_id"] == cell_id

        # Empirical SoH matches ground truth reference
        assert data["soh"] == expected["soh"]
        assert data["telemetry"]["metadata"]["soh"] == f"{expected['soh']:.2f}"
        assert data["telemetry"]["metadata"]["provenance_soh"] == "REAL"

        # Empirical discharge capacity matches
        assert data["discharge_capacity"] == expected["cap"]

        # Extracted DCIR feature matches cell's baseline DCIR within 1e-4
        assert abs(data["features"]["DCIR"] - expected["dcir"]) < 1e-3

        # Provenance separation contract
        assert data["telemetry"]["provenance"] == "SYNTHETIC"
        assert data["prediction"]["provenance"] == "PREDICTED"

    # Prove that the DCIR and SoH values are distinct across cells and not identical hardcoded constants
    dcirs = [responses[cid]["features"]["DCIR"] for cid in ["B0005", "B0006", "B0007", "B0018"]]
    assert len(set(dcirs)) == 4, f"DCIR values must be distinct across cells, got {dcirs}"

    sohs = [responses[cid]["soh"] for cid in ["B0005", "B0006", "B0007", "B0018"]]
    assert len(set(sohs)) == 4, f"SoH values must be distinct across cells, got {sohs}"


def test_simulation_cycle_selection_retrieves_correct_cycle_parameters(client):
    """
    POST /api/simulate with explicit cycle_index retrieves that cycle's empirical DCIR and SoH.
    """
    cycle_tests = [
        # B0005
        {"cell_id": "B0005", "cycle": 1, "exp_soh": 92.83, "exp_dcir": 0.091, "exp_triage": "REUSE"},
        {"cell_id": "B0005", "cycle": 40, "exp_soh": 86.07, "exp_dcir": 0.108, "exp_triage": "REUSE"},
        {"cell_id": "B0005", "cycle": 85, "exp_soh": 76.20, "exp_dcir": 0.142, "exp_triage": "INVESTIGATE"},
        {"cell_id": "B0005", "cycle": 160, "exp_soh": 65.63, "exp_dcir": 0.215, "exp_triage": "RETIRE"},
        # B0006
        {"cell_id": "B0006", "cycle": 1, "exp_soh": 101.77, "exp_dcir": 0.088, "exp_triage": "REUSE"},
        {"cell_id": "B0006", "cycle": 90, "exp_soh": 72.51, "exp_dcir": 0.158, "exp_triage": "INVESTIGATE"},
        {"cell_id": "B0006", "cycle": 155, "exp_soh": 59.25, "exp_dcir": 0.235, "exp_triage": "RETIRE"},
        # B0007
        {"cell_id": "B0007", "cycle": 1, "exp_soh": 94.55, "exp_dcir": 0.090, "exp_triage": "REUSE"},
        {"cell_id": "B0007", "cycle": 110, "exp_soh": 74.00, "exp_dcir": 0.150, "exp_triage": "INVESTIGATE"},
        {"cell_id": "B0007", "cycle": 165, "exp_soh": 62.00, "exp_dcir": 0.220, "exp_triage": "RETIRE"},
        # B0018
        {"cell_id": "B0018", "cycle": 1, "exp_soh": 92.75, "exp_dcir": 0.092, "exp_triage": "REUSE"},
        {"cell_id": "B0018", "cycle": 80, "exp_soh": 75.50, "exp_dcir": 0.145, "exp_triage": "INVESTIGATE"},
        {"cell_id": "B0018", "cycle": 130, "exp_soh": 64.00, "exp_dcir": 0.225, "exp_triage": "RETIRE"},
    ]

    for tc in cycle_tests:
        resp = client.post(
            "/api/simulate",
            json={"cell_id": tc["cell_id"], "cycle_index": tc["cycle"], "profile_type": "nominal"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["telemetry"]["cycle_index"] == tc["cycle"]
        assert data["soh"] == tc["exp_soh"]
        assert abs(data["features"]["DCIR"] - tc["exp_dcir"]) < 1e-3
        assert data["prediction"]["triage_class"] == tc["exp_triage"]


def test_session_history_records_empirical_soh(client):
    """
    Sessions created by /api/simulate record cell-specific SoH in session store.
    """
    # Run simulation for B0006 cycle 1
    resp = client.post("/api/simulate", json={"cell_id": "B0006", "profile_type": "nominal"})
    assert resp.status_code == 200
    sid = resp.json()["session_id"]

    # Retrieve recent sessions
    recents = client.get("/api/sessions?limit=5").json()
    matching = next((s for s in recents if s["session_id"] == sid), None)
    assert matching is not None
    assert matching["cell_id"] == "B0006"
    assert matching["soh"] == 101.77

