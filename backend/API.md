# API Reference

Base URL: `http://localhost:8000` (development) or `https://your-domain.com` (production)

All endpoints except `/api/health` and `/api/parse-nl` require a Supabase JWT token in the `Authorization` header:

```
Authorization: Bearer <supabase-jwt-token>
```

---

## Health Check

```
GET /api/health
```

No auth required. Returns `200 OK` when the server is running.

### Response

```json
{ "status": "ok" }
```

---

## Parse Natural Language

```
POST /api/parse-nl
```

Convert a free-text job description into structured hiring criteria.

No auth required.

### Request

```json
{
  "natural_language": "Looking for a Senior Python Developer with 5+ years experience in FastAPI, PostgreSQL, and Docker. Based in Casablanca. CDI contract."
}
```

### Response

```json
{
  "job_title": "Senior Python Developer",
  "required_skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
  "years_experience": 5,
  "location": "Casablanca",
  "contract_type": "CDI",
  "education_level": "Any",
  "sector": ""
}
```

---

## Structure Search Query

```
POST /api/structure-query
```

Generate a LinkedIn people-search keyword query from structured criteria.

Requires JWT auth.

### Request

```json
{
  "job_title": "Software Engineer",
  "required_skills": ["Python", "React"],
  "years_experience": 3,
  "location": "Casablanca",
  "contract_type": "Any",
  "education_level": "Any",
  "sector": "",
  "raw_description": ""
}
```

### Response

```json
{
  "search_query": "Software Engineer Python React Casablanca"
}
```

---

## Scrape Profiles

```
POST /api/scrape
```

Scrape LinkedIn profiles matching a search query. Requires **admin** role.

### Request

```json
{
  "search_query": "Software Engineer Python Casablanca",
  "max_results": 10,
  "scraper": "library"
}
```

### Response

```json
{
  "status": "ok",
  "profiles_found": 10
}
```

---

## Match Profiles

```
POST /api/match
```

Semantically match saved profiles against hiring criteria.

### Request

```json
{
  "job_title": "Software Engineer",
  "required_skills": ["Python", "React"],
  "years_experience": 3,
  "location": "Casablanca",
  "contract_type": "Any",
  "education_level": "Any",
  "sector": "",
  "raw_description": "",
  "min_score": 50
}
```

### Response

```json
{
  "results": [
    {
      "id": "linkedin_abc123",
      "name": "Anwar Hssine",
      "title": "Senior Software Engineer",
      "match_score": 87.34,
      "matched_skills": ["Python", "React"],
      "missing_skills": [],
      "experience": ["..."]
    }
  ],
  "count": 1
}
```

---

## List Profiles

```
GET /api/profiles
```

Return all scraped profiles for the authenticated user.

### Response

```json
{
  "profiles": [
    {
      "id": "linkedin_abc123",
      "name": "Anwar Hssine",
      "title": "Senior Software Engineer",
      "company": "Be Ys Outsourcing",
      "location": "Casablanca",
      "profile_url": "https://linkedin.com/in/anwarhssine",
      "summary": "...",
      "skills": ["Python", "React"],
      "experience": ["..."],
      "education": ["..."]
    }
  ]
}
```

---

## Delete Profiles

```
DELETE /api/profiles
```

Delete all scraped profiles for the authenticated user. Requires **admin** role.

### Response

```json
{ "status": "ok" }
```

---

## Current User

```
GET /api/me
```

Return the authenticated user's profile.

### Response

```json
{
  "id": "684eda5a-...",
  "email": "user@example.com",
  "role": "admin"
}
```

---

## Error Responses

| Status | Meaning |
|---|---|
| 401 | Missing or invalid JWT token |
| 403 | Admin role required |
| 422 | Request validation failed |
| 429 | Rate limited (scraper) |
| 500 | Unexpected server error |

Error bodies follow this format:

```json
{ "error": "Description of what went wrong" }
```
