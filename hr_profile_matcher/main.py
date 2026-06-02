import hashlib
import json
import logging
import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from matcher import match_profiles
from ollama_parser import parse_nl_to_form, structure_search_query
from profile_scraper import scrape_profiles as scrape_profiles_legacy
from scraper_lib_adapter import scrape_profiles_lib
from supabase_client import get_or_create_profile, get_supabase_client, get_user_from_jwt

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hr_profile_matcher")

app = FastAPI(title="HR Profile Matcher")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseNLRequest(BaseModel):
    natural_language: str = Field(..., min_length=1)


class CriteriaPayload(BaseModel):
    job_title: str = ""
    required_skills: List[str] = Field(default_factory=list)
    years_experience: float = 0
    location: str = ""
    contract_type: str = "Any"
    raw_description: str = ""


class StructureQueryRequest(CriteriaPayload):
    pass


class ScrapeRequest(BaseModel):
    search_query: str
    max_results: int = Field(default=20, ge=1, le=20)
    scraper: str = Field(default="library", pattern="^(legacy|library)$")


class MatchRequest(CriteriaPayload):
    min_score: float = Field(default=50, ge=0, le=100)


class CurrentUser(BaseModel):
    user_id: str
    email: Optional[str]
    role: str
    token: str


def _get_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    return auth_header.split(" ", 1)[1]


def _get_current_user(request: Request) -> CurrentUser:
    token = _get_bearer_token(request)
    user = get_user_from_jwt(token)
    profile = get_or_create_profile(token, user["id"], user["email"])
    return CurrentUser(
        user_id=profile["id"],
        email=profile.get("email"),
        role=profile.get("role", "viewer"),
        token=token,
    )


def _require_admin(current_user: CurrentUser) -> None:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"error": exc.errors()})


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Unexpected server error"},
    )


@app.post("/api/parse-nl")
async def parse_nl(payload: ParseNLRequest) -> dict:
    return parse_nl_to_form(payload.natural_language)


@app.post("/api/structure-query")
async def structure_query(
    payload: StructureQueryRequest, current_user: CurrentUser = Depends(_get_current_user)
) -> dict:
    criteria = payload.model_dump()
    criteria["raw_description"] = payload.raw_description
    search_query = structure_search_query(criteria)
    return {"search_query": search_query}


@app.post("/api/scrape")
async def scrape(
    payload: ScrapeRequest, current_user: CurrentUser = Depends(_get_current_user)
) -> dict:
    _require_admin(current_user)
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
                "raw_text": profile.get("raw_text"),
            }
        )
    client.table("scraped_profiles").upsert(rows, on_conflict="id").execute()
    return {"status": "ok", "profiles_found": len(rows)}


@app.post("/api/match")
async def match(
    payload: MatchRequest, current_user: CurrentUser = Depends(_get_current_user)
) -> dict:
    client = get_supabase_client(current_user.token)
    response = (
        client.table("scraped_profiles")
        .select("*")
        .eq("user_id", current_user.user_id)
        .execute()
    )
    profiles = response.data or []

    if not profiles:
        mock_path = Path(__file__).with_name("mock_profiles.json")
        with open(mock_path, "r", encoding="utf-8") as file:
            profiles = json.load(file)

    results = match_profiles(payload, profiles)
    return {"results": results, "count": len(results)}


@app.get("/api/profiles")
async def get_profiles(current_user: CurrentUser = Depends(_get_current_user)) -> dict:
    client = get_supabase_client(current_user.token)
    response = (
        client.table("scraped_profiles")
        .select("*")
        .eq("user_id", current_user.user_id)
        .execute()
    )
    return {"profiles": response.data or []}


@app.get("/api/me")
async def get_me(current_user: CurrentUser = Depends(_get_current_user)) -> dict:
    return {
        "id": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role,
    }
