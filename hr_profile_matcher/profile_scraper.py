import json
import logging
import os
import random
import time
from typing import List
from urllib.parse import quote_plus

from pathlib import Path

from bs4 import BeautifulSoup
from dotenv import load_dotenv
from selenium import webdriver
from selenium.common.exceptions import StaleElementReferenceException, TimeoutException, WebDriverException
from selenium.webdriver import ChromeOptions
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.core.os_manager import ChromeType

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

logger = logging.getLogger(__name__)

COOKIES_PATH = os.path.join(os.path.dirname(__file__), "credentials", "linkedin_cookies.json")
LINKEDIN_EMAIL = os.getenv("LINKEDIN_EMAIL")
LINKEDIN_PASSWORD = os.getenv("LINKEDIN_PASSWORD")


def _build_driver() -> webdriver.Chrome:
    options = ChromeOptions()
    options.binary_location = "/usr/sbin/chromium-browser"
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation", "enable-logging"])
    options.add_experimental_option("useAutomationExtension", False)
    # Tell webdriver_manager to look for chromium-browser instead of google-chrome,
    # so it detects the correct version and downloads the matching ChromeDriver.
    service = Service(ChromeDriverManager(chrome_type=ChromeType.CHROMIUM).install())
    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(30)
    driver.execute_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    return driver


def _save_cookies(driver: webdriver.Chrome) -> None:
    os.makedirs(os.path.dirname(COOKIES_PATH), exist_ok=True)
    with open(COOKIES_PATH, "w", encoding="utf-8") as file:
        json.dump(driver.get_cookies(), file)


def _load_cookies(driver: webdriver.Chrome) -> bool:
    if not os.path.exists(COOKIES_PATH):
        return False
    with open(COOKIES_PATH, "r", encoding="utf-8") as file:
        cookies = json.load(file)
    driver.get("https://www.linkedin.com")
    for cookie in cookies:
        cookie.pop("sameSite", None)
        cookie.pop("expiry", None)
        try:
            driver.add_cookie(cookie)
        except WebDriverException:
            continue
    return True


def _try_navigate(driver: webdriver.Chrome, url: str, wait_after: float = 3) -> bool:
    """Navigate to a URL with timeout recovery."""
    try:
        driver.get(url)
        time.sleep(wait_after)
        return True
    except TimeoutException:
        logger.warning("Page load timed out, stopping...")
        try:
            driver.execute_script("window.stop();")
        except Exception:
            pass
        time.sleep(1)
        return True  # Page might still be usable


def _find_visible_input(driver: webdriver.Chrome, autocomplete_value: str) -> object:
    """Find a visible input element by its autocomplete attribute value.

    LinkedIn uses SDUI with auto-generated IDs, so we scan ALL input elements
    and match by autocomplete attribute, checking visibility on each candidate.

    Uses contains-match because LinkedIn sometimes adds extra tokens like
    "username webauthn" for the visible field while "username" (exact) is a
    hidden 0x0 placeholder. The is_displayed() check already filters out
    the hidden placeholders, so we just need the contains match.
    """
    try:
        inputs = driver.find_elements(By.TAG_NAME, "input")
        for inp in inputs:
            try:
                if not inp.is_displayed():
                    continue
                ac = (inp.get_attribute("autocomplete") or "").lower()
                if autocomplete_value.lower() in ac:
                    return inp
            except WebDriverException:
                continue
    except WebDriverException:
        pass
    return None


