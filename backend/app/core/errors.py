"""Global sanitized exception handlers for ThermoCell-AI."""
from __future__ import annotations

import uuid
import logging
from typing import Dict, Any, Optional, List
from fastapi import Request, HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.responses import JSONResponse

from app.core.config import get_settings
from app.core.logging import log_security_event

logger = logging.getLogger("thermocell.errors")


def _cors_headers(
    request: Request,
    existing_headers: Optional[Dict[str, str]] = None,
) -> Dict[str, str]:
    """
    Construct CORS response headers matching the request origin if permitted.
    Preserves existing headers and merges 'Origin' into the Vary header without duplication.
    """
    headers = dict(existing_headers) if existing_headers else {}
    origin = request.headers.get("origin")
    if not origin:
        return headers

    settings = get_settings()
    clean_origin = origin.strip().strip("'\"").strip().rstrip("/")

    is_allowed = False
    if "*" in settings.ALLOWED_ORIGINS:
        is_allowed = True
    else:
        allowed_normalized = {
            o.strip().strip("'\"").strip().rstrip("/")
            for o in settings.ALLOWED_ORIGINS
        }
        if clean_origin in allowed_normalized or origin in settings.ALLOWED_ORIGINS:
            is_allowed = True

    if not is_allowed:
        return headers

    headers["Access-Control-Allow-Origin"] = origin
    headers["Access-Control-Allow-Credentials"] = "true"

    # Merge or create Vary header preserving existing tokens case-insensitively
    vary_key = None
    existing_vary_val = None
    for k in list(headers.keys()):
        if k.lower() == "vary":
            vary_key = k
            existing_vary_val = headers.pop(k)
            break

    tokens: List[str] = []
    if existing_vary_val:
        tokens = [t.strip() for t in existing_vary_val.split(",") if t.strip()]

    has_origin = any(t.lower() == "origin" for t in tokens)
    if not has_origin:
        tokens.append("Origin")

    headers["Vary"] = ", ".join(tokens)
    return headers


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Format and return standard HTTPExceptions with CORS preservation."""
    raw_headers = getattr(exc, "headers", None)
    headers = _cors_headers(request, raw_headers)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Format RequestValidationErrors with field details and CORS preservation."""
    headers = _cors_headers(request)
    return JSONResponse(
        status_code=422,
        content={
            "detail": exc.errors(),
            "message": "Input validation error",
        },
        headers=headers,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handle unexpected 500 internal server errors.
    In production: logs traceback server-side with unique error_id and returns
    opaque error_id without exposing internals or stack traces.
    In development: includes str(exc) for debuggability.
    Preserves CORS headers across all unhandled 500 responses.
    """
    error_id = str(uuid.uuid4())
    logger.exception(f"Unhandled exception [error_id={error_id}] on {request.method} {request.url.path}: {exc}")

    log_security_event(
        "UNHANDLED_EXCEPTION",
        {"error_id": error_id, "path": request.url.path, "method": request.method},
        level=logging.ERROR,
    )

    cors_hdrs = _cors_headers(request)
    settings = get_settings()
    if settings.is_production:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "error_id": error_id,
                "detail": "An unexpected error occurred. Please contact the administrator with this error_id.",
            },
            headers=cors_hdrs,
        )

    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "error_id": error_id,
            "detail": str(exc),
        },
        headers=cors_hdrs,
    )
