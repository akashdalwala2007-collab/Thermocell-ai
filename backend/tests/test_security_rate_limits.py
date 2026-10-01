"""Security rate limiting tests."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.rate_limit import limiter
from app.core.config import get_settings


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_limiter():
    """Ensure clean rate limit history before and after each test."""
    limiter.reset()
    yield
    limiter.reset()


def test_auth_endpoint_rate_limiting():
    """POST /api/auth/token must be throttled to 5 requests per minute."""
    settings = get_settings()
    # 5 requests should pass
    for _ in range(5):
        resp = client.post(
            "/api/auth/token",
            json={"username": settings.OPERATOR_USERNAME, "password": "wrong-password"},
        )
        assert resp.status_code == 401  # Rejected by auth, but not rate limited yet

    # 6th request must be rejected with 429
    resp_blocked = client.post(
        "/api/auth/token",
        json={"username": settings.OPERATOR_USERNAME, "password": "wrong-password"},
    )
    assert resp_blocked.status_code == 429
    assert resp_blocked.json()["bucket"] == "auth"
    assert "Retry-After" in resp_blocked.headers


def test_telemetry_frame_permits_120_frame_diagnostic_stream():
    """
    Streaming 120 frames at 10Hz (100 active + 20 relaxation) must NOT
    be throttled by the rate limiter.
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

    # Stream 120 frames with valid X-API-Key
    for i in range(120):
        sample_frame["timestamp"] = round(i * 0.1, 1)
        resp = client.post(
            "/api/telemetry/frame",
            json=sample_frame,
            headers={"X-API-Key": settings.HARDWARE_API_KEY},
        )
        assert resp.status_code == 200, f"Frame {i} unexpectedly rate limited"
