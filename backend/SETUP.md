# Setup Guide

## Prerequisites

- **Python 3.11+** (if running manually)
- **Docker & Docker Compose** (recommended)
- **Supabase project** — create one at [supabase.com](https://supabase.com) (free tier)
- **Groq API key** — get one at [console.groq.com](https://console.groq.com) (free tier)
- **LinkedIn account** — used for profile scraping

## Option 1: Docker Compose (recommended)

### 1. Clone the repository

```bash
git clone <repo-url>
cd hr_bot
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```ini
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...  # your anon key

# Groq API (for LLM-powered parsing)
GROQ_API_KEY=gsk_...       # your Groq API key

# LinkedIn credentials
LINKEDIN_EMAIL=your.email@example.com
LINKEDIN_PASSWORD=your-password

# Frontend (these get baked into the React build)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  # same anon key
```

### 3. Start the stack

```bash
docker compose up -d
```

This starts:
- **Backend** (FastAPI) → `http://localhost:8000`
- **Frontend** (React + nginx) → `http://localhost:80`

### 4. Verify

```bash
curl http://localhost:8000/api/health
# → {"status": "ok"}
```

Open `http://localhost` in your browser — you should see the landing page.

### 5. View logs

```bash
docker compose logs -f backend   # Backend logs
docker compose logs -f frontend  # Frontend logs
```

### 6. Restart after changes

```bash
docker compose up -d --build
```

---

## Option 2: Manual Setup

### 1. Backend

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# Install dependencies
pip install -r requirements.txt

# Install Playwright with Chromium
pip install playwright
playwright install chromium
playwright install-deps chromium  # Linux system deps

# Install the vendored scraper library
pip install ./scraping/scraper_lib/

# Configure environment
cp ../.env.example ../.env
# Edit .env with your credentials...

# Start the API server
python cli.py serve
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Environment Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | — | Supabase anonymous key |
| `GROQ_API_KEY` | Yes | — | Groq API key for LLM inference |
| `LINKEDIN_EMAIL` | Yes | — | LinkedIn account email |
| `LINKEDIN_PASSWORD` | Yes | — | LinkedIn account password |
| `LOCAL_LLM` | — | `false` | Set `true` to use Ollama instead of Groq |
| `CORS_ORIGINS` | — | `http://localhost:5173` | Comma-separated allowed CORS origins |
| `VITE_SUPABASE_URL` | Yes | — | Same as SUPABASE_URL (for frontend build) |
| `VITE_SUPABASE_ANON_KEY` | Yes | — | Same as SUPABASE_ANON_KEY (for frontend build) |

## Scraper Session

On first scrape, the backend logs into LinkedIn and saves a session file to `backend/credentials/linkedin_session.json`. This session is reused on subsequent runs, avoiding repeated logins. If the session expires, the scraper automatically re-authenticates.

## Troubleshooting

### "Groq API request failed"

- Check that `GROQ_API_KEY` is set correctly in `.env`
- Groq free tier has rate limits (~30 req/min). The scraper adds random delays to stay within limits.
- Set `LOCAL_LLM=true` to use a local Ollama instance as fallback.

### "LinkedIn session expired"

Delete the session file and restart:

```bash
rm backend/credentials/linkedin_session.json
docker compose up -d --build
```

### "Playwright Chromium not found"

```bash
docker compose up -d --build
```

The Docker build stage installs Chromium automatically.

### Frontend shows blank page

Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env` — these are required at build time.
