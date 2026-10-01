"""Global sanitized exception handlers for ThermoCell-AI."""
from __future__ import annotations

import uuid
import logging
from fastapi import Request, HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import log_security_event

logger = logging.getLogger("thermocell.errors")


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Format and return standard HTTPExceptions."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Format RequestValidationErrors with field details."""
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "message": "Input validation error",
        },
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle unexpected 500 internal server errors.
    In production: logs traceback server-side with unique error_id and returns
    opaque error_id without exposing internals or stack traces.
    In development: includes str(exc) for debuggability.
    """
    error_id = str(uuid.uuid4())
    logger.exception(f"Unhandled exception [error_id={error_id}] on {request.method} {request.url.path}: {exc}")

    log_security_event(
        "UNHANDLED_EXCEPTION",
        {"error_id": error_id, "path": request.url.path, "method": request.method},
        level=logging.ERROR,
    )

    settings = get_settings()
    if settings.is_production:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "error_id": error_id,
                "detail": "An unexpected error occurred. Please contact the administrator with this error_id.",
            },
        )

    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "error_id": error_id,
            "detail": str(exc),
        },
    )
