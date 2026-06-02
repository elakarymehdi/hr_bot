# HR Profile Matcher

HR Profile Matcher is a full-stack HR SaaS platform where users authenticate, define job criteria (form or natural language), generate a structured LinkedIn search query, scrape real profiles, and match candidates using NLP embeddings. Each user’s scraped profiles are private in Supabase.

## Stack
- **Backend:** FastAPI (Python)
- **Scraping:** Selenium + BeautifulSoup
- **NLP Matching:** SentenceTransformers `all-MiniLM-L6-v2` + cosine similarity
- **NL Parsing / Query Structuring:** Ollama `phi3`
- **Auth + DB:** Supabase (Auth + PostgreSQL)
- **Frontend:** React + Tailwind CSS

## Prerequisites
- Python 3.10+
- Node.js 18+
- Google Chrome installed
- Ollama running locally

## Supabase Setup

### Tables + RLS
Run the SQL below in Supabase SQL editor:

```sql
create table if not exists profiles (
  id uuid primary key references auth.users,
  email text,
  role text default 'viewer',
  created_at timestamp default now()
);

alter table profiles enable row level security;

create policy "Profiles read own"
on profiles for select
using (id = auth.uid());

create policy "Profiles insert own"
on profiles for insert
with check (id = auth.uid());

create policy "Profiles update own"
on profiles for update
using (id = auth.uid());

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

create policy "Scraped select own"
on scraped_profiles for select
using (user_id = auth.uid());

create policy "Scraped insert own"
on scraped_profiles for insert
with check (user_id = auth.uid());

create policy "Scraped delete own"
on scraped_profiles for delete
using (user_id = auth.uid());
```

## Environment Variables
Create `.env` in the project root:

```bash
cp .env.example .env
```

Fill in:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
LINKEDIN_EMAIL=...
LINKEDIN_PASSWORD=...
```

## Ollama Setup
Make sure Ollama is running and the model is pulled:

```bash
ollama run phi3
```

## Install Dependencies

```bash
pip install -r requirements.txt
```

```bash
cd frontend
npm install
```

## Run (Single Command)

```bash
cd frontend
npm run dev
```

This starts:
- **FastAPI** on `http://localhost:8000`
- **Vite** on `http://localhost:5173`

## Notes
- **Admins** can scrape and refresh profiles.
- **Viewers** can only match against existing Supabase data (or `mock_profiles.json` if empty).
- LinkedIn cookies are saved in `credentials/linkedin_cookies.json` after a successful login.
