"""Security authentication tests for operator JWT and hardware API key boundaries."""
from datetime import timedelta
import time
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import get_settings
from app.core.security import create_access_token
from app.core.rate_limit import limiter


client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset shared rate limiter state before each test."""
    limiter.reset()
    yield
    limiter.reset()



def test_public_endpoint_accessible_without_auth():
    """GET / and GET /health and GET /api/cells must be public."""
    assert client.get("/").status_code == 200
    assert client.get("/health").status_code == 200
    assert client.get("/api/cells").status_code == 200


def test_auth_token_issuance_valid():
    """POST /api/auth/token with valid operator credentials returns JWT token."""
    settings = get_settings()
    resp = client.post(
        "/api/auth/token",
        json={"username": settings.OPERATOR_USERNAME, "password": "thermocell2026"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60


def test_auth_token_issuance_invalid_password():
    """POST /api/auth/token with incorrect password returns 401."""
    settings = get_settings()
    resp = client.post(
        "/api/auth/token",
        json={"username": settings.OPERATOR_USERNAME, "password": "wrong-password"},
    )
    assert resp.status_code == 401
    assert "Incorrect operator username or password" in resp.json()["detail"]


def test_auth_token_issuance_invalid_username():
    """POST /api/auth/token with unknown username returns 401."""
    resp = client.post(
        "/api/auth/token",
        json={"username": "nonexistent_operator", "password": "any-password"},
    )
    assert resp.status_code == 401


def test_protected_simulation_endpoint_requires_auth():
    """POST /api/simulate returns 401 when no token is supplied."""
    resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
    )
    assert resp.status_code == 401
    assert "Missing Bearer token" in resp.json()["detail"]


def test_protected_simulation_endpoint_rejects_malformed_token():
    """POST /api/simulate returns 401 with malformed or tampered token."""
    resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
        headers={"Authorization": "Bearer not-a-valid-jwt-token"},
    )
    assert resp.status_code == 401
    assert "Invalid authentication token" in resp.json()["detail"]


def test_protected_simulation_endpoint_rejects_expired_token():
    """POST /api/simulate returns 401 when token is expired."""
    expired_token = create_access_token(
        data={"sub": "operator", "role": "operator"},
        expires_delta=timedelta(seconds=-10),  # in the past
    )
    resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401
    assert "Authentication token has expired" in resp.json()["detail"]


def test_protected_simulation_endpoint_succeeds_with_valid_jwt():
    """POST /api/simulate returns 200 when a valid JWT token is provided."""
    token = create_access_token(data={"sub": "operator", "role": "operator"})
    resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["prediction"]["provenance"] == "PREDICTED"


def test_telemetry_endpoint_requires_hardware_or_operator_auth():
    """POST /api/telemetry/reset returns 401 without auth."""
    resp = client.post("/api/telemetry/reset")
    assert resp.status_code == 401


def test_telemetry_endpoint_rejects_invalid_api_key():
    """POST /api/telemetry/reset returns 401 with incorrect X-API-Key."""
    resp = client.post(
        "/api/telemetry/reset",
        headers={"X-API-Key": "invalid-api-key-test"},
    )
    assert resp.status_code == 401


def test_telemetry_endpoint_succeeds_with_valid_hardware_api_key():
    """POST /api/telemetry/reset returns 200 with valid X-API-Key."""
    settings = get_settings()
    resp = client.post(
        "/api/telemetry/reset",
        headers={"X-API-Key": settings.HARDWARE_API_KEY},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "BUFFER_RESET"


def test_telemetry_endpoint_succeeds_with_operator_jwt():
    """POST /api/telemetry/reset allows dual auth via operator Bearer token."""
    token = create_access_token(data={"sub": "operator", "role": "operator"})
    resp = client.post(
        "/api/telemetry/reset",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "BUFFER_RESET"


def test_cell_history_endpoint_requires_operator_auth():
    """GET /api/cells/{cell_id}/history returns 401 without auth, 200 with JWT."""
    resp_unauth = client.get("/api/cells/B0005/history")
    assert resp_unauth.status_code == 401

    token = create_access_token(data={"sub": "operator", "role": "operator"})
    resp_auth = client.get(
        "/api/cells/B0005/history",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp_auth.status_code == 200
    assert isinstance(resp_auth.json(), list)
