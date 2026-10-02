"""Security middleware tests: headers, payload size enforcement, and error sanitization."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import get_settings, reset_settings
from app.core.security import create_access_token


client = TestClient(app)


@pytest.fixture
def set_allowed_origins(monkeypatch):
    """Temporarily update ALLOWED_ORIGINS in environment and sync to global app."""
    from app.main import settings as main_settings
    orig = list(main_settings.ALLOWED_ORIGINS)

    def _apply(raw: str):
        monkeypatch.setenv("ALLOWED_ORIGINS", raw)
        reset_settings()
        new_settings = get_settings()
        main_settings.ALLOWED_ORIGINS[:] = new_settings.ALLOWED_ORIGINS

    yield _apply
    main_settings.ALLOWED_ORIGINS[:] = orig
    reset_settings()


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


def test_cors_production_origin_simulate_preflight(set_allowed_origins):
    """OPTIONS preflight to /api/simulate from production Netlify origin must receive matching CORS headers."""
    set_allowed_origins("https://thermocell-ai.netlify.app")

    resp = client.options(
        "/api/simulate",
        headers={
            "Origin": "https://thermocell-ai.netlify.app",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://thermocell-ai.netlify.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"
    allow_headers = resp.headers.get("access-control-allow-headers", "").lower()
    assert "authorization" in allow_headers
    assert "content-type" in allow_headers


def test_cors_production_origin_simulate_post(set_allowed_origins):
    """POST to /api/simulate from production Netlify origin must receive matching Access-Control-Allow-Origin."""
    set_allowed_origins("https://thermocell-ai.netlify.app")

    token = create_access_token(data={"sub": "operator", "role": "operator"})
    resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
        headers={
            "Origin": "https://thermocell-ai.netlify.app",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "https://thermocell-ai.netlify.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"


def test_cors_production_origin_unauthenticated_post_preserves_cors(set_allowed_origins):
    """401 response from unauthenticated POST must still contain Access-Control-Allow-Origin."""
    set_allowed_origins("https://thermocell-ai.netlify.app")

    resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
        headers={
            "Origin": "https://thermocell-ai.netlify.app",
            "Content-Type": "application/json",
        },
    )
    assert resp.status_code == 401
    assert resp.headers.get("access-control-allow-origin") == "https://thermocell-ai.netlify.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"


def test_cors_production_origin_validation_error_preserves_cors(set_allowed_origins):
    """422 validation error response must still contain Access-Control-Allow-Origin."""
    set_allowed_origins("https://thermocell-ai.netlify.app")

    token = create_access_token(data={"sub": "operator", "role": "operator"})
    resp = client.post(
        "/api/telemetry/baseline",
        json={"cell_id": "B0005", "voltage": "not-a-valid-voltage-float"},
        headers={
            "Origin": "https://thermocell-ai.netlify.app",
            "Authorization": f"Bearer {token}",
        },
    )
    assert resp.status_code == 422
    assert resp.headers.get("access-control-allow-origin") == "https://thermocell-ai.netlify.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"


def test_cors_production_origin_server_error_preserves_cors(set_allowed_origins):
    """500 error response must still contain Access-Control-Allow-Origin to prevent browser CORS masking."""
    set_allowed_origins("https://thermocell-ai.netlify.app")

    # Add temporary error route on global app if not already present
    if not any(getattr(route, "path", None) == "/api/test-cors-server-error" for route in app.routes):
        @app.get("/api/test-cors-server-error")
        def trigger_error():
            raise RuntimeError("Test server error for CORS preservation")

    err_client = TestClient(app, raise_server_exceptions=False)
    resp = err_client.get(
        "/api/test-cors-server-error",
        headers={"Origin": "https://thermocell-ai.netlify.app"},
    )
    assert resp.status_code == 500
    assert resp.headers.get("access-control-allow-origin") == "https://thermocell-ai.netlify.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"


def test_cors_disallowed_origin_rejected(set_allowed_origins):
    """Requests and preflights from unauthorized origins must not receive CORS allow headers."""
    set_allowed_origins("https://thermocell-ai.netlify.app")

    # Disallowed origin preflight
    preflight_resp = client.options(
        "/api/simulate",
        headers={
            "Origin": "https://malicious-site.example.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization, content-type",
        },
    )
    assert preflight_resp.headers.get("access-control-allow-origin") is None

    # Authenticated POST from disallowed origin
    token = create_access_token(data={"sub": "operator", "role": "operator"})
    post_resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
        headers={
            "Origin": "https://malicious-site.example.com",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )
    assert post_resp.headers.get("access-control-allow-origin") is None

    # 401 unauthenticated POST from disallowed origin
    unauth_resp = client.post(
        "/api/simulate",
        json={"cell_id": "B0005", "profile_type": "nominal"},
        headers={
            "Origin": "https://malicious-site.example.com",
            "Content-Type": "application/json",
        },
    )
    assert unauth_resp.status_code == 401
    assert unauth_resp.headers.get("access-control-allow-origin") is None


def test_cors_local_development_origins_work():
    """Local development origins must still work with default configuration."""
    for origin in ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]:
        resp = client.options(
            "/api/simulate",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization, content-type",
            },
        )
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == origin
        assert resp.headers.get("access-control-allow-credentials") == "true"


def test_cors_error_vary_header_preservation_and_deduplication(set_allowed_origins):
    """Verify _cors_headers preserves existing Vary tokens, adds Origin, and prevents duplicates."""
    from starlette.requests import Request
    from app.core.errors import _cors_headers

    set_allowed_origins("https://thermocell-ai.netlify.app")

    def make_request(origin: str = "https://thermocell-ai.netlify.app") -> Request:
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/simulate",
            "headers": [(b"origin", origin.encode())],
        }
        return Request(scope)

    req = make_request()

    # 1. Existing Vary header is preserved and Origin is added
    res1 = _cors_headers(req, {"Vary": "Accept-Encoding", "X-Custom": "custom-val"})
    assert res1["X-Custom"] == "custom-val"
    assert res1["Access-Control-Allow-Origin"] == "https://thermocell-ai.netlify.app"
    assert res1["Access-Control-Allow-Credentials"] == "true"
    assert "Accept-Encoding" in res1["Vary"]
    assert "Origin" in res1["Vary"]

    # 2. Case-insensitive Vary matching: existing lowercase 'vary' is merged
    res2 = _cors_headers(req, {"vary": "User-Agent, Accept-Encoding"})
    assert "User-Agent" in res2["Vary"]
    assert "Accept-Encoding" in res2["Vary"]
    assert "Origin" in res2["Vary"]
    assert "vary" not in res2

    # 3. Origin is not duplicated if already present (case-insensitive check)
    res3 = _cors_headers(req, {"Vary": "Accept-Encoding, origin"})
    tokens = [t.strip().lower() for t in res3["Vary"].split(",")]
    assert tokens.count("origin") == 1
    assert "accept-encoding" in tokens

    # 4. When no existing Vary header is present, Origin is added
    res4 = _cors_headers(req, {"X-Error-Code": "ERR_001"})
    assert res4["Vary"] == "Origin"
    assert res4["X-Error-Code"] == "ERR_001"
    assert res4["Access-Control-Allow-Origin"] == "https://thermocell-ai.netlify.app"

    # 5. Unauthorized origin receives no CORS headers and preserves existing headers unchanged
    req_unauth = make_request("https://malicious-site.example.com")
    res5 = _cors_headers(req_unauth, {"Vary": "Accept-Encoding", "X-Custom": "custom-val"})
    assert res5 == {"Vary": "Accept-Encoding", "X-Custom": "custom-val"}


def test_http_exception_preserves_custom_headers_and_merges_vary(set_allowed_origins):
    """An HTTPException with existing Vary and custom headers must preserve both and add Origin."""
    from fastapi import HTTPException

    set_allowed_origins("https://thermocell-ai.netlify.app")

    if not any(getattr(route, "path", None) == "/api/test-http-error" for route in app.routes):
        @app.get("/api/test-http-error")
        def trigger_http_error():
            raise HTTPException(
                status_code=400,
                detail="Custom error",
                headers={"Vary": "Accept-Encoding", "X-Error-Reason": "InvalidFormat"},
            )

    resp = client.get(
        "/api/test-http-error",
        headers={"Origin": "https://thermocell-ai.netlify.app"},
    )
    assert resp.status_code == 400
    assert resp.headers.get("x-error-reason") == "InvalidFormat"
    assert resp.headers.get("access-control-allow-origin") == "https://thermocell-ai.netlify.app"
    assert resp.headers.get("access-control-allow-credentials") == "true"
    vary = resp.headers.get("vary", "")
    assert "Accept-Encoding" in vary
    assert "Origin" in vary
