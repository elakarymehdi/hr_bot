"""LLM-powered NLP parsing — converts natural-language job descriptions into
structured criteria and generates LinkedIn search queries.

Two backends are supported (auto-fallback):

- **Groq API** (default) — fast, cloud-hosted LLM inference
- **Ollama** — local-only mode (set ``LOCAL_LLM=true``)
"""

import json
import logging
from typing import Any, Dict

import requests

from config import (
    GROQ_API_KEY,
    GROQ_MODEL,
    GROQ_URL,
    LOCAL_LLM,
    OLLAMA_MODEL,
    OLLAMA_URL,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Low-level LLM callers
# ---------------------------------------------------------------------------


def _call_ollama(prompt: str) -> str:
    """Send a prompt to a local Ollama instance."""
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    response = requests.post(OLLAMA_URL, json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    return (data.get("response", "") or "").strip()


def _call_groq(prompt: str) -> str:
    """Call the Groq chat-completions API.

    Raises
        ValueError: If ``GROQ_API_KEY`` is not set.
        requests.RequestException: On network / HTTP errors.
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not set — cannot call Groq API")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 512,
    }
    response = requests.post(GROQ_URL, json=payload, headers=headers, timeout=30)
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"].strip()


def _call_llm(prompt: str) -> str:
    """Call the primary LLM provider, falling back to the other on failure.

    - Primary: Groq API (unless ``LOCAL_LLM=true``).
    - Fallback: Ollama (if Groq unavailable) or Groq (if Ollama fails).
    """
    if LOCAL_LLM:
        try:
            return _call_ollama(prompt)
        except Exception as exc:
            logger.warning("Ollama call failed: %s — falling back to Groq", exc)
            return _call_groq(prompt)
    else:
        try:
            return _call_groq(prompt)
        except Exception as exc:
            logger.warning("Groq call failed: %s — falling back to Ollama", exc)
            return _call_ollama(prompt)


# ---------------------------------------------------------------------------
# JSON cleaning helper
# ---------------------------------------------------------------------------


def _clean_json_response(raw: str) -> str:
    """Strip markdown code fences, leading/trailing garbage from model output."""
    if not raw:
        return ""

    # Remove markdown code blocks: ```json ... ``` or just ``` ... ```
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            part = part.strip()
            if part and not part.startswith("json") and not part.startswith("```"):
                raw = part
                break
            elif part.lower().startswith("json"):
                raw = part[4:].strip()
                break

    # Strip any non-JSON prefix — find first '{' or '['
    for start_char in ("{", "["):
        idx = raw.find(start_char)
        if idx >= 0:
            raw = raw[idx:]
            break

    # Remove trailing text after the last matching bracket
    if raw.startswith("{"):
        end_idx = raw.rfind("}")
        if end_idx >= 0:
            raw = raw[: end_idx + 1]
    elif raw.startswith("["):
        end_idx = raw.rfind("]")
        if end_idx >= 0:
            raw = raw[: end_idx + 1]

    return raw.strip()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_nl_to_form(text: str) -> Dict[str, Any]:
    """Parse natural-language job criteria into a structured form dict.

    Uses Groq API by default; falls back to Ollama if Groq is unavailable
    or ``LOCAL_LLM=true`` is set.

    Returns
        A dict with keys ``job_title``, ``required_skills``,
        ``years_experience``, ``location``, ``contract_type``,
        ``education_level``, ``sector``.
    """
    # Truncate input to avoid hitting LLM token limits
    text = text[:2000]
    prompt = (
        "Extract structured job criteria from the text below.\n\n"
        "Return ONLY raw JSON with these exact keys (no markdown, no code fences, no explanation):\n"
        '- "job_title": string\n'
        '- "required_skills": array of strings\n'
        '- "years_experience": number (0 if not mentioned)\n'
        '- "location": string ("" if not mentioned)\n'
        '- "contract_type": one of "CDI", "CDD", "Freelance", "Stage", "Any"\n'
        '- "education_level": string (one of "Bac+2", "Bac+3", "Bac+5", "Master", "Doctorat", "MBA", "Any"; "Any" if not mentioned)\n'
        '- "sector": string (industry or sector, "" if not mentioned)\n\n'
        f"Text: {text}\n\n"
        "JSON:"
    )

    raw = ""
    try:
        raw = _call_llm(prompt)
        cleaned = _clean_json_response(raw)
        if not cleaned:
            logger.warning("LLM returned empty response")
            raise ValueError("Empty response")
        parsed = json.loads(cleaned)
        return {
            "job_title": parsed.get("job_title", ""),
            "required_skills": parsed.get("required_skills", []) or [],
            "years_experience": parsed.get("years_experience", 0) or 0,
            "location": parsed.get("location", ""),
            "contract_type": parsed.get("contract_type", "Any"),
            "education_level": parsed.get("education_level", "Any"),
            "sector": parsed.get("sector", ""),
        }
    except (json.JSONDecodeError, requests.RequestException, ValueError) as exc:
        logger.warning("LLM parse failed: %s — raw: '%s'", exc, raw)
        return {
            "job_title": "",
            "required_skills": [],
            "years_experience": 0,
            "location": "",
            "contract_type": "Any",
            "education_level": "Any",
            "sector": "",
        }


def structure_search_query(criteria: Dict[str, Any]) -> str:
    """Generate a LinkedIn people-search keyword query from structured criteria.

    Uses Groq API by default; falls back to Ollama if Groq is unavailable
    or ``LOCAL_LLM=true`` is set.

    Returns
        A plain keyword string suitable for LinkedIn's ``?keywords=``
        search parameter.
    """
    # Build a clean, structured input — avoid dumping the raw dict (which may
    # contain a long raw_description paragraph that distracts the model).
    context_parts = []
    if title := criteria.get("job_title", ""):
        context_parts.append(f"Job Title: {title}")
    if skills := criteria.get("required_skills", []):
        context_parts.append(f"Skills: {', '.join(skills)}")
    if location := criteria.get("location", ""):
        context_parts.append(f"Location: {location}")
    if contract_type := criteria.get("contract_type", ""):
        if contract_type != "Any":
            context_parts.append(f"Contract: {contract_type}")
    if education_level := criteria.get("education_level", ""):
        if education_level != "Any":
            context_parts.append(f"Education: {education_level}")
    if sector := criteria.get("sector", ""):
        context_parts.append(f"Sector: {sector}")
    # Include a short hint from the raw description if available (first 120 chars)
    if raw := criteria.get("raw_description", ""):
        context_parts.append(f"Context: {raw[:120].strip()}")

    structured_input = "\n".join(context_parts) if context_parts else str(criteria)

    prompt = (
        "You are an expert LinkedIn sourcer. Generate a precise, keyword-only people search query.\n\n"
        "RULES:\n"
        "- Return ONLY the query string — no explanation, no markdown, no surrounding quotes.\n"
        "- Keywords only — no full sentences, no filler words (e.g. 'experience in', 'available now', 'looking for', 'with').\n"
        "- NEVER include the word 'LinkedIn' — the search is already on LinkedIn.\n"
        "- Keep it short and specific (5-10 words max).\n"
        "- NO quotes, NO punctuation, NO special characters — plain space-separated keywords only.\n"
        "- Multi-word job titles should just be written as separate keywords (e.g. Software Engineer, not \"Software Engineer\").\n"
        "- Prioritize: job title, core skills, location.\n"
        "- Skip years of experience and contract type — LinkedIn doesn't search them well.\n"
        "\n"
        "EXAMPLES:\n"
        '- Software Engineer Python FastAPI Casablanca\n'
        '- DevOps Engineer Docker Kubernetes AWS\n'
        '- Data Analyst SQL Tableau PowerBI\n'
        '- Full Stack Developer React Node TypeScript\n'
        "\n"
        f"INPUT:\n{structured_input}\n\n"
        "QUERY:"
    )

    raw = ""
    try:
        raw = _call_llm(prompt)
        result = raw.strip()

        # Aggressively strip all quotes (regular + smart) and common punctuation
        for ch in (
            '"',
            "\u201c",
            "\u201d",
            "\u201e",
            "\u00ab",
            "\u00bb",
            "'",
            "`",
            ",",
            ".",
            ";",
            ":",
            "!",
            "?",
        ):
            result = result.replace(ch, "")

        # Collapse multiple spaces into one
        result = " ".join(result.split())

        return result
    except (requests.RequestException, ValueError) as exc:
        logger.error("LLM query structuring failed: %s — raw: '%s'", exc, raw)
        raise
