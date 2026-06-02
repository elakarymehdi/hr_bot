"""Playwright-based LinkedIn scraper adapter using the linkedin_scraper library.

Extracts profile data directly from search result cards — avoids navigating to
individual profile pages, which LinkedIn aggressively rate-limits. The card
data (name, title, location, company, profile_url) is sufficient for matching.
"""

import asyncio
import logging
import os
import random
from typing import List
from urllib.parse import quote_plus

from dotenv import load_dotenv
from linkedin_scraper import BrowserManager

load_dotenv()

logger = logging.getLogger(__name__)

SESSION_PATH = os.path.join(
    os.path.dirname(__file__), "credentials", "linkedin_session.json"
)


# ---------------------------------------------------------------------------
# Anti-detection scripts applied to every page to reduce bot detection
# ---------------------------------------------------------------------------
STEALTH_SCRIPT = """
// Override navigator.webdriver — LinkedIn checks this
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// Override chrome.runtime to appear as a real browser
window.chrome = window.chrome || {};
window.chrome.runtime = {};

// Normalize plugins and languages
Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
});
Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
});

// Hide headless Chromium indicators — wrap Notification in try/catch
// for headless modes where it may not be available
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
"""


async def _apply_stealth(page) -> None:
    """Apply anti-detection scripts to a Playwright page."""
    try:
        await page.add_init_script(STEALTH_SCRIPT)
        logger.debug("Stealth anti-detection script applied")
    except Exception as e:
        logger.warning("Could not apply stealth script: %s", e)


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

    # Wait for inputs to appear (polling approach)
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

    # Find email field
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

    # Find password field
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


async def _login_and_search(
    browser: BrowserManager, search_query: str, max_results: int
) -> List[dict]:
    """Login to LinkedIn, search for people, and extract data from search cards.

    Returns:
        List of profile dicts matching the format used by profile_scraper.py.
        Data is extracted entirely from search result cards (no profile page
        navigation), so name, title, location, and company are always present.
    """
    email = os.getenv("LINKEDIN_EMAIL") or os.getenv("LINKEDIN_USERNAME")
    password = os.getenv("LINKEDIN_PASSWORD")

    if not email or not password:
        logger.error("LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set for login.")
        return []

    # Get the page and apply stealth scripts
    page = browser.page
    await _apply_stealth(page)

    # Try loading a saved session first
    session_loaded = False
    if os.path.exists(SESSION_PATH):
        try:
            await browser.load_session(SESSION_PATH)
            page = browser.page  # Get the NEW page after session load
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

    # Extract profile data from search result CARDS
    # This is the ONLY data source — LinkedIn rate-limits profile page visits,
    # but search result cards are always accessible. Card data (name, title,
    # location, company) is enough for candidate matching.
    card_data = await page.evaluate(
        """() => {
        const profiles = [];
        const seen = new Set();

        // Find all profile links by /in/ URL pattern
        const links = document.querySelectorAll('a');
        for (const link of links) {
            const href = link.href;
            if (!href.includes('linkedin.com/in/') || seen.has(href)) continue;

            // Walk up the DOM to find the card container.
            // Stop at the FIRST ancestor with at least 3 lines of text
            // (name + headline + location = the card).
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

            // Parse title, location, company from lines
            let title = '';
            let location = '';
            let company = '';

            for (let i = 1; i < lines.length && i < 10; i++) {
                const line = lines[i];
                // Skip connection degree lines (bullet chars, "• 2nd", etc.)
                if (line.match(/^[\\s]*[\\u2022\\u2023\\u25E6\\*\\-]/) ||
                    line.match(/\\d+(st|nd|rd)\\s*(\\u2022|$)/)) {
                    continue;
                }
                // Skip common noise
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

    if not card_data:
        logger.warning("No profiles found on search results page")
        return []

    # Build profiles from card data (no enrichment — LinkedIn rate-limits
    # profile page navigation, and card data is sufficient for matching).
    profiles = []
    for card in card_data[:max_results]:
        raw_parts = [
            card["name"],
            card["title"],
            card["company"],
            card["location"],
        ]
        profiles.append({
            "name": card["name"],
            "title": card["title"],
            "company": card["company"],
            "location": card["location"],
            "profile_url": card["url"],
            "summary": "",
            "skills": [],
            "experience": [],
            "raw_text": " ".join(p for p in raw_parts if p).strip(),
        })

    logger.info("Returning %d profiles (card data only)", len(profiles))
    return profiles


async def scrape_profiles_lib(
    search_query: str, max_results: int = 20
) -> List[dict]:
    """Scrape LinkedIn profiles using the Playwright-based library.

    Extracts data entirely from search result cards. No profile page
    navigation — avoids LinkedIn's aggressive rate limiting on profiles.

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
            # Pass Chromium args for stealth (matches bagitoJobSeeker's Selenium setup)
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
