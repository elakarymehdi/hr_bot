"""Playwright-based LinkedIn scraper adapter using the linkedin_scraper library.

Provides the same interface as profile_scraper.py (scrape_profiles) but uses
the async Playwright-based linkedin_scraper library under the hood.
"""

import asyncio
import logging
import os
import random
from pathlib import Path
from typing import List
from urllib.parse import quote_plus

from dotenv import load_dotenv
from linkedin_scraper import (
    BrowserManager,
    PersonScraper,
    SilentCallback,
)
from playwright.async_api import TimeoutError as PlaywrightTimeout

from linkedin_scraper.core.exceptions import (
    AuthenticationError,
    RateLimitError,
    ScrapingError,
)

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

logger = logging.getLogger(__name__)

SESSION_PATH = os.path.join(
    os.path.dirname(__file__), "credentials", "linkedin_session.json"
)


async def _find_visible_input_playwright(page, autocomplete_value: str):
    """Find a visible input by matching its autocomplete attribute.

    LinkedIn SDUI renders forms with auto-generated IDs, so we scan all
    input elements and match by autocomplete attribute, checking visibility.
    Uses contains-match because LinkedIn sometimes includes extra tokens
    like "username webauthn" on the visible field.
    """
    try:
        inputs = await page.query_selector_all("input")
        for inp in inputs:
            try:
                visible = await inp.is_visible()
                if not visible:
                    continue
                ac = (await inp.get_attribute("autocomplete") or "").lower()
                if autocomplete_value.lower() in ac:
                    return inp
            except Exception:
                continue
    except Exception:
        pass
    return None