def _login(driver: webdriver.Chrome) -> bool:
    if _load_cookies(driver):
        _try_navigate(driver, "https://www.linkedin.com/feed/")
        if "feed" in driver.current_url and "login" not in driver.current_url and "uas" not in driver.current_url:
            logger.info("Logged in via cookies")
            return True
        logger.info("Cookies expired, logging in with credentials...")

    if not LINKEDIN_EMAIL or not LINKEDIN_PASSWORD:
        logger.error("LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set for login.")
        return False

    _try_navigate(driver, "https://www.linkedin.com/login")
    time.sleep(2)

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
            elements = driver.find_elements(By.XPATH, f"//*[contains(text(), '{pattern}')]")
            if elements:
                logger.info("Detected 'Welcome Back' page, clicking '%s'...", pattern)
                elements[0].click()
                time.sleep(3)
                break
        except WebDriverException:
            continue

    # If password field not visible yet, try clicking "Sign in" button (another
    # welcome-back variant where the form is hidden behind a button).
    if not _find_visible_input(driver, "current-password"):
        try:
            sign_in_btn = driver.find_elements(
                By.XPATH, "//button[contains(text(), 'Sign in')]"
            )
            if sign_in_btn:
                logger.info("Clicking 'Sign in' button to reveal login form...")
                sign_in_btn[0].click()
                time.sleep(2)
        except WebDriverException:
            pass

    # Wait for any input to appear (gives SDUI framework time to render)
    try:
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.TAG_NAME, "input"))
        )
    except TimeoutException:
        logger.error("No input fields appeared on the login page")
        _save_debug_screenshot(driver)
        return False

    # ---- Find email field by scanning all visible inputs ----
    email_input = _find_visible_input(driver, "username")
    if not email_input:
        logger.error("Could not find email input on LinkedIn login page")
        _save_debug_screenshot(driver)
        return False

    logger.info("Filling in email field...")
    try:
        email_input.click()
    except WebDriverException:
        driver.execute_script("arguments[0].click();", email_input)
    time.sleep(0.3)
    email_input.clear()
    for char in LINKEDIN_EMAIL:
        email_input.send_keys(char)
        time.sleep(random.uniform(0.03, 0.08))

    # ---- Find password field by scanning all visible inputs ----
    password_input = _find_visible_input(driver, "current-password")
    if not password_input:
        logger.error("Could not find password input on LinkedIn login page")
        _save_debug_screenshot(driver)
        return False

    logger.info("Filling in password field...")
    try:
        password_input.click()
    except WebDriverException:
        driver.execute_script("arguments[0].click();", password_input)
    time.sleep(0.3)
    password_input.clear()
    for char in LINKEDIN_PASSWORD:
        password_input.send_keys(char)
        time.sleep(random.uniform(0.03, 0.08))

    # Submit
    try:
        password_input.submit()
    except WebDriverException:
        try:
            submit_btn = driver.find_element(
                By.XPATH, "//button[@type='submit']"
            )
            driver.execute_script("arguments[0].click();", submit_btn)
        except WebDriverException:
            pass

    time.sleep(5)

    if "feed" in driver.current_url:
        _save_cookies(driver)
        logger.info("Login successful")
        return True
    if "checkpoint" in driver.current_url or "challenge" in driver.current_url:
        logger.error("LinkedIn checkpoint challenge detected.")
        return False

    logger.warning("Login may have failed — current URL: %s", driver.current_url)
    return False


