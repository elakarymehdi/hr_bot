"""Hybrid candidate matching — LLM scoring with cosine similarity fallback.

Scoring strategy
----------------
1. **LLM scoring** (primary) — uses Groq API to evaluate each candidate
   against the hiring criteria. Returns a score (0-100) and a match reason.
2. **Cosine similarity** (fallback) — if Groq is unavailable (no API key,
   network error, timeout), uses sentence-transformer embeddings + cosine
   similarity as a semantic fallback.
"""

import json
import logging
import math
from typing import Any, Dict, List, Optional

import requests
from scipy.spatial.distance import cosine
from sentence_transformers import SentenceTransformer

from config import GROQ_API_KEY, GROQ_MODEL, GROQ_URL

logger = logging.getLogger(__name__)

_model: Optional[SentenceTransformer] = None


# ====================================================================
# Cosine similarity fallback
# ====================================================================


def _get_model() -> SentenceTransformer:
    """Lazy-load the SentenceTransformer model."""
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _build_criteria_text(criteria) -> str:
    """Build a plain-text representation of the hiring criteria."""
    required_skills = criteria.required_skills or []
    return (
        f"{criteria.job_title} {' '.join(required_skills)} "
        f"{criteria.years_experience} years {criteria.location} "
        f"Contract: {criteria.contract_type} Education: {criteria.education_level} "
        f"Sector: {criteria.sector} {criteria.raw_description}"
    )


def _build_raw_text(profile: dict) -> str:
    """Extract or build a plain-text representation of a profile."""
    raw_text = profile.get("raw_text") or ""
    if not raw_text.strip():
        raw_text = " ".join(
            filter(
                None,
                [
                    profile.get("name", ""),
                    profile.get("title", ""),
                    profile.get("company", ""),
                    profile.get("location", ""),
                ],
            )
        )
    return raw_text


def _find_matched_skills(required_skills: list, raw_text: str) -> tuple:
    """Return (matched_skills, missing_skills) based on keyword presence."""
    matched = [
        s for s in required_skills if s.lower() in raw_text.lower()
    ]
    missing = [s for s in required_skills if s not in matched]
    return matched, missing


def _score_with_cosine(
    criteria, profiles: List[dict], required_skills: list
) -> List[dict]:
    """Score all profiles using sentence-transformer cosine similarity."""
    criteria_text = _build_criteria_text(criteria)
    model = _get_model()
    criteria_vector = model.encode(criteria_text, convert_to_numpy=True)

    raw_texts = [_build_raw_text(p) for p in profiles]
    profile_vectors = model.encode(raw_texts, batch_size=32, convert_to_numpy=True)

    results = []
    for i, profile in enumerate(profiles):
        raw_text = raw_texts[i]
        score = float(
            round((1 - cosine(criteria_vector, profile_vectors[i])) * 100, 2)
        )
        if math.isnan(score):
            score = 0.0

        matched_skills, missing_skills = _find_matched_skills(
            required_skills, raw_text
        )
        results.append(
            {
                **profile,
                "match_score": score,
                "match_reason": None,
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
            }
        )
    return results


# ====================================================================
# LLM scoring (primary)
# ====================================================================


def _build_scoring_prompt(criteria, profile: dict) -> str:
    """Build a prompt asking the LLM to score a candidate against criteria."""
    required_skills = criteria.required_skills or []
    criteria_summary = (
        f"Job Title: {criteria.job_title or 'Not specified'}\n"
        f"Required Skills: {', '.join(required_skills) if required_skills else 'None'}\n"
        f"Years of Experience: {criteria.years_experience}\n"
        f"Location: {criteria.location or 'Any'}\n"
        f"Contract Type: {criteria.contract_type}\n"
        f"Education Level: {criteria.education_level}\n"
        f"Sector: {criteria.sector or 'Any'}\n"
    )
    if criteria.raw_description:
        criteria_summary += f"Description: {criteria.raw_description[:300].strip()}"

    # Build candidate profile summary, truncating long fields
    exp_text = "; ".join(profile.get("experience") or [])[:600]
    edu_text = "; ".join(profile.get("education") or [])[:300]
    raw_text = _build_raw_text(profile)[:600]

    profile_summary = (
        f"Name: {profile.get('name', '?')}\n"
        f"Title: {profile.get('title', '')}\n"
        f"Company: {profile.get('company', '')}\n"
        f"Location: {profile.get('location', '')}\n"
        f"Skills: {', '.join(profile.get('skills') or [])[:300]}\n"
        f"Summary: {profile.get('summary', '')[:300]}\n"
        f"Experience: {exp_text}\n"
        f"Education: {edu_text}\n"
    )

    return (
        "You are an expert technical recruiter. Evaluate how well this "
        "candidate matches the job criteria.\n\n"
        "## JOB CRITERIA\n"
        f"{criteria_summary}\n\n"
        "## CANDIDATE PROFILE\n"
        f"{profile_summary}\n\n"
        "## INSTRUCTIONS\n"
        "Score the candidate 0-100 based on:\n"
        "- Skills match (most important — 40% weight)\n"
        "- Experience relevance (30% weight)\n"
        "- Education level (15% weight)\n"
        "- Location / contract fit (10% weight)\n"
        "- Industry sector (5% weight)\n\n"
        "Return ONLY raw JSON with these exact keys (no markdown, no explanation):\n"
        '- "score": integer 0-100\n'
        '- "reason": string, 1-2 sentence explanation of the score\n\n'
        "JSON:"
    )


