"""Application configuration — centralized settings from environment variables.

All configuration values are read once at import time. Override any value
by setting the corresponding environment variable.
"""

import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# Absolute path to the backend/ directory (where this file lives)
APP_DIR = Path(__file__).resolve().parent

CREDENTIALS_DIR = APP_DIR / "credentials"

# ---------------------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------------------

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")

# ---------------------------------------------------------------------------
# LinkedIn Credentials
# ---------------------------------------------------------------------------

LINKEDIN_EMAIL: str = os.getenv("LINKEDIN_EMAIL", "") or os.getenv("LINKEDIN_USERNAME", "")
LINKEDIN_PASSWORD: str = os.getenv("LINKEDIN_PASSWORD", "")

# Paths for cached authentication sessions
COOKIES_PATH: str = str(CREDENTIALS_DIR / "linkedin_cookies.json")
SESSION_PATH: str = str(CREDENTIALS_DIR / "linkedin_session.json")

# ---------------------------------------------------------------------------
# LLM Provider
# ---------------------------------------------------------------------------

LOCAL_LLM: bool = os.getenv("LOCAL_LLM", "false").strip().lower() == "true"
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

OLLAMA_URL: str = "http://localhost:11434/api/generate"
OLLAMA_MODEL: str = "phi3"

GROQ_URL: str = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL: str = "llama-3.3-70b-versatile"

# ---------------------------------------------------------------------------
# Scraping Behaviour
# ---------------------------------------------------------------------------

# Random delay range (seconds) between individual profile enrichment visits
SCRAPING_MIN_PROFILE_DELAY: int = 3
SCRAPING_MAX_PROFILE_DELAY: int = 8

# Maximum profiles per scrape
SCRAPING_MAX_RESULTS: int = 20

# ---------------------------------------------------------------------------
# Web API (CORS)
# ---------------------------------------------------------------------------

CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:80").split(",")
