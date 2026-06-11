"""Authentication and authorisation dependencies for FastAPI routes.

Provides ``get_current_user`` (validates JWT + loads profile from Supabase)
and ``require_admin`` (role check) that can be injected via FastAPI's
``Depends()``.
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, Request, status

from api.schemas import CurrentUser
from db.client import get_or_create_profile, get_user_from_jwt

logger = logging.getLogger(__name__)


def get_bearer_token(request: Request) -> str:
    """Extract a Bearer token from the ``Authorization`` header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header",
        )
    return auth_header.split(" ", 1)[1]


def get_current_user(request: Request) -> CurrentUser:
    """FastAPI dependency: validate JWT and return the authenticated user.

    Raises ``401 UNAUTHORIZED`` if the token is missing or invalid.
    """
    token = get_bearer_token(request)
    user = get_user_from_jwt(token)
    profile = get_or_create_profile(token, user["id"], user["email"])
    return CurrentUser(
        user_id=profile["id"],
        email=profile.get("email"),
        role=profile.get("role", "admin"),
        token=token,
    )


def require_admin(current_user: CurrentUser = Depends(get_current_user)) -> None:
    """FastAPI dependency: ensure the authenticated user has the ``admin`` role.

    Raises ``403 FORBIDDEN`` if the user is not an admin.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
