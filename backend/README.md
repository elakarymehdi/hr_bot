# HR Profile Matcher — Backend

AI-powered candidate matching platform. Parses natural-language job descriptions, scrapes LinkedIn profiles, and semantically ranks candidates against your hiring criteria.

## Architecture

```
backend/
├── main.py              # FastAPI app factory, middleware, exception handlers
├── config.py             # Centralized configuration (all env vars)
├── cli.py                # CLI entry point (scrape profiles, start server)
├── api/                  # HTTP API layer
│   ├── __init__.py
│   ├── routes.py         # All /api/* route handlers
│   ├── schemas.py        # Pydantic request/response models
│   └── auth.py           # JWT validation + role-based access control
├── ai/                   # AI / NLP modules
│   ├── __init__.py
│   ├── parser.py         # LLM-powered NLP parsing (Groq / Ollama)
│   └── matcher.py        # Semantic matching (sentence-transformers)
├── scraping/             # LinkedIn scraping
│   ├── __init__.py
│   ├── profile_scraper.py       # Legacy Selenium scraper (deprecated)
│   ├── scraper_lib_adapter.py   # Playwright-based scraper (recommended)
│   └── scraper_lib/             # Vendored linkedin_scraper library
├── db/                   # Database layer
│   ├── __init__.py
│   └── client.py         # Supabase client + user management
├── credentials/          # LinkedIn session files (gitignored)
├── requirements.txt
└── Dockerfile
```

## Quick Start

### Prerequisites

- Python 3.11+
- Docker & Docker Compose (recommended)
- Supabase project (free tier)
- Groq API key (free tier)
- LinkedIn credentials

### Docker (recommended)

```bash
# 1. Clone and configure
git clone <repo-url> && cd hr_bot
cp .env.example .env
# Edit .env with your credentials

# 2. Start the stack
docker compose up -d

# 3. Verify
curl http://localhost:8000/api/health
```

### Manual setup

```bash
# 1. Create virtual environment
cd backend
python -m venv .venv && source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt
pip install playwright && playwright install chromium

# 3. Install vendored scraper library
pip install ./scraping/scraper_lib/

# 4. Configure environment
cp ../.env.example ../.env   # edit with your credentials

# 5. Start the API server
python cli.py serve
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `GROQ_API_KEY` | Yes | Groq API key for LLM inference |
| `LINKEDIN_EMAIL` | Yes | LinkedIn account email |
| `LINKEDIN_PASSWORD` | Yes | LinkedIn account password |
| `LOCAL_LLM` | No | Set `true` to use local Ollama instead of Groq |
| `CORS_ORIGINS` | No | Comma-separated allowed origins (default: `http://localhost:5173`) |

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | — | Health check |
| POST | `/api/parse-nl` | — | Parse NL job description → structured criteria |
| POST | `/api/structure-query` | JWT | Generate LinkedIn search keywords |
| POST | `/api/scrape` | Admin | Scrape LinkedIn profiles |
| POST | `/api/match` | JWT | Match saved profiles against criteria |
| GET | `/api/profiles` | JWT | List all saved profiles |
| DELETE | `/api/profiles` | Admin | Delete all saved profiles |
| GET | `/api/me` | JWT | Current user profile |

## Data Flow

```
Job Description (text)
    │
    ▼
┌─────────────────┐
│  ai/parser.py    │  ← Groq / Ollama LLM
│  parse_nl_to_form│
└────────┬────────┘
         │  structured criteria
         ▼
┌─────────────────┐
│  api/routes.py   │
│  /api/scrape     │
└────────┬────────┘
         │  search query
         ▼
┌─────────────────┐
│  scraping/       │  ← Playwright + stealth scripts
│  scrape_profiles │
└────────┬────────┘
         │  profile list
         ▼
┌─────────────────┐
│  db/client.py    │  ← Supabase storage
│  scraped_profiles│
└────────┬────────┘
         │  saved profiles
         ▼
┌─────────────────┐
│  ai/matcher.py   │  ← sentence-transformers
│  match_profiles  │
└────────┬────────┘
         │  ranked results
         ▼
┌─────────────────┐
│  Frontend UI     │  ← React (port 80)
└─────────────────┘
```

## License

Proprietary — internal use.
