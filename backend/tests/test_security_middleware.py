"""Security middleware tests: headers, payload size enforcement, and error sanitization."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import get_settings
from app.core.security import create_access_token


client = TestClient(app)


def test_security_headers_present_on_responses():
    """Verify essential hardening headers are injected on all HTTP responses."""
    resp = client.get("/health")
    assert resp.status_code == 200
    headers = resp.headers

    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert headers.get("x-xss-protection") == "0"
    assert headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in headers.get("content-security-policy", "")


def test_payload_size_limit_rejection():
    """POST with body exceeding MAX_PAYLOAD_BYTES must be rejected with 413."""
    settings = get_settings()
    # Create payload exceeding 1MB
    large_cell_id = "A" * (settings.MAX_PAYLOAD_BYTES + 100)
    token = create_access_token(data={"sub": "operator", "role": "operator"})

    resp = client.post(
        "/api/simulate",
        content=b"x" * (settings.MAX_PAYLOAD_BYTES + 50),
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(settings.MAX_PAYLOAD_BYTES + 50),
            "Authorization": f"Bearer {token}",
        },
    )
    assert resp.status_code == 413
    assert "Payload too large" in resp.json()["detail"]


def test_sanitized_validation_error_format():
    """Invalid JSON or schema validation failure returns clean 422 response."""
    token = create_access_token(data={"sub": "operator", "role": "operator"})
    resp = client.post(
        "/api/telemetry/baseline",
        json={"cell_id": "B0005", "voltage": "not-a-valid-voltage-float"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
    data = resp.json()
    assert data["message"] == "Input validation error"
    assert "detail" in data



def test_cors_preflight_headers():
    """OPTIONS preflight must return appropriate Access-Control headers."""
    resp = client.options(
        "/api/cells",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code == 200
    assert "access-control-allow-origin" in resp.headers
