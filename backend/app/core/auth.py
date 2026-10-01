"""FastAPI authorization dependencies for ThermoCell-AI."""
from __future__ import annotations

from typing import Dict, Any, Optional
from fastapi import Request, HTTPException, status, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

from app.core.security import decode_access_token, verify_hardware_api_key

security_bearer = HTTPBearer(auto_error=False)


async def get_current_operator(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
) -> Dict[str, Any]:
    """Validate Bearer JWT access token for operator-protected endpoints."""
    token: Optional[str] = None
    if credentials:
        token = credentials.credentials
    else:
        # Fallback to direct Authorization header parsing
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):].strip()

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: Missing Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(token)
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_hardware_or_operator(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
) -> Dict[str, Any]:
    """Validate either an X-API-Key header (ESP32) or a Bearer JWT (Operator)."""
    api_key = request.headers.get("X-API-Key")
    if api_key is not None:
        if verify_hardware_api_key(api_key):
            return {"type": "hardware", "identity": "esp32-bench"}
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid hardware API key",
        )

    # Fall back to operator Bearer token
    return await get_current_operator(request, credentials)
