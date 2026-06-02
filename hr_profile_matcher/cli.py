#!/usr/bin/env python3
"""CLI for running LinkedIn profile scrapers.

Usage:
    # Use the Playwright library (default)
    python cli.py --query '"Software Engineer" Python' --max-results 5

    # Use the legacy Selenium scraper
    python cli.py --scraper legacy --query '"Software Engineer" Python' --max-results 5

    # Start the FastAPI server
    python cli.py serve
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


def main():
    parser = argparse.ArgumentParser(
        description="LinkedIn Profile Scraper CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--scraper",
        choices=["legacy", "library"],
        default="library",
        help="Which scraper backend to use (default: library)",
    )
    parser.add_argument(
        "--query", "-q",
        help="LinkedIn search query (e.g. '\"Software Engineer\" Python')",
    )
    parser.add_argument(
        "--max-results", "-n",
        type=int,
        default=5,
        help="Maximum number of profiles to scrape (default: 5, max: 20)",
    )
    parser.add_argument(
        "--serve", "-s",
        action="store_true",
        help="Start the FastAPI server instead of running a scrape",
    )

    args = parser.parse_args()

    if args.serve:
        _start_server()
        return

    if not args.query:
        parser.print_help()
        sys.exit(1)

    _run_scrape(args.scraper, args.query, args.max_results)


def _run_scrape(scraper: str, query: str, max_results: int):
    """Run a scrape with the chosen scraper."""
    if scraper == "legacy":
        from profile_scraper import scrape_profiles
        profiles = scrape_profiles(query, max_results)
    else:
        from scraper_lib_adapter import scrape_profiles_lib
        profiles = asyncio.run(scrape_profiles_lib(query, max_results))

    print(f"\n=== Scraped {len(profiles)} profiles ===\n")
    for i, p in enumerate(profiles, 1):
        print(f"  [{i}] {p.get('name', '?')}")
        print(f"      Title: {p.get('title', '')}")
        print(f"      Company: {p.get('company', '')}")
        print(f"      Location: {p.get('location', '')}")
        print(f"      URL: {p.get('profile_url', '')}")
        print(f"      Summary: {p.get('summary', '')[:120]}...")
        print(f"      Skills: {len(p.get('skills', []))}")
        print(f"      Experiences: {len(p.get('experience', []))}")
        print()


def _start_server():
    """Start the FastAPI server."""
    import uvicorn
    print("Starting FastAPI server on http://localhost:8000")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    main()
