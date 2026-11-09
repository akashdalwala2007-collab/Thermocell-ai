"""Integration tests for FastAPI endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas_provenance import ProvenanceEnum
from app.services.telemetry_source import SyntheticPulseSource
from hardware.serial_bridge import generate_mock_hardware_stream


@pytest.fixture
def client():
    return TestClient(app)


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "operational"
    assert data["docs_url"] == "/docs"


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "REAL" in data["supported_provenance_levels"]
    assert "SYNTHETIC" in data["supported_provenance_levels"]
    assert "PREDICTED" in data["supported_provenance_levels"]


def test_simulate_nominal_profile(client):
    payload = {"cell_id": "B0005", "profile_type": "nominal"}
    response = client.post("/api/simulate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "session_id" in data
    assert data["telemetry"]["cell_id"] == "B0005"
    assert data["telemetry"]["provenance"] == "SYNTHETIC"
    assert data["prediction"]["provenance"] == "PREDICTED"
    assert data["prediction"]["triage_class"] == "REUSE"
    assert abs(sum(data["prediction"]["class_probabilities"].values()) - 1.0) <= 1e-4
    assert len(data["features"]) == 14


def test_simulate_degraded_profile(client):
    payload = {"cell_id": "B0005", "profile_type": "degraded"}
    response = client.post("/api/simulate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["prediction"]["triage_class"] == "RETIRE"
    assert data["prediction"]["confidence"] >= 0.50


def test_simulate_invalid_profile(client):
    payload = {"cell_id": "B0005", "profile_type": "unknown_profile"}
    response = client.post("/api/simulate", json=payload)
    assert response.status_code == 400


def test_simulate_rejects_composite_cycle_cell_id(client):
    payload = {"cell_id": "B0005-CYC40", "profile_type": "nominal"}
    response = client.post("/api/simulate", json=payload)
    assert response.status_code == 422


def test_predict_endpoint(client):
    source = SyntheticPulseSource()
    pulse = source.get_pulse_telemetry("B0005", cycle_index=10, ocv=4.143, dcir=0.092)
    response = client.post("/api/predict", json=pulse.model_dump())
    assert response.status_code == 200
    data = response.json()
    assert data["cell_id"] == "B0005"
    assert data["provenance"] == "PREDICTED"
    assert data["triage_class"] == "REUSE"


def test_cells_catalog(client):
    response = client.get("/api/cells")
    assert response.status_code == 200
    cells = response.json()
    assert len(cells) >= 4
    cell_ids = [c["cell_id"] for c in cells]
    assert "B0005" in cell_ids
    assert "B0006" in cell_ids


def test_session_persistence_and_recall(client):
    # 1. Run simulation to create session
    sim_resp = client.post("/api/simulate", json={"cell_id": "B0007", "profile_type": "nominal"})
    assert sim_resp.status_code == 200
    session_id = sim_resp.json()["session_id"]

    # 2. Recall session by UUID
    recall_resp = client.get(f"/api/sessions/{session_id}")
    assert recall_resp.status_code == 200
    session_data = recall_resp.json()
    assert session_data["session_id"] == session_id
    assert session_data["cell_id"] == "B0007"
    assert session_data["triage_class"] == "REUSE"


def test_telemetry_hardware_streaming_endpoints(client):
    # Reset buffer
    client.post("/api/telemetry/reset")

    # Set baseline
    base_resp = client.post("/api/telemetry/baseline", json={"cell_id": "HW-003", "voltage": 4.16})
    assert base_resp.status_code == 200

    # Stream frames from mock generator
    stream = generate_mock_hardware_stream(cell_id="HW-003", v_pre_pulse=4.16)
    for pkt in stream:
        if "thermal_frame_8x8" in pkt:
            frame_resp = client.post("/api/telemetry/frame", json=pkt)
            assert frame_resp.status_code == 200

    # Build pulse and diagnose
    build_resp = client.post("/api/telemetry/build-pulse", json={"cell_id": "HW-003"})
    assert build_resp.status_code == 200
    data = build_resp.json()
    assert data["telemetry"]["provenance"] == "REAL"
    assert data["prediction"]["provenance"] == "PREDICTED"
    assert "session_id" in data
