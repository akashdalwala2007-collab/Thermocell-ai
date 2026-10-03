"""Application configuration management for ThermoCell-AI."""
from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional, Any
from pydantic import BaseModel, Field, field_validator, model_validator

DEFAULT_DEV_SECRET_KEY = "thermocell-dev-insecure-secret-key-32chars-min!"
DEFAULT_DEV_HARDWARE_KEY = "thermocell-esp32-default-hw-key"
DEFAULT_DEV_OPERATOR_HASH = "$2b$12$88TfjGmtg1ZgCAhGUbWqwebe2upvEd5hacNquUoOalWlMXEI4twG2"


def _resolve_default_db_path() -> str:
    """Resolve default SQLite database path in backend/data/ directory."""
    backend_root = Path(__file__).resolve().parent.parent.parent
    data_dir = backend_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    db_file = data_dir / "thermocell_sessions.db"
    return f"sqlite:///{db_file.as_posix()}"


def _parse_allowed_origins(val: Optional[str]) -> List[str]:
    """Parse comma-separated or default list of allowed CORS origins."""
    default_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    if not val or not val.strip():
        return default_origins

    raw_clean = val.strip().strip("'\"").strip()
    if raw_clean == "*":
        return ["*"]

    parts: List[str] = []
    for p in val.split(","):
        cleaned = p.strip().strip("'\"").strip().rstrip("/")
        if cleaned:
            parts.append(cleaned)

    return parts if parts else default_origins


class Settings(BaseModel):
    """Central environment configuration for ThermoCell-AI backend services."""

    API_TITLE: str = Field(default="ThermoCell-AI Diagnostics API")
    API_VERSION: str = Field(default="0.1.0")
    ENVIRONMENT: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "development"))
    DATABASE_URL: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", _resolve_default_db_path()))
    ALLOWED_ORIGINS: List[str] = Field(default_factory=lambda: _parse_allowed_origins(os.getenv("ALLOWED_ORIGINS")))
    DEMO_MODE: bool = Field(default_factory=lambda: os.getenv("DEMO_MODE", "false").strip().lower() in ("true", "1", "yes", "t"))

    # Security & Auth Settings
    SECRET_KEY: str = Field(default_factory=lambda: os.getenv("SECRET_KEY", DEFAULT_DEV_SECRET_KEY))
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60)
    OPERATOR_USERNAME: str = Field(default_factory=lambda: os.getenv("OPERATOR_USERNAME", "operator"))
    OPERATOR_PASSWORD_HASH: str = Field(default_factory=lambda: os.getenv("OPERATOR_PASSWORD_HASH", DEFAULT_DEV_OPERATOR_HASH))
    HARDWARE_API_KEY: str = Field(default_factory=lambda: os.getenv("HARDWARE_API_KEY", DEFAULT_DEV_HARDWARE_KEY))
    RATE_LIMIT_ENABLED: bool = Field(default=True)
    MAX_PAYLOAD_BYTES: int = Field(default=1024 * 1024)  # 1 MB
    DOCS_ENABLED: bool = Field(default_factory=lambda: os.getenv("DOCS_ENABLED", "true").lower() in ("true", "1", "yes"))

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _validate_allowed_origins(cls, v: Any) -> List[str]:
        if isinstance(v, str):
            return _parse_allowed_origins(v)
        if isinstance(v, (list, tuple, set)):
            cleaned_parts: List[str] = []
            for item in v:
                if isinstance(item, str):
                    cleaned = item.strip().strip("'\"").strip()
                    if cleaned == "*":
                        cleaned_parts.append("*")
                    else:
                        cleaned = cleaned.rstrip("/")
                        if cleaned:
                            cleaned_parts.append(cleaned)
                else:
                    cleaned_parts.append(str(item))
            return cleaned_parts if cleaned_parts else _parse_allowed_origins(None)
        return _parse_allowed_origins(None)

    @field_validator("DEMO_MODE", mode="before")
    @classmethod
    def _validate_demo_mode(cls, v: Any) -> bool:
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            return v.strip().lower() in ("true", "1", "yes", "t")
        return bool(v)

    @property
    def is_production(self) -> bool:
        """Return True if running under production environment."""
        return self.ENVIRONMENT.lower() == "production"

    @property
    def is_sqlite(self) -> bool:
        """Return True if active database is SQLite."""
        return self.DATABASE_URL.lower().startswith("sqlite")

    @property
    def is_postgres(self) -> bool:
        """Return True if active database is PostgreSQL."""
        return self.DATABASE_URL.lower().startswith("postgres")

    def get_sqlalchemy_url(self) -> str:
        """Return driver-compatible SQLAlchemy database connection URL."""
        url = self.DATABASE_URL.strip()
        if url.startswith("postgres://"):
            url = "postgresql://" + url[len("postgres://"):]
        return url

    @model_validator(mode="after")
    def validate_production_hardening(self) -> Settings:
        """Enforce strict production configuration invariants."""
        if self.is_production:
            if self.SECRET_KEY == DEFAULT_DEV_SECRET_KEY or len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be a non-default secret with at least 32 characters in production.")
            if self.is_sqlite:
                raise ValueError("DATABASE_URL cannot use SQLite in production mode.")
            if "*" in self.ALLOWED_ORIGINS:
                raise ValueError("ALLOWED_ORIGINS cannot contain wildcard '*' in production mode.")
            if self.HARDWARE_API_KEY == DEFAULT_DEV_HARDWARE_KEY or not self.HARDWARE_API_KEY:
                raise ValueError("HARDWARE_API_KEY cannot use default fallback in production mode.")
            if self.OPERATOR_PASSWORD_HASH == DEFAULT_DEV_OPERATOR_HASH or not self.OPERATOR_PASSWORD_HASH:
                raise ValueError("OPERATOR_PASSWORD_HASH cannot use default fallback in production mode.")
            self.DOCS_ENABLED = False
        return self


_settings_instance: Optional[Settings] = None


def get_settings() -> Settings:
    """Retrieve or initialize singleton Settings instance."""
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance


def reset_settings() -> None:
    """Reset singleton Settings instance (useful for unit tests)."""
    global _settings_instance
    _settings_instance = None


settings = get_settings()
