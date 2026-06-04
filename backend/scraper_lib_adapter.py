"""Playwright-based LinkedIn scraper adapter using the linkedin_scraper library.

Two-phase extraction:
1. Card phase — extract name, title, company, location from search result cards
   (always succeeds, minimal rate-limiting risk)
2. Enrichment phase — visit each profile page to get about, experiences,
   education using PersonScraper from the linkedin_scraper library.
   Uses human-like delays (5-15s random jitter), comprehensive stealth
   scripts, feed page resets between profiles, and gracefully falls
   back to card data if rate-limited.
"""

import asyncio
import logging
import os
import random
from typing import List
from urllib.parse import quote_plus

from dotenv import load_dotenv
from linkedin_scraper import BrowserManager, PersonScraper, SilentCallback

load_dotenv()

logger = logging.getLogger(__name__)

SESSION_PATH = os.path.join(
    os.path.dirname(__file__), "credentials", "linkedin_session.json"
)

# Delay range between profile enrichment visits (seconds)
MIN_PROFILE_DELAY = 3
MAX_PROFILE_DELAY = 8

# ---------------------------------------------------------------------------
# Comprehensive stealth script — covers most LinkedIn fingerprinting checks
# ---------------------------------------------------------------------------
STEALTH_SCRIPT = """
// Override navigator.webdriver — LinkedIn's primary check
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// Override chrome.runtime to appear as a real browser
window.chrome = window.chrome || {};
window.chrome.runtime = {};

// Set realistic navigator properties
Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
});
Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
});
Object.defineProperty(navigator, 'platform', {
    get: () => 'Linux x86_64',
});

// Override permissions query to avoid headless notification check
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => {
    if (parameters.name === 'notifications') {
        try {
            return Promise.resolve({ state: Notification.permission });
        } catch (_) {
            return Promise.resolve({ state: 'default' });
        }
    }
    return originalQuery(parameters);
};

// Override webdriver getter on prototype chain
delete navigator.__proto__.webdriver;

// Override connection rtt to appear normal
if (navigator.connection) {
    Object.defineProperty(navigator.connection, 'rtt', {
        get: () => Math.floor(Math.random() * 100) + 50,
    });
}

// Hide headless by making screen depth look real
Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

// Override hardwareConcurrency to appear normal (not 0 or very high)
Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => Math.floor(Math.random() * 4) + 4,
});

// Override deviceMemory
Object.defineProperty(navigator, 'deviceMemory', {
    get: () => Math.floor(Math.random() * 4) + 4,
});
"""


async def _apply_stealth(page) -> None:
    """Apply comprehensive anti-detection scripts to a Playwright page."""
    try:
        await page.add_init_script(STEALTH_SCRIPT)
    except Exception as e:
        logger.warning("Could not apply stealth script: %s", e)


