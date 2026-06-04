"""Person/Profile scraper for LinkedIn.

Extracts experience and education data by sending raw page text to Groq's
LLM for structured extraction — bypasses the fragile regex noise filtering
that kept failing against LinkedIn's ever-changing layout.
"""

import json
import logging
import os
import time
from typing import List, Optional
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from playwright.async_api import Page

from .base import BaseScraper
from ..models import Person, Experience, Education
from ..callbacks import ProgressCallback, SilentCallback
from ..core.exceptions import ScrapingError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Groq API helper — used to parse raw page text into structured data
# ---------------------------------------------------------------------------

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"


def _call_groq(prompt: str, max_tokens: int = 2048) -> str:
    """Call Groq chat-completions API with retry on 429 rate limits."""
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY is not set — cannot call Groq API")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.05,
        "max_tokens": max_tokens,
    }

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.post(GROQ_URL, json=payload, headers=headers, timeout=60)
            if response.status_code == 429 and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)  # 2, 4, 8 seconds
                logger.warning("Groq rate limited (429), retrying in %ds (attempt %d/%d)", wait, attempt + 1, max_retries)
                time.sleep(wait)
                continue
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        except requests.RequestException as e:
            if hasattr(e, 'response') and e.response is not None and e.response.status_code == 429 and attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning("Groq rate limited, retrying in %ds (attempt %d/%d)", wait, attempt + 1, max_retries)
                time.sleep(wait)
            else:
                raise


def _parse_llm_json(raw: str) -> list[dict]:
    """Extract a JSON array from an LLM response (handles markdown fences / preamble)."""
    if not raw:
        return []
    # Strip markdown code fences
    if "```" in raw:
        parts = raw.split("```")
        for part in parts:
            part = part.strip()
            if part and not part.startswith("json") and not part.startswith("```"):
                raw = part
                break
            elif part.lower().startswith("json"):
                raw = part[4:].strip()
                break
    # Find the outermost JSON array
    start = raw.find("[")
    end = raw.rfind("]")
    if start >= 0 and end > start:
        raw = raw[start:end+1]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Failed to parse LLM JSON response: %s", raw[:300])
        return []


# ---------------------------------------------------------------------------
# URL helper
# ---------------------------------------------------------------------------

def _clean_profile_url(profile_url: str) -> str:
    """Remove locale suffix (e.g. /en/, /fr/) from a LinkedIn profile URL.

    Some LinkedIn profiles have URLs like:
        https://www.linkedin.com/in/zakaria-ait-yakoub/en/

    When urljoin appends "details/experience", it produces:
        https://www.linkedin.com/in/zakaria-ait-yakoub/en/details/experience   (WRONG!)

    We need:
        https://www.linkedin.com/in/zakaria-ait-yakoub/details/experience      (CORRECT)
    """
    parsed = urlparse(profile_url)
    path = parsed.path.rstrip("/")

    # If the last path segment is a 2-letter locale (en, fr, de, es, etc.),
    # remove it so urljoin produces the correct details URL.
    # We require >= 4 parts (['', 'in', '<username>', '<locale>']) to avoid
    # stripping a 2-letter username like /in/me or /in/ab.
    parts = path.split("/")
    if len(parts) >= 4 and len(parts[-1]) == 2 and parts[-1].isalpha():
        parts = parts[:-1]
        path = "/".join(parts)
        parsed = parsed._replace(path=path)

    return urlunparse(parsed)


# ---------------------------------------------------------------------------
# Groq-based extraction prompts
# ---------------------------------------------------------------------------

_EXPERIENCE_PROMPT = """You are a data extraction assistant. Extract work experience entries from the LinkedIn profile text below.

The text may contain sidebar junk, footer links, "More profiles for you" recommendations, connection cards, language selectors, etc. — IGNORE all of that. Only extract actual work experience entries.

For each experience entry, extract these fields:
- "position_title": string (the job title / role)
- "institution_name": string (the company / organization name)
- "from_date": string (start date, e.g. "Feb 2020" — empty if not found)
- "to_date": string (end date, e.g. "May 2025" or "Present" — empty if not found)
- "duration": string (e.g. "5 yrs 4 mos" — empty if not found)
- "location": string (the work location — empty if not found)
- "description": string (full description text, or empty if none)

Return ONLY a JSON array of objects — no markdown, no code fences, no explanation.
If no experience entries are found, return an empty array [].

TEXT:
{text}

JSON:"""


