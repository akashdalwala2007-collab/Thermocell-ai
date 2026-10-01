"""PyTest configuration and autouse fixtures for ThermoCell-AI tests."""
import pytest
from app.main import app
from app.core.auth import get_current_operator, get_hardware_or_operator


@pytest.fixture(autouse=True)
def override_auth_for_legacy_tests(request):
    """
    Automatically bypass auth for existing functional, ML, and schema tests
    so that adding production auth does not break regression suites.
    Security test suites (whose filename contains 'test_security') will
    explicitly test auth enforcement without this override.
    """
    node_fspath = getattr(request.node, "fspath", None)
    node_name = node_fspath.basename if node_fspath else str(getattr(request.node, "path", ""))

    if "test_security" not in node_name:
        app.dependency_overrides[get_current_operator] = lambda: {
            "sub": "operator",
            "role": "operator",
        }
        app.dependency_overrides[get_hardware_or_operator] = lambda: {
            "type": "hardware",
            "identity": "esp32-bench",
        }
        try:
            yield
        finally:
            app.dependency_overrides.pop(get_current_operator, None)
            app.dependency_overrides.pop(get_hardware_or_operator, None)
    else:
        yield