async def _login_playwright(page, email: str, password: str) -> bool:
    """Login to LinkedIn using Playwright with SDUI-compatible input detection."""
    # Navigate to login
    await page.goto(
        "https://www.linkedin.com/login",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    await asyncio.sleep(3)

    # ---- Handle "Welcome Back" page variants ----
    welcome_patterns = [
        "Sign in using another account",
        "Sign in as someone else",
        "Not you?",
        "Use another account",
        "Sign in with a different account",
    ]
    for pattern in welcome_patterns:
        try:
            elements = page.locator(f"text={pattern}")
            if await elements.count() > 0:
                logger.info("Detected 'Welcome Back' page, clicking '%s'...", pattern)
                await elements.first.click()
                await asyncio.sleep(3)
                break
        except Exception:
            continue

    # If password field not visible, try clicking "Sign in" button
    if not await _find_visible_input_playwright(page, "current-password"):
        try:
            sign_in_btn = page.locator("button:has-text('Sign in')")
            if await sign_in_btn.count() > 0:
                logger.info("Clicking 'Sign in' button to reveal login form...")
                await sign_in_btn.first.click()
                await asyncio.sleep(2)
        except Exception:
            pass

    # Wait for inputs to appear (polling approach — LinkedIn has many hidden inputs
    # and wait_for_selector can get stuck on DOM mutations)
    inputs_ready = False
    for _ in range(20):  # 20 * 0.5s = 10s total
        all_inputs = await page.query_selector_all("input")
        if all_inputs:
            inputs_ready = True
            break
        await asyncio.sleep(0.5)
    if not inputs_ready:
        logger.error("No input fields appeared on the login page")
        await _save_debug_page(page)
        return False

    # Find email field
    email_input = await _find_visible_input_playwright(page, "username")
    if not email_input:
        logger.error("Could not find email input on LinkedIn login page")
        await _save_debug_page(page)
        return False

    logger.info("Filling in email field...")
    await email_input.click()
    await asyncio.sleep(0.3)
    await email_input.fill("")
    for char in email:
        await email_input.type(char, delay=random.randint(30, 80))

    # Find password field
    password_input = await _find_visible_input_playwright(page, "current-password")
    if not password_input:
        logger.error("Could not find password input on LinkedIn login page")
        await _save_debug_page(page)
        return False

    logger.info("Filling in password field...")
    await password_input.click()
    await asyncio.sleep(0.3)
    await password_input.fill("")
    for char in password:
        await password_input.type(char, delay=random.randint(30, 80))

    # Submit
    await password_input.press("Enter")
    await asyncio.sleep(5)

    current_url = page.url
    if "feed" in current_url:
        logger.info("Login successful")
        return True
    if "checkpoint" in current_url or "challenge" in current_url:
        logger.error("LinkedIn checkpoint challenge detected.")
        return False

    logger.warning("Login may have failed — current URL: %s", current_url)
    return False


async def _save_debug_page(page):
    """Save debug artifacts when login fails."""
    try:
        await page.screenshot(path="/tmp/linkedin_playwright_debug.png")
        logger.info("Saved debug screenshot to /tmp/linkedin_playwright_debug.png")
        html = await page.content()
        with open("/tmp/linkedin_playwright_debug.html", "w", encoding="utf-8") as f:
            f.write(html[:50000])
        logger.info("Saved debug page source to /tmp/linkedin_playwright_debug.html")
    except Exception as exc:
        logger.warning("Could not save debug artifacts: %s", exc)


async def _login_and_search(
    browser: BrowserManager, search_query: str, max_results: int
) -> List[dict]:
    """Login to LinkedIn, search for people, and scrape profiles.

    Returns:
        List of profile dicts matching the format used by profile_scraper.py
    """
    email = os.getenv("LINKEDIN_EMAIL") or os.getenv("LINKEDIN_USERNAME")
    password = os.getenv("LINKEDIN_PASSWORD")

    if not email or not password:
        logger.error("LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set for login.")
        return []

    # Try loading a saved session first
    # IMPORTANT: Always re-acquire page from browser after load_session,
    # because load_session creates a new context + page internally.
    session_loaded = False
    if os.path.exists(SESSION_PATH):
        try:
            await browser.load_session(SESSION_PATH)
            page = browser.page  # Get the NEW page after session load
            await page.goto(
                "https://www.linkedin.com/feed/",
                wait_until="domcontentloaded",
                timeout=30000,
            )
            await asyncio.sleep(2)
            if "feed" in page.url and "login" not in page.url:
                session_loaded = True
                logger.info("Logged in via saved session")
        except Exception as e:
            logger.info("Session expired or invalid: %s", e)

    if not session_loaded:
        page = browser.page  # Get the current page (fresh session context)
        logger.info("Logging in with credentials (Playwright)...")
        success = await _login_playwright(page, email, password)
        if not success:
            return []

        # Save session for next time
        try:
            await browser.save_session(SESSION_PATH)
        except Exception as e:
            logger.warning("Could not save session: %s", e)
    else:
        page = browser.page

    # --- Search for people ---
    search_url = (
        "https://www.linkedin.com/search/results/people/?keywords="
        f"{quote_plus(search_query)}"
    )
    logger.info("Navigating to search results: %s", search_url)
    await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(3)

    # Scroll to load more results
    for _ in range(3):
        await page.evaluate("window.scrollBy(0, 600)")
        await asyncio.sleep(1.5)

    # Extract profile URLs from search results
    profile_urls = await page.evaluate(
        """() => {
        const links = document.querySelectorAll('a[href*="/in/"]');
        const urls = [];
        const seen = new Set();
        for (const link of links) {
            const href = link.href;
            if (href.includes('linkedin.com/in/') && !seen.has(href)) {
                seen.add(href);
                urls.push(href);
            }
        }
        return urls;
    }"""
    )

    profile_urls = profile_urls[:max_results]
    logger.info("Found %d unique profile URLs", len(profile_urls))

    if not profile_urls:
        logger.warning("No profile links found on search results page")
        return []

    # --- Scrape each profile ---
    scraper = PersonScraper(page, callback=SilentCallback())
    profiles = []
    auth_failed = False

    for profile_url in profile_urls:
        if len(profiles) >= max_results or auth_failed:
            break

        # Rate limiting delay between profiles (human-like, longer)
        delay = random.uniform(15, 30)
        await asyncio.sleep(delay)

        # Retry up to 2 times on rate-limit related errors
        for attempt in range(3):
            try:
                person = await scraper.scrape(profile_url)
                logger.info("Scraped: %s", person.name)

                # Build experience text from structured data
                experience_texts = []
                for exp in person.experiences:
                    parts = [
                        exp.position_title or "",
                        exp.institution_name or "",
                        exp.duration or "",
                        exp.description or "",
                    ]
                    experience_texts.append(" - ".join(p for p in parts if p))

                # Build raw text for matching
                raw_parts = [
                    person.name or "",
                    person.job_title or "",
                    person.company or "",
                    person.location or "",
                    person.about or "",
                    " ".join(experience_texts),
                ]
                raw_text = " ".join(p for p in raw_parts if p).strip()

                profiles.append(
                    {
                        "name": person.name or "",
                        "title": person.job_title or "",
                        "company": person.company or "",
                        "location": person.location or "",
                        "profile_url": profile_url,
                        "summary": person.about or "",
                        "skills": [],  # Library doesn't have a dedicated skills field
                        "experience": experience_texts,
                        "raw_text": raw_text,
                    }
                )
                break  # Success — exit retry loop

            except RateLimitError as e:
                backoff = 60 * (attempt + 1)
                logger.warning(
                    "Rate limited on %s (attempt %d/3). Backing off for %ds...",
                    profile_url, attempt + 1, backoff,
                )
                await asyncio.sleep(backoff)
                continue
            except AuthenticationError as e:
                logger.error("Authentication error during profile scrape: %s", e)
                auth_failed = True
                break  # Exit retry loop; outer loop checks auth_failed flag
            except ScrapingError as e:
                err_msg = str(e).lower()
                if "rate limit" in err_msg or "too many" in err_msg or "slow down" in err_msg:
                    backoff = 60 * (attempt + 1)
                    logger.warning(
                        "ScrapingError (rate-limit-like) on %s (attempt %d/3). Backing off %ds...",
                        profile_url, attempt + 1, backoff,
                    )
                    await asyncio.sleep(backoff)
                    continue
                logger.warning("ScrapingError on %s: %s", profile_url, e)
                break  # Non-rate-limit ScrapingError — skip profile
            except Exception as e:
                logger.warning("Error scraping profile %s: %s", profile_url, e)
                break  # Unknown error — skip profile

    logger.info(
        "Scraped %d/%d profiles (library adapter)",
        len(profiles),
        len(profile_urls),
    )
    return profiles


async def scrape_profiles_lib(
    search_query: str, max_results: int = 20
) -> List[dict]:
    """Scrape LinkedIn profiles using the Playwright-based library.

    Async entry point — call with await. Compatible with profile_scraper.py's
    scrape_profiles() signature when wrapped in asyncio.run() from sync context.

    Args:
        search_query: LinkedIn search query
        max_results: Maximum number of profiles to scrape (default: 20, max: 20)

    Returns:
        List of profile dicts with keys: name, title, company, location,
        profile_url, summary, skills, experience, raw_text
    """
    max_results = min(max_results, 20)

    try:
        async with BrowserManager(
            headless=True,
            viewport={"width": 1920, "height": 1080},
        ) as browser:
            return await _login_and_search(browser, search_query, max_results)
    except Exception as e:
        logger.error("Scraping failed: %s", e)
        return []