def _save_debug_screenshot(driver: webdriver.Chrome) -> None:
    """Save a debug screenshot and page source for troubleshooting."""
    try:
        driver.save_screenshot("/tmp/linkedin_debug.png")
        logger.info("Saved debug screenshot to /tmp/linkedin_debug.png")
        with open("/tmp/linkedin_debug.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source[:50000])
        logger.info("Saved debug page source to /tmp/linkedin_debug.html")
    except Exception as exc:
        logger.warning("Could not save debug artifacts: %s", exc)


def _is_rate_limited(page_source: str) -> bool:
    lowered = page_source.lower()
    return "too many requests" in lowered or "captcha" in lowered


def _parse_profile_page(page_source: str) -> dict:
    soup = BeautifulSoup(page_source, "html.parser")
    summary_section = soup.select_one("section#about")
    summary = summary_section.get_text(" ", strip=True) if summary_section else ""

    skills = [
        item.get_text(strip=True)
        for item in soup.select("section#skills span[aria-hidden='true']")
    ]
    experience = [
        item.get_text(strip=True)
        for item in soup.select("section#experience span[aria-hidden='true']")
    ]

    # Extract title/headline from profile page
    title = ""
    for sel in [
        "div.text-body-medium",
        "div[class*='text-body-medium']",
        "section:first-of-type div.text-body-medium",
        "h2[class*='headline']",
    ]:
        elem = soup.select_one(sel)
        if elem:
            title = elem.get_text(strip=True)
            break

    # Extract location from profile page
    location = ""
    for sel in [
        "span.text-body-small",
        "span[class*='text-body-small']",
        "span[class*='location']",
        "div[class*='location']",
    ]:
        elem = soup.select_one(sel)
        if elem:
            location = elem.get_text(strip=True)
            break

    return {
        "summary": summary,
        "skills": list(dict.fromkeys(skills)),
        "experience": list(dict.fromkeys(experience)),
        "title": title,
        "location": location,
    }


def _sleep_between(min_seconds: float, max_seconds: float) -> None:
    time.sleep(random.uniform(min_seconds, max_seconds))


def scrape_profiles(search_query: str, max_results: int = 20) -> List[dict]:
    driver = _build_driver()
    profiles: List[dict] = []
    max_results = min(max_results, 20)

    try:
        if not _login(driver):
            return []

        search_url = (
            "https://www.linkedin.com/search/results/people/?keywords="
            f"{quote_plus(search_query)}"
        )
        _try_navigate(driver, search_url, wait_after=4)

        # Progressive scroll to load more results (more human-like)
        for _ in range(3):
            driver.execute_script("window.scrollBy(0, 600);")
            _sleep_between(1.5, 3)

        backoff = 30
        retries = 0
        while retries < 3 and _is_rate_limited(driver.page_source):
            logger.warning("Rate limit detected. Backing off for %ss", backoff)
            time.sleep(backoff)
            backoff *= 2
            retries += 1
            _try_navigate(driver, search_url)

        # LinkedIn uses randomized CSS class names that change frequently, so we
        # can't rely on class selectors. Instead, find all profile links by their
        # /in/ URL pattern and deduplicate by URL.
        all_links = driver.find_elements(By.TAG_NAME, "a")
        profile_urls = []
        seen_urls = set()
        for link in all_links:
            href = link.get_attribute("href") or ""
            if "/in/" in href and "linkedin.com/in/" in href and href not in seen_urls:
                seen_urls.add(href)
                profile_urls.append(href)

        if not profile_urls:
            logger.warning("No profile links found on search results page.")
            return []

        logger.info("Found %d unique profile URLs", len(profile_urls))
        profile_urls = profile_urls[:max_results]

        for profile_url in profile_urls:
            if len(profiles) >= max_results:
                break

            try:
                _sleep_between(1, 2.5)
                driver.execute_script("window.open(arguments[0], '_blank');", profile_url)
                driver.switch_to.window(driver.window_handles[-1])
                _try_navigate(driver, profile_url, wait_after=4)

                if _is_rate_limited(driver.page_source):
                    logger.warning("Rate limit detected during profile scrape.")
                    driver.close()
                    driver.switch_to.window(driver.window_handles[0])
                    time.sleep(30)
                    continue

                # Progressive scroll on profile page
                for _ in range(2):
                    driver.execute_script("window.scrollBy(0, 500);")
                    _sleep_between(1, 2)

                profile_details = _parse_profile_page(driver.page_source)

                # Extract name from the profile page title
                name = driver.title.replace(" | LinkedIn", "").strip() if driver.title else ""

                driver.close()
                driver.switch_to.window(driver.window_handles[0])

                raw_text = " ".join(
                    [
                        name,
                        profile_details["title"],
                        profile_details["location"],
                        profile_details["summary"],
                        " ".join(profile_details["skills"]),
                        " ".join(profile_details["experience"]),
                    ]
                ).strip()

                profiles.append(
                    {
                        "name": name,
                        "title": profile_details["title"],
                        "company": "",
                        "location": profile_details["location"],
                        "profile_url": profile_url,
                        "summary": profile_details["summary"],
                        "skills": profile_details["skills"],
                        "experience": profile_details["experience"],
                        "raw_text": raw_text,
                    }
                )
                _sleep_between(3, 6)
            except WebDriverException as exc:
                logger.warning("Scrape error: %s", exc)
                continue

        return profiles
    finally:
        driver.quit()
