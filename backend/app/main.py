"""ThermoCell-AI FastAPI application entrypoint."""
from typing import List
from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.models.schemas_provenance import ProvenanceEnum

app = FastAPI(
    title="ThermoCell-AI Diagnostics API",
    description="Physics-informed second-life battery grading and triage diagnostics API",
    version="0.1.0",
)


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

