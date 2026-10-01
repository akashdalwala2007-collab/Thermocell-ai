"""Comprehensive end-to-end system integration tests for ThermoCell-AI."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.schemas_provenance import ProvenanceEnum
from hardware.serial_bridge import generate_mock_hardware_stream


@pytest.fixture
def client():
    return TestClient(app)


def test_full_system_integration_lifecycle(client):
    """
    End-to-End System Verification:
    1. Health check verifies provenance support
    2. Synthetic pulse simulation produces REUSE with calibrated probabilities
    3. Degraded pulse simulation triggers deterministic safety tripwire
    4. Hardware serial bridge stream builds pulse with REAL provenance
    5. Session store persists runs and provides full fidelity recall
    """
    # 1. Health Check
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    health_data = health_resp.json()
    assert health_data["status"] == "healthy"
    assert "REAL" in health_data["supported_provenance_levels"]
    assert "SYNTHETIC" in health_data["supported_provenance_levels"]
    assert "PREDICTED" in health_data["supported_provenance_levels"]

    # 2. Synthetic Simulation: Nominal Run
    nom_resp = client.post("/api/simulate", json={"cell_id": "B0005", "profile_type": "nominal"})
    assert nom_resp.status_code == 200
    nom_data = nom_resp.json()
    assert nom_data["telemetry"]["provenance"] == "SYNTHETIC"
    assert nom_data["prediction"]["provenance"] == "PREDICTED"
    assert nom_data["prediction"]["triage_class"] == "REUSE"
    assert len(nom_data["features"]) == 14
    nom_session_id = nom_data["session_id"]

    # 3. Synthetic Simulation: Degraded Run
    deg_resp = client.post("/api/simulate", json={"cell_id": "B0005", "profile_type": "degraded"})
    assert deg_resp.status_code == 200
    deg_data = deg_resp.json()
    assert deg_data["prediction"]["triage_class"] == "RETIRE"
    assert deg_data["features"]["DCIR"] > 0.20
    deg_session_id = deg_data["session_id"]

    # 4. Mock Hardware Streaming Protocol
    client.post("/api/telemetry/reset")
    client.post("/api/telemetry/baseline", json={"cell_id": "HW-E2E", "voltage": 4.14})

    stream = generate_mock_hardware_stream(cell_id="HW-E2E", cycle_index=0, v_pre_pulse=4.14)
    for pkt in stream:
        if "thermal_frame_8x8" in pkt:
            f_resp = client.post("/api/telemetry/frame", json=pkt)
            assert f_resp.status_code == 200

    hw_resp = client.post("/api/telemetry/build-pulse", json={"cell_id": "HW-E2E", "cycle_index": 0})
    assert hw_resp.status_code == 200
    hw_data = hw_resp.json()
    assert hw_data["telemetry"]["provenance"] == "REAL"
    assert hw_data["prediction"]["provenance"] == "PREDICTED"
    hw_session_id = hw_data["session_id"]

    # 5. Session Recall and Listing
    recent_resp = client.get("/api/sessions?limit=10")
    assert recent_resp.status_code == 200
    recent_sessions = recent_resp.json()
    session_ids = [s["session_id"] for s in recent_sessions]
    assert nom_session_id in session_ids
    assert deg_session_id in session_ids
    assert hw_session_id in session_ids

    # 6. Detailed Session Recall
    recall_resp = client.get(f"/api/sessions/{hw_session_id}")
    assert recall_resp.status_code == 200
    recalled = recall_resp.json()
    assert recalled["cell_id"] == "HW-E2E"
    assert recalled["provenance"] == "REAL"
    assert len(recalled["telemetry"]["thermal_frames"]) == 100
    assert len(recalled["features"]) == 14
