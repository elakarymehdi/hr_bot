# HR Profile Matcher

Full-stack HR SaaS platform. Authenticate with Supabase, describe your ideal candidate in plain English, scrape LinkedIn profiles, and get semantically matched results ranked by score.

## Project Structure

```
hr_bot/
├── backend/               # FastAPI Python backend
│   ├── main.py            # App factory + middleware
│   ├── config.py          # Centralized environment config
│   ├── cli.py             # CLI entry point
│   ├── api/               # HTTP API layer
│   │   ├── routes.py      # Route handlers
│   │   ├── schemas.py     # Pydantic models
│   │   └── auth.py        # JWT auth + role guard
│   ├── ai/                # AI / NLP modules
│   │   ├── parser.py      # LLM parsing (Groq / Ollama)
│   │   └── matcher.py     # Semantic matching
│   ├── scraping/          # LinkedIn scraping
│   │   ├── profile_scraper.py       # Legacy Selenium (deprecated)
│   │   ├── scraper_lib_adapter.py   # Playwright-based (recommended)
│   │   └── scraper_lib/             # Vendored linkedin_scraper library
│   ├── db/                # Database layer
│   │   └── client.py      # Supabase client + user management
│   └── credentials/       # LinkedIn session data (Docker volume)
├── frontend/              # React + Vite + Tailwind CSS
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf         # Production nginx config
│   └── package.json
├── docker-compose.yml     # Orchestrates backend + frontend
└── .env.example           # Environment variable template
```

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Scraping | Playwright (primary), Selenium (legacy) |
| NLP Matching | SentenceTransformers (`all-MiniLM-L6-v2`) + cosine similarity |
| NL Parsing | Groq API (default) or Ollama `phi3` (local) |
| Auth + DB | Supabase (Auth + PostgreSQL with RLS) |
| Frontend | React + Tailwind CSS, Vite build, nginx |

## Quick Start (Docker)

```bash
cp .env.example .env          # Fill in your credentials
docker compose up -d          # Starts backend + frontend
curl http://localhost:8000/api/health   # Verify
# → {"status": "ok"}
```

Then open **http://localhost** in your browser.

## Manual Setup

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip install playwright && playwright install chromium
pip install ./scraping/scraper_lib/
python cli.py serve
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Database Schema & Migrations

The project uses **Supabase** (PostgreSQL). Run these SQL statements in your Supabase SQL editor to set up the schema:

### Table: `profiles`

Stores user metadata synced from Supabase Auth.

```sql
create table if not exists profiles (
  id uuid primary key references auth.users,
  email text,
  role text default 'viewer',
  created_at timestamp default now()
);

alter table profiles enable row level security;

create policy "Profiles read own" on profiles
  for select using (id = auth.uid());
create policy "Profiles insert own" on profiles
  for insert with check (id = auth.uid());
create policy "Profiles update own" on profiles
  for update using (id = auth.uid());
```

### Table: `scraped_profiles`

Stores scraped LinkedIn profiles, one row per profile. The `experience` and `education` columns store arrays of text blocks (latest schema version includes both columns).

```sql
create table if not exists scraped_profiles (
  id text primary key,
  user_id uuid references profiles(id),
  name text,
  title text,
  company text,
  location text,
  profile_url text,
  summary text,
  skills text[],
  experience text[],
  education text[],
  raw_text text,
  scraped_at timestamp default now()
);

alter table scraped_profiles enable row level security;

create policy "Scraped select own" on scraped_profiles
  for select using (user_id = auth.uid());
create policy "Scraped insert own" on scraped_profiles
  for insert with check (user_id = auth.uid());
create policy "Scraped delete own" on scraped_profiles
  for delete using (user_id = auth.uid());
```

### Migration history

| Date | Change |
|---|---|
| Initial | Create `profiles` + `scraped_profiles` tables |
| 2024-06-03 | Add `education` column to `scraped_profiles` |

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous key |
| `GROQ_API_KEY` | Yes | — | Groq API key for LLM inference |
| `LINKEDIN_EMAIL` | Yes | — | LinkedIn account email |
| `LINKEDIN_PASSWORD` | Yes | — | LinkedIn account password |
| `LOCAL_LLM` | — | `false` | Set `true` to use Ollama instead of Groq |
| `CORS_ORIGINS` | — | `http://localhost:80` | Comma-separated allowed origins |

## Services

| Service | Port | Description |
|---|---|---|
| Frontend | 80 | React SPA (nginx) — proxies `/api/*` to backend |
| Backend | 8000 | FastAPI + scraping + matching |

## Architecture Overview

```
Job Description → ai/parser.py (LLM) → structured criteria
  → api/routes.py (/api/scrape) → scraping/ (Playwright)
  → db/client.py (Supabase) → ai/matcher.py (semantic)
  → ranked results → Frontend UI
```

## Notes

- **Admin** role can scrape profiles; **viewer** role can only match against existing data.
- LinkedIn session data is persisted in a Docker volume — no re-login on restart.
- The scraper uses a two-phase approach: card extraction (fast, safe) then enrichment (with random delays to avoid rate limits).
