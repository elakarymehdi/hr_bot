"""Supabase client — database connection and user management.

Provides a thin wrapper around the Supabase Python SDK for authentication,
user profile management, and CRUD operations on scraped profiles.
"""

import logging
from typing import Optional, TypedDict

from supabase import Client, create_client

from config import SUPABASE_ANON_KEY, SUPABASE_URL

logger = logging.getLogger(__name__)


class AuthUser(TypedDict):
    """Minimal user info returned from JWT validation."""

    id: str
    email: Optional[str]


# ---------------------------------------------------------------------------
# Client factory
# ---------------------------------------------------------------------------

# Module-level cache: keyed by JWT to avoid re-initialising the client on
# every API call.  The cache is unbounded, but in practice the number of
# concurrent tokens is tiny (one per active session).
_client_cache: dict[str, Client] = {}


def get_supabase_client(user_jwt: Optional[str] = None) -> Client:
    """Return a Supabase client, optionally scoped to a user JWT.

    When ``user_jwt`` is provided, the client's ``postgrest`` methods
    are authenticated via that token (Row-Level Security applies).

    Clients are cached by JWT to avoid redundant initialisation.
    """
    cache_key = user_jwt or "__anon__"
    cached = _client_cache.get(cache_key)
    if cached is not None:
        return cached

    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    if user_jwt:
        client.postgrest.auth(user_jwt)

    _client_cache[cache_key] = client
    return client


# ---------------------------------------------------------------------------
# Authentication helpers
# ---------------------------------------------------------------------------


def get_user_from_jwt(user_jwt: str) -> AuthUser:
    """Validate a Supabase JWT and return the associated user.

    Raises
        ValueError: If the JWT is invalid or the user does not exist.
    """
    client = get_supabase_client()
    response = client.auth.get_user(user_jwt)
    if response.user is None:
        raise ValueError("Invalid Supabase JWT")
    return {"id": response.user.id, "email": response.user.email}


def get_or_create_profile(
    user_jwt: str, user_id: str, email: Optional[str]
) -> dict:
    """Return an existing user profile, or create one if it does not exist.

    New profiles are created with the ``viewer`` role by default.
    """
    client = get_supabase_client(user_jwt)
    existing = (
        client.table("profiles")
        .select("id,email,role,created_at")
        .eq("id", user_id)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    insert_payload = {"id": user_id, "email": email, "role": "admin"}
    result = client.table("profiles").insert(insert_payload).execute()
    return result.data[0] if result.data else insert_payload
