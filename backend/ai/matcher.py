from typing import List, Optional

from scipy.spatial.distance import cosine
from sentence_transformers import SentenceTransformer

_model: Optional[SentenceTransformer] = None


def _get_model() -> SentenceTransformer:
    """Lazy-load the SentenceTransformer model.

    Loading at module level blocks uvicorn startup because the model
    (~80MB) must be downloaded from Hugging Face on first run.
    """
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def match_profiles(criteria, profiles: List[dict]) -> List[dict]:
    required_skills = criteria.required_skills or []
    criteria_text = (
        f"{criteria.job_title} {' '.join(required_skills)} "
        f"{criteria.years_experience} years {criteria.location} "
        f"Contract: {criteria.contract_type} Education: {criteria.education_level} "
        f"Sector: {criteria.sector} {criteria.raw_description}"
    )
    model = _get_model()
    criteria_vector = model.encode(criteria_text, convert_to_numpy=True)

    results = []
    for profile in profiles:
        raw_text = profile.get("raw_text") or ""
        profile_vector = model.encode(raw_text, convert_to_numpy=True)  # model already loaded above
        score = float(round((1 - cosine(criteria_vector, profile_vector)) * 100, 2))
        matched_skills = [
            skill
            for skill in required_skills
            if skill.lower() in raw_text.lower()
        ]
        missing_skills = [skill for skill in required_skills if skill not in matched_skills]
        results.append(
            {
                **profile,
                "match_score": score,
                "matched_skills": matched_skills,
                "missing_skills": missing_skills,
            }
        )

    results.sort(key=lambda item: item["match_score"], reverse=True)
    return [result for result in results if result["match_score"] >= criteria.min_score]
