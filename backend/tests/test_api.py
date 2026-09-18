"""TestClient API integration tests for ThermoCell-AI service endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.main import app, RootResponse, HealthResponse


@pytest.fixture
def client() -> TestClient:
    """Provides a TestClient instance bound to the FastAPI application."""
    return TestClient(app)


def test_app_initialization():
    """Verify application initializes cleanly without exceptions."""
    assert app.title == "ThermoCell-AI Diagnostics API"
    assert app.version == "0.1.0"


def test_read_root(client: TestClient):
    """GET / must return 200 OK with valid RootResponse metadata."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()

    # Validate against RootResponse schema
    root_model = RootResponse(**data)
    assert root_model.status == "operational"
    assert root_model.version == "0.1.0"
    assert root_model.name == "ThermoCell-AI Diagnostics API"
    assert root_model.docs_url == "/docs"


def test_health_check(client: TestClient):
    """GET /health must return 200 OK with strict provenance enforcement metadata."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()

    # Validate against HealthResponse schema
    health_model = HealthResponse(**data)
    assert health_model.status == "healthy"
    assert health_model.version == "0.1.0"
    assert health_model.provenance_system == "STRICT_ENFORCEMENT"
    assert set(health_model.supported_provenance_levels) == {"REAL", "SYNTHETIC", "PREDICTED"}