async def _find_visible_input_playwright(page, autocomplete_value: str):
    """Find a visible input by matching its autocomplete attribute."""
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
    """Login to LinkedIn using Playwright."""
    await page.goto(
        "https://www.linkedin.com/login",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    await asyncio.sleep(3)

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

    if not await _find_visible_input_playwright(page, "current-password"):
        try:
            sign_in_btn = page.locator("button:has-text('Sign in')")
            if await sign_in_btn.count() > 0:
                logger.info("Clicking 'Sign in' button to reveal login form...")
                await sign_in_btn.first.click()
                await asyncio.sleep(2)
        except Exception:
            pass

    inputs_ready = False
    for _ in range(20):
        all_inputs = await page.query_selector_all("input")
        if all_inputs:
            inputs_ready = True
            break
        await asyncio.sleep(0.5)
    if not inputs_ready:
        logger.error("No input fields appeared on the login page")
        return False

    email_input = await _find_visible_input_playwright(page, "username")
    if not email_input:
        logger.error("Could not find email input on LinkedIn login page")
        return False

    logger.info("Filling in email field...")
    await email_input.click()
    await asyncio.sleep(0.3)
    await email_input.fill("")
    for char in email:
        await email_input.type(char, delay=random.randint(30, 80))

    password_input = await _find_visible_input_playwright(page, "current-password")
    if not password_input:
        logger.error("Could not find password input on LinkedIn login page")
        return False

    logger.info("Filling in password field...")
    await password_input.click()
    await asyncio.sleep(0.3)
    await password_input.fill("")
    for char in password:
        await password_input.type(char, delay=random.randint(30, 80))

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


async def _extract_card_data(page, max_results: int) -> List[dict]:
    """Extract profile data from LinkedIn search result cards."""
    card_data = await page.evaluate(
        """() => {
        const profiles = [];
        const seen = new Set();
        const links = document.querySelectorAll('a');
        for (const link of links) {
            const href = link.href;
            if (!href.includes('linkedin.com/in/') || seen.has(href)) continue;

            let cardEl = link;
            let cardText = '';
            for (let depth = 0; depth < 8; depth++) {
                if (!cardEl.parentElement) break;
                cardEl = cardEl.parentElement;
                const text = cardEl.innerText || '';
                const lines = text.split('\\n').filter(l => l.trim());
                if (lines.length >= 3) {
                    cardText = text;
                    break;
                }
            }

            if (!cardText) continue;
            seen.add(href);

            const lines = cardText.split('\\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 2) continue;

            const name = lines[0];
            if (!name) continue;

            let title = '';
            let location = '';
            let company = '';

            for (let i = 1; i < lines.length && i < 10; i++) {
                const line = lines[i];
                if (line.match(/^[\\s]*[\\u2022\\u2023\\u25E6\\*\\-]/) ||
                    line.match(/\\d+(st|nd|rd)\\s*(\\u2022|$)/)) {
                    continue;
                }
                if (/^(connect|message|follow|more|\\u2022|\\s*$)/i.test(line)) continue;
                if (line.toLowerCase().includes('mutual connection')) continue;
                if (line.toLowerCase().startsWith('summary:')) continue;

                if (!title) {
                    title = line;
                } else if (!location &&
                           !line.toLowerCase().startsWith('current:') &&
                           !line.toLowerCase().startsWith('past:')) {
                    location = line;
                } else if (line.toLowerCase().startsWith('current:')) {
                    company = line.replace(/^current:\\s*/i, '').trim();
                }
            }

            profiles.push({
                url: href,
                name: name,
                title: title,
                location: location,
                company: company,
            });

            if (profiles.length >= 25) break;
        }
        return profiles;
    }"""
    )

    logger.info("Found %d profiles in search results", len(card_data))
    return card_data[:max_results]


def _build_card_profile(card: dict) -> dict:
    """Build a profile dict from card data (baseline with empty enrichment fields)."""
    name = card["name"]
    title = card["title"]
    company = card["company"]
    location = card["location"]

    if name and title:
        raw_text = f"{name} is a {title}"
        if company:
            raw_text += f" at {company}"
    elif name:
        raw_text = f"{name} works as a professional"
        if company:
            raw_text += f" at {company}"
    else:
        raw_text = title or "A professional"
        if company and title:
            raw_text += f" at {company}"
        elif company and not title:
            raw_text = company
    if location:
        raw_text += f", based in {location}"
    raw_text += "."

    return {
        "name": name,
        "title": title,
        "company": company,
        "location": location,
        "profile_url": card["url"],
        "summary": "",
        "skills": [],
        "experience": [],
        "education": [],
        "raw_text": raw_text,
    }


async def _enrich_profile(
    page, profile: dict, index: int, total: int
) -> dict:
    """Enrich a single profile by visiting its page using PersonScraper.

    PersonScraper handles navigation to profile page, experience, and
    education detail pages, using page.evaluate() for robust text
    extraction (not dependent on LinkedIn's changing CSS selectors).
    Falls back to card data on any error.
    """
    profile_url = profile["profile_url"]
    logger.info("Enriching profile %d/%d: %s", index + 1, total, profile_url)

    delay = random.uniform(MIN_PROFILE_DELAY, MAX_PROFILE_DELAY)
    logger.debug("Waiting %.1fs before enrichment...", delay)
    await asyncio.sleep(delay)

    try:
        await _apply_stealth(page)

        # Use PersonScraper to handle navigation + extraction
        scraper = PersonScraper(page, callback=SilentCallback())
        person = await scraper.scrape(profile_url)

        # Update profile with PersonScraper data
        # PersonScraper gets: name, headline, location, about, experiences, educations
        if person.name and person.name != "Unknown":
            profile["name"] = person.name
        if person.headline:
            profile["title"] = person.headline
        if person.location:
            profile["location"] = person.location
        if person.about:
            profile["summary"] = person.about

        # Build experience texts from Experience objects
        if person.experiences:
            exp_texts = []
            for exp in person.experiences:
                parts = []
                if exp.position_title:
                    parts.append(exp.position_title)
                if exp.institution_name:
                    parts.append(exp.institution_name)
                if exp.from_date or exp.to_date:
                    parts.append(f"{exp.from_date or ''} - {exp.to_date or ''}")
                if exp.duration:
                    parts.append(f"({exp.duration})")
                if exp.description:
                    parts.append(exp.description)
                text = " · ".join(p for p in parts if p)
                if text:
                    exp_texts.append(text)
            if exp_texts:
                profile["experience"] = exp_texts
                logger.info("  Extracted %d experience entries", len(exp_texts))

        # Build education texts from Education objects
        if person.educations:
            edu_texts = []
            for edu in person.educations:
                parts = []
                if edu.institution_name:
                    parts.append(edu.institution_name)
                if edu.degree:
                    parts.append(edu.degree)
                if edu.from_date or edu.to_date:
                    parts.append(f"{edu.from_date or ''} - {edu.to_date or ''}")
                if edu.description:
                    parts.append(edu.description)
                text = " · ".join(p for p in parts if p)
                if text:
                    edu_texts.append(text)
            if edu_texts:
                profile["education"] = edu_texts
                logger.info("  Extracted %d education entries", len(edu_texts))

        # Rebuild raw_text
        raw_parts = [
            profile["name"],
            profile["title"],
            profile["company"],
            profile["location"],
            profile["summary"],
            " ".join(profile["experience"] or []),
        ]
        profile["raw_text"] = " ".join(p for p in raw_parts if p).strip()

        logger.info(
            "Enriched %s: %d experiences, %d educations",
            profile["name"],
            len(profile["experience"] or []),
            len(profile["education"] or []),
        )

    except Exception as e:
        err_str = str(e).lower()
        if "rate" in err_str or "429" in err_str or "checkpoint" in err_str:
            logger.warning("Rate-limited on %s — keeping card data: %s", profile_url, e)
        else:
            logger.warning("Could not enrich %s (keeping card data): %s", profile_url, e)

    return profile


async def _login_and_search(
    browser: BrowserManager, search_query: str, max_results: int
) -> List[dict]:
    """Login to LinkedIn, search for people, extract card data, then enrich profiles."""
    email = os.getenv("LINKEDIN_EMAIL") or os.getenv("LINKEDIN_USERNAME")
    password = os.getenv("LINKEDIN_PASSWORD")

    if not email or not password:
        logger.error("LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set for login.")
        return []

    page = browser.page
    await _apply_stealth(page)

    # Phase 0: Login / session restore
    session_loaded = False
    if os.path.exists(SESSION_PATH):
        try:
            await browser.load_session(SESSION_PATH)
            page = browser.page
            await _apply_stealth(page)
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
        page = browser.page
        await _apply_stealth(page)
        logger.info("Logging in with credentials...")
        success = await _login_playwright(page, email, password)
        if not success:
            return []
        try:
            await browser.save_session(SESSION_PATH)
        except Exception as e:
            logger.warning("Could not save session: %s", e)
    else:
        page = browser.page

    # Phase 1: Search and extract card data
    search_url = (
        "https://www.linkedin.com/search/results/people/?keywords="
        f"{quote_plus(search_query)}"
    )
    logger.info("Navigating to search results: %s", search_url)
    await page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
    await asyncio.sleep(3)

    for _ in range(3):
        await page.evaluate("window.scrollBy(0, 600)")
        await asyncio.sleep(1.5)

    cards = await _extract_card_data(page, max_results)
    if not cards:
        logger.warning("No profiles found on search results page")
        return []

    profiles = [_build_card_profile(card) for card in cards]
    logger.info("Phase 1 complete: %d profiles from card data", len(profiles))

    # Phase 2: Enrich profiles by visiting their pages
    logger.info(
        "Phase 2: Enriching up to %d profiles with %d-%ds delays...",
        len(profiles), MIN_PROFILE_DELAY, MAX_PROFILE_DELAY,
    )

    for i, profile in enumerate(profiles):
        enriched = await _enrich_profile(page, profile, i, len(profiles))
        profiles[i] = enriched

    enriched_count = sum(
        1 for p in profiles if p["summary"] or p["experience"] or p["education"]
    )
    logger.info(
        "Done: %d profiles total, %d enriched with profile data",
        len(profiles), enriched_count,
    )
    return profiles


async def scrape_profiles_lib(
    search_query: str, max_results: int = 20
) -> List[dict]:
    """Scrape LinkedIn profiles using Playwright with two-phase extraction.

    Phase 1: Extract name, title, company, location from search result cards.
    Phase 2: Visit each profile page to enrich with about, experiences, education.

    Args:
        search_query: LinkedIn search query
        max_results: Maximum number of profiles to scrape (default: 20, max: 20)

    Returns:
        List of profile dicts with keys: name, title, company, location,
        profile_url, summary, skills, experience, education, raw_text
    """
    max_results = min(max_results, 20)

    try:
        async with BrowserManager(
            headless=True,
            viewport={"width": 1920, "height": 1080},
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-automation",
                "--no-sandbox",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
            ],
        ) as browser:
            return await _login_and_search(browser, search_query, max_results)
    except Exception as e:
        logger.error("Scraping failed: %s", e)
        return []