_EDUCATION_PROMPT = """You are a data extraction assistant. Extract education entries from the LinkedIn profile text below.

The text may contain sidebar junk, footer links, "More profiles for you" recommendations, connection cards, language selectors, etc. — IGNORE all of that. Only extract actual education entries.

For each education entry, extract these fields:
- "institution_name": string (school / university name)
- "degree": string (e.g. "Master's degree", "Engineer's degree", "Bachelor's degree" — empty if not found)
- "from_date": string (start year/date — empty if not found)
- "to_date": string (end year/date — empty if not found)
- "description": string (any additional details like field of study, activities, skills, grades — empty if not found)

Return ONLY a JSON array of objects — no markdown, no code fences, no explanation.
If no education entries are found, return an empty array [].

TEXT:
{text}

JSON:"""


# ---------------------------------------------------------------------------
# Main scraper class
# ---------------------------------------------------------------------------

class PersonScraper(BaseScraper):
    """Async scraper for LinkedIn person profiles."""

    def __init__(self, page: Page, callback: Optional[ProgressCallback] = None):
        super().__init__(page, callback)

    async def scrape(self, linkedin_url: str) -> Person:
        """Scrape a LinkedIn person profile."""
        await self.callback.on_start("person", linkedin_url)

        try:
            await self.navigate_and_wait(linkedin_url)
            await self.callback.on_progress("Navigated to profile", 10)

            try:
                await self.ensure_logged_in()
            except Exception as auth_err:
                logger.debug("Login check warning (non-fatal): %s", auth_err)

            await self.page.wait_for_selector("main", timeout=10000)
            await self.wait_and_focus(1)

            name, location, headline = await self._get_name_and_location()
            await self.callback.on_progress(f"Got name: {name}", 20)

            open_to_work = await self._check_open_to_work()
            about = await self._get_about()
            await self.callback.on_progress("Got about section", 30)

            await self.scroll_page_to_half()
            await self.scroll_page_to_bottom(pause_time=0.5, max_scrolls=3)

            experiences = await self._get_experiences(linkedin_url)
            await self.callback.on_progress(f"Got {len(experiences)} experiences", 60)

            educations = await self._get_educations(linkedin_url)
            await self.callback.on_progress(f"Got {len(educations)} educations", 50)

            person = Person(
                linkedin_url=linkedin_url,
                name=name,
                headline=headline or None,
                location=location,
                about=about,
                open_to_work=open_to_work,
                experiences=experiences,
                educations=educations,
            )

            await self.callback.on_progress("Scraping complete", 100)
            await self.callback.on_complete("person", person)
            return person

        except Exception as e:
            await self.callback.on_error(e)
            raise ScrapingError(f"Failed to scrape person profile: {e}")

    async def _get_name_and_location(self) -> tuple[str, Optional[str], Optional[str]]:
        """Extract name, location, and headline from the profile page.

        Primary: parse `document.title` — LinkedIn format is always
        "Name - Headline | LinkedIn" — pure Python, no API call, no JS, no regex.
        Fallback: h1 element for name, empty headline.
        """
        name = "Unknown"
        headline = ""

        try:
            # Get document.title + h1 name in one simple evaluate (no regex, no split)
            page_data = await self.page.evaluate(
                """() => ({
                    title: document.title,
                    h1: document.querySelector('h1')?.innerText?.trim() || ''
                })"""
            )
            doc_title = page_data.get("title") or ""
            h1_name = page_data.get("h1") or ""

            # Parse document.title: LinkedIn format "Name - Headline | LinkedIn"
            if doc_title:
                # Remove " | LinkedIn" suffix
                without_suffix = doc_title.rsplit("|", 1)[0].strip() if "|" in doc_title else doc_title

                # Split on " - " to get name and headline
                if " - " in without_suffix:
                    parts = without_suffix.split(" - ", 1)
                    if len(parts) == 2:
                        parsed_name = parts[0].strip()
                        parsed_headline = parts[1].strip()
                        if parsed_name and " " in parsed_name:
                            name = parsed_name
                        if parsed_headline:
                            headline = parsed_headline
                            logger.info("Got headline from title: %s", headline[:80])

            # Fallback for name: use h1 if title didn't yield a valid name
            if name == "Unknown" or len(name) < 2 or " " not in name:
                if h1_name and " " in h1_name:
                    name = h1_name

            return name, None, headline

        except Exception as e:
            logger.warning("Error getting name/location/headline: %s", e)
            return "Unknown", None, ""

    async def _check_open_to_work(self) -> bool:
        """Check if profile has open to work badge."""
        try:
            return await self.page.evaluate(
                "() => document.body.innerText.includes('#opentowork') || "
                "document.body.innerText.includes('Open to work')"
            )
        except Exception:
            return False

    async def _get_about(self) -> Optional[str]:
        """Extract about section."""
        try:
            about = await self.page.evaluate("""() => {
                const headings = document.querySelectorAll('h2');
                for (const h of headings) {
                    const text = h.innerText.trim().toLowerCase();
                    if (text === 'about' || text.startsWith('about')) {
                        const section = h.closest('section') || h.parentElement;
                        if (section) {
                            const full = section.innerText.trim();
                            return full.replace(/^About\s*/i, '').trim();
                        }
                    }
                }
                return '';
            }""")
            return about if about else None
        except Exception:
            return None

    # ------------------------------------------------------------------
    # Experience extraction via Groq
    # ------------------------------------------------------------------

    async def _get_experiences(self, base_url: str) -> list[Experience]:
        """Extract experiences by sending raw page text to Groq for structured parsing."""
        experiences = []

        try:
            clean_url = _clean_profile_url(base_url)
            exp_url = urljoin(clean_url, "details/experience")
            await self.navigate_and_wait(exp_url)
            await self.page.wait_for_selector("main", timeout=15000)
            await self.wait_and_focus(2)
            await self.scroll_page_to_half()
            await self.scroll_page_to_bottom(pause_time=0.5, max_scrolls=3)

            # Grab raw text — no filtering needed, Groq will handle the noise
            raw_text = await self.page.evaluate(
                "() => document.querySelector('main') ? document.querySelector('main').innerText : ''"
            )

            if not raw_text or len(raw_text.strip()) < 20:
                logger.debug("No text found on experience details page")
                return experiences

            logger.debug("Sending %d chars of raw experience text to Groq", len(raw_text))

            prompt = _EXPERIENCE_PROMPT.format(text=raw_text[:8000])  # limit context
            response = _call_groq(prompt, max_tokens=4096)
            items = _parse_llm_json(response)

            for item in items:
                experiences.append(Experience(
                    position_title=item.get("position_title") or "",
                    institution_name=item.get("institution_name") or "",
                    from_date=item.get("from_date") or None,
                    to_date=item.get("to_date") or None,
                    duration=item.get("duration") or None,
                    location=item.get("location") or None,
                    description=item.get("description") or "",
                ))

            logger.info("Groq extracted %d experience entries from %d chars", len(experiences), len(raw_text))

        except ValueError as e:
            logger.error("Groq API key error for experiences: %s", e)
        except requests.RequestException as e:
            logger.error("Groq API request failed for experiences: %s", e)
        except Exception as e:
            logger.warning("Error getting experiences: %s", e)

        return experiences

    # ------------------------------------------------------------------
    # Education extraction via Groq
    # ------------------------------------------------------------------

    async def _get_educations(self, base_url: str) -> list[Education]:
        """Extract educations by sending raw page text to Groq for structured parsing."""
        educations = []

        try:
            clean_url = _clean_profile_url(base_url)
            edu_url = urljoin(clean_url, "details/education")
            await self.navigate_and_wait(edu_url)
            await self.page.wait_for_selector("main", timeout=15000)
            await self.wait_and_focus(2)
            await self.scroll_page_to_half()
            await self.scroll_page_to_bottom(pause_time=0.5, max_scrolls=3)

            # Grab raw text
            raw_text = await self.page.evaluate(
                "() => document.querySelector('main') ? document.querySelector('main').innerText : ''"
            )

            if not raw_text or len(raw_text.strip()) < 20:
                logger.debug("No text found on education details page")
                return educations

            logger.debug("Sending %d chars of raw education text to Groq", len(raw_text))

            prompt = _EDUCATION_PROMPT.format(text=raw_text[:8000])
            response = _call_groq(prompt, max_tokens=2048)
            items = _parse_llm_json(response)

            for item in items:
                educations.append(Education(
                    institution_name=item.get("institution_name") or "",
                    degree=item.get("degree") or None,
                    from_date=item.get("from_date") or None,
                    to_date=item.get("to_date") or None,
                    description=item.get("description") or "",
                ))

            logger.info("Groq extracted %d education entries from %d chars", len(educations), len(raw_text))

        except ValueError as e:
            logger.error("Groq API key error for educations: %s", e)
        except requests.RequestException as e:
            logger.error("Groq API request failed for educations: %s", e)
        except Exception as e:
            logger.warning("Error getting educations: %s", e)

        return educations
