"""ThermoCell-AI FastAPI application entrypoint."""
from __future__ import annotations

from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.middleware import SecurityHeadersMiddleware, PayloadSizeLimitMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.core.errors import (
    http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from app.models.schemas_provenance import ProvenanceEnum
from app.api.routes_auth import router as auth_router
from app.api.routes_simulation import router as simulation_router
from app.api.routes_diagnostics import router as diagnostics_router
from app.api.routes_cells import router as cells_router
from app.api.routes_telemetry import router as telemetry_router

settings = get_settings()

app = FastAPI(
    title=settings.API_TITLE,
    description="Physics-informed second-life battery grading and triage diagnostics API",
    version=settings.API_VERSION,
    docs_url="/docs" if settings.DOCS_ENABLED else None,
    redoc_url="/redoc" if settings.DOCS_ENABLED else None,
    openapi_url="/openapi.json" if settings.DOCS_ENABLED else None,
)

# Exception handlers
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Middlewares (executed in reverse registration order: CORS -> Security -> Payload -> RateLimit)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(PayloadSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(auth_router)
app.include_router(simulation_router)
app.include_router(diagnostics_router)
app.include_router(cells_router)
app.include_router(telemetry_router)


class RootResponse(BaseModel):
    """API root service metadata response model."""
    name: str = Field(default="ThermoCell-AI Diagnostics API")
    version: str = Field(default="0.1.0")
    status: str = Field(default="operational")
    docs_url: str = Field(default="/docs")


class HealthResponse(BaseModel):
    """API system health and provenance enforcement metadata response model."""
    status: str = Field(default="healthy")
    version: str = Field(default="0.1.0")
    provenance_system: str = Field(default="STRICT_ENFORCEMENT")
    supported_provenance_levels: List[str] = Field(
        default_factory=lambda: [e.value for e in ProvenanceEnum]
    )


@app.get("/", response_model=RootResponse, status_code=200)
def read_root() -> RootResponse:
    """Service root endpoint returning basic metadata and documentation link."""
    return RootResponse()


@app.get("/health", response_model=HealthResponse, status_code=200)
def health_check() -> HealthResponse:
    """System health check endpoint verifying service status and provenance configuration."""
    return HealthResponse()
