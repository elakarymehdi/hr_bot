"""Pydantic models for API request/response validation.

All HTTP payloads are validated against these schemas via FastAPI's
dependency injection system, returning 422 Unprocessable Entity on
validation failure.
"""

from typing import List, Optional

from pydantic import BaseModel, Field


class ParseNLRequest(BaseModel):
    """Request body for the natural-language parsing endpoint."""

    natural_language: str = Field(..., min_length=1, description="Raw job description in plain text")


class CriteriaPayload(BaseModel):
    """Structured hiring criteria used across multiple endpoints."""

    job_title: str = ""
    required_skills: List[str] = Field(default_factory=list)
    years_experience: float = 0
    location: str = ""
    contract_type: str = "Any"
    education_level: str = "Any"
    sector: str = ""
    raw_description: str = ""


class StructureQueryRequest(CriteriaPayload):
    """Alias for readability — shares all fields with CriteriaPayload."""

    pass


class ScrapeRequest(BaseModel):
    """Request body for triggering a LinkedIn profile scrape."""

    search_query: str
    max_results: int = Field(default=20, ge=1, le=20)
    scraper: str = Field(default="library", pattern="^(legacy|library)$")


class MatchRequest(CriteriaPayload):
    """Request body for matching existing profiles against criteria."""

    min_score: float = Field(default=50, ge=0, le=100, description="Minimum match score (0-100)")


class CurrentUser(BaseModel):
    """Authenticated user extracted from the JWT token."""

    user_id: str
    email: Optional[str] = None
    role: str = "viewer"
    token: str
