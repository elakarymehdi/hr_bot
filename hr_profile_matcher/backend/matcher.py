from typing import List

from scipy.spatial.distance import cosine
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")


def match_profiles(criteria, profiles: List[dict]) -> List[dict]:
    required_skills = criteria.required_skills or []
    criteria_text = (
        f"{criteria.job_title} {' '.join(required_skills)} "
        f"{criteria.years_experience} years {criteria.location} {criteria.raw_description}"
    )
    criteria_vector = model.encode(criteria_text, convert_to_numpy=True)

    results = []
    for profile in profiles:
        raw_text = profile.get("raw_text") or ""
        profile_vector = model.encode(raw_text, convert_to_numpy=True)
        score = float(round((1 - cosine(criteria_vector, profile_vector)) * 100, 1))
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
