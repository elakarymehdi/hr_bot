"""HTTP route handlers — all /api/* endpoints.

Routes are registered via an APIRouter that is included by the app factory
in ``main.py``.
"""

import hashlib
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse

from api.schemas import (
    CurrentUser,
    MatchRequest,
    ParseNLRequest,
    ScrapeRequest,
    StructureQueryRequest,
)
from api.auth import get_current_user, require_admin
from ai.parser import parse_nl_to_form, structure_search_query
from ai.matcher import match_profiles
from scraping.profile_scraper import scrape_profiles as scrape_profiles_legacy
from scraping.scraper_lib_adapter import scrape_profiles_lib
from db.client import get_supabase_client

logger = logging.getLogger("hr_profile_matcher")

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


@router.get("/health")
async def health() -> dict:
    """Lightweight health-check endpoint (no auth required)."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Natural-language parsing
# ---------------------------------------------------------------------------


@router.post("/parse-nl")
async def parse_nl(payload: ParseNLRequest) -> dict:
    """Parse a free-text job description into structured criteria."""
    return parse_nl_to_form(payload.natural_language)


# ---------------------------------------------------------------------------
# Query structuring
# ---------------------------------------------------------------------------


@router.post("/structure-query")
async def structure_query(
    payload: StructureQueryRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Generate a LinkedIn people-search keyword query from structured criteria."""
    criteria = payload.model_dump()
    criteria["raw_description"] = payload.raw_description
    search_query = structure_search_query(criteria)
    return {"search_query": search_query}


# ---------------------------------------------------------------------------
# Profile scraping
# ---------------------------------------------------------------------------


@router.post("/scrape")
async def scrape(
    payload: ScrapeRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Scrape LinkedIn profiles matching the given search query."""
    require_admin(current_user)

    if payload.scraper == "legacy":
        logger.info("Using legacy Selenium-based scraper")
        profiles = scrape_profiles_legacy(payload.search_query, payload.max_results)
    else:
        logger.info("Using Playwright-based library scraper")
        profiles = await scrape_profiles_lib(payload.search_query, payload.max_results)

    if not profiles:
        return {"status": "ok", "profiles_found": 0}

    client = get_supabase_client(current_user.token)
    rows = []
    for profile in profiles:
        profile_url = profile.get("profile_url", "")
        profile_id = f"linkedin_{hashlib.md5(profile_url.encode('utf-8')).hexdigest()}"
        rows.append(
            {
                "id": profile_id,
                "user_id": current_user.user_id,
                "name": profile.get("name"),
                "title": profile.get("title"),
                "company": profile.get("company"),
                "location": profile.get("location"),
                "profile_url": profile_url,
                "summary": profile.get("summary"),
                "skills": profile.get("skills") or [],
                "experience": profile.get("experience") or [],
                "education": profile.get("education") or [],
                "raw_text": profile.get("raw_text"),
            }
        )
    client.table("scraped_profiles").upsert(rows, on_conflict="id").execute()
    return {"status": "ok", "profiles_found": len(rows)}


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


@router.post("/match")
async def match(
    payload: MatchRequest,
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Semantically match saved profiles against hiring criteria."""
    client = get_supabase_client(current_user.token)
    response = (
        client.table("scraped_profiles")
        .select("*")
        .eq("user_id", current_user.user_id)
        .execute()
    )
    profiles = response.data or []

    if not profiles:
        return {"results": [], "count": 0, "message": "No profiles in database. Run a scrape first."}

    results = match_profiles(payload, profiles)
    return {"results": results, "count": len(results)}


# ---------------------------------------------------------------------------
# Profile CRUD
# ---------------------------------------------------------------------------


@router.get("/profiles")
async def get_profiles(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return all scraped profiles for the authenticated user."""
    client = get_supabase_client(current_user.token)
    response = (
        client.table("scraped_profiles")
        .select("*")
        .eq("user_id", current_user.user_id)
        .execute()
    )
    return {"profiles": response.data or []}


@router.delete("/profiles")
async def delete_profiles(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Delete all scraped profiles for the authenticated user (admin only)."""
    require_admin(current_user)
    client = get_supabase_client(current_user.token)
    client.table("scraped_profiles").delete().eq("user_id", current_user.user_id).execute()
    logger.info("Cleared all scraped profiles for user %s", current_user.user_id)
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# User info
# ---------------------------------------------------------------------------


@router.get("/me")
async def get_me(
    current_user: CurrentUser = Depends(get_current_user),
) -> dict:
    """Return the authenticated user's profile info."""
    return {
        "id": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role,
    }
