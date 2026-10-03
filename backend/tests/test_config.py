"""Unit tests for environment-driven configuration management."""
import os
import pytest
from app.core.config import Settings, get_settings, reset_settings


@pytest.fixture(autouse=True)
def cleanup_settings():
    """Ensure settings are cleanly reset before and after each test."""
    reset_settings()
    yield
    reset_settings()


def test_default_settings(monkeypatch):
    """Default settings must initialize with SQLite file persistence and localhost origins."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    s = Settings()
    assert s.is_sqlite is True
    assert s.is_postgres is False
    assert "thermocell_sessions.db" in s.DATABASE_URL
    assert "http://localhost:5173" in s.ALLOWED_ORIGINS
    assert "http://127.0.0.1:5173" in s.ALLOWED_ORIGINS


def test_custom_sqlite_in_memory():
    """Settings must support in-memory SQLite for ephemeral test runs."""
    s = Settings(DATABASE_URL="sqlite:///:memory:")
    assert s.is_sqlite is True
    assert s.is_postgres is False
    assert s.get_sqlalchemy_url() == "sqlite:///:memory:"


def test_postgresql_uri_scheme():
    """Settings must support PostgreSQL and normalize legacy postgres:// URI schemes."""
    s_direct = Settings(DATABASE_URL="postgresql://user:pass@localhost:5432/thermocell")
    assert s_direct.is_postgres is True
    assert s_direct.is_sqlite is False
    assert s_direct.get_sqlalchemy_url() == "postgresql://user:pass@localhost:5432/thermocell"

    s_legacy = Settings(DATABASE_URL="postgres://user:pass@localhost:5432/thermocell")
    assert s_legacy.is_postgres is True
    assert s_legacy.get_sqlalchemy_url() == "postgresql://user:pass@localhost:5432/thermocell"


def test_allowed_origins_env_override(monkeypatch):
    """ALLOWED_ORIGINS environment variable must be parsed correctly from comma-separated string."""
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://dashboard.thermocell.ai, http://192.168.1.50:3000/")
    reset_settings()
    s = get_settings()
    assert "https://dashboard.thermocell.ai" in s.ALLOWED_ORIGINS
    assert "http://192.168.1.50:3000" in s.ALLOWED_ORIGINS
    assert len(s.ALLOWED_ORIGINS) == 2


def test_allowed_origins_wildcard(monkeypatch):
    """Wildcard ALLOWED_ORIGINS must be respected when configured."""
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    reset_settings()
    s = get_settings()
    assert s.ALLOWED_ORIGINS == ["*"]


def test_allowed_origins_single_url(monkeypatch):
    """Single URL with trailing slashes, quotes, or whitespace must parse to clean single origin."""
    for raw in [
        "https://thermocell-ai.netlify.app",
        "https://thermocell-ai.netlify.app/",
        '"https://thermocell-ai.netlify.app"',
        "'https://thermocell-ai.netlify.app'",
        "  https://thermocell-ai.netlify.app  ",
    ]:
        monkeypatch.setenv("ALLOWED_ORIGINS", raw)
        reset_settings()
        s = get_settings()
        assert s.ALLOWED_ORIGINS == ["https://thermocell-ai.netlify.app"]


def test_production_rejects_default_secret_key():
    """Production mode must reject default or short SECRET_KEY."""
    with pytest.raises(ValueError, match="SECRET_KEY must be a non-default secret"):
        Settings(
            ENVIRONMENT="production",
            DATABASE_URL="postgresql://user:pass@localhost:5432/thermocell",
            ALLOWED_ORIGINS=["https://dashboard.thermocell.ai"],
            HARDWARE_API_KEY="custom-production-hardware-key-12345",
        )


def test_production_rejects_sqlite():
    """Production mode must reject SQLite database."""
    with pytest.raises(ValueError, match="DATABASE_URL cannot use SQLite"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="super-secure-production-secret-key-at-least-32-chars",
            DATABASE_URL="sqlite:///prod.db",
            ALLOWED_ORIGINS=["https://dashboard.thermocell.ai"],
            HARDWARE_API_KEY="custom-production-hardware-key-12345",
        )


def test_production_rejects_wildcard_cors():
    """Production mode must reject wildcard CORS."""
    with pytest.raises(ValueError, match="ALLOWED_ORIGINS cannot contain wildcard"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="super-secure-production-secret-key-at-least-32-chars",
            DATABASE_URL="postgresql://user:pass@localhost:5432/thermocell",
            ALLOWED_ORIGINS=["*"],
            HARDWARE_API_KEY="custom-production-hardware-key-12345",
        )


def test_production_rejects_default_hw_key():
    """Production mode must reject default hardware API key."""
    with pytest.raises(ValueError, match="HARDWARE_API_KEY cannot use default fallback"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="super-secure-production-secret-key-at-least-32-chars",
            DATABASE_URL="postgresql://user:pass@localhost:5432/thermocell",
            ALLOWED_ORIGINS=["https://dashboard.thermocell.ai"],
        )


def test_production_rejects_default_operator_password_hash():
    """Production mode must reject default operator password hash."""
    with pytest.raises(ValueError, match="OPERATOR_PASSWORD_HASH cannot use default fallback"):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="super-secure-production-secret-key-at-least-32-chars",
            DATABASE_URL="postgresql://user:pass@localhost:5432/thermocell",
            ALLOWED_ORIGINS=["https://dashboard.thermocell.ai"],
            HARDWARE_API_KEY="custom-production-hardware-key-12345",
        )


def test_production_valid_configuration():
    """Valid production settings must initialize without error."""
    s = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="super-secure-production-secret-key-at-least-32-chars",
        DATABASE_URL="postgresql://user:pass@localhost:5432/thermocell",
        ALLOWED_ORIGINS=["https://dashboard.thermocell.ai"],
        HARDWARE_API_KEY="custom-production-hardware-key-12345",
        OPERATOR_PASSWORD_HASH="custom-production-password-hash-12345",
    )
    assert s.is_production is True
    assert s.is_postgres is True
    assert s.DOCS_ENABLED is False


def test_demo_mode_configuration_parsing(monkeypatch):
    """DEMO_MODE environment variable must be parsed correctly."""
    monkeypatch.delenv("DEMO_MODE", raising=False)
    reset_settings()
    assert get_settings().DEMO_MODE is False

    for truthy_val in ["true", "True", "1", "yes"]:
        monkeypatch.setenv("DEMO_MODE", truthy_val)
        reset_settings()
        assert get_settings().DEMO_MODE is True

    for falsy_val in ["false", "False", "0", "no"]:
        monkeypatch.setenv("DEMO_MODE", falsy_val)
        reset_settings()
        assert get_settings().DEMO_MODE is False

