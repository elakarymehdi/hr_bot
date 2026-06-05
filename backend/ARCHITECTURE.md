# Architecture

## Overview

HR Profile Matcher is a three-tier application:

1. **Backend API** — FastAPI server handling auth, LLM calls, scraping, and matching
2. **Frontend** — React SPA with Tailwind CSS (served via nginx on port 80)
3. **Supabase** — Managed PostgreSQL with Row-Level Security + Auth

The backend is structured into four sub-packages reflecting the system's responsibilities:

```
backend/
├── api/          # HTTP interface (routes, auth, schemas)
├── ai/           # AI / NLP processing (parsing, matching)
├── scraping/     # LinkedIn data extraction (Playwright + Selenium)
└── db/           # Database access (Supabase client)
```

## Module Breakdown

### `api/` — Web Layer

| File | Responsibility |
|---|---|
| `main.py` | App factory — creates FastAPI instance, wires CORS middleware, registers exception handlers, includes route router |
| `api/routes.py` | All `/api/*` handlers — delegates to `ai/`, `scraping/`, `db/` modules |
| `api/schemas.py` | Pydantic models for request validation and response serialisation |
| `api/auth.py` | JWT extraction from `Authorization` header, Supabase user lookup, admin role check |

### `ai/` — Intelligence Layer

| File | Responsibility |
|---|---|
| `parser.py` | LLM-powered NLP — calls Groq (default) or Ollama (fallback) to parse free-text job descriptions into structured criteria and to generate LinkedIn search keywords |
| `matcher.py` | Semantic matching — uses `sentence-transformers` (`all-MiniLM-L6-v2`) to encode criteria and profile text, then ranks by cosine similarity; also computes skill gap analysis |

**Auto-fallback logic**: If `LOCAL_LLM=true` is set, Ollama is the primary provider with Groq as fallback. Otherwise, Groq is primary with Ollama as fallback.

### `scraping/` — Data Extraction Layer

| File | Responsibility |
|---|---|
| `scraper_lib_adapter.py` | **Primary scraper** — two-phase Playwright extraction: (1) card data from search results, (2) enrichment via `PersonScraper` (name, headline, location, about, experiences, education). Includes stealth anti-detection scripts, session caching, and rate-limit handling. |
| `profile_scraper.py` | **Deprecated** — Selenium-based scraper kept for backward compatibility |
| `scraper_lib/` | Vendored `linkedin_scraper` pip package providing `PersonScraper`, `BrowserManager`, and data models |

### `db/` — Data Access Layer

| File | Responsibility |
|---|---|
| `client.py` | Supabase client factory (scoped to user JWT for RLS), user lookup from JWT, auto-creation of user profiles with `viewer` role |

## Request Lifecycle

```
Client Request
    │
    ▼
┌──────────────────────┐
│  nginx (port 80)      │  → proxies /api/* to backend:8000
│                       │  → serves static SPA for everything else
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  FastAPI main.py      │  → CORS check
│                       │  → exception handling
│                       │  → route dispatch
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  api/auth.py          │  → extract JWT from Bearer header
│  get_current_user()   │  → validate with Supabase
│                       │  → lookup / create profile
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  api/routes.py        │  → validate request with Pydantic
│                       │  → delegate to business logic
└──────────┬───────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌────────┐ ┌──────────┐
│ ai/    │ │ scraping/ │
│ db/    │ └──────────┘
└───┬────┘
    │
    ▼
┌──────────┐
│ Response │  → JSONResponse
└──────────┘
```

## Key Design Decisions

### Two-phase scraping

Instead of extracting everything from profile pages (which triggers rate limits), the scraper first extracts name/title from search result cards (safe, fast), then enriches profiles one-by-one with random delays. If enrichment fails, card data is preserved.

### LLM auto-fallback

The system defaults to Groq API for speed and reliability, but transparently falls back to a local Ollama instance if Groq is unavailable — or vice versa if `LOCAL_LLM=true` is set.

### Lazy model loading

The sentence-transformer model is loaded on first use (`_get_model()` in `matcher.py`), not at import time. This avoids blocking uvicorn startup with an ~80 MB download from Hugging Face.

### Config-driven

All environment variables are read once in `config.py` and imported where needed — no scattered `os.getenv()` calls, no dotenv loading in individual modules.
