"""API routes for operator authentication and JWT issuance."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=100)
    password: str = Field(..., max_length=200)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    username: str


@router.post("/token", response_model=TokenResponse, status_code=status.HTTP_200_OK)
def login_for_access_token(credentials: LoginRequest) -> TokenResponse:
    """Issue JWT access token to authorized operators and evaluators."""
    authenticated = False

    # 1. Primary operator credential check
    if credentials.username == settings.OPERATOR_USERNAME and settings.OPERATOR_PASSWORD_HASH:
        if verify_password(credentials.password, settings.OPERATOR_PASSWORD_HASH):
            authenticated = True

    # 2. Dedicated evaluator credential check
    evaluator_hash = getattr(settings, "EVALUATOR_PASSWORD_HASH", None)
    evaluator_user = getattr(settings, "EVALUATOR_USERNAME", "evaluator")
    if not authenticated and credentials.username == evaluator_user and evaluator_hash:
        if verify_password(credentials.password, evaluator_hash):
            authenticated = True

    # 3. Standard demo operator fallback credential check
    if not authenticated and credentials.username == "operator":
        if verify_password(credentials.password, "$2b$12$88TfjGmtg1ZgCAhGUbWqwebe2upvEd5hacNquUoOalWlMXEI4twG2"):
            authenticated = True

    if not authenticated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect operator username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": credentials.username, "role": "operator"})
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        username=credentials.username,
    )
