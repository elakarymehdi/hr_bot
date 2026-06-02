import json
import logging
from typing import Any, Dict

import requests

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "phi3"


def _call_ollama(prompt: str) -> str:
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    response = requests.post(OLLAMA_URL, json=payload, timeout=60)
    response.raise_for_status()
    data = response.json()
    return (data.get("response", "") or "").strip()


def _clean_json_response(raw: str) -> str:
    """Strip markdown code fences, leading/trailing whitespace, and garbage from model output."""
    # Remove markdown code blocks: ```json ... ``` or just ``` ... ```
    if "```" in raw:
        # Extract content between the outermost triple backticks
        parts = raw.split("```")
        for part in parts:
            part = part.strip()
            if part and not part.startswith("json") and not part.startswith("```"):
                raw = part
                break
            elif part.lower().startswith("json"):
                raw = part[4:].strip()
                break
    # Strip any non-JSON prefix (model sometimes prefaces with "Here's the JSON:" etc.)
    # Find the first '{' or '[' and slice from there
    for start_char in ("{", "["):
        idx = raw.find(start_char)
        if idx >= 0:
            raw = raw[idx:]
            break
    # Remove trailing text after the last matching bracket
    # Find the last '}' or ']' and slice there
    if raw.startswith("{"):
        end_idx = raw.rfind("}")
        if end_idx >= 0:
            raw = raw[: end_idx + 1]
    elif raw.startswith("["):
        end_idx = raw.rfind("]")
        if end_idx >= 0:
            raw = raw[: end_idx + 1]
    return raw.strip()


def parse_nl_to_form(text: str) -> Dict[str, Any]:
    prompt = (
        "Extract structured job criteria from this text.\n\n"
        "Return ONLY raw JSON with these exact keys (no markdown, no code fences, no explanation):\n"
        '- "job_title": string\n'
        '- "required_skills": array of strings\n'
        '- "years_experience": number (0 if not mentioned)\n'
        '- "location": string ("" if not mentioned)\n'
        '- "contract_type": one of "CDI", "CDD", "Freelance", "Stage", "Any"\n\n'
        "Text: "
        f"{text}\n\n"
        "JSON:"
    )
    raw = ""
    try:
        raw = _call_ollama(prompt)
        cleaned = _clean_json_response(raw)
        if not cleaned:
            logger.warning("Ollama returned empty response")
            raise ValueError("Empty response")
        parsed = json.loads(cleaned)
        return {
            "job_title": parsed.get("job_title", ""),
            "required_skills": parsed.get("required_skills", []) or [],
            "years_experience": parsed.get("years_experience", 0) or 0,
            "location": parsed.get("location", ""),
            "contract_type": parsed.get("contract_type", "Any"),
        }
    except (json.JSONDecodeError, requests.RequestException, ValueError) as exc:
        logger.warning("Ollama parse failed: %s — raw: '%s'", exc, raw)
        return {
            "job_title": "",
            "required_skills": [],
            "years_experience": 0,
            "location": "",
            "contract_type": "Any",
        }


def structure_search_query(criteria: Dict[str, Any]) -> str:
    # Build a clean, structured input — avoid dumping the raw dict (which may
    # contain a long raw_description paragraph that distracts the model).
    context_parts = []
    if title := criteria.get("job_title", ""):
        context_parts.append(f"Job Title: {title}")
    if skills := criteria.get("required_skills", []):
        context_parts.append(f"Skills: {', '.join(skills)}")
    if location := criteria.get("location", ""):
        context_parts.append(f"Location: {location}")
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
        "- Put multi-word job titles in double quotes (e.g. \"Software Engineer\", \"Data Scientist\").\n"
        "- Prioritize: job title, core skills, location.\n"
        "- Skip years of experience and contract type — LinkedIn doesn't search them well.\n"
        "\n"
        "EXAMPLES:\n"
        "- \"Software Engineer\" Python FastAPI Casablanca\n"
        "- \"DevOps Engineer\" Docker Kubernetes AWS\n"
        "- \"Data Analyst\" SQL Tableau PowerBI\n"
        "- \"Full Stack Developer\" React Node.js TypeScript\n"
        "\n"
        f"INPUT:\n{structured_input}\n\n"
        "QUERY:"
    )
    try:
        result = _call_ollama(prompt).strip()
        # Remove surrounding quotes (regular and smart quotes) if they wrap the entire string.
        # This preserves quotes used for quoted terms inside the query
        # (e.g., "Software Engineer" Python stays intact).
        smart_quotes = [("\u201c", "\u201d"), ("\u201e", "\u201c"), ("\u00ab", "\u00bb")]
        for pair in smart_quotes:
            if result.startswith(pair[0]) and result.endswith(pair[1]):
                result = result[len(pair[0]):-len(pair[1])].strip()
                break
        if result.startswith('"') and result.endswith('"') and result.count('"') == 2:
            result = result[1:-1]
        return result
    except requests.RequestException as exc:
        logger.error("Ollama query structuring failed: %s", exc)
        raise
