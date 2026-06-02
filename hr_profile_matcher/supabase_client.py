import logging
import os
from typing import Optional, TypedDict

from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env")


class AuthUser(TypedDict):
    id: str
    email: Optional[str]


def get_supabase_client(user_jwt: Optional[str] = None) -> Client:
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    if user_jwt:
        client.postgrest.auth(user_jwt)
    return client


def get_user_from_jwt(user_jwt: str) -> AuthUser:
    client = get_supabase_client()
    response = client.auth.get_user(user_jwt)
    if response.user is None:
        raise ValueError("Invalid Supabase JWT")
    return {"id": response.user.id, "email": response.user.email}


def get_or_create_profile(user_jwt: str, user_id: str, email: Optional[str]) -> dict:
    client = get_supabase_client(user_jwt)
    existing = (
        client.table("profiles")
        .select("id,email,role,created_at")
        .eq("id", user_id)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    insert_payload = {"id": user_id, "email": email, "role": "viewer"}
    result = client.table("profiles").insert(insert_payload).execute()
    return result.data[0] if result.data else insert_payload
