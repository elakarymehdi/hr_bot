# HR Profile Matcher

HR Profile Matcher is a full-stack HR SaaS platform where users authenticate, define job criteria (form or natural language), generate a structured LinkedIn search query, scrape real profiles, and match candidates using NLP embeddings. Each user's scraped profiles are private in Supabase.

## Project Structure

```
hr_profile_matcher/
├── backend/              # FastAPI Python backend
│   ├── main.py           # API server
│   ├── matcher.py        # NLP candidate matching
│   ├── ollama_parser.py  # NL parsing + query generation (Groq/Ollama)
│   ├── supabase_client.py
│   ├── profile_scraper.py   # Legacy Selenium scraper
│   ├── scraper_lib_adapter.py  # Playwright-based scraper
│   ├── cli.py            # CLI entry point
│   ├── scraper_lib/      # LinkedIn scraper library (pip-installable)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
├── frontend/             # React + Vite + Tailwind CSS
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   ├── nginx.conf        # Production nginx config
│   └── package.json
├── docker-compose.yml    # Orchestrates backend + frontend
├── .env.example
├── mock_profiles.json    # Fallback data when DB is empty
├── .gitignore
└── README.md
```

## Stack

- **Backend:** FastAPI (Python)
- **Scraping:** Playwright (primary) + Selenium/BeautifulSoup (legacy)
- **NLP Matching:** SentenceTransformers `all-MiniLM-L6-v2` + cosine similarity
- **NL Parsing / Query Structuring:** Groq API (default) or Ollama `phi3` (local)
- **Auth + DB:** Supabase (Auth + PostgreSQL)
- **Frontend:** React + Tailwind CSS (Vite build)

## Quick Start with Docker

### Prerequisites
- Docker & Docker Compose

### Setup

1. **Clone and create `.env`:**
   ```bash
   cp .env.example .env
   ```
   Fill in your Supabase credentials, LinkedIn credentials, and Groq API key.

2. **Build and start:**
   ```bash
   docker compose up --build -d
   ```

3. **Open the app:** http://localhost

### Services

| Service  | Port | Description                      |
|----------|------|----------------------------------|
| Frontend | 80   | React SPA (nginx)                |
| Backend  | 8000 | FastAPI + scraping + matching    |

The frontend nginx server proxies `/api/` requests to the backend automatically.

## Development Without Docker

### Prerequisites
- Python 3.10+
- Node.js 18+
- Playwright Chromium (`playwright install chromium`)
- Ollama running locally (optional, for LOCAL_LLM=true)

### Install Dependencies

```bash
# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install -e scraper_lib/
.venv/bin/pip install playwright
.venv/bin/playwright install chromium
.venv/bin/playwright install-deps chromium

# Frontend
cd frontend
npm install
```

### Run

```bash
# Terminal 1: Backend
cd backend
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Frontend (Vite dev server with API proxy)
cd frontend
npm run dev
```

Vite dev server runs at http://localhost:5173 and proxies `/api/` to the backend.

## Supabase Setup

Run this SQL in Supabase SQL editor:

```sql
create table if not exists profiles (
  id uuid primary key references auth.users,
  email text,
  role text default 'viewer',
  created_at timestamp default now()
);
alter table profiles enable row level security;

create policy "Profiles read own" on profiles for select using (id = auth.uid());
create policy "Profiles insert own" on profiles for insert with check (id = auth.uid());
create policy "Profiles update own" on profiles for update using (id = auth.uid());

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
  raw_text text,
  scraped_at timestamp default now()
);
alter table scraped_profiles enable row level security;

create policy "Scraped select own" on scraped_profiles for select using (user_id = auth.uid());
create policy "Scraped insert own" on scraped_profiles for insert with check (user_id = auth.uid());
create policy "Scraped delete own" on scraped_profiles for delete using (user_id = auth.uid());
```

## Environment Variables

See `.env.example` for all required variables. Key variables:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `LINKEDIN_EMAIL` | LinkedIn account email |
| `LINKEDIN_PASSWORD` | LinkedIn account password |
| `LOCAL_LLM` | Set to `true` to use Ollama instead of Groq |
| `GROQ_API_KEY` | Groq API key (required unless `LOCAL_LLM=true`) |

## Notes

- **Admins** can scrape and refresh profiles. **Viewers** can only match against existing data.
- LinkedIn session data is persisted in a Docker volume (`linkedin_sessions`) so you don't need to re-login on each restart.
- The backend's CORS allows requests from `localhost:5173` (Vite dev) and `localhost` (Docker nginx).