def _call_groq_scoring(prompt: str) -> Dict[str, Any]:
    """Call Groq API for a single scoring evaluation.

    Returns
        Parsed JSON dict with ``score`` (int) and ``reason`` (str).

    Raises
        ValueError: If the API key is missing or the response cannot be parsed.
        requests.RequestException: On network / HTTP errors.
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 256,
    }
    response = requests.post(GROQ_URL, json=payload, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"].strip()

    # Try to extract JSON from the response
    json_str = content
    # Remove markdown code fences if present
    if "```" in json_str:
        parts = json_str.split("```")
        for part in parts:
            part = part.strip()
            if part.lower().startswith("json"):
                part = part[4:].strip()
            if part.startswith("{") or part.startswith("["):
                json_str = part
                break
    # Find first '{' and last '}'
    start = json_str.find("{")
    end = json_str.rfind("}")
    if start >= 0 and end > start:
        json_str = json_str[start : end + 1]

    parsed = json.loads(json_str)
    return {
        "score": int(parsed.get("score", 0)),
        "reason": str(parsed.get("reason", "")),
    }


def _score_with_llm(
    criteria, profiles: List[dict], required_skills: list
) -> Optional[List[dict]]:
    """Score profiles using Groq LLM.

    Returns
        List of result dicts, or ``None`` if the LLM is unavailable
        (in which case the caller should fall back to cosine scoring).
    """
    if not GROQ_API_KEY:
        logger.info("GROQ_API_KEY not set — skipping LLM scoring")
        return None

    results = []
    for i, profile in enumerate(profiles):
        name = profile.get("name", "?")
        try:
            prompt = _build_scoring_prompt(criteria, profile)

            logger.info(
                "LLM scoring %d/%d: %s...",
                i + 1,
                len(profiles),
                name,
            )
            llm_result = _call_groq_scoring(prompt)
            score = max(0, min(100, llm_result["score"]))
            reason = llm_result["reason"]

            logger.info(
                "  → %s: LLM score=%d/100, reason=%s",
                name, score, reason[:80],
            )
        except (requests.RequestException, ValueError, json.JSONDecodeError, KeyError) as exc:
            logger.warning(
                "LLM scoring failed for %s: %s — falling back to cosine",
                name,
                exc,
            )
            return None  # Signal caller to fall back entirely

        raw_text = _build_raw_text(profile)
        matched_skills, missing_skills = _find_matched_skills(
            required_skills, raw_text
        )
        results.append(
            {
                **profile,
                "match_score": float(score),
                "match_reason": reason,
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
            }
        )

    return results


# ====================================================================
# Public API
# ====================================================================


def match_profiles(criteria, profiles: List[dict]) -> List[dict]:
    """Match candidates against hiring criteria.

    Uses Groq LLM scoring when available, with automatic fallback to
    cosine similarity if the Groq API is unreachable or unconfigured.
    """
    required_skills = criteria.required_skills or []

    # Phase 1: try LLM scoring
    results = _score_with_llm(criteria, profiles, required_skills)

    # Phase 2: fall back to cosine similarity if LLM was unavailable
    if results is None:
        logger.info("Falling back to cosine similarity scoring")
        results = _score_with_cosine(criteria, profiles, required_skills)

    # Sort by match_score descending
    results.sort(key=lambda r: r["match_score"], reverse=True)

    # Filter by minimum score
    filtered = [r for r in results if r["match_score"] >= criteria.min_score]

    logger.info(
        "Matching complete: %d total, %d above min_score=%.0f%%",
        len(results),
        len(filtered),
        criteria.min_score,
    )
    return filtered
