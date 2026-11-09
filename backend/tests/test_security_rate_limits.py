"""Tests verifying that rate limiting is completely disabled and repeated requests are permitted."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import get_settings


client = TestClient(app)


def test_auth_endpoint_permits_repeated_requests():
    """
    POST /api/auth/token must permit repeated requests without rate-limit throttling (no 429).
    Repeated incorrect attempts must return 401 (auth failure), never 429.
    Subsequent valid attempt must return 200.
    """
    settings = get_settings()

    # Send 25 consecutive incorrect login requests (previously throttled at 5)
    for i in range(25):
        resp = client.post(
            "/api/auth/token",
            json={"username": settings.OPERATOR_USERNAME, "password": "wrong-password"},
        )
        assert resp.status_code == 401, f"Request {i} unexpectedly returned {resp.status_code}"
        assert "429" not in str(resp.status_code)
        assert "Retry-After" not in resp.headers

    # Valid login immediately succeeds after repeated requests
    login_resp = client.post(
        "/api/auth/token",
        json={"username": settings.OPERATOR_USERNAME, "password": "thermocell2026"},
    )
    assert login_resp.status_code == 200
    assert "access_token" in login_resp.json()


def test_telemetry_frame_permits_unthrottled_stream():
    """
    Streaming 150 frames with hardware API key must succeed with 200 OK
    and never be throttled by any rate limiter.
    """
    settings = get_settings()
    sample_frame = {
        "cell_id": "HW-001",
        "timestamp": 0.1,
        "voltage": 3.75,
        "current": 2.0,
        "bulk_temperature": 25.0,
        "thermal_frame_8x8": [[25.0] * 8 for _ in range(8)],
        "provenance": "REAL",
    }

    for i in range(150):
        sample_frame["timestamp"] = round(i * 0.1, 1)
        resp = client.post(
            "/api/telemetry/frame",
            json=sample_frame,
            headers={"X-API-Key": settings.HARDWARE_API_KEY},
        )
        assert resp.status_code == 200, f"Frame {i} unexpectedly returned {resp.status_code}"
        assert "Retry-After" not in resp.headers


def test_simulation_permits_rapid_repeated_requests():
    """
    POST /api/simulate must permit rapid repeated simulation runs without 429 throttling
    (previously capped at 30 req/min for compute bucket).
    """
    # Authenticate to get valid operator token
    settings = get_settings()
    login_resp = client.post(
        "/api/auth/token",
        json={"username": settings.OPERATOR_USERNAME, "password": "thermocell2026"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Execute 35 consecutive simulation requests (exceeds old 30 req/min limit)
    for i in range(35):
        resp = client.post(
            "/api/simulate",
            json={"cell_id": "B0005", "profile_type": "nominal"},
            headers=headers,
        )
        assert resp.status_code == 200, f"Simulation request {i} unexpectedly returned {resp.status_code}"
        assert resp.json()["prediction"]["triage_class"] == "REUSE"


def test_general_endpoints_permit_burst_traffic():
    """
    General API endpoints must permit burst traffic without 429 rate limit errors.
    """
    for i in range(50):
        resp = client.get("/api/cells")
        assert resp.status_code == 200, f"Cells request {i} unexpectedly returned {resp.status_code}"

    for i in range(50):
        resp = client.get("/health")
        assert resp.status_code == 200, f"Health request {i} unexpectedly returned {resp.status_code}"
